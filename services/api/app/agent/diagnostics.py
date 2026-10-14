"""User-triggered fixed probes. No chat history, tools, arbitrary URLs or retries."""

import asyncio
from datetime import UTC, datetime
from threading import BoundedSemaphore
from time import perf_counter

import httpx
from redis.exceptions import RedisError

from app.agent.failures import diagnostic_code
from app.agent.schemas import Answer, DiagnosticResult
from app.auth.limits import _COUNT
from app.auth.service import AuthError, digest
from app.infrastructure.workers import run_blocking
from app.observability.events import emit, request_id
from app.providers.base import InvalidPayload

PROBE_TIMEOUT = 12
_slots = BoundedSemaphore(2)


def limit_diagnostics(cache, user_id):
    try:
        for key, maximum in ((f'account:{digest(user_id)}', 3), ('global', 20)):
            count, ttl = cache.eval(_COUNT, 1, f'agent:diagnostics:{key}', 60)
            if int(count) > maximum:
                raise AuthError('diagnostics_rate_limited', 429,
                                'Too many connection checks. Wait before retrying.', max(1, int(ttl)))
    except RedisError as exc:
        raise AuthError('diagnostics_unavailable', 503, 'Connection checks temporarily unavailable.', 2) from exc


def result(code, started, service='model'):
    elapsed = round((perf_counter() - started) * 1000, 3)
    emit('agent_diagnostic', code=code, latency_ms=elapsed)
    return DiagnosticResult(service=service, code=code, checked_at=datetime.now(UTC).isoformat(),
                            latency_ms=elapsed, request_id=request_id())


async def probe_model(provider):
    started = perf_counter()
    if provider.name == 'local':
        return result('not_configured', started)
    if not _slots.acquire(blocking=False):
        return result('diagnostics_busy', started)
    try:
        async with asyncio.timeout(PROBE_TIMEOUT):
            value = await provider.answer({'message': 'Return JSON {"answer":"ok"}.',
                                           'task': 'connection_diagnostic'}, [])
            Answer.model_validate(value)
        return result('ok', started)
    except (httpx.HTTPError, OSError, ValueError, TypeError, KeyError) as exc:
        return result(diagnostic_code(exc), started)
    finally:
        _slots.release()


async def probe_search(search):
    started = perf_counter()
    if search is None:
        return result('not_configured', started, 'search')

    slots = _slots

    def check():
        # The worker owns the slot until actual completion, including after HTTP cancellation.
        if not slots.acquire(blocking=False):
            return 'diagnostics_busy'
        try:
            search.search('music')
            return 'ok'
        except (InvalidPayload, ValueError, TypeError, KeyError):
            return 'search_output_incompatible'
        except (httpx.HTTPError, OSError) as exc:
            return diagnostic_code(exc)
        finally:
            slots.release()

    try:
        async with asyncio.timeout(PROBE_TIMEOUT):
            code = await run_blocking(check)
    except TimeoutError:
        code = 'connection_timeout'
    return result(code, started, 'search')
