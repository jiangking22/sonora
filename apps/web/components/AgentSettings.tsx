"use client";

import { useEffect, useRef, useState } from "react";
import { diagnoseAgentService } from "../lib/agent";
import { diagnosticHelp } from "../lib/diagnostics";
import { ApiError } from "../lib/errors";
import type { DiagnosticResult, ModelCapabilities } from "../types/agent";

export default function AgentSettings({ capabilities }: { capabilities: ModelCapabilities | null }) {
  const [latest, setLatest] = useState<Partial<Record<"model" | "search", DiagnosticResult>>>({});
  const [busy, setBusy] = useState<"model" | "search" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function check(service: "model" | "search") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(service); setError(null);
    try {
      const value = await diagnoseAgentService("/api", service, controller.signal);
      if (!controller.signal.aborted) setLatest((previous) => ({ ...previous, [service]: value }));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof ApiError && failure.code === "diagnostics_rate_limited"
        ? "检测次数受限，请等待一分钟后手动重试。" : "检测未完成，请检查连接或稍后重试；上次结果不能代表当前状态。");
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  }

  return <details className="agent-settings">
    <summary>智能服务设置</summary>
    <div className="agent-settings-body">
      <p>模型配置：{capabilities?.model_configuration === "configured" ? "已配置（尚不代表连接成功）"
        : capabilities?.model_configuration === "local_mode" ? "基础规则模式" : capabilities?.model_configuration === "not_configured" ? "未配置" : "状态未知，请刷新页面"}</p>
      <div role="status" aria-live="polite" aria-busy={!!busy}>
        {(["model", "search"] as const).map((service) => {
          const check = latest[service];
          return <div key={service}><p>最近{service === "model" ? "模型" : "搜索"}检测：{check ? diagnosticHelp(check.code, service) : "尚未检测"}</p>
            {check ? <small>检测时间：{new Date(check.checked_at).toLocaleString()} · {Math.round(check.latency_ms)} ms<br />请求标识：{check.request_id}</small> : null}</div>;
        })}
      </div>
      <p>网页检索状态：{capabilities?.web_search === "available" ? "已配置（连接结果见最近搜索检测）" : capabilities?.web_search === "not_configured" ? "未配置" : "未知"}。与模型连接分别判断。</p>
      <div className="agent-diagnostic-actions"><button type="button" onClick={() => void check("model")} disabled={!!busy}>{busy === "model" ? "检测中…" : "检测模型连接"}</button>
      <button type="button" onClick={() => void check("search")} disabled={!!busy}>{busy === "search" ? "检测中…" : "检测搜索连接"}</button></div>
      <p className="agent-footnote">点击检测会发送一次固定测试请求，可能产生少量模型或搜索费用；不会提交你的聊天，也不会自动重试。</p>
      {error ? <p role="alert">{error}</p> : null}
      <details><summary>服务端配置与重新加载</summary>
        <p>由管理员在服务器配置 <code>LLM_PROVIDER=openai_compatible</code>、<code>LLM_BASE_URL</code>、<code>LLM_MODEL</code>、<code>LLM_API_KEY</code>。继续使用现有 DeepSeek 地址与模型。</p>
        <p>保存服务端环境变量后执行 <code>docker compose up -d --force-recreate api</code>；使用自定义 CA 时保留证书 Compose 覆盖文件。直接运行时重启 API 进程。然后刷新页面，再点击检测。</p>
        <p>这里不接收、保存或显示密钥。请勿把密钥填入聊天或浏览器存储。证书错误需在实际 API 容器运行 <code>python -m scripts.model_tls_probe</code> 核对。</p>
      </details>
      <details><summary>配置 Brave 网页搜索</summary>
        <p>Brave 使用独立的服务端 <code>BRAVE_SEARCH_API_KEY</code>，不能用 DeepSeek 密钥替代。管理员在服务器环境中配置，并保持 <code>ENABLE_MUSIC_PROVIDERS=true</code>；重新创建 API 容器或重启 API 进程，再刷新页面并检测搜索连接。</p>
        <p>模型可用不等于网页搜索可用。搜索检测只查询固定词，不读取聊天、不调用模型，也不核实某首歌曲。实际聊天按需要检索；网页线索还须通过真实曲库核实，核实成功才展示引用。</p>
        <p>网页检索失败时，相关资料未核实；模型生成的链接不能作为搜索证据。当前模型原生搜索仍不可用。</p>
      </details>
    </div>
  </details>;
}
