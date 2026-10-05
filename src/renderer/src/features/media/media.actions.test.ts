import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@renderer/lib/utils", () => ({ logger: { info() {}, error() {} } }))

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

function status(title: string, uri: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { time: 10, position: 0.1, duration: 100, rate: 1 },
		mediaType: "audio",
		media: { title, sourceUri: uri },
	}
}

describe("media enrichment", () => {
	it.each(["file", "playlist"] as const)(
		"discards the first visit's result after a %s change and return",
		async (change) => {
			let finish!: (value: VlcStatus) => void
			const playing = status("Song", "file:///C:/song.mp3")
			const getMediaInfo = vi
				.fn()
				.mockImplementationOnce(
					() =>
						new Promise<VlcStatus>((resolve) => {
							finish = resolve
						}),
				)
				.mockResolvedValue({ ...playing, content_metadata: { clean_title: "Current visit" } })
			vi.stubGlobal("window", { api: { media: { getMediaInfo } } })
			const actions = await import("./media.actions")
			const { vlcStatusStore } = await import("@renderer/features/vlc/vlc.store")
			const { mediaStore } = await import("./media.store")
			vlcStatusStore.set("connected")
			actions.updateFromVlcStatus(playing)
			const firstVisit = actions.refreshMediaInfo(playing)
			actions.updateFromVlcStatus(
				change === "file"
					? status("Another song", "file:///C:/other.mp3")
					: { ...playing, plid: 2 },
			)
			actions.updateFromVlcStatus(playing)
			await actions.refreshMediaInfo(playing)
			finish(playing)
			await firstVisit
			expect(getMediaInfo).toHaveBeenCalledTimes(2)
			expect(mediaStore.get().title).toBe("Current visit")
		},
	)

	it("shares pending polls but lets a correction replace their result", async () => {
		let finish!: (value: VlcStatus) => void
		const playing = status("Song", "file:///C:/song.mp3")
		const getMediaInfo = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<VlcStatus>((resolve) => {
						finish = resolve
					}),
			)
			.mockResolvedValue({ ...playing, content_metadata: { clean_title: "Corrected" } })
		vi.stubGlobal("window", { api: { media: { getMediaInfo } } })
		const actions = await import("./media.actions")
		const { vlcStatusStore } = await import("@renderer/features/vlc/vlc.store")
		const { mediaStore } = await import("./media.store")
		vlcStatusStore.set("connected")
		actions.updateFromVlcStatus(playing)
		const first = actions.refreshMediaInfo(playing)
		const second = actions.refreshMediaInfo(playing)
		expect(getMediaInfo).toHaveBeenCalledExactlyOnceWith(playing)
		await actions.applyCorrection("file:Song", "saved")
		finish(playing)
		await Promise.all([first, second])
		expect(getMediaInfo).toHaveBeenCalledTimes(2)
		expect(mediaStore.get().title).toBe("Corrected")
	})

	it("discards an old response when files have the same title but different paths", async () => {
		let finish!: (value: VlcStatus) => void
		const old = status("Song", "file:///C:/old/song.mp3")
		const current = status("Song", "file:///C:/new/song.mp3")
		const getMediaInfo = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<VlcStatus>((resolve) => {
						finish = resolve
					}),
			)
			.mockResolvedValue({ ...current, content_metadata: { clean_title: "New recording" } })
		vi.stubGlobal("window", { api: { media: { getMediaInfo } } })
		const actions = await import("./media.actions")
		const { vlcStatusStore } = await import("@renderer/features/vlc/vlc.store")
		const { mediaStore } = await import("./media.store")
		vlcStatusStore.set("connected")
		actions.updateFromVlcStatus(old)
		const pending = actions.refreshMediaInfo(old)
		actions.updateFromVlcStatus(current)
		await actions.refreshMediaInfo(current)
		finish(old)
		await pending
		expect(mediaStore.get().title).toBe("New recording")
		expect(mediaStore.get().sourceUri).toBe(current.media.sourceUri)
	})
})
