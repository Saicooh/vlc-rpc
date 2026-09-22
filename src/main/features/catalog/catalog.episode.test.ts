import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { EpisodeTitleResolver } from "./catalog.episode"
import type { CatalogResult } from "./catalog.types"

function status(filename: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0, time: 0, duration: 1500, rate: 1 },
		mediaType: "video",
		media: { title: filename, filename },
	}
}

function reply(body: unknown, ok = true): { ok: boolean; json: () => Promise<unknown> } {
	return { ok, json: async () => body }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("EpisodeTitleResolver", () => {
	it("gets a named episode by exact season and number, sharing and caching the lookup", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch")
				? reply({ id: 14459, name: "Re:Zero kara Hajimeru Isekai Seikatsu" })
				: reply({ name: "Good Loser" }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver()
		const video = status("Re.ZERO.S04E17.mkv")

		const first = await Promise.all([resolver.resolve(video, null), resolver.resolve(video, null)])
		const cached = await resolver.resolve(video, null)

		expect(first).toEqual(["Good Loser", "Good Loser"])
		expect(cached).toBe("Good Loser")
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://api.tvmaze.com/shows/14459/episodebynumber?season=4&number=17",
		)
	})

	it("does not use a fuzzy match for a different show or guess a different season", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch")
				? reply({ id: 17, name: "An Unrelated Show" })
				: reply({ name: "Wrong Episode" }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver()

		expect(await resolver.resolve(status("Re.ZERO.S05E17.mkv"), null)).toBeNull()
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it("keeps the number when TVMaze has no name for that season and episode", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url.includes("singlesearch")
					? reply({ id: 14459, name: "Re:Zero kara Hajimeru Isekai Seikatsu" })
					: reply({}, false),
			),
		)
		expect(await new EpisodeTitleResolver().resolve(status("Re.ZERO.S05E17.mkv"), null)).toBeNull()
	})

	it("skips the network when VLC or the filename already names the episode", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver()
		const tagged = status("Re.ZERO.S04E17.mkv")
		tagged.media.episodeTitle = "Good Loser"

		expect(await resolver.resolve(tagged, null)).toBeNull()
		expect(await resolver.resolve(status("Re.ZERO.S04E17.Good.Loser.mkv"), null)).toBeNull()
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("uses AniList streaming titles for an absolute anime episode without a season", async () => {
		const fetchMock = vi.fn(async (_url: string) =>
			reply({
				data: {
					Media: {
						streamingEpisodes: [
							{ title: "Episode 16 - Previous", site: "Crunchyroll" },
							{ title: "Episode 17 - Good Loser", site: "Crunchyroll" },
						],
					},
				},
			}),
		)
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Re:ZERO",
			poster: null,
			mediaKind: "tv",
			episode: 17,
			sourceUrl: "https://anilist.co/anime/189046",
		}

		expect(
			await new EpisodeTitleResolver().resolve(status("[Fansub] Re ZERO - 17.mkv"), catalog),
		).toBe("Good Loser")
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graphql.anilist.co")
	})

	it("does not fetch episode names for a film or a video without an episode number", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver()
		const movie: CatalogResult = { title: "The Matrix", poster: null, mediaKind: "movie" }
		expect(await resolver.resolve(status("The.Matrix.1999.mkv"), movie)).toBeNull()
		expect(await resolver.resolve(status("holiday-clip.mkv"), null)).toBeNull()
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
