import asyncio
import ssl

import httpx
import pytest
from fastapi.testclient import TestClient

from app.agent.providers import (
    LocalLLMProvider,
    OpenAICompatibleProvider,
    get_llm_provider,
)
from app.infrastructure.cache import get_redis
from app.main import app
from app.providers.registry import ProviderRegistry, get_provider_registry


class Counter:
    def __init__(self):
        self.counts = {}

    def eval(self, script, number, key, seconds):
        self.counts[key] = self.counts.get(key, 0) + 1
        return [self.counts[key], 60]


@pytest.fixture
def client():
    app.dependency_overrides[get_redis] = Counter
    # Keep the same counter for the lifetime of this client.
    counter = Counter()
    app.dependency_overrides[get_redis] = lambda: counter
    with TestClient(app) as client:
        yield client


def provider_with(outcome):
    def respond(request):
        if isinstance(outcome, BaseException):
            raise outcome
        if isinstance(outcome, int):
            return httpx.Response(outcome, text='private-upstream-marker')
        return httpx.Response(200, json=outcome)
    provider = OpenAICompatibleProvider('https://model.example', 'private-key-marker', 'test',
                                        httpx.MockTransport(respond))
    app.dependency_overrides[get_llm_provider] = lambda: provider
    return provider


@pytest.mark.parametrize('outcome,code', [
    (401, 'authentication_failed'), (403, 'authentication_failed'), (429, 'rate_limited'),
    (503, 'upstream_error'), (httpx.ReadTimeout('private-timeout-marker'), 'connection_timeout'),
    ({'choices': []}, 'model_output_incompatible'),
    ({'choices': [{'message': {'content': '[]'}}]}, 'model_output_incompatible'),
])
def test_diagnostic_error_categories_are_safe(client, outcome, code, caplog):
    provider_with(outcome)
    response = client.post('/v1/agent/diagnostics', json={'service': 'model'})
    assert response.status_code == 200
    assert response.json()['code'] == code
    assert response.json()['service'] == 'model'
    assert response.json()['request_id']
    assert 'marker' not in response.text + caplog.text


def test_certificate_chain_error_is_classified_without_message_matching(client):
    error = httpx.ConnectError('private-network-marker')
    error.__cause__ = ssl.SSLCertVerificationError('private-certificate-marker')
    provider_with(error)
    assert client.post('/v1/agent/diagnostics', json={'service': 'model'}).json()['code'] == 'tls_verification_failed'


def test_probe_validates_fixed_structured_response_and_never_runs_tools(client):
    provider_with({'choices': [{'message': {'content': '{"answer":"ok"}'}}]})
    result = client.post('/v1/agent/diagnostics', json={'service': 'model'}).json()
    assert result['code'] == 'ok'
    assert result['checked_at'] and result['latency_ms'] >= 0


def test_no_model_and_capability_status_never_claim_connectivity(client):
    app.dependency_overrides[get_llm_provider] = LocalLLMProvider
    body = client.get('/v1/agent/capabilities').json()
    assert body['model_configuration'] in ('local_mode', 'not_configured')
    assert client.post('/v1/agent/diagnostics', json={'service': 'model'}).json()['code'] == 'not_configured'


def test_diagnostics_reject_arbitrary_targets_and_limit_frequency(client):
    provider_with({'choices': [{'message': {'content': '{"answer":"ok"}'}}]})
    assert client.post('/v1/agent/diagnostics', json={'service': 'model', 'url': 'https://evil.example'}).status_code == 422
    assert client.post('/v1/agent/diagnostics', json={'service': 'evil'}).status_code == 422
    for _ in range(3):
        assert client.post('/v1/agent/diagnostics', json={'service': 'model'}).status_code == 200
    response = client.post('/v1/agent/diagnostics', json={'service': 'model'})
    assert response.status_code == 429
    assert response.headers['retry-after']


def test_diagnostic_deadline_and_concurrency(monkeypatch):
    from app.agent import diagnostics

    class Slow(LocalLLMProvider):
        name = 'openai_compatible'

        async def answer(self, context, results):
            await asyncio.sleep(1)

    monkeypatch.setattr(diagnostics, 'PROBE_TIMEOUT', 0.02)

    async def check():
        results = await asyncio.gather(*(diagnostics.probe_model(Slow()) for _ in range(3)))
        assert sorted(r.code for r in results) == ['connection_timeout', 'connection_timeout', 'diagnostics_busy']
    asyncio.run(check())


def test_redis_outage_prevents_paid_probe(client):
    from redis.exceptions import ConnectionError

    class Down:
        def eval(self, *args):
            raise ConnectionError('private-redis-marker')
    app.dependency_overrides[get_redis] = Down
    response = client.post('/v1/agent/diagnostics', json={'service': 'model'})
    assert response.status_code == 503
    assert 'marker' not in response.text


def test_search_not_configured_is_independent_of_model(client):
    provider_with({'choices': [{'message': {'content': '{"answer":"ok"}'}}]})
    app.dependency_overrides[get_provider_registry] = lambda: ProviderRegistry([])
    assert client.post('/v1/agent/diagnostics', json={'service': 'model'}).json()['code'] == 'ok'
    response = client.post('/v1/agent/diagnostics', json={'service': 'search'})
    assert response.status_code == 200
    assert response.json()['code'] == 'not_configured'
    assert response.json()['service'] == 'search'


@pytest.mark.parametrize('status,code', [(200, 'ok'), (401, 'authentication_failed'),
                                       (429, 'rate_limited'), (503, 'upstream_error')])
def test_search_diagnostic_reuses_brave_fixed_bounded_request(client, status, code):
    from pydantic import SecretStr

    from app.providers.brave import BraveSearch

    def respond(request):
        assert str(request.url).startswith('https://api.search.brave.com/res/v1/web/search?')
        assert request.url.params['q'] == 'music'
        assert request.url.params['count'] == '5'
        assert request.headers['X-Subscription-Token'] == 'private-search-marker'
        return httpx.Response(status, json={'web': {'results': []}})

    search = BraveSearch(SecretStr('private-search-marker'), httpx.Client(transport=httpx.MockTransport(respond)))
    registry = ProviderRegistry([], web_search=search)
    app.dependency_overrides[get_provider_registry] = lambda: registry
    response = client.post('/v1/agent/diagnostics', json={'service': 'search'})
    assert response.status_code == 200
    assert response.json()['code'] == code
    assert 'marker' not in response.text


def test_timed_out_search_keeps_concurrency_slot_until_worker_finishes(monkeypatch):
    import threading

    from app.agent import diagnostics

    release = threading.Event()
    started = threading.Event()

    class SlowSearch:
        def search(self, query):
            started.set()
            release.wait(1)
            return []

    monkeypatch.setattr(diagnostics, 'PROBE_TIMEOUT', 0.02)
    monkeypatch.setattr(diagnostics, '_slots', threading.BoundedSemaphore(1))

    async def check():
        try:
            response = await diagnostics.probe_search(SlowSearch())
            assert started.is_set() and response.code == 'connection_timeout'
            assert (await diagnostics.probe_search(SlowSearch())).code == 'diagnostics_busy'
        finally:
            release.set()
    asyncio.run(check())
