"use client";

import { useEffect, useRef, useState } from "react";
import { diagnoseAgentService } from "../lib/agent";
import { DIAGNOSTIC_HELP } from "../lib/diagnostics";
import { ApiError } from "../lib/errors";
import type { DiagnosticResult, ModelCapabilities } from "../types/agent";

export default function AgentSettings({ capabilities }: { capabilities: ModelCapabilities | null }) {
  const [latest, setLatest] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function check() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(null);
    try {
      const value = await diagnoseAgentService("/api", "model", controller.signal);
      if (!controller.signal.aborted) setLatest(value);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof ApiError && failure.code === "diagnostics_rate_limited"
        ? "检测次数受限，请等待一分钟后手动重试。" : "检测未完成，请检查连接或稍后重试；上次结果不能代表当前状态。");
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <details className="agent-settings">
    <summary>智能服务设置</summary>
    <div className="agent-settings-body">
      <p>模型配置：{capabilities?.model_configuration === "configured" ? "已配置（尚不代表连接成功）"
        : capabilities?.model_configuration === "local_mode" ? "基础规则模式" : capabilities?.model_configuration === "not_configured" ? "未配置" : "状态未知，请刷新页面"}</p>
      <div role="status" aria-live="polite" aria-busy={busy}>
        <p>最近模型检测：{latest ? DIAGNOSTIC_HELP[latest.code] : "尚未检测"}</p>
        {latest ? <small>检测时间：{new Date(latest.checked_at).toLocaleString()} · {Math.round(latest.latency_ms)} ms<br />请求标识：{latest.request_id}</small> : null}
      </div>
      <p>网页检索状态：{capabilities?.web_search === "available" ? "已配置，尚未验证连接" : capabilities?.web_search === "not_configured" ? "未配置" : "未知"}。与模型连接分别判断。</p>
      <button type="button" onClick={() => void check()} disabled={busy}>{busy ? "检测中…" : "检测模型连接"}</button>
      <p className="agent-footnote">点击检测会发送一次固定测试请求，可能产生少量模型费用；不会提交你的聊天，也不会自动重试。</p>
      {error ? <p role="alert">{error}</p> : null}
      <details><summary>服务端配置与重新加载</summary>
        <p>由管理员在服务器配置 <code>LLM_PROVIDER=openai_compatible</code>、<code>LLM_BASE_URL</code>、<code>LLM_MODEL</code>、<code>LLM_API_KEY</code>。继续使用现有 DeepSeek 地址与模型。</p>
        <p>保存服务端环境变量后执行 <code>docker compose up -d --force-recreate api</code>；使用自定义 CA 时保留证书 Compose 覆盖文件。直接运行时重启 API 进程。然后刷新页面，再点击检测。</p>
        <p>这里不接收、保存或显示密钥。请勿把密钥填入聊天或浏览器存储。证书错误需在实际 API 容器运行 <code>python -m scripts.model_tls_probe</code> 核对。</p>
      </details>
    </div>
  </details>;
}
