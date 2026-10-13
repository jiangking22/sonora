from dataclasses import dataclass, field
from typing import Literal

from app.domain.artist_names import artist_identity
from app.domain.music import Track
from app.domain.pipeline import RankedTrack, rerank_diverse


@dataclass(frozen=True)
class ArtistPreferenceSummary:
    prefer_seed_artist: bool
    applied: bool = False
    target_same_artist: int = 0
    same_artist_count: int = 0
    other_artist_count: int = 0
    shortfalls: list[Literal["same_artist", "other_artists"]] = field(default_factory=list)
    not_applied_reason: Literal["theme", "seed_unresolved", "confirmation_required"] | None = None


def select_artist_mix(ranked: list[RankedTrack], seed: Track, limit: int,
                      enabled: bool) -> tuple[list[RankedTrack], ArtistPreferenceSummary]:
    # Integer arithmetic gives round-half-up, including 70% of five = four.
    target = (limit * (7 if enabled else 2) + 5) // 10
    identity = artist_identity(seed.artist.name)
    same, other = [], []
    for item in ranked:
        (same if artist_identity(item.track.artist.name) == identity else other).append(item)
    same_count, other_count = min(target, len(same)), min(limit - target, len(other))
    shortfalls = []
    if same_count < target:
        shortfalls.append("same_artist")
    if other_count < limit - target:
        shortfalls.append("other_artists")
    # Only one group can have spare candidates when a quota is short.
    same_count = min(len(same), limit - other_count)
    other_count = min(len(other), limit - same_count)
    selected = rerank_diverse(same, same_count) + rerank_diverse(other, other_count)
    # This pass orders the selected set; it cannot replace either group's allocation.
    selected = rerank_diverse(selected, len(selected))
    return selected, ArtistPreferenceSummary(enabled, True, target, same_count, other_count, shortfalls)
