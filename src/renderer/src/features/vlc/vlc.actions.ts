import { updateFromVlcStatus } from "@renderer/features/media/media.actions"
import { refreshMediaInfo } from "@renderer/features/media/media.actions"
import { logger } from "@renderer/lib/utils"
import type { VlcConfig } from "@shared/config/app-config"
import { DEFAULT_CONFIG } from "@shared/config/defaults"
import type { VlcConfigSaveResult } from "@shared/ipc/channels"
import { vlcConfigStore, vlcConnectionReasonStore, vlcStatusStore } from "./vlc.store"

let statusPollingInterval: ReturnType<typeof setInterval> | null = null
let statusRefreshInFlight = false
let visibilityListenerInstalled = false
let windowVisible = false
let visibilityVersion = 0
let initialized = false

export async function loadVlcConfig(): Promise<VlcConfig | null> {
	try {
		const config = await window.api.vlc.getConfig()
		vlcConfigStore.set(config)
		logger.info("VLC configuration loaded")

		await checkVlcConnection()
		return config
	} catch (error) {
		logger.error(`Failed to load VLC configuration: ${error}`)
		return null
	}
}

export type SaveVlcConfigResult =
	| { kind: "saved"; config: VlcConfig }
	| { kind: Exclude<VlcConfigSaveResult, "saved"> }

export async function saveVlcConfig(config: VlcConfig): Promise<SaveVlcConfigResult> {
	try {
		vlcStatusStore.set("connecting")
		const result = await window.api.vlc.setupConfig(config)

		if (result === "saved") {
			const updatedConfig = await window.api.vlc.getConfig()
			vlcConfigStore.set(updatedConfig)
			await checkVlcConnection()
			logger.info("VLC configuration saved")
			return { kind: "saved", config: updatedConfig }
		}
		await checkVlcConnection()
		return { kind: result }
	} catch (error) {
		vlcStatusStore.set("error")
		logger.error(`Error saving VLC configuration: ${error}`)
		return { kind: "failed" }
	}
}

export async function checkVlcConnection(): Promise<boolean> {
	try {
		const status = await window.api.vlc.checkStatus()
		vlcConnectionReasonStore.set(status.reason)

		if (status.isRunning) {
			vlcStatusStore.set("connected")
			startStatusPolling()
			return true
		}
		vlcStatusStore.set("disconnected")
		updateFromVlcStatus(null)

		return false
	} catch (error) {
		vlcStatusStore.set("error")
		vlcConnectionReasonStore.set(null)
		logger.error(`Error checking VLC connection: ${error}`)
		return false
	}
}

/**
 * Only writes vlcrc after VLC has closed, so the next launch reads the change.
 */
export async function repairVlcConfig(): Promise<SaveVlcConfigResult> {
	const current = vlcConfigStore.get() ?? DEFAULT_CONFIG.vlc
	return await saveVlcConfig({ ...current, httpEnabled: true })
}

function startStatusPolling(): void {
	if (!canPoll() || statusPollingInterval) return

	statusPollingInterval = setInterval(() => void refreshVlcStatus(), 2000)
	void refreshVlcStatus()
	logger.info("VLC status polling started (2000ms)")
}

function canPoll(): boolean {
	return initialized && windowVisible && document.visibilityState === "visible"
}

function stopStatusPolling(): void {
	if (!statusPollingInterval) return
	clearInterval(statusPollingInterval)
	statusPollingInterval = null
}

async function refreshVlcStatus(): Promise<void> {
	if (!canPoll() || statusRefreshInFlight) return
	statusRefreshInFlight = true

	try {
		if (vlcStatusStore.get() === "disconnected") {
			const isConnected = await checkVlcConnection()
			if (!isConnected || !canPoll()) return
		}

		const status = await window.api.vlc.getStatus(true)
		if (!canPoll()) return

		if (status) {
			vlcStatusStore.set("connected")
			updateFromVlcStatus(status)
			await refreshMediaInfo()
		} else {
			await checkVlcConnection()
		}
	} catch (error) {
		logger.error(`Error refreshing VLC status: ${error}`)
		await checkVlcConnection()
	} finally {
		statusRefreshInFlight = false
	}
}

export async function initializeVlcStore(): Promise<void> {
	if (!visibilityListenerInstalled) {
		document.addEventListener("visibilitychange", () => {
			if (canPoll()) startStatusPolling()
			else stopStatusPolling()
		})
		window.api.app.onVisibilityChange((visible) => {
			visibilityVersion++
			windowVisible = visible
			if (canPoll()) startStatusPolling()
			else stopStatusPolling()
		})
		visibilityListenerInstalled = true
	}

	const version = visibilityVersion
	const visible = await window.api.app.isVisible()
	if (visibilityVersion === version) windowVisible = visible
	await loadVlcConfig()
	initialized = true
	startStatusPolling()
}
