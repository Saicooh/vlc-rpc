interface MediaArtworkProps {
	src: string | null
	size?: "sm" | "md" | "lg"
}

export function MediaArtwork({ src, size = "md" }: MediaArtworkProps): JSX.Element {
	const sizeClasses = {
		sm: "w-16 h-16",
		md: "w-32 h-32",
		lg: "w-48 h-48",
	}

	if (src) {
		return (
			<div
				className={`${sizeClasses[size]} rounded-md overflow-hidden bg-muted flex-shrink-0 mx-auto sm:mx-0 border border-border/30`}
			>
				<img src={src} alt="Media artwork" className="w-full h-full object-cover" />
			</div>
		)
	}

	return (
		<div
			className={`${sizeClasses[size]} rounded-md overflow-hidden bg-muted flex-shrink-0 mx-auto sm:mx-0 flex items-center justify-center border border-border/30`}
		>
			<MusicIcon className="h-12 w-12 text-muted-foreground" />
		</div>
	)
}

function MusicIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
	return (
		<svg
			{...props}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Music</title>
			<path d="M9 18V5l12-2v13" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="16" r="3" />
		</svg>
	)
}
