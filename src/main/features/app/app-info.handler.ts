import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Startup } from "./app.startup"

export class AppInfoHandler {
	constructor(private readonly startup: Startup) {
		this.registerHandlers()
		logger.info("App info handler initialized")
	}

	private registerHandlers(): void {
		registerHandler("app:set-start-with-system", (enabled) => {
			if (!this.startup.setStartAtLogin(enabled)) return false
			configService.set("startWithSystem", enabled)
			return true
		})
	}
}
