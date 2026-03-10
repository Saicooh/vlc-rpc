interface ProgressBarProps {
	position: number
	duration: number
}

export function ProgressBar({ position, duration }: ProgressBarProps): JSX.Element {
	const percentage = (position / duration) * 100

	return (
		<div className="mt-4">
			<div className="h-2 bg-muted rounded-full overflow-hidden">
				<div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
			</div>
			<div className="flex justify-between mt-1 text-xs text-muted-foreground">
				<span>{formatTime(position)}</span>
				<span>{formatTime(duration)}</span>
			</div>
		</div>
	)
}

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60)
	const secs = Math.floor(seconds % 60)
	return `${mins}:${secs.toString().padStart(2, "0")}`
}
