import pytest
from test_discovery_core import CatalogRegistry, result, song

from app.domain.artist_names import artist_identity
from app.domain.profile import PreferenceProfile
from app.services.recommendation import discover


def catalog(same=10, other=10, *, metadata=True):
    genres = ("folk",) if metadata else ()
    seed = song("Anchor", "Faye Wong", genres=genres)
    own = [song(f"Own {i}", "王菲", genres=genres) for i in range(same)]
    others = [song(f"Other {i}", f"Singer {i}", genres=genres) for i in range(other)]
    excluded = [song("Anchor (Live)", "Faye Wong", genres=genres),
                song("Anchor", "Singer Cover", genres=genres),
                song("Unrelated", "Dance Artist", genres=("dance",))]
    return CatalogRegistry({"Anchor": result([seed]), "Faye Wong": result(own + excluded),
                            "folk": result(others)})


@pytest.mark.parametrize("enabled,limit,expected", [
    (True, 3, 2), (True, 5, 4), (True, 10, 7),
    (False, 3, 1), (False, 5, 1), (False, 10, 2),
])
def test_explicit_mix_survives_strong_affinity_and_preserves_identity(enabled, limit, expected):
    profile = PreferenceProfile(artist_affinity={"王菲": 1000})
    response = discover("Anchor", limit, catalog(), profile, prefer_seed_artist=enabled)
    assert len(response.items) == limit
    assert sum(artist_identity(item.track.artist.name) == artist_identity("Faye Wong")
               for item in response.items) == expected
    assert len({item.key for item in response.items}) == limit
    assert all(item.track.title not in {"Anchor", "Anchor (Live)", "Unrelated"} for item in response.items)
    summary = response.artist_preference
    assert summary.applied and summary.prefer_seed_artist == enabled
    assert (summary.target_same_artist, summary.same_artist_count, summary.other_artist_count) == (
        expected, expected, limit - expected)
    assert summary.shortfalls == []
    repeated = discover("Anchor", limit, catalog(), profile, prefer_seed_artist=enabled)
    assert response.items == repeated.items


@pytest.mark.parametrize("same,other,enabled,count,same_count,shortfalls", [
    (1, 10, True, 10, 1, ["same_artist"]),
    (10, 1, False, 10, 9, ["other_artists"]),
    (1, 1, True, 2, 1, ["same_artist", "other_artists"]),
    (0, 0, False, 0, 0, ["same_artist", "other_artists"]),
])
def test_shortages_fill_only_from_eligible_candidates(same, other, enabled, count, same_count, shortfalls):
    response = discover("Anchor", 10, catalog(same, other), prefer_seed_artist=enabled)
    assert len(response.items) == count
    assert response.artist_preference.same_artist_count == same_count
    assert response.artist_preference.shortfalls == shortfalls


@pytest.mark.parametrize("enabled,queries", [
    (True, ["Anchor", "Faye Wong", "folk"]),
    (False, ["Anchor", "folk", "Faye Wong"]),
])
def test_recall_order_changes_without_increasing_budget(enabled, queries):
    registry = catalog()
    discover("Anchor", 10, registry, prefer_seed_artist=enabled)
    assert [query for query, _ in registry.calls] == queries
    assert all(limit <= 25 for _, limit in registry.calls)


def test_no_metadata_does_not_invent_queries_and_reports_shortage():
    registry = catalog(metadata=False)
    response = discover("Anchor", 5, registry, prefer_seed_artist=False)
    assert [query for query, _ in registry.calls] == ["Anchor", "Faye Wong"]
    assert response.artist_preference.same_artist_count == 5
    assert response.artist_preference.shortfalls == ["other_artists"]


def test_omitted_preference_keeps_old_policy_and_response():
    original = discover("Anchor", 5, catalog())
    explicit_none = discover("Anchor", 5, catalog(), prefer_seed_artist=None)
    assert original.items == explicit_none.items
    assert original.artist_preference is None


@pytest.mark.parametrize("intent", ["song", "theme"])
def test_unmatched_or_theme_queries_do_not_apply_artist_mix(intent):
    response = discover("quiet", 5, CatalogRegistry({}), intent=intent, prefer_seed_artist=True)
    assert not response.artist_preference.applied
    assert response.artist_preference.not_applied_reason == ("theme" if intent == "theme" else "seed_unresolved")
