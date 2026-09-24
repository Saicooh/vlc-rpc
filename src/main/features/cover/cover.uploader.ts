import { logger } from "@main/core/logger"
import type { FileMetadata } from "@shared/config/app-config"

const UPLOAD_TIMEOUT_MS = 15_000
const FAILURE_COOLDOWN_MS = 30_000
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000

class UploadHttpError extends Error {
	constructor(readonly status: number) {
		super(`HTTP ${status}`)
	}
}

function requireOk(response: Response): void {
	if (!response.ok) throw new UploadHttpError(response.status)
}

interface UploadRequest {
	image: Blob
	filename: string
	expiryHours: number
	signal: AbortSignal
}

interface ImageUploadService {
	name: string
	upload: (request: UploadRequest) => Promise<string | null>
	maxFileSize: number
	supportsExpiry: boolean
}

/** The attempt that produced a url first, and the controller that must survive. */
interface RaceWinner {
	serviceName: string
	url: string
	controller: AbortController
}

function isUsableUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value.trim())
		return protocol === "http:" || protocol === "https:"
	} catch {
		return false
	}
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : "unknown"
}

/** tempfile.org honours 1, 6, 24 or 48 hours only, so ask for the longest that fits. */
function tempFileExpiry(expiryHours: number): number {
	return [1, 6, 24, 48].filter((hours) => hours <= expiryHours).at(-1) ?? 1
}

export class Uploader {
	private readonly appVersion: string
	private readonly appName = "VLC-Discord-RPC"
	private readonly userAgent: string
	private readonly cooldownUntil = new Map<string, number>()

	private readonly services: ImageUploadService[] = [
		{
			name: "x0.at",
			upload: this.uploadToX0At.bind(this),
			maxFileSize: 512 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "catbox.moe",
			upload: this.uploadToCatbox.bind(this),
			maxFileSize: 200 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "uguu.se",
			upload: this.uploadToUguu.bind(this),
			maxFileSize: 128 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "0x0.st",
			upload: this.uploadTo0x0st.bind(this),
			maxFileSize: 512 * 1024 * 1024,
			supportsExpiry: true,
		},
		// tmpfiles.org was removed, not left to lose honestly like 0x0.st sometimes
		// does. Its upload answers with a url that looks fine but no longer serves
		// the file, the /dl/ path redirects to an html page instead of the image,
		// so it would win the race and hand Discord a link that renders nothing.
		{
			name: "tempfile.org",
			upload: this.uploadToTempFile.bind(this),
			maxFileSize: 100 * 1024 * 1024,
			supportsExpiry: true,
		},
	]

	constructor(appVersion = "5.0.1") {
		this.appVersion = appVersion
		this.userAgent = `${this.appName}/${this.appVersion}`
		logger.info("Multi-service image uploader initialized")
	}

	public async uploadImage(
		imageBuffer: Buffer,
		filename: string,
		expiryHours = 24,
	): Promise<string | null> {
		const fileSize = imageBuffer.length

		for (const service of this.services) {
			if (fileSize > service.maxFileSize) {
				logger.warn(
					`Skipping ${service.name}: file too large (${fileSize} > ${service.maxFileSize})`,
				)
			}
		}

		const entrants = this.services.filter(
			(service) =>
				fileSize <= service.maxFileSize &&
				(this.cooldownUntil.get(service.name) ?? 0) <= Date.now(),
		)
		if (entrants.length === 0) return null
		logger.info(`Racing ${entrants.length} upload services: ${filename} (${fileSize} bytes)`)
		const image = new Blob([Uint8Array.from(imageBuffer)], { type: this.getMimeType(filename) })

		const attempts = entrants.map((service) => {
			const controller = new AbortController()
			return {
				controller,
				result: this.attempt(service, controller, { image, filename, expiryHours }),
			}
		})

		let winner: RaceWinner
		try {
			winner = await Promise.any(attempts.map((attempt) => attempt.result))
		} catch {
			logger.error("All upload services failed")
			return null
		}

		// Every entrant is uploading the same bytes, so the moment one of them has a
		// url the rest are spending the user's bandwidth on an answer nobody reads.
		for (const attempt of attempts) {
			if (attempt.controller !== winner.controller) {
				attempt.controller.abort()
			}
		}

		logger.info(`Upload won by ${winner.serviceName}: ${winner.url}`)
		return winner.url
	}

	private async attempt(
		service: ImageUploadService,
		controller: AbortController,
		request: Omit<UploadRequest, "signal">,
	): Promise<RaceWinner> {
		let timedOut = false
		const timeout = setTimeout(() => {
			if (controller.signal.aborted) return
			timedOut = true
			controller.abort()
		}, UPLOAD_TIMEOUT_MS)
		try {
			const url = await service.upload({ ...request, signal: controller.signal })

			if (url && isUsableUrl(url)) {
				return { serviceName: service.name, url, controller }
			}

			logger.warn(`Upload to ${service.name} answered without a usable url`)
			this.cooldownUntil.set(service.name, Date.now() + FAILURE_COOLDOWN_MS)
		} catch (error) {
			// Losing the race is how all but one upload ends, and the abort that ends
			// them is the expected outcome, not a failure worth a line in the log.
			if (!controller.signal.aborted || timedOut) {
				logger.warn(`Upload to ${service.name} failed: ${errorName(error)}`)
				this.cooldownUntil.set(
					service.name,
					Date.now() +
						(error instanceof UploadHttpError && error.status === 429
							? RATE_LIMIT_COOLDOWN_MS
							: FAILURE_COOLDOWN_MS),
				)
			}
		} finally {
			clearTimeout(timeout)
		}

		// Promise.any settles on the first fulfilled promise, so an attempt without a
		// url has to reject for the race to move on to the services still in flight.
		throw new Error(`${service.name} produced no url`)
	}

	private async uploadToX0At({ image, filename, signal }: UploadRequest): Promise<string | null> {
		const formData = new FormData()
		formData.append("file", image, filename)

		const response = await fetch("https://x0.at/", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		requireOk(response)

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToCatbox({ image, filename, signal }: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("reqtype", "fileupload")
		formData.append("fileToUpload", image, filename)

		const response = await fetch("https://catbox.moe/user/api.php", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		requireOk(response)

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToUguu({ image, filename, signal }: UploadRequest): Promise<string | null> {
		const formData = new FormData()
		formData.append("files[]", image, filename)

		const response = await fetch("https://uguu.se/upload", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		requireOk(response)

		const result = await response.json()

		if (result.success && result.files && result.files.length > 0) {
			return result.files[0].url
		}

		return null
	}

	private async uploadTo0x0st({
		image,
		filename,
		expiryHours,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("file", image, filename)
		formData.append("expires", expiryHours.toString())
		formData.append("secret", "")

		const response = await fetch("https://0x0.st", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		requireOk(response)

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToTempFile({
		image,
		filename,
		expiryHours,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("files", image, filename)
		formData.append("expiryHours", tempFileExpiry(expiryHours).toString())

		const response = await fetch("https://tempfile.org/api/upload/local", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		requireOk(response)

		const result = await response.json()
		const url = result.success && result.files?.[0]?.url

		if (typeof url !== "string") {
			return null
		}

		// The url tempfile.org reports is an html landing page. Discord needs the
		// bytes, which it serves one path segment deeper.
		return `${url.replace(/\/+$/, "")}/download`
	}

	private getMimeType(filename: string): string {
		const ext = filename.toLowerCase().split(".").pop()

		switch (ext) {
			case "jpg":
			case "jpeg":
				return "image/jpeg"
			case "png":
				return "image/png"
			case "gif":
				return "image/gif"
			case "webp":
				return "image/webp"
			case "bmp":
				return "image/bmp"
			default:
				return "image/jpeg"
		}
	}

	public generateMetadataTags(imageUrl: string, expiryDate?: Date): Partial<FileMetadata> {
		const tags: Partial<FileMetadata> = {
			"X-COVER-URL": imageUrl,
			"X-APP-VERSION": this.appVersion,
			"X-PROCESSED-BY": this.appName,
		}

		if (expiryDate) {
			tags["X-EXPIRY-DATE"] = expiryDate.toISOString()
		}

		return tags
	}

	public parseMetadataTags(metadata: Partial<FileMetadata>): {
		imageUrl: string | null
		isExpired: boolean
		appVersion: string | null
		processedBy: string | null
	} {
		const imageUrl = metadata["X-COVER-URL"] || null
		const appVersion = metadata["X-APP-VERSION"] || null
		const processedBy = metadata["X-PROCESSED-BY"] || null
		const expiryDateStr = metadata["X-EXPIRY-DATE"]

		let isExpired = false
		if (expiryDateStr) {
			try {
				const expiryDate = new Date(expiryDateStr)
				isExpired = expiryDate.getTime() < Date.now()
			} catch (error) {
				logger.warn(`Invalid expiry date format: ${expiryDateStr}`)
			}
		}

		return {
			imageUrl,
			isExpired,
			appVersion,
			processedBy,
		}
	}
}
