import { initializeDiscordStore } from "@renderer/features/discord"
import { initializeVlcStore } from "@renderer/features/vlc"
import { logger } from "@renderer/lib/utils"
import { appStatusStore } from "@renderer/stores/app.store"
import { loadConfig } from "@renderer/stores/config.store"
import { useEffect, useState } from "react"

export function useAppInit(): boolean {
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function init(): Promise<void> {
			try {
				logger.info("App initializing")
				await loadConfig()
				await initializeVlcStore()
				await initializeDiscordStore()
				appStatusStore.set("ready")
				logger.info("App initialized")
			} catch (error) {
				logger.error(`Initialization error: ${error}`)
				appStatusStore.set("error")
			} finally {
				setLoading(false)
			}
		}

		init()
	}, [])

	return loading
}
