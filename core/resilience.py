"""Transient network-failure classification and bounded retries.

The fleet is one long-lived process that talks to a single HTTP API. A brief
DNS outage or a reset connection must therefore cost a few seconds of retrying,
never the process — but the opposite failure mode (silently retrying a bad
credential forever) is just as bad, so everything here is deliberately narrow:

* only errors that are provably network-shaped are retried;
* a server answer (4xx/5xx ``HTTPStatusError``) is never retried — that is a
  configuration/auth problem and must surface loudly on the first attempt;
* two tiers of "network error" exist, because HTTP methods differ in safety:
  ``is_connect_phase_error`` is the subset raised only while *establishing* the
  connection (DNS, TCP, TLS), where the request provably never reached the
  server, so even a POST may be retried; ``is_transient_network_error`` is the
  wider set (timeouts, resets mid-response) and is only safe for idempotent
  operations such as ``bus/ensure`` or a re-select-before-insert;
* every retry is logged with an operation label, the attempt number and the
  error, and exhaustion is logged at error level before the exception is
  re-raised, so a log reader can always tell a blip from a wall.
"""

from __future__ import annotations

import asyncio
import random
import socket
import time
from typing import Awaitable, Callable, TypeVar

import httpx
import structlog

logger = structlog.get_logger(__name__)

T = TypeVar("T")

# errno values that mean "the network is not usable right now".
#   8  ENOENT — how macOS surfaces EAI_NONAME ("nodename nor servname provided")
#   51 ENETUNREACH      53 ECONNABORTED      54 ECONNRESET
#   60 ETIMEDOUT        61 ECONNREFUSED      65 EHOSTUNREACH
_TRANSIENT_ERRNOS = frozenset({8, 51, 53, 54, 60, 61, 65})

# Same list minus the two that can also describe a connection dying *after* the
# request was written (reset / aborted mid-flight): those are not safe to
# replay against a mutating POST.
_CONNECT_PHASE_ERRNOS = frozenset({8, 51, 60, 61, 65})

# httpx (0.27) raises ConnectError/ConnectTimeout only while connecting; the
# rest can also fire mid-response.
_TRANSIENT_HTTPX = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.ReadError,
    httpx.WriteError,
    httpx.CloseError,
    httpx.RemoteProtocolError,
)

_CONNECT_PHASE_HTTPX = (httpx.ConnectError, httpx.ConnectTimeout)


def _exception_chain(exc: BaseException):
    """Yield ``exc`` and every wrapper it was raised from/through."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def is_transient_network_error(exc: BaseException) -> bool:
    """True only for errors that a later attempt could plausibly survive.

    A server response (``httpx.HTTPStatusError``) returns False immediately,
    even when a transport error sits further down the chain: a 401 wrapped in
    a retry is still a 401.
    """
    for err in _exception_chain(exc):
        if isinstance(err, httpx.HTTPStatusError):
            return False
        if isinstance(err, _TRANSIENT_HTTPX):
            return True
        if isinstance(err, socket.gaierror):
            return True
        if isinstance(err, ConnectionError):  # ConnectionReset/Aborted/Refused
            return True
        if isinstance(err, OSError) and err.errno in _TRANSIENT_ERRNOS:
            return True
    return False


def is_connect_phase_error(exc: BaseException) -> bool:
    """True when the request never reached the server.

    Safe to retry for any HTTP method: the failure happened in DNS resolution,
    TCP connect or the TLS handshake, before a single byte of the request body
    was delivered.
    """
    for err in _exception_chain(exc):
        if isinstance(err, httpx.HTTPStatusError):
            return False
        if isinstance(err, _CONNECT_PHASE_HTTPX):
            return True
        if isinstance(err, socket.gaierror):
            return True
        if isinstance(err, OSError) and err.errno in _CONNECT_PHASE_ERRNOS:
            return True
    return False


def _delay_for(
    attempt: int,
    base_delay: float,
    max_delay: float,
    rng: random.Random | object,
) -> float:
    """Exponential backoff with jitter, capped at ``max_delay``.

    ``attempt`` is 0-based. Jitter is multiplicative over ``[0.5, 1.5)`` so
    concurrent callers (the agents all boot at once) do not retry in lockstep.
    """
    ceiling = min(max_delay, base_delay * (2 ** attempt))
    return max(0.0, ceiling * (0.5 + rng.random()))


async def retry_async(
    operation: Callable[[], Awaitable[T]],
    *,
    label: str,
    attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    classify: Callable[[BaseException], bool] = is_transient_network_error,
    sleep: Callable[[float], Awaitable[None]] | None = None,
    rng: random.Random | object | None = None,
) -> T:
    """Run ``operation`` with bounded exponential backoff for transient errors.

    Non-transient exceptions propagate immediately (single attempt). After
    ``attempts`` transient failures the last exception is logged at error level
    and re-raised — the caller decides whether that is fatal.
    """
    if attempts < 1:
        raise ValueError("attempts must be >= 1")
    sleeper = sleep or asyncio.sleep
    rand = rng or random

    for attempt in range(attempts):
        try:
            return await operation()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not classify(exc):
                raise
            if attempt + 1 >= attempts:
                logger.error(
                    "network_retry_exhausted",
                    label=label,
                    attempts=attempts,
                    error=f"{type(exc).__name__}: {exc}",
                )
                raise
            delay = _delay_for(attempt, base_delay, max_delay, rand)
            logger.warning(
                "network_retry",
                label=label,
                attempt=attempt + 1,
                attempts=attempts,
                delay_s=round(delay, 2),
                error=f"{type(exc).__name__}: {exc}",
            )
            await sleeper(delay)

    raise AssertionError("unreachable")  # pragma: no cover


def retry_sync(
    operation: Callable[[], T],
    *,
    label: str,
    attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    classify: Callable[[BaseException], bool] = is_transient_network_error,
    sleep: Callable[[float], None] | None = None,
    rng: random.Random | object | None = None,
) -> T:
    """Synchronous sibling of :func:`retry_async` for the fluent Table path."""
    if attempts < 1:
        raise ValueError("attempts must be >= 1")
    sleeper = sleep or time.sleep
    rand = rng or random

    for attempt in range(attempts):
        try:
            return operation()
        except Exception as exc:
            if not classify(exc):
                raise
            if attempt + 1 >= attempts:
                logger.error(
                    "network_retry_exhausted",
                    label=label,
                    attempts=attempts,
                    error=f"{type(exc).__name__}: {exc}",
                )
                raise
            delay = _delay_for(attempt, base_delay, max_delay, rand)
            logger.warning(
                "network_retry",
                label=label,
                attempt=attempt + 1,
                attempts=attempts,
                delay_s=round(delay, 2),
                error=f"{type(exc).__name__}: {exc}",
            )
            sleeper(delay)

    raise AssertionError("unreachable")  # pragma: no cover
