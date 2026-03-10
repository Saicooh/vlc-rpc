import { useStore } from "@nanostores/react"
import { PauseIcon, PlayIcon, StopIcon } from "@radix-ui/react-icons"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import { vlcStatusStore } from "@renderer/features/vlc"
import { ContentTypeBadge } from "./content-type-badge"
import { MediaArtwork } from "./media-artwork"
import { ProgressBar } from "./progress-bar"

export function NowPlaying(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const media = useStore(mediaStore)
	const proxiedArtworkUrl = useProxiedArtwork()

	const displayTitle = media.title
	const isEpisode = media.season !== null && media.episode !== null
	const isMovie = media.contentType === "movie" && media.year !== null

	if (vlcStatus !== "connected") {
		return (
			<div className="bg-card text-card-foreground rounded-md border border-border p-8 text-center">
				<div className="text-muted-foreground mb-2">
					{vlcStatus === "connecting" ? (
						<span className="animate-pulse">Connecting to VLC...</span>
					) : (
						<>VLC is not connected</>
					)}
				</div>
				<p className="text-xs mt-2 text-muted-foreground">
					Make sure VLC is running with HTTP interface enabled
				</p>
			</div>
		)
	}

	if (!displayTitle) {
		return (
			<div className="bg-card text-card-foreground rounded-md border border-border p-8 text-center">
				<StopIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
				<p className="text-muted-foreground">Nothing playing in VLC</p>
				<p className="text-xs mt-2 text-muted-foreground">Play something in VLC to see it here</p>
			</div>
		)
	}

	return (
		<div className="bg-card text-card-foreground rounded-md border border-border p-4">
			<div className="flex flex-col sm:flex-row gap-4">
				<MediaArtwork src={proxiedArtworkUrl} />

				<div className="flex-1">
					<div className="flex items-center mb-2">
						{media.mediaStatus === "playing" ? (
							<div className="flex items-center text-green-400 text-sm font-medium">
								<PlayIcon className="mr-1.5" />
								<span>Playing</span>
							</div>
						) : (
							<div className="flex items-center text-muted-foreground text-sm font-medium">
								<PauseIcon className="mr-1.5" />
								<span>Paused</span>
							</div>
						)}
						{media.contentType && <ContentTypeBadge contentType={media.contentType} />}
					</div>

					<h3 className="font-semibold text-lg">{displayTitle}</h3>

					{isEpisode && (
						<p className="text-sm mt-1">
							Season {media.season} · Episode {media.episode}
						</p>
					)}

					{isMovie && media.year && <p className="text-sm mt-1">{media.year}</p>}

					{media.artist && <p className="mt-1">{media.artist}</p>}

					{media.album && <p className="text-sm text-muted-foreground">{media.album}</p>}

					{media.duration && (
						<ProgressBar position={media.position || 0} duration={media.duration} />
					)}
				</div>
			</div>
		</div>
	)
}
