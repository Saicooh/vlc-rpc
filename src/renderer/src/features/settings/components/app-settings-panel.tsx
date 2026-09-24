import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Panel, Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { loadConfig, saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import { useState } from "react"

type CacheState = { kind: "idle" } | { kind: "clearing" } | { kind: "cleared" } | { kind: "failed" }

const CACHE_IDLE =
	"When a file carries its own artwork, the app uploads it so Discord can fetch it, and remembers the link. Clearing that makes it upload again."

const CACHE_DESCRIPTION: Record<CacheState["kind"], string> = {
	idle: CACHE_IDLE,
	clearing: CACHE_IDLE,
	cleared: "Cleared. The next file with its own artwork gets uploaded again.",
	failed: "Could not clear the saved links. Try again.",
}

interface AppSettingsPanelProps {
	config: AppConfig
	/**
	 * A portable copy has nothing to register at startup. It stays false while
	 * the install type is unknown, so the row never appears and then vanishes.
	 */
	canStartWithSystem: boolean
}

export function AppSettingsPanel({
	config,
	canStartWithSystem,
}: AppSettingsPanelProps): JSX.Element {
	const [cache, setCache] = useState<CacheState>({ kind: "idle" })
	const [startupError, setStartupError] = useState<string | null>(null)

	async function handleToggleOption(
		option: "minimizeToTray" | "startWithSystem" | "startMinimized" | "hideActivityWhenPaused",
	): Promise<void> {
		try {
			if (option === "startWithSystem") {
				setStartupError(null)
				const saved = await window.api.app.setStartWithSystem(!config.startWithSystem)
				if (!saved) throw new Error("Could not update the Windows login item")
				await loadConfig()
				return
			}
			await saveConfig(option, !config[option])
		} catch (error) {
			logger.error(`Failed to toggle ${option}: ${error}`)
			if (option === "startWithSystem") {
				setStartupError("Could not change the Windows startup setting. Try again.")
			}
		}
	}

	async function handleClearMetadataCache(): Promise<void> {
		setCache({ kind: "clearing" })
		try {
			// The handler resolves with success false when it could not clear, and
			// only throws when the call itself failed. Reading one and not the other
			// is how a locked file reported "Cleared."
			const result = await window.api.metadata.clearCache()
			setCache(result.success ? { kind: "cleared" } : { kind: "failed" })
		} catch (error) {
			logger.error(`Failed to clear the cover art cache: ${error}`)
			setCache({ kind: "failed" })
		}
	}

	return (
		<Panel label="App">
			<Row
				htmlFor="hideActivityWhenPaused"
				label="Hide Discord activity while paused"
				description="Clear your activity when you pause VLC; show it again when playback resumes."
				control={
					<Switch
						id="hideActivityWhenPaused"
						checked={config.hideActivityWhenPaused === true}
						onChange={() => handleToggleOption("hideActivityWhenPaused")}
					/>
				}
			/>
			<Row
				htmlFor="minimizeToTray"
				label="Keep running in the tray when you minimize"
				description="Closing or minimizing keeps the app in the tray."
				control={
					<Switch
						id="minimizeToTray"
						checked={config.minimizeToTray}
						onChange={() => handleToggleOption("minimizeToTray")}
					/>
				}
			/>
			<Row
				htmlFor="startMinimized"
				label="Start in the tray"
				description="Keep the window hidden on launch, including when you open the app yourself."
				control={
					<Switch
						id="startMinimized"
						checked={config.startMinimized === true}
						onChange={() => handleToggleOption("startMinimized")}
					/>
				}
			/>

			{canStartWithSystem && (
				<Row
					htmlFor="startWithSystem"
					label="Start when Windows starts"
					description={
						startupError ? (
							<span role="alert" className="text-danger-text">
								{startupError}
							</span>
						) : (
							"Launch at sign-in; the window stays hidden if the tray option is on."
						)
					}
					control={
						<Switch
							id="startWithSystem"
							checked={config.startWithSystem}
							onChange={() => handleToggleOption("startWithSystem")}
						/>
					}
				/>
			)}

			<div className="bg-background p-3 rounded-md space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-card-foreground">Custom Discord Button</p>
						<p className="text-xs text-muted-foreground">
							Add a custom button (e.g., My Profile) to anime Rich Presence
						</p>
					</div>
					<Switch
						checked={!!config.customButtonEnabled}
						onChange={(e) => saveConfig("customButtonEnabled", e.target.checked)}
					/>
				</div>

				{config.customButtonEnabled && (
					<div className="space-y-3 pt-2 border-t border-border">
						<div className="space-y-1">
							<label
								htmlFor="custom-button-label"
								className="text-xs font-medium text-muted-foreground"
							>
								Button Label
							</label>
							<Input
								id="custom-button-label"
								defaultValue={config.customButtonLabel || "My Profile"}
								onBlur={(e) => saveConfig("customButtonLabel", e.target.value)}
								placeholder="My Profile"
							/>
						</div>
						<div className="space-y-1">
							<label
								htmlFor="custom-button-url"
								className="text-xs font-medium text-muted-foreground"
							>
								Button URL
							</label>
							<Input
								id="custom-button-url"
								defaultValue={config.customButtonUrl || ""}
								onBlur={(e) => saveConfig("customButtonUrl", e.target.value)}
								placeholder="https://anilist.co/user/..."
								type="url"
							/>
						</div>
					</div>
				)}
			</div>

			<Row
				label="Uploaded cover art"
				description={
					<span
						aria-live="polite"
						className={cache.kind === "failed" ? "text-danger-text" : undefined}
					>
						{CACHE_DESCRIPTION[cache.kind]}
					</span>
				}
				control={
					<Button
						variant="secondary"
						size="sm"
						onClick={handleClearMetadataCache}
						isLoading={cache.kind === "clearing"}
					>
						Clear
					</Button>
				}
			/>
		</Panel>
	)
}
