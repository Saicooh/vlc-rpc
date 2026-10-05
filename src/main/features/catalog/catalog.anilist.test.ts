import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { AniListProvider } from "./catalog.anilist"
import type { Candidate } from "./catalog.types"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: true, json: async () => JSON.parse(body) })),
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("AniListProvider", () => {
	it("does not let the artwork fallback accept a title with a conflicting film year", async () => {
		const provider = new AniListProvider()
		vi.spyOn(provider, "search").mockResolvedValue([
			{
				provider: "anilist",
				id: "1",
				title: "Monster",
				aliases: [],
				mediaKind: "tv",
				year: 2004,
				posterUrl: "https://example.test/wrong.jpg",
			},
		])
		expect(
			await provider.searchBest("Monster", { title: "Monster", year: 2023, signal: "western" }),
		).toBeNull()
	})
	it("uses episode context to find a sequel missing from the base search", async () => {
		const provider = new AniListProvider()
		const first: Candidate = {
			provider: "anilist",
			id: "1",
			title: "Overlord",
			aliases: [],
			mediaKind: "tv",
			posterUrl: "https://example.test/first.jpg",
		}
		const second: Candidate = {
			...first,
			id: "2",
			title: "Overlord II",
			posterUrl: "https://example.test/second.jpg",
		}
		const search = vi
			.spyOn(provider, "search")
			.mockResolvedValueOnce([first])
			.mockResolvedValueOnce([second])
		expect(
			await provider.searchBest("Overlord", {
				title: "Overlord",
				season: 2,
				episode: 4,
				signal: "western",
			}),
		).toEqual(second)
		expect(search.mock.calls.map(([title]) => title)).toEqual(["Overlord", "Overlord Season 2"])
	})
	it("normalizes a search result with romaji, english, native and synonyms as aliases", async () => {
		respondWith(fixture("anilist-search-response"))

		const provider = new AniListProvider()
		const results = await provider.search("Sora wa Akai Kawa no Hotori")

		expect(results).toEqual([
			{
				provider: "anilist",
				id: "207809",
				title: "Sora wa Akai Kawa no Hotori",
				aliases: ["Red River", "天は赤い河のほとり", "Anatolia Story"],
				year: 2026,
				mediaKind: "tv",
				posterUrl:
					"https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx207809-cpS7CAyjN7iP.jpg",
			},
		])
	})

	it("returns an empty list when there are no results", async () => {
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const results = await provider.search("zzxxqqnonexistentqueryxyz123")

		expect(results).toEqual([])
	})

	it("rejects when the response is not ok, so the caller can tell it apart from zero results", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 503 })),
		)

		const provider = new AniListProvider()
		await expect(provider.search("anything")).rejects.toThrow("HTTP 503")
	})

	it("rejects when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down")
			}),
		)

		const provider = new AniListProvider()
		await expect(provider.search("anything")).rejects.toThrow("network down")
	})

	it("waits at least 250ms between consecutive requests", async () => {
		vi.useFakeTimers()
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const first = provider.search("a")
		await vi.advanceTimersByTimeAsync(0)
		await first

		const second = provider.search("b")
		await vi.advanceTimersByTimeAsync(0)

		const fetchCallsBeforeWait = vi.mocked(fetch).mock.calls.length
		expect(fetchCallsBeforeWait).toBe(1)

		await vi.advanceTimersByTimeAsync(250)
		await second

		expect(vi.mocked(fetch).mock.calls.length).toBe(2)
	})

	it("spaces out concurrent requests instead of firing them all at once", async () => {
		vi.useFakeTimers()
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const all = Promise.all([provider.search("a"), provider.search("b"), provider.search("c")])

		await vi.advanceTimersByTimeAsync(0)
		expect(vi.mocked(fetch).mock.calls.length).toBe(1)

		await vi.advanceTimersByTimeAsync(250)
		expect(vi.mocked(fetch).mock.calls.length).toBe(2)

		await vi.advanceTimersByTimeAsync(250)
		expect(vi.mocked(fetch).mock.calls.length).toBe(3)

		await all
	})
})
