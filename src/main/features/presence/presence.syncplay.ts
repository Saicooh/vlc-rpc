import { execFile } from "node:child_process"
import { logger } from "@main/core/logger"

export interface SyncplayStatus {
	isRunning(): Promise<boolean>
}

/** Process-based Syncplay detection, cached so the presence loop stays cheap. */
export class SyncplayDetector implements SyncplayStatus {
	private isRunningValue = false
	private lastCheck = 0
	private readonly checkInterval = 15_000

	public async isRunning(): Promise<boolean> {
		const now = Date.now()
		if (now - this.lastCheck < this.checkInterval) return this.isRunningValue

		this.lastCheck = now
		const previous = this.isRunningValue
		this.isRunningValue = await this.checkProcess()
		if (this.isRunningValue !== previous) {
			logger.info(`Syncplay ${this.isRunningValue ? "detected" : "no longer detected"}`)
		}

		return this.isRunningValue
	}

	private checkProcess(): Promise<boolean> {
		return new Promise((resolve) => {
			const windows = process.platform === "win32"
			const executable = windows ? "tasklist.exe" : "pgrep"
			const args = windows
				? ["/FI", "IMAGENAME eq Syncplay.exe", "/FO", "CSV", "/NH"]
				: ["-xi", "syncplay"]

			execFile(executable, args, { timeout: 3000 }, (error, stdout) => {
				if (process.platform === "win32") {
					resolve(!error && /^"Syncplay\.exe",/im.test(stdout))
					return
				}

				resolve(!error && stdout.trim().length > 0)
			})
		})
	}
}
