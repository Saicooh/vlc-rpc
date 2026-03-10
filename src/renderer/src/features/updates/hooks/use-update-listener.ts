import { logger } from "@renderer/lib/utils"
import { useEffect, useState } from "react"

interface UpdateInfo {
	version: string
	files: Array<{ url: string; size: number }>
	releaseDate: string
	releaseName?: string
}

interface ProgressInfo {
	percent: number
	bytesPerSecond: number
	total: number
	transferred: number
}

interface UpdateStatus {
	isPortable: boolean
	updateCheckInProgress: boolean
	retryCount: number
	currentVersion: string
}

export interface UpdateState {
	status: string | null
	updateInfo: UpdateInfo | null
	progressInfo: ProgressInfo | null
	error: string | null
	visible: boolean
	updateStatus: UpdateStatus | null
	installationType: "portable" | "setup" | null
	checkForUpdates: () => void
	downloadUpdate: () => void
	closeNotification: () => void
}

export function useUpdateListener(): UpdateState {
	const [status, setStatus] = useState<string | null>(null)
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [visible, setVisible] = useState(false)
	const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
	const [installationType, setInstallationType] = useState<"portable" | "setup" | null>(null)

	useEffect(() => {
		Promise.all([window.api.update.getInstallationType(), window.api.update.getStatus()])
			.then(([type, status]) => {
				setInstallationType(type)
				setUpdateStatus(status)
			})
			.catch((err) => {
				logger.error(`Error getting update info: ${err}`)
			})

		const cleanup = window.api.update.onUpdateStatus((event, data) => {
			logger.info(`Update event: ${event} - ${JSON.stringify(data)}`)

			setStatus(event)

			if (event === "update-available") {
				setUpdateInfo(data as UpdateInfo)
				setVisible(true)
			} else if (event === "download-progress") {
				setProgressInfo(data as ProgressInfo)
				setVisible(true)
			} else if (event === "update-downloaded") {
				setUpdateInfo(data as UpdateInfo)
				setProgressInfo(null)
				setVisible(true)
			} else if (event === "error") {
				setError((data as { message?: string })?.message || "Unknown error")
				setVisible(true)
			} else if (event === "checking-for-update") {
				window.api.update
					.getStatus()
					.then(setUpdateStatus)
					.catch((err) => {
						logger.error(`Error getting status: ${err}`)
					})
			} else if (event === "update-not-available") {
				setVisible(false)
			}
		})

		return cleanup
	}, [])

	const checkForUpdates = (): void => {
		window.api.update.check(false).catch((err) => {
			logger.error(`Error checking for updates: ${err}`)
		})
	}

	const downloadUpdate = (): void => {
		window.api.update.download().catch((err) => {
			logger.error(`Error downloading update: ${err}`)
		})
	}

	const closeNotification = (): void => {
		setVisible(false)
	}

	return {
		status,
		updateInfo,
		progressInfo,
		error,
		visible,
		updateStatus,
		installationType,
		checkForUpdates,
		downloadUpdate,
		closeNotification,
	}
}
