import type { DiagnosticCode } from "../types/agent";

export const DIAGNOSTIC_HELP: Record<DiagnosticCode, string> = {
  ok: "模型连接可用。本次检测通过，不代表已执行网页搜索。",
  not_configured: "尚未配置云端服务。请在服务端设置模型环境变量，再重新加载 API。",
  tls_verification_failed: "证书校验失败。请管理员在 API 容器核对证书链、系统信任库和网络代理；需要私有 CA 时只读挂载已核实的证书，保持 HTTPS 校验开启。",
  tls_configuration_error: "证书配置无法读取。请检查 LLM_CA_BUNDLE 对应文件的挂载、权限和 PEM 格式，再重新加载 API。",
  connection_timeout: "连接超时。请检查服务器网络、DNS 和服务状态，稍后手动重试。",
  connection_failed: "无法连接服务。请检查服务端地址、DNS、防火墙和网络路径。",
  authentication_failed: "鉴权失败。请管理员在服务端检查密钥是否有效及账号权限，再重新加载 API。",
  rate_limited: "服务请求受限。请稍后手动重试，并检查服务端账号配额。",
  upstream_error: "上游服务异常。请检查服务状态及服务端模型配置，稍后手动重试。",
  model_output_incompatible: "模型输出不兼容。请检查所选模型是否支持当前 Chat Completions 和 JSON 输出格式。",
  search_output_incompatible: "搜索服务返回格式异常。请检查 Brave Search API 服务状态，稍后手动再试；相关资料未核实。",
  diagnostics_busy: "连接检测正忙。请稍后手动再试。",
};

export function isDiagnosticCode(value: unknown): value is DiagnosticCode {
  return typeof value === "string" && Object.hasOwn(DIAGNOSTIC_HELP, value);
}


export function diagnosticHelp(code: DiagnosticCode, service: "model" | "search") {
  if (service === "search" && code === "ok") return "网页搜索连接可用。仅完成固定测试查询，尚未核实本轮聊天资料。";
  if (service === "search" && code === "not_configured") return "网页搜索未配置。请在服务端设置 BRAVE_SEARCH_API_KEY 并启用 ENABLE_MUSIC_PROVIDERS，再重新加载 API。";
  return DIAGNOSTIC_HELP[code];
}
