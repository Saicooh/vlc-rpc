import { registerHandler } from "@main/ipc"
import { logger } from "@main/services/logger"
import { startupService } from "@main/services/startup"

/**
 * Handler for app info requests
 */
export class AppInfoHandler {
	constructor() {
		this.registerHandlers()
		logger.info("App info handler initialized")
	}

	private registerHandlers(): void {
		registerHandler("app:is-portable", async () => {
			try {
				const isPortable = startupService.isPortable()
				logger.info(`App is portable: ${isPortable}`)
				return isPortable
			} catch (error) {
				logger.error(`Failed to check if portable: ${error}`)
				return false
			}
		})
	}
}
