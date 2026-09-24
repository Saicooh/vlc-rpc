import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { ImageProxy } from "./media.image-proxy"

afterEach(() => vi.unstubAllGlobals())

describe("ImageProxy cache", () => {
	it("evicts the least recently used image after fifty distinct sources", async () => {
		const fetchImage = vi.fn(
			async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-type": "image/png" },
				}),
		)
		vi.stubGlobal("fetch", fetchImage)
		const proxy = new ImageProxy()
		const source = (index: number) => `https://example.test/${index}.png`

		for (let index = 0; index < 50; index++) await proxy.getImageAsDataUrl(source(index))
		await proxy.getImageAsDataUrl(source(0))
		await proxy.getImageAsDataUrl(source(50))
		await proxy.getImageAsDataUrl(source(0))
		expect(fetchImage).toHaveBeenCalledTimes(51)

		await proxy.getImageAsDataUrl(source(1))
		expect(fetchImage).toHaveBeenCalledTimes(52)
	})
})
