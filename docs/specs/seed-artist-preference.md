# Seed artist preference / 原唱偏好

Approved 2026-10-13. Applies to the Sonora homepage discovery flow; legacy runtime, assistant,
MCP, authentication and database schema are unchanged. See ADR-039 and the three ordered TODO items.

## Behavior / 行为

ADR-042 refinement: disabled preference performs early broad catalog discovery for sparse
metadata. Preserve strict matches, then fill missing slots from new real other-artist recordings
without requiring shared genre/tag evidence. Label these as broader exploration; retain
artist caps, explicit listening constraints, deduplication and seed/version exclusions.

- Default on; persist a boolean under `sonora.prefer-seed-artist` in browser local storage.
  Missing/invalid/unavailable storage defaults on; storage failure never blocks discovery.
- On/off targets 70%/20% same-artist results, integer round-half-up against the requested limit.
  For 3/5/10 tracks: on 2/4/7; off 1/1/2. Explicit preference overrides historical affinity's
  effect on group allocation, not the existing eligibility or scoring rules.
- Resolve the song and preserve necessary artist confirmation. Reviewed canonical aliases define
  the grouping. The label refers to the identified/confirmed artist, not proof of authorship.
- Recall artist first when on, genre/tag first when off, within the existing request/deadline
  budget. Missing metadata produces no invented query. Both groups keep existing deterministic
  scores and diverse selection. The final diverse ordering cannot change group membership.
- If other-artist candidates remain short and search budget remains, try one metadata-derived
  `<genre/tag> hits` query before backfilling. No such query runs for omitted preference, full
  groups or missing metadata. Disabled requests additionally try distinct hits/songs queries
  from up to four genres/four tags and up to eight eligible peer artists, recomputing after each
  query until the total is full. This also fills missing same-artist slots with other artists.
  Provider deadlines and operation/result caps remain authoritative (ADR-041).
- When enabled, fill a group's shortage with eligible tracks from the other group. When disabled,
  cap same-artist tracks at the rounded 20% requested-count quota; only other artists may fill
  remaining slots. Return fewer if unavailable. Never pad with unrelated tracks or fixtures.
- Switch refreshes confirmed results; pending requests are cancelled and late success/error replies
  ignored. Request snapshots include seed, artist/proof/storefront, limit, language and preference.
  Unsubmitted input edits wait for submission; unresolved/theme results do not refresh on a switch.
- Retain artist and proof together on repeat submission. Expired proof is dropped on retry/switch,
  retaining the selected artist for fresh catalog validation. Loading and errors hide old results.

默认开启并记住浏览器选择；开启约七成、关闭最多为请求数量的约两成同歌手。
关闭时禁止同歌手补位，继续按元数据及相关歌手检索补满（ADR-041）；
只有检索条件、来源或预算耗尽才返回实际数量并提示重试。开启时仍允许合格候选互补。
身份确认、来源证据、版本过滤、历史反馈评分和确定性排序均保留。

## Contract / 契约

`POST /v1/recommendations/discover` adds `prefer_seed_artist: boolean | null` (default null).
Reject strings/numbers/collections with the existing 422 error envelope. Omitted/null retains
old selection and returns a null summary. Frontend sends an explicit boolean, including false.

The optional response `artist_preference` contains:

| Field | Meaning |
| --- | --- |
| `prefer_seed_artist` | Request choice |
| `applied` | Whether a resolved, confirmed seed permitted allocation |
| `target_same_artist` | Rounded same-artist target; zero if not applied |
| `same_artist_count`, `other_artist_count` | Actual allocated counts; zero if not applied |
| `shortfalls` | `same_artist` / `other_artists` groups with insufficient candidates before filling |
| `not_applied_reason` | `theme`, `seed_unresolved`, `confirmation_required`, or null when applied |

## Implementation and verification / 实施与验证

Domain allocation lives in `services/api/app/domain/artist_preference.py`; the discovery service
owns recall order and the API owns the response. Homepage control/result presentation is separate
from request orchestration; transport types use canonical models only. Follow existing Python
snake_case and TypeScript camelCase conventions, typed immutable snapshots, and bilingual copy.

From `services/api` (activate its `.venv` on Windows):

```sh
python -m pytest -q
python -m ruff check app tests scripts
python -m compileall -q app
python -m app.domain.evaluation
```

From `apps/web`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
From root: `python scripts/legacy_smoke.py`.

Tests cover target counts, alias identity, version filters, shortages, strong history, deterministic
results, absent fields, invalid inputs, model confirmation, defaults/persistence, storage failures,
dirty inputs, rapid switches, late failures, expired proofs and retries. Browser acceptance uses
an isolated profile and disposable account on local Docker, real catalog songs, desktop and mobile
viewports, keyboard switching and reload persistence. Exact ratios are proven with fixed fixtures;
live catalogs may be incomplete. Never commit credentials, generated screenshots or build artifacts.
