import type { Candidate, CatalogResult } from "@main/features/catalog"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VideoResolver, extractGoogleImageUrl } from "./cover.video"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

afterEach(() => {
	vi.unstubAllGlobals()
})

function status(filename: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0, time: 0, duration: 1200, rate: 1 },
		mediaType: "video",
		media: { title: filename, filename },
	}
}

function anilistResult(overrides: Partial<Candidate> = {}): Candidate {
	return {
		provider: "anilist",
		id: "42",
		title: "The Matrix",
		aliases: [],
		mediaKind: "movie",
		posterUrl: "https://example.test/anilist.jpg",
		sourceUrl: "https://anilist.co/anime/42",
		sourceName: "AniList",
		...overrides,
	}
}

describe("VideoResolver", () => {
	it("uses a catalog poster and preserves its source", async () => {
		const catalog: CatalogResult = {
			title: "The Matrix",
			poster: "https://example.test/catalog.jpg",
			mediaKind: "movie",
			sourceUrl: "https://anilist.co/anime/42",
			sourceName: "AniList",
		}
		const resolver = new VideoResolver({ searchBest: vi.fn() })

		expect(await resolver.resolve(status("The.Matrix.1999.mkv"), catalog)).toEqual({
			imageUrl: "https://example.test/catalog.jpg",
			sourceUrl: "https://anilist.co/anime/42",
			sourceName: "AniList",
			canonicalTitle: "The Matrix",
		})
	})

	it("falls back to Google and links the result to IMDb", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				text: async () => '<img src="https://encrypted-tbn0.gstatic.com/poster.jpg">',
			})),
		)
		const resolver = new VideoResolver({ searchBest: async () => null })

		expect(await resolver.resolve(status("The.Matrix.1999.mkv"))).toEqual({
			imageUrl: "https://encrypted-tbn0.gstatic.com/poster.jpg",
			sourceUrl: "https://www.imdb.com/find/?q=The%20Matrix",
			sourceName: "IMDB",
			canonicalTitle: null,
		})
	})

	it("uses the AniList-first result and caches the lookup", async () => {
		const searchBest = vi.fn(async () => anilistResult())
		const resolver = new VideoResolver({ searchBest })
		const first = await resolver.resolve(status("The.Matrix.1999.mkv"))
		const second = await resolver.resolve(status("The.Matrix.1999.mkv"))

		expect(first).toEqual(second)
		expect(searchBest).toHaveBeenCalledOnce()
	})

	it("uses TVMaze for a western series when AniList has no result", async () => {
		const fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				name: "Better Call Saul",
				url: "https://www.tvmaze.com/shows/618/better-call-saul",
				image: { original: "https://static.tvmaze.com/better-call-saul.jpg" },
			}),
		}))
		vi.stubGlobal("fetch", fetch)
		const resolver = new VideoResolver({ searchBest: async () => null })

		expect(await resolver.resolve(status("better.call.saul.s06e06.1080p.web.h264-cakes"))).toEqual({
			imageUrl: "https://static.tvmaze.com/better-call-saul.jpg",
			sourceUrl: "https://www.tvmaze.com/shows/618/better-call-saul",
			sourceName: "TVMaze",
			canonicalTitle: "Better Call Saul",
		})
		expect(fetch).toHaveBeenCalledWith(
			"https://api.tvmaze.com/singlesearch/shows?q=better%20call%20saul",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		)
	})

	it("searches an episode arc before the base title and restores JoJo casing", async () => {
		const searchBest = vi.fn(async (query: string) =>
			query === "JoJo Bizarre Adventure Steel Ball Run"
				? anilistResult({
						id: "190327",
						title: "JoJo no Kimyou na Bouken: Steel Ball Run - 1st STAGE",
						mediaKind: "tv",
					})
				: null,
		)
		const resolver = new VideoResolver({ searchBest })

		const result = await resolver.resolve(
			status("JoJos_Bizarre_Adventure_2012_S06E01_STEEL_BALL_RUN_1080p_NF_WEB.mkv"),
		)

		expect(result.canonicalTitle).toBe("JoJo no Kimyou na Bouken: Steel Ball Run - 1st STAGE")
		expect(result.imageUrl).toBe("https://example.test/anilist.jpg")
		expect(searchBest.mock.calls.map(([query]) => query)).toEqual([
			"JoJos Bizarre Adventure Steel Ball Run",
			"JoJo Bizarre Adventure Steel Ball Run",
		])
	})
})

describe("extractGoogleImageUrl", () => {
	it("prefers a gstatic image and ignores common interface images", () => {
		const html =
			'<img src="https://example.com/logo.png"><img src="https://gstatic.com/poster.jpg">'
		expect(extractGoogleImageUrl(html)).toBe("https://gstatic.com/poster.jpg")
	})
})
