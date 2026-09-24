import { describe, expect, it } from "vitest"
import { isSafeExternalUrl } from "./app.external-url"

describe("external link protocol", () => {
	it("opens web links only", () => {
		expect(isSafeExternalUrl("https://example.test/page")).toBe(true)
		expect(isSafeExternalUrl("http://example.test/page")).toBe(true)
		for (const url of [
			"file:///C:/Windows/system.ini",
			"javascript:alert(1)",
			"powershell:run",
			"not a url",
		]) {
			expect(isSafeExternalUrl(url)).toBe(false)
		}
	})
})
