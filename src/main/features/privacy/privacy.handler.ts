import { registerHandler } from "@main/core/ipc"
import type { Client as VlcClient } from "@main/features/vlc"
import type { Service } from "./privacy.service"

export class Handler {
	constructor(privacy: Service, vlc: VlcClient, changed: () => Promise<unknown>) {
		registerHandler("privacy:describe", async (suppliedStatus) => {
			const status = suppliedStatus ?? (await vlc.readStatus(false))
			return status ? privacy.describe(status) : null
		})
		registerHandler("privacy:exclude-current", async (uri, kind) => {
			const status = await vlc.readStatus(true)
			if (!status?.active) return false
			const current = await privacy.describe(status, true)
			// A button belongs to the file shown when it was pressed, even if VLC advances meanwhile.
			if (current.sourceUri !== uri || !privacy.exclude(kind, current)) return false
			await changed()
			return true
		})
		registerHandler("privacy:remove", async (rule) => {
			privacy.remove(rule)
			await changed()
			return true
		})
	}
}
