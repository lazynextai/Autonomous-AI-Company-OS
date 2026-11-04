"""Finance Agent - weekly reports.

Report numbers are READ FROM D1, never generated: `format_verified_facts()`
turns the live billing funnel into a verified-facts block that is prepended to
the LLM narrative. This exists because a previous prompt handed the model
`licenses_pro=1` and it described that single entitlement as a paid Pro
subscription — while the same report said $0 revenue. The one Pro license is
the self-issued dogfood license and there are 0 subscriptions (Dodo is
deliberately in test mode). See docs/ops/watch-calendar.md.
"""

from typing import Any

from agents.base_agent import BaseAgent, TaskResult
from core.messaging.channels import Channels
from core.messaging.schemas import TaskMessage
from core.operations.report_facts import (
    format_verified_facts,
    funnel_number,
    hard_rules,
)


def build_report_prompt(funnel: dict | None) -> str:
    """The narrative prompt. Facts are quoted in; numbers are forbidden."""
    return f"""You are the Finance Agent. Write the 3-5 sentence narrative part of a weekly finance report.

{format_verified_facts(funnel)}

{hard_rules(funnel)}

Cover: the metrics above, any trend that the numbers themselves show, and one concrete recommendation.
Plain text only, no headings, no placeholders."""


class FinanceAgent(BaseAgent):
    """Finance agent - weekly reports."""

    def get_subscribed_channels(self) -> list[Channels]:
        return []

    def get_system_prompt(self) -> str:
        return """You are the Finance Agent for an autonomous AI startup. You track revenue, MRR, users, burn rate, and runway.
Output concise, professional reports. Use actual data provided. Never use placeholders or templates."""

    async def execute_task(self, task: TaskMessage) -> TaskResult:
        return TaskResult(task_id=task.task_id, success=True, output="Finance report")

    async def run(self) -> None:
        import asyncio
        self.is_running = True
        await self.agent_memory.initialize(self.agent_id, self.role)

        while self.is_running:
            try:
                await self._maybe_update_status("active", "finance_report")
                if await self._report_due():
                    await self.run_weekly_finance_report()
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error("finance_loop_error", error=str(e))
                await asyncio.sleep(3600)

        self.is_running = False
        await self._maybe_update_status("stopped", "")

    async def _report_due(self) -> bool:
        """Persisted weekly gate — the in-loop sleep resets on every fleet
        restart (launchd KeepAlive), which fired a report per restart."""
        try:
            from datetime import datetime, timezone
            from core.cloudflare_client import CloudflareClient
            client = CloudflareClient()
            if not client.is_configured():
                return True
            last = await client.kv_get("brief:last:finance")
            now = datetime.now(timezone.utc).date()
            if last and (now - datetime.fromisoformat(last).date()).days < 7:
                return False
            self._pending_report_stamp = now.isoformat()
            return True
        except Exception as e:
            self.logger.warning("report_gate_read_failed", error=str(e))
            return True

    async def run_weekly_finance_report(self) -> None:
        # Only post reports after first milestone is achieved
        if not await self._has_any_milestones():
            self.logger.debug("skipping_report_no_milestones", message="Waiting for first milestone before posting reports")
            return

        brain = await self.company_brain.get()
        # brain.metrics has no writer for users/revenue — read the live product
        # funnel (D1-backed) so the report reflects real counts. `None` means
        # the read failed: the facts block then says "unavailable" instead of
        # letting the model fill the gap.
        funnel = await self._fetch_funnel()
        facts = format_verified_facts(funnel)
        prompt = f"""{build_report_prompt(funnel)}

Product: {brain.product_name or 'Not defined'}"""
        narrative = await self.call_llm(self.get_system_prompt(), prompt)
        # Facts first, narrative second: the numbers are quoted from D1 and the
        # prose is explicitly labelled as commentary.
        report = f"{facts}\n\nWhat this means:\n{str(narrative).strip()}"
        from core.operations.briefings import post_briefing
        await post_briefing("finance_report", "Weekly Finance Report", report)
        try:
            stamp = getattr(self, "_pending_report_stamp", None)
            if stamp:
                from core.cloudflare_client import CloudflareClient as _CF
                client = _CF()
                if client.is_configured():
                    await client.kv_put("brief:last:finance", stamp, ttl=0)
        except Exception as e:
            self.logger.warning("report_gate_write_failed", error=str(e))

        from core.config import get_settings
        s = get_settings()
        if s.founder_email:
            try:
                from core.tools.email_tool import send_email
                await send_email(s.founder_email, "Weekly Finance Report", report)
            except Exception as e:
                self.logger.warning("finance_report_email_failed", error=str(e))
    
    async def _fetch_funnel(self) -> dict | None:
        """Live billing funnel from the platform (`/api/v1/billing/funnel`).

        Returns `None` when the read did not happen or failed — never `{}` — so
        the facts block can say "unavailable" rather than silently reporting
        zeros that look like real measurements.
        """
        try:
            import asyncio
            import httpx
            from core.cloudflare_client import CloudflareClient
            client = CloudflareClient()
            if not client.is_configured():
                return None

            def _get():
                with httpx.Client(timeout=15.0, headers=client._headers) as http:
                    r = http.get(f"{client.url}/api/v1/billing/funnel")
                    return r.json() if r.status_code == 200 else None

            funnel: Any = await asyncio.to_thread(_get)
            return funnel if isinstance(funnel, dict) and funnel else None
        except Exception as e:
            self.logger.warning("funnel_fetch_failed", error=str(e))
            return None

    async def _has_any_milestones(self) -> bool:
        """Check if any milestones have been achieved."""
        try:
            import asyncio
            from core.cloudflare_client import CloudflareClient
            client = CloudflareClient()
            if not client.is_configured():
                return False
            
            def _check():
                r = client.table("milestone_log").select("id").limit(1).execute()
                return len(r.data or []) > 0
            
            return await asyncio.to_thread(_check)
        except Exception as e:
            self.logger.warning("milestone_check_failed", error=str(e))
            return False
