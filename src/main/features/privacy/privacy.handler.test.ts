import type { Client as VlcClient } from "@main/features/vlc"
import type { ContentExclusion } from "@shared/privacy/privacy.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { beforeEach, expect, it, vi } from "vitest"
import { Handler } from "./privacy.handler"
import { Service } from "./privacy.service"

const handlers = vi.hoisted(() => ({
	exclude: undefined as
		| undefined
		| ((uri: string, kind: ContentExclusion["kind"]) => Promise<boolean>),
}))
vi.mock("@main/core/ipc", () => ({
	registerHandler: (name: string, handler: unknown) => {
		if (name === "privacy:exclude-current")
			handlers.exclude = handler as NonNullable<typeof handlers.exclude>
	},
}))
beforeEach(() => {
	handlers.exclude = undefined
})

it("refuses a stale file and saves only VLC's current path before refreshing", async () => {
	let rules: ContentExclusion[] = []
	const vlc = {
		readStatus: async () =>
			({ active: true, media: { sourceUri: "file:///C:/Private/lesson.mkv" } }) as VlcStatus,
		getCurrentFileUri: async () => "file:///C:/Private/lesson.mkv",
	}
	const service = new Service(vlc, {
		get: () => rules,
		set: (_key, value) => {
			rules = value
		},
	})
	const changed = vi.fn(async () => {
		expect(rules.length).toBeGreaterThan(0)
	})
	new Handler(service, vlc as unknown as VlcClient, changed)
	const exclude = handlers.exclude
	if (!exclude) throw new Error("Exclusion handler was not registered")
	expect(await exclude("file:///C:/Other/lesson.mkv", "file")).toBe(false)
	expect(rules).toHaveLength(0)
	expect(changed).not.toHaveBeenCalled()
	expect(await exclude("file:///C:/Private/lesson.mkv", "folder")).toBe(true)
	expect(rules).toHaveLength(1)
	expect(rules[0]?.kind).toBe("folder")
	expect(changed).toHaveBeenCalledOnce()
})
