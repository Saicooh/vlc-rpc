import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Client as DiscordClient } from "@main/features/discord"
import {
	Tray as ElectronTray,
	Menu,
	type MenuItemConstructorOptions,
	app,
	nativeImage,
	powerMonitor,
} from "electron"
import iconPath16 from "../../../../resources/icons/16x16.png?asset"
import type { Startup } from "./app.startup"
import type { Window } from "./app.window"

const TEMPORARY_DISABLES = [
	{ label: "disable15", minutes: 15 },
	{ label: "disable1h", minutes: 60 },
	{ label: "disable2h", minutes: 120 },
] as const

const TRAY_LABELS = {
	en: {
		open: "Open VLC Discord RP",
		minimize: "Minimize to Tray",
		start: "Start with System",
		richPresence: "Rich Presence",
		richPresenceOff: "Rich Presence (off)",
		richPresenceUntil: "Rich Presence (off until {time})",
		disable15: "Disable for 15 minutes",
		disable1h: "Disable for 1 hour",
		disable2h: "Disable for 2 hours",
		exit: "Exit",
	},
	es: {
		open: "Abrir VLC Discord RP",
		minimize: "Minimizar a la bandeja",
		start: "Iniciar con Windows",
		richPresence: "Actividad de Discord",
		richPresenceOff: "Actividad de Discord (desactivada)",
		richPresenceUntil: "Actividad de Discord (desactivada hasta las {time})",
		disable15: "Desactivar durante 15 minutos",
		disable1h: "Desactivar durante 1 hora",
		disable2h: "Desactivar durante 2 horas",
		exit: "Salir",
	},
} as const

type TrayLanguage = keyof typeof TRAY_LABELS
const UNTIL_TIME = new Map<TrayLanguage, Intl.DateTimeFormat>()

function formatUntil(language: TrayLanguage, timestamp: number): string {
	let formatter = UNTIL_TIME.get(language)
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" })
		UNTIL_TIME.set(language, formatter)
	}
	return formatter.format(timestamp)
}

export class Tray {
	private tray: ElectronTray | null = null
	private window: Window | null = null
	private readyPromise: Promise<void>
	private readyResolver: (() => void) | null = null
	private menuUpdateTimer: NodeJS.Timeout | null = null
	private keepaliveTimer: NodeJS.Timeout | null = null
	private stopLanguageListener: (() => void) | null = null

	constructor(
		private readonly startup: Startup,
		private readonly discord: DiscordClient,
	) {
		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolver = resolve
		})

		if (app.isReady()) {
			this.initTray()
		} else {
			app.whenReady().then(() => this.initTray())
		}

		app.on("before-quit", () => this.dispose())

		powerMonitor.on("suspend", () => {
			logger.info("System is going to sleep")
		})

		powerMonitor.on("resume", () => {
			logger.info("System resumed from sleep")
			setTimeout(() => {
				if (!this.tray || this.tray.isDestroyed()) {
					logger.info("Tray icon lost after system resume, reinitializing")
					this.initTray()
				}
			}, 1000)
		})

		powerMonitor.on("lock-screen", () => {
			logger.info("Screen locked")
		})

		powerMonitor.on("unlock-screen", () => {
			logger.info("Screen unlocked")
			setTimeout(() => {
				if (!this.tray || this.tray.isDestroyed()) {
					logger.info("Tray icon lost after screen unlock, reinitializing")
					this.initTray()
				}
			}, 1000)
		})

		this.setupTrayKeepalive()
		this.startMenuUpdateTimer()
		this.stopLanguageListener = configService.onChange("interfaceLanguage", () =>
			this.updateContextMenu(),
		)
	}

	/**
	 * Tray and Window need each other only inside callbacks, so the composition
	 * root wires this by hand rather than letting the two modules import each
	 * other.
	 */
	public setWindow(window: Window): void {
		this.window = window
	}

	/**
	 * The keepalive rebuilds an icon that went missing, so leaving it running
	 * past the quit is how a tray icon comes back a minute after the user asked
	 * for it to go.
	 */
	public dispose(): void {
		this.stopTrayKeepalive()
		this.stopMenuUpdateTimer()
		this.stopLanguageListener?.()
		this.stopLanguageListener = null

		if (this.tray) {
			this.tray.destroy()
			this.tray = null
			logger.info("Tray destroyed")
		}
	}

	public async whenReady(): Promise<void> {
		return this.readyPromise
	}

	public isAvailable(): boolean {
		return this.tray !== null && !this.tray.isDestroyed()
	}

	private initTray(): void {
		try {
			if (this.tray && !this.tray.isDestroyed()) {
				logger.info("Tray already exists and is not destroyed, skipping initialization")
				return
			}

			logger.info("Initializing tray")

			const iconPath = this.getTrayIconPath()
			logger.info(`Loading tray icon from: ${iconPath}`)

			const trayIcon = nativeImage.createFromPath(iconPath)

			if (trayIcon.isEmpty()) {
				logger.error("Tray icon is empty, will try fallback")
				throw new Error("Empty tray icon")
			}

			if (this.tray) {
				try {
					this.tray.destroy()
					logger.info("Destroyed existing tray before creating new one")
				} catch (error) {
					logger.warn(`Error destroying existing tray: ${error}`)
				}
			}

			this.tray = new ElectronTray(trayIcon)
			this.tray.setIgnoreDoubleClickEvents(true)
			this.tray.setToolTip("VLC Discord RP")
			this.updateContextMenu()

			this.tray.on("click", () => {
				this.window?.showWindow()
			})

			logger.info("Tray initialized successfully")

			if (this.readyResolver) {
				this.readyResolver()
				this.readyResolver = null
			}
		} catch (error) {
			logger.error(`Failed to initialize tray: ${error}`)
			this.fallbackTrayInit()
		}
	}

	private getTrayIconPath(): string {
		const iconName = "16x16.png"

		if (is.dev) {
			return iconPath16
		}
		return join(process.resourcesPath, "resources", "icons", iconName)
	}

	/** An icon drawn here rather than loaded, for when the file cannot be read. */
	private fallbackTrayInit(): void {
		try {
			if (this.tray && !this.tray.isDestroyed()) {
				logger.info("Tray already exists and is not destroyed, skipping fallback initialization")
				return
			}

			logger.info("Attempting fallback tray initialization")

			if (this.tray) {
				try {
					this.tray.destroy()
					logger.info("Destroyed existing tray before fallback creation")
				} catch (error) {
					logger.warn(`Error destroying existing tray in fallback: ${error}`)
				}
			}

			const svgIcon = `
				<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
					<rect width="16" height="16" fill="#5865F2" />
					<path d="M3 4L8 12L13 4" stroke="white" stroke-width="2" fill="none" />
				</svg>
			`

			const svgBuffer = Buffer.from(svgIcon)
			const nativeImg = nativeImage.createFromBuffer(svgBuffer)
			this.tray = new ElectronTray(nativeImg)

			this.tray.setToolTip("VLC Discord RP")
			this.updateContextMenu()

			this.tray.on("click", () => {
				this.window?.showWindow()
			})

			logger.info("Fallback tray initialized")

			if (this.readyResolver) {
				this.readyResolver()
				this.readyResolver = null
			}
		} catch (error) {
			logger.error(`Fallback tray initialization failed: ${error}`)
			this.window?.showWindow()
		} finally {
			this.readyResolver?.()
			this.readyResolver = null
		}
	}

	private setupTrayKeepalive(): void {
		this.stopTrayKeepalive()

		this.keepaliveTimer = setInterval(() => {
			if (!this.tray || this.tray.isDestroyed()) {
				logger.info("Tray keepalive check - tray missing or destroyed, reinitializing")
				this.initTray()
			}
		}, 60000)
	}

	private stopTrayKeepalive(): void {
		if (this.keepaliveTimer) {
			clearInterval(this.keepaliveTimer)
			this.keepaliveTimer = null
			logger.info("Tray keepalive stopped")
		}
	}

	private startMenuUpdateTimer(): void {
		this.stopMenuUpdateTimer()

		this.menuUpdateTimer = setInterval(() => {
			// A pending temporary window is the only thing that changes the menu
			// on its own. Once it elapses the client drops the timestamp, the
			// refreshed menu reads as enabled again and this goes quiet.
			if (configService.get("rpcDisabledUntil") !== undefined) {
				this.updateContextMenu()
			}
		}, 10000)
	}

	private stopMenuUpdateTimer(): void {
		if (this.menuUpdateTimer) {
			clearInterval(this.menuUpdateTimer)
			this.menuUpdateTimer = null
			logger.info("Menu update timer stopped")
		}
	}

	public updateContextMenu(): void {
		if (!this.tray) {
			logger.warn("Cannot update tray menu, tray is not initialized")
			return
		}

		try {
			const config = configService.get()
			const language = config.interfaceLanguage === "es" ? "es" : "en"
			const labels = TRAY_LABELS[language]

			const menuItems: MenuItemConstructorOptions[] = [
				{
					label: labels.open,
					click: () => this.window?.showWindow(),
				},
				{ type: "separator" },
				{
					label: labels.minimize,
					type: "checkbox",
					checked: config.minimizeToTray,
					click: () => {
						const newValue = !config.minimizeToTray
						configService.set("minimizeToTray", newValue)
					},
				},
			]

			if (this.startup.canStartAtLogin()) {
				menuItems.push({
					label: labels.start,
					type: "checkbox",
					checked: config.startWithSystem,
					click: () => {
						const newValue = !config.startWithSystem
						if (this.startup.setStartAtLogin(newValue)) {
							configService.set("startWithSystem", newValue)
						}
					},
				})
			}

			const rpcEnabled = this.discord.isRpcEnabled()

			menuItems.push(
				{ type: "separator" },
				{
					label: this.rpcMenuLabel(rpcEnabled, language),
					type: "checkbox",
					checked: rpcEnabled,
					click: () => {
						if (rpcEnabled) {
							this.discord.disableRpc()
						} else {
							this.discord.enableRpc()
						}
						this.updateContextMenu()
					},
				},
				// The three the README has always promised. Issue 30 is someone
				// reading that page, looking for them here and finding one.
				...TEMPORARY_DISABLES.map(({ label, minutes }) => ({
					label: labels[label],
					enabled: rpcEnabled,
					click: () => {
						this.discord.disableRpcTemporary(minutes)
						this.updateContextMenu()
					},
				})),
			)

			menuItems.push(
				{ type: "separator" },
				{
					label: labels.exit,
					click: () => {
						app.isQuitting = true
						app.quit()
					},
				},
			)

			const contextMenu = Menu.buildFromTemplate(menuItems)
			this.tray.setContextMenu(contextMenu)
			logger.info("Tray context menu updated")
		} catch (error) {
			logger.error(`Failed to update tray context menu: ${error}`)
		}
	}

	/**
	 * The on/off answer comes from the client rather than from the flags again,
	 * so the menu cannot claim one thing while Discord shows another.
	 */
	private rpcMenuLabel(enabled: boolean, language: TrayLanguage): string {
		const labels = TRAY_LABELS[language]
		if (enabled) {
			return labels.richPresence
		}

		const disabledUntil = configService.get("rpcDisabledUntil")
		if (disabledUntil === undefined) {
			return labels.richPresenceOff
		}

		return labels.richPresenceUntil.replace("{time}", formatUntil(language, disabledUntil))
	}
}
