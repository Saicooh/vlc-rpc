import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@renderer/lib/utils", () => ({
	logger: { info: () => {}, error: () => {} },
}))

vi.mock("@renderer/features/media/media.actions", () => ({
	updateFromVlcStatus: vi.fn(),
	refreshMediaInfo: vi.fn(),
}))

beforeEach(() => {
	vi.resetModules()
	vi.useFakeTimers()
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("VLC status polling", () => {
	it("pauses in the tray even when Electron reports the document as visible", async () => {
		let visibility: DocumentVisibilityState = "visible"
		const documentMock = new EventTarget()
		Object.defineProperty(documentMock, "visibilityState", { get: () => visibility })
		vi.stubGlobal("document", documentMock)
		let onVisibilityChange: (visible: boolean) => void = () => {}
		const checkStatus = vi.fn(async () => ({ isRunning: true, reason: "connected" }))
		const getStatus = vi.fn(async () => ({ active: true }))
		vi.stubGlobal("window", {
			api: {
				vlc: { getConfig: async () => ({}), checkStatus, getStatus },
				app: {
					isVisible: async () => false,
					onVisibilityChange: (callback: (visible: boolean) => void) => {
						onVisibilityChange = callback
					},
				},
			},
		})

		const { initializeVlcStore } = await import("./vlc.actions")
		const { refreshMediaInfo } = await import("@renderer/features/media/media.actions")
		await initializeVlcStore()
		await vi.advanceTimersByTimeAsync(6000)
		expect(getStatus).not.toHaveBeenCalled()
		expect(checkStatus).toHaveBeenCalledTimes(1)

		onVisibilityChange(true)
		await vi.advanceTimersByTimeAsync(0)
		expect(getStatus).toHaveBeenCalledTimes(1)
		expect(refreshMediaInfo).toHaveBeenCalledTimes(1)

		onVisibilityChange(false)
		await vi.advanceTimersByTimeAsync(6000)
		expect(getStatus).toHaveBeenCalledTimes(1)

		onVisibilityChange(true)
		await vi.advanceTimersByTimeAsync(0)
		expect(getStatus).toHaveBeenCalledTimes(2)

		visibility = "hidden"
		documentMock.dispatchEvent(new Event("visibilitychange"))
		await vi.advanceTimersByTimeAsync(6000)
		expect(getStatus).toHaveBeenCalledTimes(2)

		visibility = "visible"
		documentMock.dispatchEvent(new Event("visibilitychange"))
		await vi.advanceTimersByTimeAsync(0)
		expect(getStatus).toHaveBeenCalledTimes(3)
	})

	it("keeps checking for VLC when the window starts visible but disconnected", async () => {
		const documentMock = new EventTarget()
		Object.defineProperty(documentMock, "visibilityState", { value: "visible" })
		vi.stubGlobal("document", documentMock)
		const checkStatus = vi
			.fn()
			.mockResolvedValueOnce({ isRunning: false, reason: "not-running" })
			.mockResolvedValueOnce({ isRunning: false, reason: "not-running" })
			.mockResolvedValue({ isRunning: true, reason: "connected" })
		const getStatus = vi.fn(async () => ({ active: true }))
		vi.stubGlobal("window", {
			api: {
				vlc: { getConfig: async () => ({}), checkStatus, getStatus },
				app: { isVisible: async () => true, onVisibilityChange: () => {} },
			},
		})

		const { initializeVlcStore } = await import("./vlc.actions")
		await initializeVlcStore()
		await vi.advanceTimersByTimeAsync(0)
		expect(getStatus).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(2000)
		expect(checkStatus).toHaveBeenCalledTimes(3)
		expect(getStatus).toHaveBeenCalledTimes(1)
	})

	it("keeps a show event that arrives before the initial visibility query returns", async () => {
		const documentMock = new EventTarget()
		Object.defineProperty(documentMock, "visibilityState", { value: "visible" })
		vi.stubGlobal("document", documentMock)
		let onVisibilityChange: (visible: boolean) => void = () => {}
		let answerVisibility: (visible: boolean) => void = () => {}
		const initialVisibility = new Promise<boolean>((resolve) => {
			answerVisibility = resolve
		})
		const getStatus = vi.fn(async () => ({ active: true }))
		vi.stubGlobal("window", {
			api: {
				vlc: {
					getConfig: async () => ({}),
					checkStatus: async () => ({ isRunning: true, reason: "connected" }),
					getStatus,
				},
				app: {
					isVisible: () => initialVisibility,
					onVisibilityChange: (callback: (visible: boolean) => void) => {
						onVisibilityChange = callback
					},
				},
			},
		})

		const { initializeVlcStore } = await import("./vlc.actions")
		const initialization = initializeVlcStore()
		onVisibilityChange(true)
		answerVisibility(false)
		await initialization
		await vi.advanceTimersByTimeAsync(0)
		expect(getStatus).toHaveBeenCalledTimes(1)
	})
})
