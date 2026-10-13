import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductClient from "../components/ProductClient";
import { ArtistPreferenceResult } from "../components/ArtistPreference";
import type { DiscoveryResponse, Track } from "../types/music";

const api = vi.hoisted(() => ({ discover: vi.fn(), profile: vi.fn(), cancelDiscovery: vi.fn() }));
vi.mock("../lib/api", () => ({ createApiClient: () => api }));
const track: Track = { title: "Anchor", artist: { name: "Faye Wong", provider_artist_id: null },
  album: null, duration_ms: null, artwork_url: null, language: "zh", genres: ["folk"], tags: [],
  popularity: null, canonical_key: "anchor::faye wong",
  source: { provider: "itunes", provider_track_id: "seed", external_url: null } };
const result: DiscoveryResponse = { request_id: "first", items: [], sources: {}, seed_track: track,
  seed_candidates: [], seed_status: "matched", seed_storefront: "TW", resolution_id: "verified-recording",
  guidance: "Matched", guidance_provider: "local", guidance_status: "ready",
  artist_preference: { applied: true, prefer_seed_artist: true, target_same_artist: 4,
    same_artist_count: 2, other_artist_count: 3, shortfalls: ["same_artist"], not_applied_reason: null } };

beforeEach(() => {
  vi.resetAllMocks();
  api.profile.mockResolvedValue({ artists: [], genres: [], tags: [], languages: [], recent_feedback: [] });
  api.discover.mockResolvedValue(result);
});
afterEach(() => vi.restoreAllMocks());

it.each(["en", "zh"] as const)("explains disabled shortages without promising same-artist backfill (%s)", (language) => {
  render(<ArtistPreferenceResult language={language} summary={{ ...result.artist_preference!,
    prefer_seed_artist: false, same_artist_count: 1, other_artist_count: 0,
    shortfalls: ["other_artists"] }} />);
  expect(screen.getByText(language === "en"
    ? "Could not fill this request with other artists from the available sources. Search again to retry; no extra seed-artist tracks were added."
    : "当前来源未能凑满其他歌手作品，请再次发现音乐以重试；不使用同歌手作品补位。")).toBeInTheDocument();
});

async function start() {
  const view = render(<ProductClient />);
  await screen.findByText("Ready to discover");
  fireEvent.change(screen.getByLabelText("Song or mood"), { target: { value: "Anchor" } });
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  await screen.findByText("Anchor · Faye Wong");
  return view;
}

it("defaults on, sends an explicit preference and renders truthful bilingual counts", async () => {
  await start();
  expect(screen.getByRole("switch", { name: "Seed artist preference" })).toBeChecked();
  expect(api.discover.mock.calls[0][7]).toBe(true);
  expect(screen.getByText("Same artist: 2 · Other artists: 3")).toBeInTheDocument();
  expect(screen.getByText(/Not enough same-artist tracks/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "切换为中文" }));
  expect(screen.getByRole("switch", { name: "原唱偏好" })).toBeChecked();
  expect(screen.getByText("同歌手 2 首 · 其他歌手 3 首")).toBeInTheDocument();
});

it("refreshes the confirmed recording immediately and remembers the browser choice", async () => {
  const view = await start();
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(2));
  expect(api.discover).toHaveBeenLastCalledWith("Anchor", 5, "en", "Faye Wong", "TW",
    "verified-recording", undefined, false);
  expect(api.cancelDiscovery).toHaveBeenCalled();
  view.unmount();
  render(<ProductClient />);
  await screen.findByText("Ready to discover");
  expect(screen.getByRole("switch")).not.toBeChecked();
});

it("changes only the setting when the input is an unsubmitted edit", async () => {
  await start();
  fireEvent.change(screen.getByLabelText("Song or mood"), { target: { value: "New song" } });
  fireEvent.click(screen.getByRole("switch"));
  expect(api.discover).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(2));
  expect(api.discover.mock.calls[1][0]).toBe("New song");
  expect(api.discover.mock.calls[1][7]).toBe(false);
});

it("preserves artist confirmation and applies the latest switch value after selection", async () => {
  api.discover.mockResolvedValueOnce({ ...result, seed_status: "ambiguous", seed_track: null,
    seed_candidates: [track], artist_preference: null });
  render(<ProductClient />);
  await screen.findByText("Ready to discover");
  fireEvent.change(screen.getByLabelText("Song or mood"), { target: { value: "Anchor" } });
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  await screen.findByText("Which artist did you mean?");
  fireEvent.click(screen.getByRole("switch"));
  expect(api.discover).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Anchor · Faye Wong" }));
  await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(2));
  expect(api.discover.mock.calls[1][3]).toBe("Faye Wong");
  expect(api.discover.mock.calls[1][7]).toBe(false);
});

it("ignores late replies after rapid switches even when cancellation is ignored", async () => {
  await start();
  let release!: (value: DiscoveryResponse) => void;
  api.discover.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.queryByText("Same artist: 2 · Other artists: 3")).not.toBeInTheDocument();
  api.discover.mockResolvedValueOnce({ ...result, seed_track: { ...track, title: "Latest" } });
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("Latest · Faye Wong");
  await act(async () => release({ ...result, seed_track: { ...track, title: "Stale" } }));
  expect(screen.queryByText("Stale · Faye Wong")).not.toBeInTheDocument();
  expect(api.discover.mock.calls.map((args) => args[7])).toEqual([true, false, true]);
});

it("retries a failed switch with the confirmed identity and hides the old result", async () => {
  await start();
  api.discover.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByRole("alert");
  expect(screen.queryByText("Same artist: 2 · Other artists: 3")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Anchor · Faye Wong");
  expect(api.discover).toHaveBeenLastCalledWith("Anchor", 5, "en", "Faye Wong", "TW",
    "verified-recording", undefined, false);
});

it("keeps artist and proof paired when submitting again after an automatic-seed switch", async () => {
  await start();
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("Anchor · Faye Wong");
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(3));
  expect(api.discover).toHaveBeenLastCalledWith("Anchor", 5, "en", "Faye Wong", "TW",
    "verified-recording", undefined, false);
});

it("continues working when local storage cannot be read or written", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  await start();
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("switch")).not.toBeChecked();
});

it("drops expired proof but retains the confirmed artist on another switch", async () => {
  await start();
  api.discover.mockRejectedValueOnce(Object.assign(new Error("expired"), { code: "resolution_expired" }));
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("Anchor · Faye Wong");
  expect(api.discover).toHaveBeenLastCalledWith("Anchor", 5, "en", "Faye Wong", "TW",
    undefined, undefined, true);
});

it("restarts an initial in-flight search with the new preference and ignores its late failure", async () => {
  let reject!: (reason: Error) => void;
  api.discover.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<ProductClient />);
  await screen.findByText("Ready to discover");
  fireEvent.change(screen.getByLabelText("Song or mood"), { target: { value: "Anchor" } });
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("Anchor · Faye Wong");
  await act(async () => reject(new Error("late failure")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.discover.mock.calls.map((args) => args[7])).toEqual([true, false]);
});

it("keeps theme results without refreshing and explains why the preference is not applied", async () => {
  api.discover.mockResolvedValue({ ...result, seed_track: null, seed_status: "unresolved",
    artist_preference: { ...result.artist_preference!, applied: false, not_applied_reason: "theme" } });
  render(<ProductClient />);
  await screen.findByText("Ready to discover");
  fireEvent.click(screen.getByRole("switch"));
  expect(api.discover).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Song or mood"), { target: { value: "jazz" } });
  fireEvent.click(screen.getByRole("button", { name: /find music/i }));
  await screen.findByText("Artist preference does not apply to a mood or theme search.");
  fireEvent.click(screen.getByRole("switch"));
  expect(api.discover).toHaveBeenCalledTimes(1);
});
