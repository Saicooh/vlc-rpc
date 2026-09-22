import type { InstallKind } from "@main/features/updates"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { electronMock } = vi.hoisted(() => ({
	electronMock: {
		isPackaged: { value: true },
		setLoginItemSettings: vi.fn(),
	},
}))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("electron", () => ({
	app: {
		get isPackaged(): boolean {
			return electronMock.isPackaged.value
		},
		setLoginItemSettings: electronMock.setLoginItemSettings,
	},
}))

import { LOGIN_LAUNCH_ARG, START_MINIMIZED_ARG, Startup, shouldStartHidden } from "./app.startup"

const INSTALLED: InstallKind = { kind: "installed" }
const RENAMED_PORTABLE: InstallKind = { kind: "portable", reason: "portable-launcher" }
const UNIDENTIFIED: InstallKind = { kind: "unknown", reason: "no-uninstaller" }

beforeEach(() => {
	electronMock.setLoginItemSettings.mockClear()
	electronMock.isPackaged.value = true
})

describe("Deciding whether a copy may start with Windows", () => {
	it("takes the answer it is given rather than reading the executable path", () => {
		// The old answer lowercased process.execPath and looked for "portable",
		// so an ordinary install under a folder like C:\PortableApps lost start at
		// login. The path is not an input any more, which is what this asserts:
		// the same process, one kind each way, two different answers.
		expect(new Startup(INSTALLED).canStartAtLogin()).toBe(true)
		expect(new Startup(RENAMED_PORTABLE).canStartAtLogin()).toBe(false)
		expect(new Startup(UNIDENTIFIED).canStartAtLogin()).toBe(false)
	})

	it("writes the login item for an installed copy", () => {
		new Startup(INSTALLED).setStartAtLogin(true)

		expect(electronMock.setLoginItemSettings).toHaveBeenCalledTimes(1)
		expect(electronMock.setLoginItemSettings.mock.calls[0]?.[0]).toMatchObject({
			openAtLogin: true,
			args: [LOGIN_LAUNCH_ARG],
		})
	})

	it("refuses it for a portable copy, whatever its folder is called", () => {
		// The other direction of the same bug: a portable copy the user renamed
		// was written into the registry at a path it is free to move away from.
		new Startup(RENAMED_PORTABLE).setStartAtLogin(true)
		new Startup(UNIDENTIFIED).setStartAtLogin(true)

		expect(electronMock.setLoginItemSettings).not.toHaveBeenCalled()
	})

	it("writes nothing while running from source", () => {
		electronMock.isPackaged.value = false

		new Startup(INSTALLED).setStartAtLogin(true)

		expect(electronMock.setLoginItemSettings).not.toHaveBeenCalled()
	})
})

describe("Window visibility on launch", () => {
	const config = {
		isFirstRun: false,
		minimizeToTray: true,
		startWithSystem: true,
		startMinimized: false,
	}

	it("shows a manual launch even when Start with System is enabled", () => {
		expect(shouldStartHidden(config, true, false, [])).toBe(false)
	})

	it("hides a login launch and an explicit minimized launch", () => {
		expect(shouldStartHidden(config, true, true, [LOGIN_LAUNCH_ARG])).toBe(true)
		expect(shouldStartHidden(config, true, false, [START_MINIMIZED_ARG])).toBe(true)
		expect(shouldStartHidden({ ...config, startMinimized: true }, true, false, [])).toBe(true)
	})

	it("opens the window when the tray failed or setup is unfinished", () => {
		expect(shouldStartHidden(config, false, true, [LOGIN_LAUNCH_ARG])).toBe(false)
		expect(shouldStartHidden({ ...config, isFirstRun: true }, true, true, [])).toBe(false)
	})
})
