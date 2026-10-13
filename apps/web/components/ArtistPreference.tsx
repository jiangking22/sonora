import { copyFor } from "../lib/i18n";
import type { DiscoveryResponse, InterfaceLanguage } from "../types/music";

export function ArtistPreferenceControl({ enabled, ready, language, onChange }: {
  enabled: boolean; ready: boolean; language: InterfaceLanguage; onChange: () => void;
}) {
  const copy = copyFor(language);
  return <div className="artist-preference-control">
    <button type="button" role="switch" aria-checked={enabled} disabled={!ready}
      aria-labelledby="artist-preference-label" aria-describedby="artist-preference-help"
      className="artist-preference-switch" onClick={onChange}>
      <span className="switch-track" aria-hidden="true"><span /></span>
      <span id="artist-preference-label">{copy.artistPreference}</span>
      <span className="switch-state" aria-hidden="true">{enabled ? copy.preferenceOn : copy.preferenceOff}</span>
    </button>
    <p id="artist-preference-help">{enabled ? copy.artistPreferenceOnHelp : copy.artistPreferenceOffHelp}</p>
  </div>;
}

export function ArtistPreferenceResult({ summary, language }: {
  summary: DiscoveryResponse["artist_preference"]; language: InterfaceLanguage;
}) {
  if (!summary) return null;
  const copy = copyFor(language);
  if (!summary.applied) return <p className="artist-preference-summary">{
    summary.not_applied_reason === "theme" ? copy.artistPreferenceTheme : copy.artistPreferenceUnresolved
  }</p>;
  return <div className="artist-preference-summary" aria-live="polite">
    <p>{copy.artistPreferenceResult}: {summary.prefer_seed_artist ? copy.preferenceOn : copy.preferenceOff}</p>
    <p>{language === "zh"
      ? `同歌手 ${summary.same_artist_count} 首 · 其他歌手 ${summary.other_artist_count} 首`
      : `Same artist: ${summary.same_artist_count} · Other artists: ${summary.other_artist_count}`}</p>
    {summary.shortfalls.length ? <p>{summary.shortfalls.length === 2 ? copy.artistPreferenceBothShort
      : summary.shortfalls[0] === "same_artist" ? copy.artistPreferenceSameShort
      : summary.prefer_seed_artist ? copy.artistPreferenceOtherShort : copy.artistPreferenceOtherShortStrict}</p> : null}
  </div>;
}
