import { useStore } from "@nanostores/react"
import { StatusBadge } from "@renderer/components/status-badge"
import { checkDiscordStatus } from "@renderer/features/discord"
import { discordStatusStore } from "@renderer/features/discord"
import { checkVlcConnection, vlcStatusStore } from "@renderer/features/vlc"

interface ConnectionStatusProps {
	onRefresh?: () => void
}

export function ConnectionStatus({ onRefresh }: ConnectionStatusProps): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const discordStatus = useStore(discordStatusStore)

	const handleRefresh = async (): Promise<void> => {
		await checkVlcConnection()
		await checkDiscordStatus()
		onRefresh?.()
	}

	return (
		<div className="mb-6">
			<div className="flex justify-between items-center mb-2">
				<h2 className="text-xl font-semibold">Connection Status</h2>
				<button
					type="button"
					onClick={handleRefresh}
					className="px-3 py-1 cursor-pointer text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20"
				>
					Refresh
				</button>
			</div>
			<div className="bg-card text-card-foreground rounded-md border border-border p-4">
				<div className="flex flex-col sm:flex-row sm:gap-8">
					<StatusItem label="VLC" status={vlcStatus} />
					<StatusItem label="Discord" status={discordStatus} />
				</div>
			</div>
		</div>
	)
}

function StatusItem({ label, status }: { label: string; status: string }): JSX.Element {
	return (
		<div className="flex items-center py-1">
			<span className="font-medium w-16">{label}:</span>
			<StatusBadge status={status} />
		</div>
	)
}
