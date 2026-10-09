import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { SetActivity } from "@xhayper/discord-rpc"
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
	user: { setActivity: ReturnType<typeof vi.fn> }
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
