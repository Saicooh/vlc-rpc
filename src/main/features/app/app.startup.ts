import { logger } from "@main/core/logger"
import type { InstallKind } from "@main/features/updates"
import type { AppConfig } from "@shared/config/app-config"
import { app } from "electron"

export const LOGIN_LAUNCH_ARG = "--launch-at-login"
export const START_MINIMIZED_ARG = "--start-minimized"

export function shouldStartHidden(
	config: Pick<AppConfig, "isFirstRun" | "minimizeToTray" | "startWithSystem" | "startMinimized">,
	trayAvailable: boolean,
	launchedAtStartup: boolean,
	args: readonly string[],
): boolean {
	return (
		!config.isFirstRun &&
		trayAvailable &&
		(config.startMinimized === true ||
			args.includes(START_MINIMIZED_ARG) ||
			(config.minimizeToTray && config.startWithSystem && launchedAtStartup))
	)
}

export class Startup {
	/**
	 * The install kind is decided once in the composition root and handed to
	 * everything that asks. Reading it off the executable path was a guess that
	 * was wrong in both directions: a portable copy in a folder not named
	 * "portable" was offered start at login, which writes a registry entry
	 * pointing at a file the user is free to move, and an install under a folder
	 * like C:\PortableApps lost start at login for no reason.
	 */
	constructor(private readonly install: InstallKind) {}

	public isPortable(): boolean {
		return this.install.kind === "portable"
	}

	/** Only an installed copy can be written into the registry. */
	public setStartAtLogin(enable: boolean): boolean {
		try {
			if (!app.isPackaged) {
				logger.warn("Not setting start at login in development mode")
				return false
			}

			if (this.isPortable()) {
				logger.warn("Start at login is not available for portable version")
				return false
			}

			app.setLoginItemSettings({
				openAtLogin: enable,
				path: process.execPath,
				args: [LOGIN_LAUNCH_ARG],
			})
			logger.info(`Set start at login: ${enable}`)
			return true
		} catch (error) {
			logger.error(`Failed to set start at login: ${error}`)
			return false
		}
	}
}
