import { promises as fs } from "node:fs"
import { fileURLToPath } from "node:url"
import { logger } from "@main/core/logger"

/**
 * Images reach the renderer as data URLs: the window's Content Security Policy
 * allows `data:` and `blob:` for images and nothing remote.
 */
export class ImageProxy {
	private cache = new Map<string, { dataUrl: string; timestamp: number; bytes: number }>()
	private cacheBytes = 0
	private readonly maxCacheEntries = 50
	private readonly maxCacheBytes = 32 * 1024 * 1024
	private readonly cacheTtl = 3600 // seconds

	constructor() {
		logger.info("Image proxy service initialized")
	}

	public async getImageAsDataUrl(source: string | null | undefined): Promise<string | null> {
		if (!source) {
			return null
		}

		const cached = this.cache.get(source)
		if (cached && Date.now() / 1000 - cached.timestamp < this.cacheTtl) {
			this.cache.delete(source)
			this.cache.set(source, cached)
			logger.info(`Using cached image data for: ${this.sanitizeUrl(source)}`)
			return cached.dataUrl
		}
		if (cached) this.removeCached(source)

		try {
			let buffer: Buffer
			let contentType: string

			if (source.startsWith("file://")) {
				const filePath = fileURLToPath(source)
				logger.info(`Loading local file: ${this.sanitizeUrl(filePath)}`)
				buffer = await fs.readFile(filePath)
				contentType = this.getContentTypeFromFileName(filePath)
			} else if (source.startsWith("http://") || source.startsWith("https://")) {
				logger.info(`Fetching remote image: ${this.sanitizeUrl(source)}`)
				const response = await fetch(source, {
					headers: {
						"User-Agent": "VLC-Discord-RP/5.0 (https://github.com/Saicooh/vlc-rpc)",
					},
				})

				if (!response.ok) {
					throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
				}

				buffer = Buffer.from(await response.arrayBuffer())
				contentType =
					response.headers.get("content-type") || this.getContentTypeFromFileName(source)
			} else {
				logger.warn(`Unsupported image source format: ${this.sanitizeUrl(source)}`)
				return null
			}

			const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`

			this.cacheImage(source, dataUrl)

			return dataUrl
		} catch (error) {
			logger.error(
				`Error converting image to data URL: ${error}, Source: ${this.sanitizeUrl(source)}`,
			)
			return null
		}
	}

	private cacheImage(source: string, dataUrl: string): void {
		const bytes = Buffer.byteLength(dataUrl)
		if (bytes > this.maxCacheBytes) return
		const now = Math.floor(Date.now() / 1000)
		for (const [key, entry] of this.cache) {
			if (now - entry.timestamp >= this.cacheTtl) this.removeCached(key)
		}
		this.removeCached(source)
		this.cache.set(source, { dataUrl, timestamp: now, bytes })
		this.cacheBytes += bytes
		while (this.cache.size > this.maxCacheEntries || this.cacheBytes > this.maxCacheBytes) {
			const oldest = this.cache.keys().next().value
			if (oldest === undefined) break
			this.removeCached(oldest)
		}
	}

	private removeCached(source: string): void {
		const entry = this.cache.get(source)
		if (!entry) return
		this.cacheBytes -= entry.bytes
		this.cache.delete(source)
	}

	private getContentTypeFromFileName(fileName: string): string {
		const extension = fileName.toLowerCase().split(".").pop() || ""

		switch (extension) {
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

	/** A local path is logged as its last two segments: the rest is the user's disk. */
	private sanitizeUrl(url: string): string {
		if (url.startsWith("file://") || (!url.startsWith("http://") && !url.startsWith("https://"))) {
			const parts = url.split(/[/\\]/)
			return `.../${parts.slice(-2).join("/")}`
		}

		return url
	}
}
