import { logger } from "@renderer/lib/utils"
import type { UpdateInstallKind } from "@shared/updates/update.types"

export type SystemInfo =
	| { kind: "loading" }
	| { kind: "ready"; version: string; installedAs: UpdateInstallKind }
	| { kind: "failed" }

/** Never rejects: a settings screen that cannot read its own version still renders. */
export async function readSystemInfo(): Promise<SystemInfo> {
	try {
		const [status, installedAs] = await Promise.all([
			window.api.update.getStatus(),
			window.api.update.getInstallationType(),
		])

		return { kind: "ready", version: status.currentVersion, installedAs }
	} catch (error) {
		logger.error(`Failed to read the app version and install type: ${error}`)
		return { kind: "failed" }
	}
}
