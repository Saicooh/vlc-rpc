import { exec } from "node:child_process"
import { logger } from "./logger"

/**
 * Service to detect if Syncplay is running on the system.
 * Caches the result to avoid excessive process lookups.
 */
export class SyncplayDetector {
	private static instance: SyncplayDetector | null = null
	private _isRunning = false
	private lastCheck = 0
	private readonly checkInterval = 15000 // Check every 15 seconds

	private constructor() {
		logger.info("Syncplay detector initialized")
	}

	public static getInstance(): SyncplayDetector {
		if (!SyncplayDetector.instance) {
			SyncplayDetector.instance = new SyncplayDetector()
		}
		return SyncplayDetector.instance
	}

	/**
	 * Check if Syncplay is currently running.
	 * Results are cached for 15 seconds to avoid spamming process lookups.
	 */
	public async isRunning(): Promise<boolean> {
		const now = Date.now()
		if (now - this.lastCheck < this.checkInterval) {
			return this._isRunning
		}

		this.lastCheck = now
		const wasRunning = this._isRunning
		this._isRunning = await this.checkProcess()

		// Only log on state change
		if (this._isRunning !== wasRunning) {
			logger.info(`Syncplay ${this._isRunning ? "detected" : "no longer detected"}`)
		}

		return this._isRunning
	}

	/**
	 * Check the system process list for Syncplay
	 */
	private checkProcess(): Promise<boolean> {
		return new Promise((resolve) => {
			const platform = process.platform
			let command: string

			if (platform === "win32") {
				command = 'tasklist /FI "IMAGENAME eq Syncplay.exe" /NH'
			} else {
				// macOS and Linux
				command = "pgrep -xi syncplay"
			}

			exec(command, { timeout: 3000 }, (error, stdout) => {
				if (platform === "win32") {
					resolve(stdout.toLowerCase().includes("syncplay"))
				} else {
					// pgrep returns exit code 0 if found, 1 if not
					resolve(!error && stdout.trim().length > 0)
				}
			})
		})
	}
}

export const syncplayDetector = SyncplayDetector.getInstance()
