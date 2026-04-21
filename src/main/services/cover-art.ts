import { promises as fs } from "node:fs"
import { metadataWriterService } from "@main/services/metadata-writer"
import { multiImageUploaderService } from "@main/services/multi-image-uploader"
import { VideoAnalyzerService } from "@main/services/video-analyzer"
import { vlcStatusService } from "@main/services/vlc-status"
import type { VlcStatus } from "@shared/types/vlc"
import * as cheerio from "cheerio"
import { logger } from "./logger"



/** Cached video cover entry */
interface CachedVideoCover {
	url: string | null
	timestamp: number
	ttl: number
}

/** Media data structure for cover art searching */
interface MediaData {
	title?: string
	artist?: string
	album?: string
	artworkUrl?: string
	date?: string
	year?: string
	[key: string]: string | undefined
}

/** Service to fetch album cover art for audio files */
export class CoverArtService {
	private static instance: CoverArtService | null = null

	/** In-memory cache for video covers to avoid repeated API calls on each poll cycle */
	private videoCoverCache: Map<string, CachedVideoCover> = new Map()
	private readonly videoCoverCacheTtl = 10 * 60 // 10 minutes in seconds
	private readonly videoCoverMissTtl = 30 // 30 seconds for transient failures

	private constructor() {
		logger.info("Cover art service initialized")
	}

	/** Get the singleton instance of the cover art service */
	public static getInstance(): CoverArtService {
		if (!CoverArtService.instance) {
			CoverArtService.instance = new CoverArtService()
		}
		return CoverArtService.instance
	}

	/** Fetch cover art URL using all available media information */
	public async fetch(mediaInfo: VlcStatus | null): Promise<string | null> {
		const media = this.extractMediaData(mediaInfo)
		if (!media) {
			return null
		}

		// Step 1: Check if media already has an uploaded image URL in its metadata
		const fileUri = await vlcStatusService.getCurrentFileUri()
		if (fileUri && media.artworkUrl) {
			const filePath = metadataWriterService.vlcUriToFilePath(fileUri)
			if (filePath) {
				const customMetadata = await metadataWriterService.readMetadataTags(filePath)
				if (customMetadata) {
					const parsed = multiImageUploaderService.parseMetadataTags(customMetadata)
					if (parsed.imageUrl && !parsed.isExpired) {
						logger.info(`Using existing uploaded cover image: ${parsed.imageUrl}`)
						return parsed.imageUrl
					}

					if (parsed.isExpired) {
						logger.info("Existing uploaded cover image has expired, will re-upload")
					}
				}
			}
		}

		// Step 2: Prioritize local artwork from the file
		if (media.artworkUrl?.startsWith("file://")) {
			try {
				// Upload the local artwork to 0x0.st for Discord compatibility
				const localPath = media.artworkUrl.replace("file://", "")
				const decodedPath = decodeURIComponent(localPath)

				// Handle Windows paths
				const fixedPath =
					process.platform === "win32" && decodedPath.startsWith("/")
						? decodedPath.substring(1)
						: decodedPath

				try {
					const imageBuffer = await fs.readFile(fixedPath)
					const filename = `cover_${Date.now()}.jpg`
					const uploadedUrl = await multiImageUploaderService.uploadImage(
						imageBuffer,
						filename,
						24 * 7,
					) // 7 days

					if (uploadedUrl && fileUri) {
						// Store the uploaded URL in metadata for future use
						const filePath = metadataWriterService.vlcUriToFilePath(fileUri)
						if (filePath) {
							const expiryDate = new Date()
							expiryDate.setDate(expiryDate.getDate() + 7) // 7 days from now

							const tags = multiImageUploaderService.generateMetadataTags(uploadedUrl, expiryDate)
							await metadataWriterService.writeMetadataTags(filePath, tags)

							logger.info(`Uploaded local artwork and saved metadata: ${uploadedUrl}`)
						}
						return uploadedUrl
					}
				} catch (error) {
					logger.warn(`Could not upload local artwork: ${error}`)
				}
			} catch (error) {
				logger.warn(`Error processing local artwork: ${error}`)
			}
		}

		// No cover art available - no more online search
		logger.info("No local artwork available and online search disabled")
		return null
	}

	/**
	 * Fetch cover art for video content
	 * Uses Jikan API (MyAnimeList) as primary source, Google Images as fallback
	 */
	public async fetchVideoImageFromGoogle(mediaInfo: VlcStatus | null): Promise<string | null> {
		if (!mediaInfo || mediaInfo.mediaType !== "video") {
			return null
		}

		try {
			const videoAnalyzer = VideoAnalyzerService.getInstance()
			const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)
			const title = videoAnalysis.title

			if (!title || title === "Unknown") {
				logger.warn("No valid title for video cover art search")
				return null
			}

			// Check in-memory cache first
			const cacheKey = title.toLowerCase().trim()
			const cached = this.videoCoverCache.get(cacheKey)
			if (cached) {
				const age = Math.floor(Date.now() / 1000) - cached.timestamp
				if (age < cached.ttl) {
					logger.info(`Using cached video cover for "${title}" (age: ${age}s)`)
					return cached.url
				}
				// Cache expired, remove it
				this.videoCoverCache.delete(cacheKey)
			}

			// We always try AniList first because it provides the best anime/show covers.
			// If it's a Hollywood movie, AniList will safely return no results and we'll fall back to Google.
			const anilistCover = await this.fetchVideoCoverFromAnilist(title)
			if (anilistCover) {
				this.cacheVideoCover(cacheKey, anilistCover)
				return anilistCover
			}

			// Step 2: Fallback to Google Images scraping
			let searchTerm = ""
			if (videoAnalysis.isTvShow) {
				searchTerm = `${title} tv show poster`
			} else if (videoAnalysis.isMovie) {
				searchTerm = videoAnalysis.year
					? `${title} ${videoAnalysis.year} movie poster`
					: `${title} movie poster`
			} else {
				searchTerm = `${title} cover`
			}

			logger.info(`Jikan returned no results, falling back to Google for: ${searchTerm}`)
			const googleResult = await this.fetchImageFromGoogle(searchTerm)
			this.cacheVideoCover(cacheKey, googleResult)
			return googleResult
		} catch (error) {
			logger.error(`Error fetching video cover art: ${error}`)
			return null
		}
	}

	/**
	 * Fetch cover art from AniList API (GraphQL)
	 * Better search relevancy for aliases than Jikan and images load properly in Discord.
	 * Rate limit: 90 req / minute
	 * @param title - The anime/show title to search for
	 * @returns Image URL from AniList CDN or null
	 */
	private async fetchVideoCoverFromAnilist(title: string): Promise<string | null> {
		try {
			logger.info(`Searching AniList API for: "${title}"`)

			const query = `
			query ($search: String) {
			  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
				id
				title { romaji english native }
				coverImage { extraLarge large }
			  }
			}`

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000)

			const response = await fetch("https://graphql.anilist.co", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					query,
					variables: { search: title },
				}),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (!response.ok) {
				if (response.status === 429) {
					logger.warn("AniList API rate limited, will retry on next cycle")
				} else {
					logger.warn(`AniList API returned status: ${response.status}`)
				}
				return null
			}

			const data = await response.json()
			const media = data?.data?.Media

			if (!media || !media.coverImage) {
				logger.info(`No AniList results found for: "${title}"`)
				return null
			}

			const imageUrl = media.coverImage.extraLarge || media.coverImage.large
			if (imageUrl) {
				logger.info(
					`Found AniList cover for "${title}": ${media.title.romaji || media.title.english} (AniList ID: ${media.id})`,
				)
				return imageUrl
			}

			return null
		} catch (error: unknown) {
			const err = error as Error
			if (err.name === "AbortError") {
				logger.warn("AniList request timed out")
			} else {
				logger.error(`Error fetching video cover from AniList: ${error}`)
			}
			return null
		}
	}

	/**
	 * Cache a video cover result in memory
	 */
	private cacheVideoCover(key: string, url: string | null): void {
		this.videoCoverCache.set(key, {
			url,
			timestamp: Math.floor(Date.now() / 1000),
			ttl: url ? this.videoCoverCacheTtl : this.videoCoverMissTtl,
		})

		// Limit cache size to prevent memory leaks
		if (this.videoCoverCache.size > 50) {
			const oldestKey = this.videoCoverCache.keys().next().value
			if (oldestKey) {
				this.videoCoverCache.delete(oldestKey)
			}
		}
	}

	/**
	 * Fetch image from Google Images based on search term (fallback)
	 */
	private async fetchImageFromGoogle(searchTerm: string): Promise<string | null> {
		try {
			logger.info(`Searching Google Images for: ${searchTerm}`)
			const encodedQuery = encodeURIComponent(searchTerm)
			const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch`

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000)

			const response = await fetch(searchUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
					Accept: "text/html,application/xhtml+xml",
				},
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (!response.ok) {
				logger.warn(`Google search failed with status: ${response.status}`)
				return null
			}

			const html = await response.text()
			const $ = cheerio.load(html)

			let imageUrl: string | null = null

			// First, try to find gstatic images (Google's cached images)
			$("img").each((_, img) => {
				const src = $(img).attr("src")
				if (src?.startsWith("http") && !src.endsWith(".gif")) {
					if (src.includes("gstatic.com")) {
						imageUrl = src
						return false // Break the loop
					}
				}
				return true
			})

			if (imageUrl) {
				logger.info(`Found gstatic image: ${imageUrl}`)
				return imageUrl
			}

			// If no gstatic image found, try to extract from JavaScript
			const imgRegex = /https?:\/\/\S+?\.(?:jpg|jpeg|png)/g
			$("script").each((_, script) => {
				const content = $(script).html()
				if (content?.includes("AF_initDataCallback")) {
					const matches = content.match(imgRegex)
					if (matches) {
						for (const url of matches) {
							// Skip common non-content images
							if (!/icon|emoji|favicon|logo|button/i.test(url)) {
								imageUrl = url
								logger.info(`Found image from script: ${imageUrl}`)
								return false // Break the loop
							}
						}
					}
				}
				return true
			})

			if (imageUrl) {
				return imageUrl
			}

			logger.warn(`No suitable image found for: ${searchTerm}`)
			return null
		} catch (error: unknown) {
			const err = error as Error
			if (err.name === "AbortError") {
				logger.warn("Google Images request timed out")
			} else {
				logger.error(`Error fetching image from Google: ${error}`)
			}
			return null
		}
	}

	/** Extract media data from the input */
	private extractMediaData(mediaInfo: VlcStatus | null): MediaData | null {
		if (!mediaInfo || typeof mediaInfo !== "object") {
			logger.info("No valid media info provided for cover art")
			return null
		}

		return mediaInfo.media as MediaData
	}
}

export const coverArtService = CoverArtService.getInstance()
