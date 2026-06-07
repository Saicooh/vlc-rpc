import { MusicNotes, VideoCamera } from "phosphor-react"

interface DiscordPreviewProps {
	activityName: string
	details: string
	state: string
	supportingText?: string
	artworkUrl: string | null
	mediaKind?: "music" | "video"
}

export function DiscordPreview({
	activityName,
	details,
	state,
	supportingText,
	artworkUrl,
	mediaKind = "music",
}: DiscordPreviewProps): JSX.Element {
	const isVideo = mediaKind === "video"
	const Icon = isVideo ? VideoCamera : MusicNotes
	const activityLabel = isVideo ? activityName : `Listening to ${activityName}`
	const artworkAlt = isVideo ? "Video artwork" : "Album artwork"

	return (
		<div className="bg-background rounded-md p-3 border border-border">
			<div className="text-xs font-medium text-muted-foreground mb-2">{activityLabel}</div>

			<div className="flex items-start gap-3">
				{artworkUrl ? (
					<img
						src={artworkUrl}
						alt={artworkAlt}
						className="w-16 h-16 rounded object-cover flex-shrink-0"
					/>
				) : (
					<div className="w-16 h-16 bg-gradient-to-br from-primary/30 to-primary/10 rounded flex items-center justify-center flex-shrink-0">
						<Icon size={32} weight="fill" className="text-primary" />
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold text-foreground truncate mb-0.5">{details}</div>
					<div className="text-xs text-muted-foreground truncate mb-0.5">{state}</div>
					{supportingText && (
						<div className="text-xs text-muted-foreground truncate">{supportingText}</div>
					)}
					<div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
						<div className="w-full bg-muted rounded-full h-1">
							<div className="bg-primary h-1 rounded-full w-1/3" />
						</div>
						<span className="text-[10px]">1:23</span>
					</div>
				</div>
			</div>
		</div>
	)
}
