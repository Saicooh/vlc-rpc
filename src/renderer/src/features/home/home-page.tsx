import { useStore } from "@nanostores/react"
import { refreshMediaInfo } from "@renderer/features/media"
import { NowPlaying } from "@renderer/features/media/components/now-playing"
import { refreshVlcStatus, vlcErrorStore, vlcStatusStore } from "@renderer/features/vlc"
import { ConnectionStatus } from "./components/connection-status"

export function HomePage(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const vlcError = useStore(vlcErrorStore)

	return (
		<div className="max-w-3xl mx-auto">
			{vlcStatus === "error" && vlcError && (
				<div className="mb-6 bg-destructive/10 text-destructive p-4 rounded-md">
					<h3 className="font-semibold mb-1">Connection Error</h3>
					<p className="text-sm">{vlcError}</p>
				</div>
			)}

			<ConnectionStatus />

			<div>
				<div className="flex justify-between items-center mb-2">
					<h2 className="text-xl font-semibold">Now Playing</h2>
					{vlcStatus === "connected" && (
						<button
							type="button"
							onClick={async () => {
								await refreshVlcStatus()
								await refreshMediaInfo()
							}}
							className="px-3 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20"
						>
							Refresh
						</button>
					)}
				</div>
				<NowPlaying />
			</div>
		</div>
	)
}
