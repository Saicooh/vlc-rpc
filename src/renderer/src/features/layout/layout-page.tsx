import { useStore } from "@nanostores/react"
import { Tabs, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { logger } from "@renderer/lib/utils"
import { configStore, saveConfig } from "@renderer/stores/config.store"
import { LAYOUT_PRESETS } from "@shared/constants/layouts"
import type { LayoutPreset, PresenceLayout } from "@shared/types"
import { MusicNotes, VideoCamera } from "phosphor-react"
import { useState } from "react"
import { LayoutCard } from "./components/layout-card"
import { LayoutEditor } from "./components/layout-editor"
import { LAYOUT_CARDS } from "./layout.constants"

function findMatchingPreset(layout: PresenceLayout): LayoutPreset | null {
	const match = Object.entries(LAYOUT_PRESETS).find(([, presetLayout]) => {
		return (
			layout.activityName === presetLayout.activityName &&
			layout.musicDetails === presetLayout.musicDetails &&
			layout.musicState === presetLayout.musicState &&
			layout.videoDetails === presetLayout.videoDetails &&
			layout.videoState === presetLayout.videoState
		)
	})

	if (!match) {
		return null
	}

	return match[0] as LayoutPreset
}

export function LayoutPage(): JSX.Element {
	const config = useStore(configStore)
	const [activeTab, setActiveTab] = useState<"music" | "video">("music")

	const handleSelectPreset = async (preset: LayoutPreset): Promise<void> => {
		try {
			await saveConfig("layoutPreset", preset)
			await saveConfig("presenceLayout", LAYOUT_PRESETS[preset])
			logger.info(`Layout preset changed to: ${preset}`)
		} catch (error) {
			logger.error(`Failed to update layout preset: ${error}`)
		}
	}

	const handleLayoutChange = async (layout: PresenceLayout): Promise<void> => {
		try {
			await saveConfig("presenceLayout", layout)
			const matchingPreset = findMatchingPreset(layout)
			if (matchingPreset && matchingPreset !== config?.layoutPreset) {
				await saveConfig("layoutPreset", matchingPreset)
			} else if (!matchingPreset && config?.layoutPreset) {
				await saveConfig("layoutPreset", undefined)
			}
			logger.info("Presence layout templates updated")
		} catch (error) {
			logger.error(`Failed to update presence layout templates: ${error}`)
		}
	}

	if (!config) {
		return <div className="p-6 text-center text-foreground">Loading...</div>
	}

	const currentLayout = config.presenceLayout || LAYOUT_PRESETS[config.layoutPreset || "default"]
	const selectedPreset = findMatchingPreset(currentLayout)
	const customLayoutActive = selectedPreset === null

	return (
		<div className="max-w-7xl mx-auto">
			<div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
				<div>
					<h1 className="text-xl font-bold">Rich Presence Layout</h1>
					<p className="text-sm text-muted-foreground">
						Choose presets or tune the exact Discord lines for music and video playback.
					</p>
				</div>
				{customLayoutActive && (
					<div className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
						Custom templates active
					</div>
				)}
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as "music" | "video")}
				className="mb-4"
			>
				<TabsList>
					<TabsTrigger value="music">
						<MusicNotes size={18} weight="fill" />
						Music
					</TabsTrigger>
					<TabsTrigger value="video">
						<VideoCamera size={18} weight="fill" />
						Video
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-sm font-semibold">Preset Gallery</h2>
							<p className="text-xs text-muted-foreground">
								Preset cards update the music and video templates together.
							</p>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{LAYOUT_CARDS.map((card) => (
							<LayoutCard
								key={card.preset}
								card={card}
								isSelected={selectedPreset === card.preset}
								mediaKind={activeTab}
								onSelect={handleSelectPreset}
							/>
						))}
					</div>
				</div>

				<aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
					<div className="mb-4">
						<h2 className="text-sm font-semibold">Template Editor</h2>
						<p className="text-xs text-muted-foreground">
							Changes save immediately and may take a few seconds to appear in Discord.
						</p>
					</div>
					<LayoutEditor
						layout={currentLayout}
						activeTab={activeTab}
						onLayoutChange={(layout) => void handleLayoutChange(layout)}
					/>
				</aside>
			</div>
		</div>
	)
}
