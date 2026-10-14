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
