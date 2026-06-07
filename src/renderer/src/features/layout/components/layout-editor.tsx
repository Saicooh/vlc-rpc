import { Input } from "@renderer/components/ui/input"
import { MUSIC_TEMPLATE_VARS, VIDEO_TEMPLATE_VARS, applyTemplate } from "@shared/constants/layouts"
import type { PresenceLayout } from "@shared/types"
import { DiscordPreview } from "./discord-preview"

type LayoutEditorTab = "music" | "video"
type TemplateFieldName = "musicDetails" | "musicState" | "videoDetails" | "videoState"

interface LayoutEditorProps {
	layout: PresenceLayout
	activeTab: LayoutEditorTab
	onLayoutChange: (layout: PresenceLayout) => void
}

export function LayoutEditor({
	layout,
	activeTab,
	onLayoutChange,
}: LayoutEditorProps): JSX.Element {
	const musicExampleData = {
		title: "Bohemian Rhapsody",
		artist: "Queen",
		album: "A Night at the Opera",
	}

	const videoExampleData = {
		title: "Breaking Bad",
		episodeInfo: "S05E14",
		year: "2013",
		season: "5",
		episode: "14",
	}

	const handleTemplateChange = (field: TemplateFieldName, value: string): void => {
		onLayoutChange({
			...layout,
			[field]: value,
		})
	}

	const musicPreviewDetails = applyTemplate(layout.musicDetails, musicExampleData)
	const musicPreviewState = applyTemplate(layout.musicState, musicExampleData)
	const videoPreviewDetails = applyTemplate(layout.videoDetails, videoExampleData)
	const videoPreviewState = applyTemplate(layout.videoState, videoExampleData)

	return (
		<div className="space-y-5">
			{activeTab === "music" && (
				<div className="space-y-4">
					<div>
						<div className="text-sm font-medium mb-1">First Line (Details)</div>
						<Input
							value={layout.musicDetails}
							onChange={(e) => handleTemplateChange("musicDetails", e.target.value)}
							placeholder="{title}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(MUSIC_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-sm font-medium mb-1">Second Line (State)</div>
						<Input
							value={layout.musicState}
							onChange={(e) => handleTemplateChange("musicState", e.target.value)}
							placeholder="by {artist}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(MUSIC_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-xs text-muted-foreground mb-2">Live Preview</div>
						<DiscordPreview
							activityName="Queen"
							details={musicPreviewDetails}
							state={musicPreviewState}
							supportingText="A Night at the Opera"
							artworkUrl={null}
							mediaKind="music"
						/>
					</div>
				</div>
			)}

			{activeTab === "video" && (
				<div className="space-y-4">
					<div>
						<div className="text-sm font-medium mb-1">First Line (Details)</div>
						<Input
							value={layout.videoDetails}
							onChange={(e) => handleTemplateChange("videoDetails", e.target.value)}
							placeholder="{title}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(VIDEO_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-sm font-medium mb-1">Second Line (State)</div>
						<Input
							value={layout.videoState}
							onChange={(e) => handleTemplateChange("videoState", e.target.value)}
							placeholder="{episodeInfo}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(VIDEO_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-xs text-muted-foreground mb-2">Live Preview</div>
						<DiscordPreview
							activityName="Watching VLC Media Player"
							details={videoPreviewDetails}
							state={videoPreviewState}
							supportingText="2013"
							artworkUrl={null}
							mediaKind="video"
						/>
					</div>
				</div>
			)}

			<div className="bg-muted/50 rounded-md p-3 text-xs">
				<div className="font-medium mb-2">Template Variables</div>
				<div className="grid grid-cols-1 gap-2 text-muted-foreground">
					{Object.entries(activeTab === "music" ? MUSIC_TEMPLATE_VARS : VIDEO_TEMPLATE_VARS).map(
						([name, description]) => (
							<div key={name} className="flex items-center justify-between gap-3">
								<code className="rounded bg-background px-1.5 py-0.5 text-foreground">{`{${name}}`}</code>
								<span className="text-right">{description}</span>
							</div>
						),
					)}
				</div>
			</div>
		</div>
	)
}
