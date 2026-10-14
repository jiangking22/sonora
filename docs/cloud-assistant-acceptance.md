# Cloud assistant recovery / 云端助手恢复

## 2026-10-14: TLS investigation

Started Docker Desktop and the original four stopped containers. The original API returned a
real configured DeepSeek conversation answer. Both DNS addresses (116.196.150.245 and
119.188.175.46) passed two verified TLS handshakes each. OpenSSL independently returned verify
code 0 for both chains: api.deepseek.com → TrustAsia DV TLS RSA CA 2025 → DigiCert Global Root G2.
Leaf expiry: 2026-12-01. System store: 150 CA certificates. No proxy environment variables;
model transport disables environment proxy routing. This does not exclude historical alternate
DNS routes or transparent network interception.

历史 tls_verification_failed 本次未复现，根因尚未确定，不能声称已修复缺失 CA。
保留原 Key、模型和系统信任库；新增可选只读 CA 挂载，仅在部署者核实私有 CA 后使用。
两项新增回归测试先失败后通过，覆盖系统信任补充及无效/缺失 PEM 的安全失败。

Brave is not configured. Live search/citation validation awaits a valid operator-provided key;
mocked search/citation results must not be described as live verification.

Item 1: 402 API tests, Ruff/compile and legacy smoke passed. Standard Docker build failed at
Docker Hub authentication connectivity; updated application files using the existing local image
and unchanged dependencies, then reverified both TLS endpoints and a real model answer.
Use `python -m scripts.model_tls_probe` so source imports resolve from the container workdir.

## Item 2: status, diagnostics and retry

13 diagnostic regressions and two UI regressions failed before implementation. Final checks:
423 API / 107 Web tests; Ruff/compile, ESLint/typecheck/production build, legacy smoke passed.
Anonymous and CSRF rejection, Redis outage/rate limit, concurrent checks/timeouts, safe error
categories and compatible JSON/SSE fallback are covered. Real Edge against updated containers
passed authenticated model check and cloud chat. A browser-controlled TLS error displayed actionable
help; exactly one user-clicked retry then returned a real model answer. Screenshots at 1440px and
390px were inspected: no horizontal overflow or page exceptions. Mocked failure is not live TLS
reproduction. Actual search remains unconfigured. Latest diagnostics are page-local, not persisted.

## Item 3: independent search guidance and detection (2026-10-15)

Six API/search and two UI regressions failed before implementation. Final verification:
429 API / 109 Web tests; API Ruff/compile, Web lint/typecheck/production build and
`python scripts/legacy_smoke.py` pass. One pre-existing Starlette/httpx deprecation warning remains.
Tests cover unconfigured search despite a successful model, fixed Brave URL/query/count,
auth/rate/upstream errors and timeout slot retention. Existing progressive-search tests validate
canonical recording identity, reject invented IDs, preserve source-bound references, and retain
cancellation/deadline/budget behavior. No ranking or legacy-source diff exists.

Updated local containers pass real authenticated model diagnostics, cloud chat, explicit manual
retry after a browser-controlled TLS fault, and independent search-not-configured detection.
Controlled SSE fixtures verify failed search's unverified-information notice and citation rendering
at 390px/1440px; screenshots were inspected, with no overflow/page exceptions. These fixtures
are not real Brave retrieval. Both task-created QA accounts and dependent rows were removed;
all four containers are healthy. Original credentials/model remain unchanged.

### Explicit limits / 未验证范围

- Historical intermittent TLS failure did not recur; its underlying cause remains unresolved.
  Current actual-container chain and real model calls succeed with verification enabled.
- No Brave key is configured; live Brave search and resulting catalog-bound citations are unverified.
  Configure the server-side key and use the documented independent check before live acceptance.
- Standard Docker Hub image build was blocked by registry connectivity. Runtime was updated from
  cached existing images with unchanged dependencies and the verified local Web production build.
  This is not a clean network image rebuild. No public deployment or remote CI run is claimed.
- Physical mobile keyboard behavior was not newly tested; responsive browser viewport was tested.

三项按顺序独立交付；不关闭证书校验，不添加本地大模型或个人密钥存储，不自动重试聊天。
