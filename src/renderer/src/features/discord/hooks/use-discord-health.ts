import { useStore } from "@nanostores/react"
import { logger } from "@renderer/lib/utils"
import { useEffect } from "react"
import { checkDiscordStatus, tryReconnect } from "../discord.actions"
import { discordStatusStore } from "../discord.store"

const HEALTH_CHECK_INTERVAL = 120000

export function useDiscordHealth(): void {
	const discordStatus = useStore(discordStatusStore)

	useEffect(() => {
		const interval = setInterval(() => {
			if (discordStatus !== "connected") {
				checkDiscordStatus().then((isConnected) => {
					if (!isConnected) {
						logger.info("Periodic check found Discord disconnected")
						tryReconnect()
					}
				})
			}
		}, HEALTH_CHECK_INTERVAL)

		const handleVisibilityChange = (): void => {
			if (document.visibilityState === "visible" && discordStatus !== "connected") {
				logger.info("Document became visible, checking Discord connection")
				checkDiscordStatus().then((isConnected) => {
					if (!isConnected) {
						tryReconnect()
					}
				})
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			clearInterval(interval)
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
	}, [discordStatus])
}
