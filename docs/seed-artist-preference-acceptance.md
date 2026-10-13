# Seed artist preference acceptance / 原唱偏好验收

Verified locally on 2026-10-13. API and Web Docker images were rebuilt from this implementation;
API, Web, PostgreSQL and Redis are healthy. No dependency, schema or credential changes.
This is local acceptance, not a remote deployment or a guarantee about future catalog availability.

## Automated verification / 自动验证

- 383 API tests pass, including strict boolean validation, omitted-field compatibility,
  confirmation states, deterministic 3/5/10 ratios, aliases, filtering, shortages and recall budgets.
- 102 Web tests pass, including 11 preference scenarios: default/persistence, storage failures,
  dirty inputs, artist confirmation, rapid switches, late success/failure, retry and expired proofs.
- Ruff, Python compile, ESLint, TypeScript and production Web build pass.
- Existing offline evaluator remains relevance 1.0, personalization effect 1.0, diversity 0.8333,
  coverage 0.8 (two cases, `evaluation_v1`); this is the legacy policy baseline, not a live accuracy claim.
- Legacy help and isolated HTTP 200 smoke pass. The four legacy runtime files are unchanged.

New backend and frontend regressions failed before implementation. Review also reproduced and
fixed submitting a confirmation ID without its artist after an automatic-seed switch. Three more
failing regressions preceded the bounded supplementary recall discovered during runtime acceptance.
The API runner reports the existing Starlette/httpx deprecation warning.

## Real catalog and browser checks / 真实曲库与浏览器

Isolated Edge via bundled Playwright, a disposable registered account, real same-origin auth/API
proxy and configured music catalogs. No mock recommendation responses were used in these checks.

| Seed / 歌曲 | View / 界面 | Preference / 开关 | Same artist / 同歌手 | Other artists / 其他歌手 | External calls / 外部调用 |
| --- | --- | --- | ---: | ---: | ---: |
| Dreams · Fleetwood Mac | Desktop 1440×1000 | On | 7 | 3 | 9 |
| Dreams · Fleetwood Mac | Desktop, Space key | Off | 2 | 8 | 10 |
| Dreams · Fleetwood Mac | Mobile 390×844 | On | 7 | 3 | 7 |
| Dreams · Fleetwood Mac | Mobile 390×844 | Off | 2 | 8 | 10 |
| 我好想你 · sodagreen / 苏打绿 | Mobile 390×844 | On | 7 | 3 | 10 |
| 我好想你 · sodagreen / 苏打绿 | Mobile 390×844 | Off | 2 | 8 | 10 |

All six results contain ten unique canonical tracks, with rendered card counts matching the
response and displayed summary. Switching reuses the verified recording; keyboard focus remains
on the switch. EN/中文, reload persistence with the switch off, and unsubmitted edits without a
new discovery request passed. No horizontal overflow at 320, 390, 768, 1024 or 1440 pixels.
Desktop and mobile screenshots were inspected. Screenshots and test credentials are not committed.
Temporary accounts and sessions were removed after sign-out; existing user accounts were untouched.

早期实测中，单独按曲风名检索导致其他歌手合格候选不足：系统正确显示不足并补足数量。
检查确认录音的 Mandopop 元数据没有丢失，问题在于检索结果缺少匹配标签。最终实现仅在不足且预算
允许时补查一次基于已有曲风／标签的 hits 查询，保留原筛选规则，随后两首歌均达到开启 7/3、关闭 2/8。
所有比例均为当次可用曲库实测，候选不足时仍允许跨组补足，并如实提示。

NetEase returned `invalid_payload` during the final Chinese-song requests; available catalogs still
supplied the verified ten-track mixes. Provider failures remain partial-source states. Browser
page exceptions: zero. Console observations include the existing favicon 404 and unused CSS
preload warnings; no application exception was observed. Client cancellation prevents stale UI
updates; an already-running synchronous upstream call may finish within its existing bounds.
