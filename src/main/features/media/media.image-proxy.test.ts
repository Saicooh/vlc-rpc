import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { ImageProxy } from "./media.image-proxy"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("ImageProxy cache", () => {
	it("shares a pending download and retries after a shared failure", async () => {
		let finish!: (response: Response) => void
		const fetchImage = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve
					}),
			)
			.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
		vi.stubGlobal("fetch", fetchImage)
		const proxy = new ImageProxy()
		const first = proxy.getImageAsDataUrl("https://example.test/image.png")
		const second = proxy.getImageAsDataUrl("https://example.test/image.png")
		expect(fetchImage).toHaveBeenCalledOnce()
		finish(new Response(null, { status: 503 }))
		expect(await first).toBeNull()
		expect(await second).toBeNull()
		expect(await proxy.getImageAsDataUrl("https://example.test/image.png")).toContain("base64,AQID")
		expect(fetchImage).toHaveBeenCalledTimes(2)
	})

	it("aborts a download that never returns headers", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_source: string, init: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
							once: true,
						})
					}),
			),
		)
		const download = new ImageProxy().getImageAsDataUrl("https://example.test/stalled.png")
		await vi.advanceTimersByTimeAsync(8000)
		expect(await download).toBeNull()
		expect(vi.getTimerCount()).toBe(0)
	})

	it("keeps the timeout active until the response body is complete", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (_source: string, init: RequestInit) =>
					new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(new Uint8Array([1]))
								init.signal?.addEventListener(
									"abort",
									() => controller.error(new Error("aborted")),
									{ once: true },
								)
							},
						}),
					),
			),
		)
		const download = new ImageProxy().getImageAsDataUrl("https://example.test/slow-body.png")
		await vi.advanceTimersByTimeAsync(8000)
		expect(await download).toBeNull()
		expect(vi.getTimerCount()).toBe(0)
	})

	it("rejects an oversized Content-Length before reading the image", async () => {
		const cancel = vi.fn()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new ReadableStream({ cancel }), {
						headers: { "content-length": String(8 * 1024 * 1024 + 1) },
					}),
			),
		)
		expect(await new ImageProxy().getImageAsDataUrl("https://example.test/huge.png")).toBeNull()
		expect(cancel).toHaveBeenCalledOnce()
	})

	it("bounds streamed bytes when the size header is missing", async () => {
		const cancel = vi.fn()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						new ReadableStream({
							pull(controller) {
								controller.enqueue(new Uint8Array(3 * 1024 * 1024))
							},
							cancel,
						}),
					),
			),
		)
		expect(await new ImageProxy().getImageAsDataUrl("https://example.test/stream.png")).toBeNull()
		expect(cancel).toHaveBeenCalledOnce()
	})
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
