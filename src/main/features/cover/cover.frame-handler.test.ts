import type { Client as VlcClient } from "@main/features/vlc"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { handlers, settings, capture } = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	settings: { showEpisodeThumbnails: true, episodeFrameChoices: {} as Record<string, number> },
	capture: vi.fn(async (_status: VlcStatus, position: number) => Buffer.from(String(position))),
}))

vi.mock("@main/core/ipc", () => ({
	registerHandler: (channel: string, handler: (...args: unknown[]) => unknown) => {
		handlers.set(channel, handler)
	},
}))
vi.mock("@main/core/config", () => ({
	configService: {
		get: (key: keyof typeof settings) => settings[key],
		set: (key: keyof typeof settings, value: unknown) => {
			if (key === "episodeFrameChoices")
				settings.episodeFrameChoices = value as Record<string, number>
		},
	},
}))
vi.mock("./cover.episode", () => ({
	FRAME_POSITIONS: [0.2, 0.4, 0.6],
	captureEpisodeFrame: capture,
	episodeFrameKey: (status: VlcStatus) =>
		status.media.sourceUri === "file:///episode.mkv" ? "current-episode" : null,
}))

import { EpisodeFrameHandler } from "./cover.frame-handler"

function status(): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 10, time: 10, duration: 100, rate: 1 },
		mediaType: "video",
		media: { title: "Series S01E01", sourceUri: "file:///episode.mkv" },
	}
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
	const handler = handlers.get(channel)
	if (!handler) throw new Error(`Missing handler: ${channel}`)
	return Promise.resolve(handler(...args))
}

beforeEach(() => {
	handlers.clear()
	capture.mockClear()
	settings.showEpisodeThumbnails = true
	settings.episodeFrameChoices = {}
})

describe("EpisodeFrameHandler", () => {
	it("keeps previews local until a frame is chosen and checks the active episode", async () => {
		let current = status()
		const vlc = { readStatus: vi.fn(async () => current) }
		const thumbnails = { clearCache: vi.fn(), resolve: vi.fn() }
		const forceNextUpdate = vi.fn()
		new EpisodeFrameHandler(
			vlc as unknown as VlcClient,
			thumbnails as unknown as ConstructorParameters<typeof EpisodeFrameHandler>[1],
			forceNextUpdate,
		)

		const preview = await invoke("media:preview-frames")
		expect(preview).toEqual({
			key: "current-episode",
			frames: [0.2, 0.4, 0.6].map((position) => ({
				position,
				dataUrl: `data:image/jpeg;base64,${Buffer.from(String(position)).toString("base64")}`,
			})),
		})
		expect(capture).toHaveBeenCalledTimes(3)
		expect(thumbnails.resolve).not.toHaveBeenCalled()
		expect(settings.episodeFrameChoices).toEqual({})

		expect(await invoke("media:select-frame", "other-episode", 0.4)).toBe(false)
		expect(await invoke("media:select-frame", "current-episode", 0.5)).toBe(false)
		expect(await invoke("media:select-frame", "current-episode", 0.4)).toBe(true)
		expect(settings.episodeFrameChoices).toEqual({ "current-episode": 0.4 })
		expect(thumbnails.clearCache).toHaveBeenCalledTimes(1)
		expect(forceNextUpdate).toHaveBeenCalledTimes(1)

		current = { ...current, media: { ...current.media, sourceUri: "file:///next.mkv" } }
		expect(await invoke("media:reset-frame", "current-episode")).toBe(false)
		expect(settings.episodeFrameChoices).toEqual({ "current-episode": 0.4 })
	})
})
