import { Panel, Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"

export function ExperimentalSettingsPanel({ config }: { config: AppConfig }): JSX.Element {
	async function toggle(
		option: "preferSpanishEpisodeTitles" | "showEpisodeThumbnails",
	): Promise<void> {
		try {
			await saveConfig(option, !config[option])
		} catch (error) {
			logger.error(`Failed to toggle ${option}: ${error}`)
		}
	}

	return (
		<Panel label="Experimental">
			<Row
				htmlFor="preferSpanishEpisodeTitles"
				label="Prefer Spanish episode titles"
				description="Use a Spanish episode title when available; fall back to English automatically."
				control={
					<Switch
						id="preferSpanishEpisodeTitles"
						checked={config.preferSpanishEpisodeTitles === true}
						onChange={() => toggle("preferSpanishEpisodeTitles")}
					/>
				}
			/>
			<Row
				htmlFor="showEpisodeThumbnails"
				label="Show episode thumbnails"
				description="Use an episode image when available. Otherwise, upload a frame from the local video to an image host for Discord."
				control={
					<Switch
						id="showEpisodeThumbnails"
						checked={config.showEpisodeThumbnails === true}
						onChange={() => toggle("showEpisodeThumbnails")}
					/>
				}
			/>
		</Panel>
	)
}
