import type { ContentPrivacy } from "@shared/privacy/privacy.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@renderer/lib/utils", () => ({ logger: { info: () => {}, error: () => {} } }))
beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

function playing(uri: string, plid: number): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid,
		mediaType: "video",
		media: { title: "Clip", sourceUri: uri },
		playback: { duration: 60, time: 1, position: 0, rate: 1 },
	}
}

it("makes visibility available before catalog enrichment finishes and rejects a stale URI answer", async () => {
	const privacy: ContentPrivacy = {
		sourceUri: "file:///C:/Private/Clip.mkv",
		path: "C:\\Private\\Clip.mkv",
		folder: "C:\\Private",
		exclusion: null,
		hidden: false,
	}
	let finishInfo: (value: null) => void = () => {}
	let finishPrivacy: (value: ContentPrivacy) => void = () => {}
	const describe = vi
		.fn()
		.mockResolvedValueOnce(privacy)
		.mockImplementationOnce(
			() =>
				new Promise<ContentPrivacy>((resolve) => {
					finishPrivacy = resolve
				}),
		)
	const getMediaInfo = vi.fn(
		() =>
			new Promise<null>((resolve) => {
				finishInfo = resolve
			}),
	)
	vi.stubGlobal("window", { api: { privacy: { describe }, media: { getMediaInfo } } })
	const { vlcStatusStore } = await import("@renderer/features/vlc/vlc.store")
	const { mediaStore } = await import("./media.store")
	const { refreshMediaInfo, updateFromVlcStatus } = await import("./media.actions")
	vlcStatusStore.set("connected")
	const first = playing(privacy.sourceUri ?? "", 1)
	updateFromVlcStatus(first)
	const pending = refreshMediaInfo(first)
	await vi.waitFor(() => expect(mediaStore.get().privacy).toEqual(privacy))
	finishInfo(null)
	await pending
	updateFromVlcStatus(first)
	const oldRead = refreshMediaInfo(first)
	updateFromVlcStatus(playing("file:///C:/Public/Clip.mkv", 2))
	finishPrivacy(privacy)
	finishInfo(null)
	await oldRead
	expect(mediaStore.get().privacy).toBeNull()
	expect(mediaStore.get().sourceUri).toBe("file:///C:/Public/Clip.mkv")
})
