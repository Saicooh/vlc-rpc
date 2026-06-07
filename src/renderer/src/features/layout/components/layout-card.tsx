import { useStore } from "@nanostores/react"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import { LAYOUT_PRESETS, applyTemplate } from "@shared/constants/layouts"
import type { LayoutPreset } from "@shared/types"
import { VideoCamera } from "phosphor-react"
import type { LayoutCardData } from "../layout.constants"
import { DiscordPreview } from "./discord-preview"

interface LayoutCardProps {
	card: LayoutCardData
	isSelected: boolean
	mediaKind: "music" | "video"
	onSelect: (preset: LayoutPreset) => void
}

export function LayoutCard({
	card,
	isSelected,
	mediaKind,
	onSelect,
}: LayoutCardProps): JSX.Element {
	const media = useStore(mediaStore)
	const proxiedArtworkUrl = useProxiedArtwork()

	const layout = LAYOUT_PRESETS[card.preset]
	const hasMusicInfo = mediaKind === "music" && media.title && media.artist
	const hasVideoInfo = mediaKind === "video" && media.title && media.contentType

	const musicTemplateVariables = {
		title: media.title || "Bohemian Rhapsody",
		artist: media.artist || "Queen",
		album: media.album || "A Night at the Opera",
	}
	const videoTemplateVariables = {
		title: media.title || "Breaking Bad",
		episodeInfo:
			media.season && media.episode
				? `S${media.season}E${media.episode}`
				: media.season
					? `Season ${media.season}`
					: media.episode
						? `Episode ${media.episode}`
						: media.contentType === "movie"
							? "Movie"
							: "S05E14",
		year: media.year || "2013",
		season: media.season?.toString() || "5",
		episode: media.episode?.toString() || "14",
	}

	const displayActivityName =
		mediaKind === "music"
			? hasMusicInfo && layout.activityName
				? applyTemplate(layout.activityName, musicTemplateVariables)
				: "Queen"
			: "Watching VLC Media Player"

	const displayDetails =
		mediaKind === "music"
			? hasMusicInfo
				? applyTemplate(layout.musicDetails, musicTemplateVariables)
				: card.musicExample.details
			: hasVideoInfo
				? applyTemplate(layout.videoDetails, videoTemplateVariables)
				: card.videoExample.details

	const displayState =
		mediaKind === "music"
			? hasMusicInfo
				? applyTemplate(layout.musicState, musicTemplateVariables)
				: card.musicExample.state
			: hasVideoInfo
				? applyTemplate(layout.videoState, videoTemplateVariables)
				: card.videoExample.state

	const supportingText =
		mediaKind === "music"
			? hasMusicInfo && media.album
				? media.album
				: "A Night at the Opera"
			: media.year || "2013"

	return (
		<button
			key={card.preset}
			type="button"
			onClick={() => onSelect(card.preset)}
			className={`text-left p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
				isSelected
					? "border-primary bg-primary/5 shadow-lg shadow-primary/20"
					: "border-border bg-card hover:border-primary/50 hover:bg-card/80"
			}`}
		>
			<div className="flex items-start justify-between mb-3">
				<div>
					<h3 className="font-semibold text-base flex items-center gap-2">
						{card.name}
						{isSelected && (
							<span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
								Active
							</span>
						)}
					</h3>
					<p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
				</div>
				{mediaKind === "video" && <VideoCamera size={18} weight="fill" className="text-primary" />}
			</div>

			<DiscordPreview
				activityName={displayActivityName}
				details={displayDetails}
				state={displayState}
				supportingText={supportingText}
				artworkUrl={mediaKind === "music" ? proxiedArtworkUrl : media.contentImageUrl}
				mediaKind={mediaKind}
			/>
		</button>
	)
}
