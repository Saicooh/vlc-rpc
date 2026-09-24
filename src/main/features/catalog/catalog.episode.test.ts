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

	it("prefers a Spanish episode title when the option is enabled", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url !== "https://apis.justwatch.com/graphql") return reply({}, false)
			const body = JSON.parse(String(init?.body)) as { query: string }
			if (body.query.includes("EpisodeTitleSearch")) {
				return reply({ data: { popularTitles: { edges: [{ node: { id: "ts41257" } }] } } })
			}
			return reply({
				data: {
					node: {
						seasons: [
							{
								content: { seasonNumber: 4 },
								episodes: [
									{
										content: {
											title: "Buen perdedor",
											seasonNumber: 4,
											episodeNumber: 17,
										},
									},
								],
							},
						],
					},
				},
			})
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Re ZERO",
			poster: null,
			mediaKind: "tv",
		}

		expect(
			await new EpisodeTitleResolver(() => true).resolve(status("Re.ZERO.S04E17.mkv"), catalog),
		).toBe("Buen perdedor")
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it("gets the Spanish title for an Erai-raws file with an explicit third season", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url !== "https://apis.justwatch.com/graphql") return reply({}, false)
			const body = JSON.parse(String(init?.body)) as {
				query: string
				variables: Record<string, unknown>
			}
			if (body.query.includes("EpisodeTitleSearch")) {
				expect(body.query).not.toContain("$language: Language!")
				expect(body.variables).not.toHaveProperty("language")
				return reply({ data: { popularTitles: { edges: [{ node: { id: "ts79325" } }] } } })
			}
			return reply({
				data: {
					node: {
						seasons: [
							{
								content: { seasonNumber: 3 },
								episodes: [
									{
										content: {
											title: "Un resplandor solo mío",
											seasonNumber: 3,
											episodeNumber: 4,
										},
									},
								],
							},
						],
					},
				},
			})
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Uma Musume: Pretty Derby Season 3",
			poster: null,
			mediaKind: "tv",
		}
		const filename =
			"[Erai-raws] Uma Musume - Pretty Derby Season 3 - 04 [1080p][Multiple Subtitle][173E422F]"

		expect(await new EpisodeTitleResolver(() => true).resolve(status(filename), catalog)).toBe(
			"Un resplandor solo mío",
		)
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it("falls back to the English lookup when Spanish only has a generic episode label", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url === "https://apis.justwatch.com/graphql") {
				const body = JSON.parse(String(init?.body)) as { query: string }
				if (body.query.includes("EpisodeTitleSearch")) {
					return reply({ data: { popularTitles: { edges: [{ node: { id: "ts41257" } }] } } })
				}
				return reply({
					data: {
						node: {
							seasons: [
								{
									content: { seasonNumber: 4 },
									episodes: [
										{
											content: {
												title: "Episodio 17",
												seasonNumber: 4,
												episodeNumber: 17,
											},
										},
									],
								},
							],
						},
					},
				})
			}
			if (url.includes("singlesearch")) {
				return reply({ id: 14459, name: "Re ZERO" })
			}
			return reply({ name: "Good Loser" })
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = { title: "Re ZERO", poster: null, mediaKind: "tv" }

		expect(
			await new EpisodeTitleResolver(() => true).resolve(status("Re.ZERO.S04E17.mkv"), catalog),
		).toBe("Good Loser")
	})

	it("keeps English and Spanish episode-title caches separate when the setting changes", async () => {
		let preferSpanish = false
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url === "https://apis.justwatch.com/graphql") {
				const body = JSON.parse(String(init?.body)) as { query: string }
				if (body.query.includes("EpisodeTitleSearch")) {
					return reply({ data: { popularTitles: { edges: [{ node: { id: "ts41257" } }] } } })
				}
				return reply({
					data: {
						node: {
							seasons: [
								{
									content: { seasonNumber: 4 },
									episodes: [
										{
											content: {
												title: "Buen perdedor",
												seasonNumber: 4,
												episodeNumber: 17,
											},
										},
									],
								},
							],
						},
					},
				})
			}
			if (url.includes("singlesearch")) return reply({ id: 14459, name: "Re ZERO" })
			return reply({ name: "Good Loser" })
		})
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver(() => preferSpanish)
		const video = status("Re.ZERO.S04E17.mkv")
		const catalog: CatalogResult = { title: "Re ZERO", poster: null, mediaKind: "tv" }

		expect(await resolver.resolve(video, catalog)).toBe("Good Loser")
		preferSpanish = true
		expect(await resolver.resolve(video, catalog)).toBe("Buen perdedor")
		preferSpanish = false
		expect(await resolver.resolve(video, catalog)).toBe("Good Loser")
		expect(fetchMock).toHaveBeenCalledTimes(4)
	})

	it("tries the base series title when the identified anime title includes a season", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("4th%20Season")) return reply({}, false)
			if (url.includes("singlesearch")) {
				return reply({ id: 14459, name: "Re:Zero kara Hajimeru Isekai Seikatsu" })
			}
			return reply({ name: "Good Loser" })
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season",
			poster: null,
			mediaKind: "tv",
			sourceUrl: "https://anilist.co/anime/189046",
		}
		const filename =
			"[Erai-raws] Re Zero kara Hajimeru Isekai Seikatsu 4th Season - 17 [1080p CR WEBRip HEVC AAC][MultiSub][A8F9762F].mkv"

		expect(await new EpisodeTitleResolver().resolve(status(filename), catalog)).toBe("Good Loser")
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://api.tvmaze.com/singlesearch/shows?q=Re%3AZero%20kara%20Hajimeru%20Isekai%20Seikatsu%204th%20Season",
			"https://api.tvmaze.com/singlesearch/shows?q=Re%3AZero%20kara%20Hajimeru%20Isekai%20Seikatsu",
			"https://api.tvmaze.com/shows/14459/episodebynumber?season=4&number=17",
		])
	})

	it("gets the English title for an Erai-raws file with an explicit third season", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("Season%203")) return reply({}, false)
			if (url.includes("singlesearch")) {
				return reply({ id: 35288, name: "Uma Musume: Pretty Derby" })
			}
			return reply({ name: "My Own Shine" })
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Uma Musume: Pretty Derby Season 3",
			poster: null,
			mediaKind: "tv",
		}
		const filename =
			"[Erai-raws] Uma Musume - Pretty Derby Season 3 - 04 [1080p][Multiple Subtitle][173E422F]"

		expect(await new EpisodeTitleResolver().resolve(status(filename), catalog)).toBe("My Own Shine")
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://api.tvmaze.com/singlesearch/shows?q=Uma%20Musume%3A%20Pretty%20Derby%20Season%203",
			"https://api.tvmaze.com/singlesearch/shows?q=Uma%20Musume%3A%20Pretty%20Derby",
			"https://api.tvmaze.com/shows/35288/episodebynumber?season=3&number=4",
		])
	})

	it("does not use a fuzzy match for a different show or guess a different season", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch") ? reply({ id: 17, name: "An Unrelated Show" }) : reply([]),
		)
		vi.stubGlobal("fetch", fetchMock)
		const resolver = new EpisodeTitleResolver()

		expect(await resolver.resolve(status("Re.ZERO.S05E17.mkv"), null)).toBeNull()
		expect(fetchMock).toHaveBeenCalledTimes(2)
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

	it("uses the identified anime instead of the short release name for episode 12", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://graphql.anilist.co") {
				return reply({ data: { Media: { streamingEpisodes: [] } } })
			}
			if (url.includes("singlesearch")) {
				return reply({ id: 80462, name: "This Monster Wants to Eat Me" })
			}
			if (url.endsWith("/akas")) {
				return reply([{ name: "Watashi wo Tabetai, Hitodenashi" }])
			}
			if (url.endsWith("/seasons")) return reply([{ number: 1 }])
			return reply({ name: "Beloved Child" })
		})
		vi.stubGlobal("fetch", fetchMock)
		const catalog: CatalogResult = {
			title: "Watashi wo Tabetai, Hitodenashi",
			poster: null,
			mediaKind: "tv",
			sourceUrl: "https://anilist.co/anime/183385",
		}

		expect(
			await new EpisodeTitleResolver().resolve(
				status("[Erai-raws] WataTabe - 12 [WEB 1080p].mkv"),
				catalog,
			),
		).toBe("Beloved Child")
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://graphql.anilist.co",
			"https://api.tvmaze.com/singlesearch/shows?q=Watashi%20wo%20Tabetai%2C%20Hitodenashi",
			"https://api.tvmaze.com/shows/80462/akas",
			"https://api.tvmaze.com/shows/80462/seasons",
			"https://api.tvmaze.com/shows/80462/episodebynumber?season=1&number=12",
		])
	})

	it("does not assume season one for an absolute episode of a multi-season show", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("singlesearch")) return reply({ id: 8, name: "Some Show" })
			return reply([{ number: 1 }, { number: 2 }])
		})
		vi.stubGlobal("fetch", fetchMock)

		expect(
			await new EpisodeTitleResolver().resolve(status("[Fansub] Some Show - 12.mkv"), null),
		).toBeNull()
		expect(fetchMock).toHaveBeenCalledTimes(2)
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
