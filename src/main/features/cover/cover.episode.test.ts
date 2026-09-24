import type { CatalogResult } from "@main/features/catalog/catalog.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { EpisodeThumbnailResolver, episodeFrameKey } from "./cover.episode"

const filename =
	"[Erai-raws] Uma Musume - Pretty Derby Season 3 - 04 [1080p][Multiple Subtitle][173E422F]"
const catalog: CatalogResult = {
	title: "Uma Musume: Pretty Derby Season 3",
	poster: "https://example.test/poster.jpg",
	mediaKind: "tv",
}

function status(): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 300, time: 300, duration: 1500, rate: 1 },
		mediaType: "video",
		media: { title: filename, filename, sourceUri: "file:///C:/Videos/uma-musume-3x04.mkv" },
	}
}

function reply(value: unknown, ok = true): { ok: boolean; json: () => Promise<unknown> } {
	return { ok, json: async () => value }
}

afterEach(() => vi.unstubAllGlobals())

describe("EpisodeThumbnailResolver", () => {
	it("uses the chosen frame even when a catalog still exists, and can return to automatic art", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch")
				? reply({ id: 35288, name: "Uma Musume: Pretty Derby" })
				: reply({ image: { original: "https://static.tvmaze.com/episode.jpg" } }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const key = episodeFrameKey(status(), catalog)
		expect(key).not.toBeNull()
		let position: number | undefined = 0.4
		const capture = vi.fn(async () => Buffer.from("chosen frame"))
		const uploadImage = vi.fn(async () => "https://example.test/chosen.jpg")
		const resolver = new EpisodeThumbnailResolver({ uploadImage }, capture, () => position)

		expect(await resolver.resolve(status(), catalog)).toBe("https://example.test/chosen.jpg")
		expect(capture).toHaveBeenCalledWith(expect.anything(), 0.4)
		expect(fetchMock).not.toHaveBeenCalled()
		position = undefined
		expect(await resolver.resolve(status(), catalog)).toBe("https://static.tvmaze.com/episode.jpg")
	})
	it("uses a verified episode image and caches it without capturing the file", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch")
				? reply({ id: 35288, name: "Uma Musume: Pretty Derby" })
				: reply({ image: { original: "https://static.tvmaze.com/episode.jpg" } }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const capture = vi.fn(async () => Buffer.from("frame"))
		const uploadImage = vi.fn(async () => "https://example.test/upload.jpg")
		const resolver = new EpisodeThumbnailResolver({ uploadImage }, capture)

		expect(await resolver.resolve(status(), catalog)).toBe("https://static.tvmaze.com/episode.jpg")
		expect(await resolver.resolve(status(), catalog)).toBe("https://static.tvmaze.com/episode.jpg")
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://api.tvmaze.com/singlesearch/shows?q=Uma%20Musume%3A%20Pretty%20Derby",
			"https://api.tvmaze.com/shows/35288/episodebynumber?season=3&number=4",
		])
		expect(capture).not.toHaveBeenCalled()
		expect(uploadImage).not.toHaveBeenCalled()
	})

	it("uploads a frame when the verified episode has no image", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("singlesearch")
				? reply({ id: 35288, name: "Uma Musume: Pretty Derby" })
				: reply({ image: null }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const frame = Buffer.from("frame")
		const capture = vi.fn(async () => frame)
		const uploadImage = vi.fn(async () => "https://example.test/episode.jpg")
		const resolver = new EpisodeThumbnailResolver({ uploadImage }, capture)

		expect(await resolver.resolve(status(), catalog)).toBe("https://example.test/episode.jpg")
		expect(await resolver.resolve(status(), catalog)).toBe("https://example.test/episode.jpg")
		expect(capture).toHaveBeenCalledTimes(1)
		expect(uploadImage).toHaveBeenCalledWith(frame, "episode.jpg", 24)
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it("never uses an image from a different Uma Musume series", async () => {
		const fetchMock = vi.fn(async (_url: string) =>
			reply({ id: 87601, name: "Uma Musume: Pretty Derby - BNW no Chikai" }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const capture = vi.fn(async () => Buffer.from("frame"))
		const uploadImage = vi.fn(async () => "https://example.test/episode.jpg")

		expect(
			await new EpisodeThumbnailResolver({ uploadImage }, capture).resolve(status(), catalog),
		).toBe("https://example.test/episode.jpg")
		expect(fetchMock.mock.calls.every(([url]) => url.includes("singlesearch"))).toBe(true)
		expect(capture).toHaveBeenCalledTimes(1)
	})

	it("avoids episode lookups for movies and files without an episode", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const capture = vi.fn(async () => Buffer.from("frame"))
		const resolver = new EpisodeThumbnailResolver({ uploadImage: vi.fn() }, capture)
		const movie = { ...catalog, mediaKind: "movie" as const }
		const clip = status()
		clip.media = { title: "holiday-clip.mkv" }

		expect(await resolver.resolve(status(), movie)).toBeNull()
		expect(await resolver.resolve(clip, null)).toBeNull()
		expect(fetchMock).not.toHaveBeenCalled()
		expect(capture).not.toHaveBeenCalled()
	})
})
