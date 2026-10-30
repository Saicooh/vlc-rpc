import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { SetActivity } from "@xhayper/discord-rpc"
import { afterEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({
	instances: [] as unknown[],
	loginGate: null as Promise<void> | null,
	failLogin: false,
}))

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
		isConnected = false
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
			if (fakes.loginGate) await fakes.loginGate
			if (fakes.failLogin) throw new Error("Could not connect")
			this.isConnected = true
			this.listeners.ready?.()
		}
		destroy = vi.fn(async () => {
			this.isConnected = false
			this.listeners.disconnected?.()
		})
	},
}))

import { Client } from "./discord.client"

interface FakeRpc {
	isConnected: boolean
	destroy: ReturnType<typeof vi.fn>
	user: { setActivity: ReturnType<typeof vi.fn> }
}

/** The socket closes while Discord is handling the request, as when Discord quits. */
function dropTransportOnRequest(rpc: FakeRpc): void {
	rpc.user.setActivity.mockImplementation(async () => {
		rpc.isConnected = false
		throw new Error("Socket closed")
	})
}

afterEach(() => {
	fakes.instances.length = 0
	fakes.loginGate = null
	fakes.failLogin = false
	vi.useRealTimers()
})

describe("Discord connection cleanup", () => {
	it("keeps a healthy connection when Discord refuses an activity", async () => {
		vi.useFakeTimers()
		const client = new Client({ now: () => Date.now() })
		expect(await client.connect()).toBe(true)
		const rpc = fakes.instances[0] as FakeRpc
		expect(await client.update({ details: "Track" })).toBe(false)

		expect(client.isConnected()).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
		rpc.user.setActivity.mockResolvedValue(undefined)
		expect(await client.update({ details: "Next track" })).toBe(true)
		expect(rpc.destroy).not.toHaveBeenCalled()
		expect(fakes.instances).toHaveLength(1)
		await client.close()
	})

	it("destroys a dropped client before the scheduled retry replaces it", async () => {
		vi.useFakeTimers()
		const client = new Client({ now: () => Date.now() })
		expect(await client.connect()).toBe(true)
		const first = fakes.instances[0] as FakeRpc
		dropTransportOnRequest(first)
		expect(await client.update({ details: "Track" })).toBe(false)
		expect(client.isConnected()).toBe(false)

		// Polling waits for the retry instead of opening a client of its own.
		expect(await client.connect()).toBe(false)
		expect(await client.update({ details: "Track" })).toBe(false)
		expect(fakes.instances).toHaveLength(1)

		await vi.advanceTimersByTimeAsync(5000)
		expect(client.isConnected()).toBe(true)
		expect(first.destroy).toHaveBeenCalledOnce()
		expect(fakes.instances).toHaveLength(2)
		await client.close()
	})

	it("reconnects a socket that closed between requests without waiting", async () => {
		const client = new Client({ now: () => Date.now() })
		await client.connect()
		const first = fakes.instances[0] as FakeRpc
		first.isConnected = false
		expect(client.isConnected()).toBe(false)

		expect(await client.connect()).toBe(true)
		expect(first.destroy).toHaveBeenCalledOnce()
		expect(fakes.instances).toHaveLength(2)
		await client.close()
	})

	it("shares one login between concurrent callers", async () => {
		let release = (): void => {}
		fakes.loginGate = new Promise<void>((resolve) => {
			release = resolve
		})
		const client = new Client({ now: () => Date.now() })
		const first = client.connect()
		const second = client.connect()
		const forced = client.forceReconnect()
		expect(await client.update({ details: "Track" })).toBe(false)

		release()
		expect(await Promise.all([first, second, forced])).toEqual([true, true, true])
		expect(fakes.instances).toHaveLength(1)
		await client.close()
	})

	it("keeps retrying after ten failed attempts", async () => {
		vi.useFakeTimers()
		fakes.failLogin = true
		const client = new Client({ now: () => Date.now() })
		expect(await client.connect()).toBe(false)

		await vi.advanceTimersByTimeAsync(5000 * 11)
		expect(fakes.instances).toHaveLength(12)
		for (const rpc of fakes.instances.slice(0, -1) as FakeRpc[]) {
			expect(rpc.destroy).toHaveBeenCalledOnce()
		}

		fakes.failLogin = false
		await vi.advanceTimersByTimeAsync(5000)
		expect(client.isConnected()).toBe(true)
		await client.close()
		expect(vi.getTimerCount()).toBe(0)
	})

	it("skips the pending delay when a reconnect is forced", async () => {
		vi.useFakeTimers()
		fakes.failLogin = true
		const client = new Client({ now: () => Date.now() })
		expect(await client.connect()).toBe(false)
		expect(vi.getTimerCount()).toBe(1)

		fakes.failLogin = false
		expect(await client.forceReconnect()).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
		await client.close()
	})

	it("does not schedule a retry for a login that close() ended", async () => {
		vi.useFakeTimers()
		let release = (): void => {}
		fakes.loginGate = new Promise<void>((resolve) => {
			release = resolve
		})
		const client = new Client({ now: () => Date.now() })
		const login = client.connect()
		await vi.waitFor(() => expect(fakes.instances).toHaveLength(1))
		await client.close()
		expect((fakes.instances[0] as FakeRpc).destroy).toHaveBeenCalledOnce()

		fakes.failLogin = true
		release()
		expect(await login).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("closes an instance even when connected was already cleared", async () => {
		vi.useFakeTimers()
		const client = new Client({ now: () => Date.now() })
		await client.connect()
		const rpc = fakes.instances[0] as FakeRpc
		dropTransportOnRequest(rpc)
		await client.update({ details: "Track" })

		await client.close()
		expect(rpc.destroy).toHaveBeenCalledOnce()
		expect(vi.getTimerCount()).toBe(0)
	})
})

describe("Discord activity text", () => {
	it.each([
		["details", "details"],
		["state", "state"],
		["large_text", "largeImageText"],
		["small_text", "smallImageText"],
		["name", "name"],
	] as const)("pads a one-character %s and accepts the next track", async (field, rpcField) => {
		const client = new Client({ now: () => Date.now() })
		await client.connect()
		const rpc = fakes.instances[0] as FakeRpc
		rpc.user.setActivity.mockImplementation(async (activity: SetActivity) => {
			const text = activity[rpcField]
			if (typeof text === "string" && text.length < 2) throw new Error("Text too short")
			return activity
		})
		const presence: DiscordPresenceData = { [field]: "D" }

		expect(await client.update(presence)).toBe(true)
		expect(rpc.user.setActivity).toHaveBeenLastCalledWith(
			expect.objectContaining({ [rpcField]: "D\u200b" }),
		)
		expect(presence[field]).toBe("D")
		expect(await client.update({ [field]: "Next track" })).toBe(true)
		expect(rpc.user.setActivity).toHaveBeenLastCalledWith(
			expect.objectContaining({ [rpcField]: "Next track" }),
		)
		expect(client.isConnected()).toBe(true)
		expect(fakes.instances).toHaveLength(1)
		await client.close()
	})

	it("keeps empty lines, absent fields and longer Unicode text unchanged", async () => {
		const client = new Client({ now: () => Date.now() })
		await client.connect()
		const rpc = fakes.instances[0] as FakeRpc
		rpc.user.setActivity.mockResolvedValue(undefined)

		expect(await client.update({ details: "", state: "", large_text: "", small_text: "" })).toBe(
			true,
		)
		expect(rpc.user.setActivity).toHaveBeenLastCalledWith({
			largeImageKey: "logo",
			instance: false,
			statusDisplayType: 0,
			details: "",
			state: "",
			type: 0,
		})
		expect(await client.update({ details: "🎵", large_text: "AB" })).toBe(true)
		expect(rpc.user.setActivity).toHaveBeenLastCalledWith({
			largeImageKey: "logo",
			largeImageText: "AB",
			instance: false,
			statusDisplayType: 0,
			details: "🎵",
			type: 0,
		})
		await client.close()
	})
})
