import {
	CheckCircledIcon,
	Cross1Icon,
	DownloadIcon,
	ExclamationTriangleIcon,
	ReloadIcon,
} from "@radix-ui/react-icons"
import { useUpdateListener } from "../hooks/use-update-listener"

export function UpdateNotification(): JSX.Element | null {
	const {
		status,
		updateInfo,
		progressInfo,
		error,
		visible,
		checkForUpdates,
		downloadUpdate,
		closeNotification,
	} = useUpdateListener()

	if (!visible) return null

	return (
		<div className="fixed bottom-4 right-4 z-50 w-96 bg-card rounded-lg border border-border shadow-lg overflow-hidden">
			<div className="flex items-center justify-between bg-card p-3 border-b border-border">
				<div className="flex items-center space-x-2">
					{status === "error" && <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />}
					{status === "update-available" && <ReloadIcon className="h-5 w-5 text-primary" />}
					{status === "download-progress" && <DownloadIcon className="h-5 w-5 text-primary" />}
					{status === "update-downloaded" && (
						<CheckCircledIcon className="h-5 w-5 text-green-500" />
					)}

					<h3 className="font-medium text-card-foreground">
						{status === "error" && "Update Error"}
						{status === "update-available" && "Update Available"}
						{status === "download-progress" && "Downloading Update"}
						{status === "update-downloaded" && "Update Ready"}
					</h3>
				</div>

				<button
					type="button"
					onClick={closeNotification}
					className="text-muted-foreground hover:text-foreground"
					aria-label="Close"
				>
					<Cross1Icon className="h-4 w-4" />
				</button>
			</div>

			<div className="p-4">
				{status === "error" && (
					<div>
						<p className="text-destructive mb-3">{error}</p>
						<button
							type="button"
							onClick={checkForUpdates}
							className="w-full bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
						>
							Try Again
						</button>
					</div>
				)}

				{status === "update-available" && updateInfo && (
					<div>
						<p className="mb-3 text-card-foreground">
							Version {updateInfo.version} is available to download.
						</p>
						{updateInfo.releaseDate && (
							<p className="text-xs text-muted-foreground mb-3">
								Released: {formatDate(updateInfo.releaseDate)}
							</p>
						)}
						<button
							type="button"
							onClick={downloadUpdate}
							className="w-full bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
						>
							Download Update
						</button>
					</div>
				)}

				{status === "download-progress" && progressInfo && (
					<div>
						<div className="mb-2">
							<div className="flex justify-between text-xs mb-1">
								<span>{Math.round(progressInfo.percent)}%</span>
								<span>
									{formatBytes(progressInfo.transferred)} / {formatBytes(progressInfo.total)}
								</span>
							</div>
							<div className="h-2 bg-muted rounded-full overflow-hidden">
								<div className="h-full bg-primary" style={{ width: `${progressInfo.percent}%` }} />
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Speed: {formatBytes(progressInfo.bytesPerSecond)}/s
						</p>
					</div>
				)}

				{status === "update-downloaded" && updateInfo && (
					<div>
						<p className="mb-3 text-card-foreground">
							Version {updateInfo.version} has been downloaded and is ready to install.
						</p>
						<div className="flex justify-end space-x-2">
							<button
								type="button"
								onClick={closeNotification}
								className="bg-muted text-muted-foreground py-1 px-3 rounded-md text-sm hover:bg-muted/90"
							>
								Later
							</button>
							<button
								type="button"
								onClick={() => window.api.app.close()}
								className="bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
							>
								Install & Restart
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	const sizes = ["B", "KB", "MB", "GB"]
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
}

function formatDate(dateString: string): string {
	const date = new Date(dateString)
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}
