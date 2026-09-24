import { afterEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({ instances: [] as unknown[] }))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))
vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) =>
			key ? ({ rpcEnabled: true } as Record<string, unknown>)[key] : { largeImage: "logo" },
	},
}))
vi.mock("@xhayper/discord-rpc", () => ({
	StatusDisplayType: { DETAILS: 0 },
	Client: class {
		private listeners: Record<string, () => void> = {}
		user = {
			setActivity: vi.fn(async () => {
				throw new Error("RPC request failed")
			}),
			clearActivity: vi.fn(async () => {}),
		}
		constructor() {
			fakes.instances.push(this)
		}
		on(event: string, callback: () => void) {
			this.listeners[event] = callback
		}
		async login() {
			this.listeners.ready?.()
		}
		destroy = vi.fn(async () => {
			this.listeners.disconnected?.()
		})
	},
}))

import { Client } from "./discord.client"

interface FakeRpc {
	destroy: ReturnType<typeof vi.fn>
}

afterEach(() => {
	fakes.instances.length = 0
	vi.useRealTimers()
})

describe("Discord connection cleanup", () => {
	it("destroys a previous client after an activity error before reconnecting", async () => {
		const client = new Client({ now: () => Date.now() })
		expect(await client.connect()).toBe(true)
		const first = fakes.instances[0] as FakeRpc
		expect(await client.update({ details: "Track" })).toBe(false)

		expect(await client.connect()).toBe(true)
		expect(first.destroy).toHaveBeenCalledOnce()
		expect(fakes.instances).toHaveLength(2)
		await client.close()
	})

	it("closes an instance even when connected was already cleared", async () => {
		vi.useFakeTimers()
		const client = new Client({ now: () => Date.now() })
		await client.connect()
		const rpc = fakes.instances[0] as FakeRpc
		await client.update({ details: "Track" })

		await client.close()
		expect(rpc.destroy).toHaveBeenCalledOnce()
		expect(vi.getTimerCount()).toBe(0)
	})
})
