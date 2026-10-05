import type { ContentExclusion } from "@shared/privacy/privacy.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"
import { Service, localPath, matchingExclusion } from "./privacy.service"

describe("content exclusions", () => {
	it("drops a memoized audio URI when playback stops", async () => {
		const vlc = {
			getCurrentFileUri: vi
				.fn()
				.mockResolvedValueOnce("file:///C:/Private/Clip.mp3")
				.mockResolvedValueOnce("file:///C:/Public/Clip.mp3"),
		}
		const service = new Service(vlc, { get: () => [], set: () => {} })
		const playing = () => ({ active: true, plid: 1, media: { title: "Clip" } }) as VlcStatus
		expect((await service.describe(playing())).sourceUri).toContain("Private")
		expect((await service.describe({ active: false } as VlcStatus)).hidden).toBe(false)
		expect((await service.describe(playing())).sourceUri).toContain("Public")
	})
	it("holds an unidentified file until its URI can be checked, while allowing known streams", async () => {
		const service = new Service(
			{ getCurrentFileUri: async () => null },
			{ get: () => [{ kind: "folder", path: "C:\\Private" }], set: () => {} },
		)
		expect(await service.isExcluded({ active: true, media: {} } as VlcStatus)).toBe(true)
		expect(
			await service.isExcluded({
				active: true,
				media: { sourceUri: "file:///C:/bad%XX.mkv" },
			} as VlcStatus),
		).toBe(true)
		expect(
			await service.isExcluded({
				active: true,
				media: { sourceUri: "https://radio.example/live" },
			} as VlcStatus),
		).toBe(false)
	})
	it("refreshes the URI before a click even when VLC reuses the same playlist identity", async () => {
		const service = new Service(
			{ getCurrentFileUri: async () => "file:///C:/Other/clip.mp3" },
			{ get: () => [], set: () => {} },
		)
		const status = {
			active: true,
			plid: 1,
			media: { sourceUri: "file:///C:/Private/clip.mp3", title: "Clip" },
		} as VlcStatus
		expect((await service.describe(status, true)).sourceUri).toBe("file:///C:/Other/clip.mp3")
	})
	it("decodes local Windows and network-share URIs without accepting streams", () => {
		expect(localPath("file:///C:/Videos/Clase%20de%20espa%C3%B1ol.mkv", "win32")).toBe(
			"C:\\Videos\\Clase de español.mkv",
		)
		expect(localPath("file://server/media/clip.mkv", "win32")).toBe("\\\\server\\media\\clip.mkv")
		expect(localPath("https://example.com/clip.mkv", "win32")).toBeNull()
		expect(localPath("file:///C:/bad%XX.mkv", "win32")).toBeNull()
	})
	it("distinguishes equal filenames, normalizes Windows paths and respects directory boundaries", () => {
		const file: ContentExclusion = { kind: "file", path: "C:\\Private\\clip.mkv" }
		const folder: ContentExclusion = { kind: "folder", path: "C:\\Classes\\" }
		expect(matchingExclusion("c:/private/CLIP.mkv", [file], "win32")).toBe(file)
		expect(matchingExclusion("C:\\Public\\clip.mkv", [file], "win32")).toBeNull()
		expect(matchingExclusion("C:\\Classes\\Week 1\\clip.mkv", [folder], "win32")).toBe(folder)
		expect(matchingExclusion("C:\\Classes-old\\clip.mkv", [folder], "win32")).toBeNull()
		expect(matchingExclusion("D:\\Classes\\clip.mkv", [folder], "win32")).toBeNull()
		expect(matchingExclusion("C:\\Classes\\..\\Public\\clip.mkv", [folder], "win32")).toBeNull()
	})
	it("retains case sensitivity on Linux", () => {
		expect(
			matchingExclusion("/private/clip.mkv", [{ kind: "folder", path: "/Private" }], "linux"),
		).toBeNull()
	})
	it("resolves an audio URI once, persists exclusions and removes only the chosen rule", async () => {
		let rules: ContentExclusion[] = []
		const config = {
			get: () => rules,
			set: (_key: string, value: ContentExclusion[]) => {
				rules = value
			},
		}
		const vlc = { getCurrentFileUri: vi.fn(async () => "file:///C:/Private/clip.mp3") }
		const status = { active: true, plid: 1, media: { title: "Clip" } } as VlcStatus
		const service = new Service(vlc, config)
		const privacy = await service.describe(status)
		expect(service.exclude("file", privacy)).toBe(true)
		expect(service.exclude("folder", privacy)).toBe(true)
		expect(await new Service(vlc, config).isExcluded(status)).toBe(true)
		const file = rules.find((rule) => rule.kind === "file")
		const folder = rules.find((rule) => rule.kind === "folder")
		if (!file || !folder) throw new Error("Exclusions were not saved")
		service.remove(file)
		expect(await service.isExcluded(status)).toBe(true)
		service.remove(folder)
		expect(await service.isExcluded(status)).toBe(false)
		expect(vlc.getCurrentFileUri).toHaveBeenCalledOnce()
	})
})
