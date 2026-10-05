import { describe, expect, it } from "vitest"
import { recordingTitle } from "./music.title"

describe("recording title", () => {
	it.each([
		"Song (Remastered 2011)",
		"Song [2011 Remaster]",
		"Song - 2011 Remaster",
		"Song – Remastered",
	])("removes the edition label from %s", (title) => {
		expect(recordingTitle(title)).toBe("Song")
	})
	it.each(["Song (Live)", "Song - Remix", "Remastered", "The Remaster", "Song (2011 Remix)"])(
		"preserves the recording identity of %s",
		(title) => {
			expect(recordingTitle(title)).toBe(title)
		},
	)
})
