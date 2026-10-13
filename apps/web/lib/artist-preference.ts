const KEY = "sonora.prefer-seed-artist";

export function readArtistPreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveArtistPreference(value: boolean): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Storage is optional: this page's in-memory choice still applies.
  }
}
