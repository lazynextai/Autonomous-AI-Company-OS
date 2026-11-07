"""Start all agents and deadlock detector."""

import asyncio
import random
import time
from typing import Awaitable, Callable

import structlog
from rich.console import Console

from core.config import get_settings
from core.evaluation.reward_engine import RewardEngine
from core.evaluation.scorer import PerformanceScorer
from core.llm.workers_ai_client import WorkersAIClient
from core.memory.agent_memory import AgentMemory
from core.memory.company_brain_cached import CachedCompanyBrain
from core.memory.episodic_memory import EpisodicMemory
from core.messaging.bus import MessageBus
from core.operations.task_tracker import TaskTracker
from core.resilience import is_transient_network_error
from core.watchdog.deadlock_detector import DeadlockDetector

console = Console()
logger = structlog.get_logger(__name__)

# Per-agent crash restart budget: 15s -> 30s -> 60s -> 120s -> capped at 5min.
# An agent that keeps crashing from *transient* network trouble must not be
# allowed to take the fleet down with it, and must not hot-loop the API.
AGENT_RESTART_BASE_S = 15.0
AGENT_RESTART_MAX_S = 300.0

# Wall-clock budget for the boot-time bus pre-warm. Bounded in *seconds*, not
# in attempts: a DNS failure can hang for the full client timeout, so counting
# attempts would make the worst case unbounded in practice.
BOOT_BUS_BUDGET_S = 60.0
BOOT_BUS_MAX_DELAY_S = 8.0


async def _ensure_consumer_groups(
    message_bus: MessageBus,
    *,
    budget_s: float = BOOT_BUS_BUDGET_S,
    sleep: Callable[[float], Awaitable[None]] | None = None,
    clock: Callable[[], float] | None = None,
    rng: random.Random | object | None = None,
) -> bool:
    """Boot-time consumer group setup, retried but never fatal.

    Creating consumer groups is an idempotent pre-warm step: it only creates
    missing offsets, and the fleet's task queue is ``task_log`` via
    TaskTracker, not the bus. Failing it must therefore never stop the agents
    from starting — that is exactly what killed the fleet on 2026-11-07, when
    an ``httpx.ConnectError: [Errno 8] nodename nor servname provided`` here
    propagated out of ``asyncio.gather`` and terminated the process.

    Retries are bounded by wall clock (``budget_s``), so a hung resolver cannot
    stretch startup indefinitely. Returns True on success, False once the
    budget is spent; the caller logs the transition and carries on.
    """
    sleeper = sleep or asyncio.sleep
    now = clock or time.monotonic
    rand = rng or random
    started = now()
    attempt = 0

    while True:
        attempt += 1
        remaining = budget_s - (now() - started)
        if remaining <= 0:
            logger.error(
                "consumer_groups_deadline_exceeded",
                attempts=attempt - 1,
                elapsed_s=round(now() - started, 1),
                budget_s=budget_s,
                note="continuing; task work comes from task_log, bus pre-warm retried by the watchdog",
            )
            return False
        try:
            # Hard wall-clock cap: one attempt may not outlive the budget, so a
            # hung resolver (30s timeout per request) cannot stretch startup.
            await asyncio.wait_for(
                message_bus.create_consumer_groups(), timeout=remaining
            )
            if attempt > 1:
                logger.info(
                    "consumer_groups_recovered",
                    attempts=attempt,
                    elapsed_s=round(now() - started, 1),
                )
            return True
        except asyncio.CancelledError:
            raise
        except Exception as e:
            elapsed = now() - started
            deadline_hit = isinstance(e, TimeoutError) and elapsed >= budget_s
            if deadline_hit:
                logger.error(
                    "consumer_groups_deadline_exceeded",
                    attempts=attempt,
                    elapsed_s=round(elapsed, 1),
                    budget_s=budget_s,
                    error=f"{type(e).__name__}: {e}",
                    note="continuing; task work comes from task_log, bus pre-warm retried by the watchdog",
                )
                return False
            if not is_transient_network_error(e):
                logger.error(
                    "consumer_groups_unavailable",
                    attempts=attempt,
                    elapsed_s=round(elapsed, 1),
                    error=f"{type(e).__name__}: {e}",
                    note="continuing; permanent failure — check credentials/API before restarting the fleet",
                )
                return False
            delay = min(
                BOOT_BUS_MAX_DELAY_S, 2.0 ** (attempt - 1)
            ) * (0.5 + rand.random())
            delay = min(delay, max(0.0, budget_s - elapsed))
            logger.warning(
                "consumer_groups_retry",
                attempt=attempt,
                delay_s=round(delay, 2),
                elapsed_s=round(elapsed, 1),
                error=f"{type(e).__name__}: {e}",
            )
            await sleeper(delay)


async def _supervise(
    name: str,
    coro_factory,
    crashes: dict[str, int],
    sleep: Callable[[float], Awaitable[None]] | None = None,
) -> None:
    """Run ``coro_factory()`` forever, restarting it on transient failures.

    A *transient* network failure (the class ``core.resilience`` classifies) is
    contained: the agent is restarted with capped exponential backoff and the
    crash is counted and logged at error level. A *permanent* failure (bad
    credentials, 4xx auth, a programming error) re-raises through
    ``asyncio.gather`` so the process still exits loudly and launchd restarts
    the fleet — one misconfigured agent must not silently half-run the company
    engine.
    """
    sleeper = sleep or asyncio.sleep
    while True:
        try:
            await coro_factory()
            logger.info("agent_task_finished", agent=name)
            return
        except asyncio.CancelledError:
            raise
        except Exception as e:
            if not is_transient_network_error(e):
                logger.error(
                    "agent_task_permanent_failure",
                    agent=name,
                    error=f"{type(e).__name__}: {e}",
                )
                raise
            crashes[name] = crashes.get(name, 0) + 1
            delay = min(
                AGENT_RESTART_MAX_S,
                AGENT_RESTART_BASE_S * (2 ** (crashes[name] - 1)),
            )
            logger.error(
                "agent_task_crashed",
                agent=name,
                crashes=crashes[name],
                retry_in_s=round(delay, 1),
                error=f"{type(e).__name__}: {e}",
            )
            await sleeper(delay)


async def main() -> None:
    settings = get_settings()
    if not settings.cloudflare_api_url or not settings.cloudflare_api_token:
        console.print("[red]Cloudflare not configured — the Workers AI brain needs CLOUDFLARE_API_URL and CLOUDFLARE_API_TOKEN in .env[/red]")

    company_brain = CachedCompanyBrain()
    agent_memory = AgentMemory()
    episodic_memory = EpisodicMemory()
    message_bus = MessageBus()
    llm_client = WorkersAIClient()
    task_tracker = TaskTracker()
    bus_ready = await _ensure_consumer_groups(message_bus)
    worker_task = llm_client.start_worker()

    agents = []
    try:
        from agents.engineering.qa_agent import QAAgent
        from agents.engineering.backend_agent import BackendAgent
        from agents.engineering.frontend_agent import FrontendAgent
        from agents.engineering.devops_agent import DevOpsAgent
        from agents.engineering.code_review_agent import CodeReviewAgent
        from agents.strategic.ceo_agent import CEOAgent
        from agents.strategic.cto_agent import CTOAgent
        from agents.infrastructure.knowledge_agent import KnowledgeAgent
        from agents.infrastructure.hr_agent import HRAgent
        from agents.growth.marketing_agent import MarketingAgent
        from agents.growth.sales_agent import SalesAgent
        from agents.growth.customer_success_agent import CustomerSuccessAgent
        from agents.infrastructure.finance_agent import FinanceAgent

        rag_engine = None
        knowledge_downloader = None
        try:
            from core.knowledge.rag_engine import RAGEngine
            from core.knowledge.downloader import KnowledgeDownloader
            rag_engine = RAGEngine()
            knowledge_downloader = KnowledgeDownloader()
        except ImportError:
            pass
        performance_scorer = PerformanceScorer(agent_memory)
        reward_engine = RewardEngine(
            agent_memory=agent_memory,
            ollama_client=llm_client,
            knowledge_downloader=knowledge_downloader,
        )

        def make_agent(cls, aid: str, role: str):
            return cls(
                agent_id=aid,
                role=role,
                company_brain=company_brain,
                agent_memory=agent_memory,
                episodic_memory=episodic_memory,
                message_bus=message_bus,
                ollama_client=llm_client,
                rag_engine=rag_engine,
                knowledge_downloader=knowledge_downloader,
                performance_scorer=performance_scorer,
                reward_engine=reward_engine,
                task_tracker=task_tracker,
            )

        agent_configs = [
            (QAAgent, "qa_1", "qa"),
            (KnowledgeAgent, "knowledge_1", "knowledge"),
            (CEOAgent, "ceo_1", "ceo"),
            (CTOAgent, "cto_1", "cto"),
            (BackendAgent, "backend_1", "backend"),
            (FrontendAgent, "frontend_1", "frontend"),
            (CodeReviewAgent, "code_review_1", "code_review"),
            (DevOpsAgent, "devops_1", "devops"),
            (MarketingAgent, "marketing_1", "marketing"),
            (SalesAgent, "sales_1", "sales"),
            (CustomerSuccessAgent, "customer_success_1", "customer_success"),
            (HRAgent, "hr_1", "hr"),
            (FinanceAgent, "finance_1", "finance"),
        ]

        crashes: dict[str, int] = {}
        for cls, aid, role in agent_configs:
            agent = make_agent(cls, aid, role)
            agents.append(asyncio.create_task(_supervise(aid, agent.run, crashes)))

        detector = DeadlockDetector(message_bus)

        async def watchdog_loop():
            nonlocal bus_ready
            while True:
                await detector.run_check()
                # Re-attempt bus setup: a boot-time DNS outage must heal without
                # a process restart. Only log the state transition.
                if not bus_ready:
                    bus_ready = await _ensure_consumer_groups(message_bus)
                await asyncio.sleep(1800)

        agents.append(
            asyncio.create_task(_supervise("watchdog", watchdog_loop, crashes))
        )
        agents.insert(0, worker_task)

        console.print("[green]All agents started. Press Ctrl+C to stop.[/green]")

        await asyncio.gather(*agents)
    except KeyboardInterrupt:
        console.print("\n[yellow]Shutting down...[/yellow]")
        for t in agents:
            t.cancel()
        await asyncio.gather(*agents, return_exceptions=True)
    finally:
        await message_bus.close()
        await episodic_memory.close()
        await llm_client.close()


if __name__ == "__main__":
    asyncio.run(main())
