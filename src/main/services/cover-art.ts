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
	sourceUrl: string | null
	sourceName: string | null
	canonicalTitle: string | null
	timestamp: number
	ttl: number
}

interface AnilistTitle {
	romaji: string | null
	english: string | null
	native: string | null
}

interface AnilistCoverImage {
	extraLarge: string | null
	large: string | null
}

interface AnilistMedia {
	id: number
	title: AnilistTitle | null
	synonyms: string[] | null
	coverImage: AnilistCoverImage | null
	siteUrl: string | null
}

interface AnilistSearchResponse {
	data?: {
		Page?: {
			media?: AnilistMedia[] | null
		} | null
	} | null
}

interface AnilistSearchCandidate {
	value: string
	isSubtitleFallback: boolean
	seriesContext?: string
}

interface AnilistAcceptedMatch {
	media: AnilistMedia
	score: number
	candidate: AnilistSearchCandidate
	canonicalTitle: string
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

/** Result from video cover art search, includes both image and source page URL */
export interface VideoCoverResult {
	imageUrl: string | null
	sourceUrl: string | null
	sourceName: string | null
	canonicalTitle: string | null
}

const ANILIST_FORMAT_DESCRIPTORS = new Set(["movie", "film", "ova", "ona", "special", "specials"])

const ANILIST_GENERIC_SUBTITLE_TOKENS = new Set([
	"a",
	"an",
	"the",
	"final",
	"season",
	"part",
	"chapter",
	"episode",
	"movie",
	"film",
	"special",
	"specials",
])

const ANILIST_DESCRIPTOR_PATTERN = /\b(?:the\s+movie|movie|film|ova|ona|specials?|pel[ií]cula)\b/gi

const ANILIST_RELEASE_NOISE_PATTERN =
	/\b(?:\d{3,4}p|4k|uhd|web(?:-dl|rip)?|bdrip|bluray|blu-ray|hevc|x26[45]|aac|flac|dual|dub(?:bed)?|sub(?:bed)?|multi|remux|hdr|sdr)\b/gi

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
	 * Uses AniList API as primary source, Google Images as fallback
	 * Returns both the cover image URL and source page URL for Discord buttons
	 */
	public async fetchVideoCover(mediaInfo: VlcStatus | null): Promise<VideoCoverResult> {
		const emptyResult: VideoCoverResult = {
			imageUrl: null,
			sourceUrl: null,
			sourceName: null,
			canonicalTitle: null,
		}

		if (!mediaInfo || mediaInfo.mediaType !== "video") {
			return emptyResult
		}

		try {
			const videoAnalyzer = VideoAnalyzerService.getInstance()
			const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)
			const title = videoAnalysis.title

			if (!title || title === "Unknown") {
				logger.warn("No valid title for video cover art search")
				return emptyResult
			}

			// Check in-memory cache first
			const cacheKey = title.toLowerCase().trim()
			const cached = this.videoCoverCache.get(cacheKey)
			if (cached) {
				const age = Math.floor(Date.now() / 1000) - cached.timestamp
				if (age < cached.ttl) {
					logger.info(`Using cached video cover for "${title}" (age: ${age}s)`)
					return {
						imageUrl: cached.url,
						sourceUrl: cached.sourceUrl,
						sourceName: cached.sourceName,
						canonicalTitle: cached.canonicalTitle,
					}
				}
				// Cache expired, remove it
				this.videoCoverCache.delete(cacheKey)
			}

			// We always try AniList first because it provides the best anime/show covers.
			// If it's a Hollywood movie, AniList will safely return no results and we'll fall back to Google.
			const anilistResult = await this.fetchVideoCoverFromAnilist(title)
			if (anilistResult.imageUrl) {
				this.cacheVideoCover(
					cacheKey,
					anilistResult.imageUrl,
					anilistResult.sourceUrl,
					anilistResult.sourceName,
					anilistResult.canonicalTitle,
				)
				return anilistResult
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

			logger.info(`AniList returned no results, falling back to Google for: ${searchTerm}`)
			const googleImageUrl = await this.fetchImageFromGoogle(searchTerm)

			// Generate IMDB search URL as the source link for non-anime content
			const imdbSearchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`
			const sourceUrl = googleImageUrl ? imdbSearchUrl : null
			const sourceName = googleImageUrl ? "IMDB" : null

			this.cacheVideoCover(cacheKey, googleImageUrl, sourceUrl, sourceName, null)
			return { imageUrl: googleImageUrl, sourceUrl, sourceName, canonicalTitle: null }
		} catch (error) {
			logger.error(`Error fetching video cover art: ${error}`)
			return emptyResult
		}
	}

	/**
	 * Legacy method for backward compatibility
	 * @deprecated Use fetchVideoCover() instead
	 */
	public async fetchVideoImageFromGoogle(mediaInfo: VlcStatus | null): Promise<string | null> {
		const result = await this.fetchVideoCover(mediaInfo)
		return result.imageUrl
	}

	/**
	 * Fetch cover art from AniList API (GraphQL)
	 * Better search relevancy for aliases than Jikan and images load properly in Discord.
	 * Rate limit: 90 req / minute
	 * @param title - The anime/show title to search for
	 * @returns Image URL from AniList CDN or null
	 */
	private async fetchVideoCoverFromAnilist(title: string): Promise<{
		imageUrl: string | null
		sourceUrl: string | null
		sourceName: string | null
		canonicalTitle: string | null
	}> {
		const emptyResult = { imageUrl: null, sourceUrl: null, sourceName: null, canonicalTitle: null }
		try {
			const candidates = this.buildAnilistSearchCandidates(title)
			logger.info(
				`Searching AniList API for "${title}" with candidates: ${candidates.map((candidate) => `"${candidate.value}"`).join(", ")}`,
			)

			const query = `
			query ($search: String) {
			  Page(page: 1, perPage: 5) {
				media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
				  id
				  title { romaji english native }
				  synonyms
				  coverImage { extraLarge large }
				  siteUrl
				}
			  }
			}`

			let bestMatch: AnilistAcceptedMatch | null = null

			for (const candidate of candidates) {
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), 5000)

				try {
					const response = await fetch("https://graphql.anilist.co", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Accept: "application/json",
						},
						body: JSON.stringify({
							query,
							variables: { search: candidate.value },
						}),
						signal: controller.signal,
					})

					if (!response.ok) {
						if (response.status === 429) {
							logger.warn("AniList API rate limited, will retry on next cycle")
						} else {
							logger.warn(`AniList API returned status: ${response.status}`)
						}
						return emptyResult
					}

					const data = (await response.json()) as AnilistSearchResponse
					const mediaResults = data.data?.Page?.media ?? []
					const acceptedMatch = this.findBestAnilistMatch(title, candidate, mediaResults)

					if (acceptedMatch && (!bestMatch || acceptedMatch.score > bestMatch.score)) {
						bestMatch = acceptedMatch
					}

					if (bestMatch && bestMatch.score >= 0.96) {
						break
					}
				} finally {
					clearTimeout(timeoutId)
				}
			}

			const coverImage = bestMatch?.media.coverImage
			if (!bestMatch || !coverImage) {
				logger.info(`No accepted AniList results found for: "${title}"`)
				return emptyResult
			}

			const media = bestMatch.media
			const imageUrl = coverImage.extraLarge || coverImage.large
			if (imageUrl) {
				const sourceUrl = media.siteUrl || `https://anilist.co/anime/${media.id}`
				logger.info(
					`Accepted AniList match for "${title}" via "${bestMatch.candidate.value}": ${bestMatch.canonicalTitle} (score: ${bestMatch.score.toFixed(2)}, AniList ID: ${media.id})`,
				)
				return {
					imageUrl,
					sourceUrl,
					sourceName: "AniList",
					canonicalTitle: bestMatch.canonicalTitle,
				}
			}

			return emptyResult
		} catch (error: unknown) {
			const err = error as Error
			if (err.name === "AbortError") {
				logger.warn("AniList request timed out")
			} else {
				logger.error(`Error fetching video cover from AniList: ${error}`)
			}
			return emptyResult
		}
	}

	private buildAnilistSearchCandidates(title: string): AnilistSearchCandidate[] {
		const cleanedTitle = this.cleanAnilistSearchText(title)
		const descriptorSplit = this.splitOnFormatDescriptor(cleanedTitle)
		const seriesContext = descriptorSplit?.series
		const candidates: AnilistSearchCandidate[] = []
		const addCandidate = (
			value: string,
			isSubtitleFallback = false,
			seriesContext?: string,
		): void => {
			const cleanedValue = this.cleanAnilistSearchText(value)
			if (!cleanedValue) return

			const normalizedValue = this.normalizeAnilistText(cleanedValue).compact
			if (
				candidates.some(
					(candidate) => this.normalizeAnilistText(candidate.value).compact === normalizedValue,
				)
			) {
				return
			}

			candidates.push({ value: cleanedValue, isSubtitleFallback, seriesContext })
		}

		addCandidate(title, false, seriesContext)
		addCandidate(cleanedTitle, false, seriesContext)

		const withoutDescriptors = this.removeAnilistDescriptors(cleanedTitle)
		addCandidate(withoutDescriptors, false, seriesContext)

		if (descriptorSplit) {
			const { series, subtitle } = descriptorSplit
			addCandidate(`${series}: ${subtitle}`, false, series)
			addCandidate(`${series} ${subtitle}`, false, series)
			addCandidate(subtitle, true, series)
		}

		return candidates.slice(0, 8)
	}

	private cleanAnilistSearchText(value: string): string {
		return value
			.replace(/\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i, "")
			.replace(/\[[^\]]*\]/g, " ")
			.replace(/\((?!\d{4}\))[^)]*\)/g, " ")
			.replace(ANILIST_RELEASE_NOISE_PATTERN, " ")
			.replace(/[._]+/g, " ")
			.replace(/[\s\-–—]+$/g, "")
			.replace(/^[\s\-–—]+/g, "")
			.replace(/\s{2,}/g, " ")
			.trim()
	}

	private removeAnilistDescriptors(value: string): string {
		return value
			.replace(ANILIST_DESCRIPTOR_PATTERN, " ")
			.replace(/\s{2,}/g, " ")
			.replace(/\s+([:;,.!?])/g, "$1")
			.trim()
	}

	private splitOnFormatDescriptor(value: string): { series: string; subtitle: string } | null {
		const tokens = value.split(/\s+/).filter(Boolean)
		const descriptorIndex = tokens.findIndex((token) =>
			ANILIST_FORMAT_DESCRIPTORS.has(this.normalizeToken(token)),
		)

		if (descriptorIndex <= 0 || descriptorIndex >= tokens.length - 1) {
			return null
		}

		const series = tokens.slice(0, descriptorIndex).join(" ").trim()
		const subtitle = tokens
			.slice(descriptorIndex + 1)
			.join(" ")
			.trim()

		if (!series || !subtitle) {
			return null
		}

		return { series, subtitle }
	}

	private findBestAnilistMatch(
		originalTitle: string,
		candidate: AnilistSearchCandidate,
		mediaResults: AnilistMedia[],
	): AnilistAcceptedMatch | null {
		let bestMatch: AnilistAcceptedMatch | null = null

		for (const media of mediaResults) {
			const canonicalTitle = this.getCanonicalAnilistTitle(media)
			if (!canonicalTitle) continue

			const titles = this.getAnilistComparableTitles(media)
			const candidateScore = Math.max(
				...titles.map((mediaTitle) => this.scoreAnilistTitle(candidate.value, mediaTitle)),
			)
			const originalScore = Math.max(
				...titles.map((mediaTitle) => this.scoreAnilistTitle(originalTitle, mediaTitle)),
			)
			const seriesContextScore = candidate.seriesContext
				? Math.max(
						...titles.map((mediaTitle) =>
							this.scoreAnilistTitle(candidate.seriesContext ?? "", mediaTitle),
						),
					)
				: 0
			const score = Math.max(candidateScore, originalScore)

			if (
				!this.isAnilistMatchAccepted(
					candidate,
					candidateScore,
					originalScore,
					seriesContextScore,
					score,
				)
			) {
				continue
			}

			if (!bestMatch || score > bestMatch.score) {
				bestMatch = { media, score, candidate, canonicalTitle }
			}
		}

		return bestMatch
	}

	private getCanonicalAnilistTitle(media: AnilistMedia): string | null {
		return media.title?.english || media.title?.romaji || null
	}

	private getAnilistComparableTitles(media: AnilistMedia): string[] {
		const titles = [
			media.title?.romaji,
			media.title?.english,
			media.title?.native,
			...(media.synonyms ?? []),
		]

		return titles.filter((title): title is string => Boolean(title?.trim()))
	}

	private isAnilistMatchAccepted(
		candidate: AnilistSearchCandidate,
		candidateScore: number,
		originalScore: number,
		seriesContextScore: number,
		score: number,
	): boolean {
		if (candidate.isSubtitleFallback) {
			return (
				this.hasSpecificSubtitleFallback(candidate.value) &&
				candidateScore >= 0.8 &&
				originalScore >= 0.9 &&
				seriesContextScore >= 0.72
			)
		}

		if (candidate.seriesContext) {
			return score >= 0.78 && seriesContextScore >= 0.72
		}

		return score >= 0.78
	}

	private hasSpecificSubtitleFallback(value: string): boolean {
		const normalized = this.normalizeAnilistText(value)
		const meaningfulTokens = normalized.tokens.filter(
			(token) => !ANILIST_GENERIC_SUBTITLE_TOKENS.has(token),
		)

		return normalized.compact.length >= 12 && meaningfulTokens.length >= 2
	}

	private scoreAnilistTitle(inputTitle: string, mediaTitle: string): number {
		const input = this.normalizeAnilistText(this.removeAnilistDescriptors(inputTitle))
		const media = this.normalizeAnilistText(this.removeAnilistDescriptors(mediaTitle))

		if (!input.compact || !media.compact) {
			return 0
		}

		if (input.compact === media.compact) {
			return 1
		}

		const compactContainment = this.getContainmentScore(input.compact, media.compact)
		const tokenCoverage = this.getTokenCoverageScore(input.tokens, media.tokens)
		const diceScore = this.getDiceCoefficient(input.compact, media.compact)

		return Math.max(compactContainment, tokenCoverage, diceScore)
	}

	private normalizeAnilistText(value: string): { compact: string; tokens: string[] } {
		const normalized = value
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.replace(/&/g, " and ")
			.replace(/[^\p{L}\p{N}\s]/gu, " ")
			.toLowerCase()
			.replace(/\s{2,}/g, " ")
			.trim()

		const tokens = normalized
			.split(/\s+/)
			.map((token) => this.normalizeToken(token))
			.filter((token) => token && !ANILIST_FORMAT_DESCRIPTORS.has(token))

		return {
			compact: tokens.join(""),
			tokens,
		}
	}

	private normalizeToken(value: string): string {
		return value
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.replace(/[^\p{L}\p{N}]/gu, "")
			.toLowerCase()
	}

	private getContainmentScore(left: string, right: string): number {
		const shorter = left.length <= right.length ? left : right
		const longer = left.length > right.length ? left : right

		if (shorter.length < 6 || !longer.includes(shorter)) {
			return 0
		}

		return 0.72 + 0.2 * (shorter.length / longer.length)
	}

	private getTokenCoverageScore(inputTokens: string[], mediaTokens: string[]): number {
		if (inputTokens.length === 0 || mediaTokens.length === 0) {
			return 0
		}

		const inputCompact = inputTokens.join("")
		const mediaCompact = mediaTokens.join("")
		const matchedInputTokens = inputTokens.filter((token) => mediaCompact.includes(token)).length
		const matchedMediaTokens = mediaTokens.filter((token) => inputCompact.includes(token)).length
		const inputCoverage = matchedInputTokens / inputTokens.length
		const mediaCoverage = matchedMediaTokens / mediaTokens.length

		return (inputCoverage + mediaCoverage) / 2
	}

	private getDiceCoefficient(left: string, right: string): number {
		if (left.length < 2 || right.length < 2) {
			return left === right ? 1 : 0
		}

		const leftBigrams = this.getBigrams(left)
		const rightBigrams = this.getBigrams(right)
		const remainingRightBigrams = [...rightBigrams]
		let intersection = 0

		for (const bigram of leftBigrams) {
			const index = remainingRightBigrams.indexOf(bigram)
			if (index >= 0) {
				intersection += 1
				remainingRightBigrams.splice(index, 1)
			}
		}

		return (2 * intersection) / (leftBigrams.length + rightBigrams.length)
	}

	private getBigrams(value: string): string[] {
		const bigrams: string[] = []
		for (let index = 0; index < value.length - 1; index += 1) {
			bigrams.push(value.slice(index, index + 2))
		}
		return bigrams
	}

	/**
	 * Cache a video cover result in memory
	 */
	private cacheVideoCover(
		key: string,
		url: string | null,
		sourceUrl: string | null = null,
		sourceName: string | null = null,
		canonicalTitle: string | null = null,
	): void {
		this.videoCoverCache.set(key, {
			url,
			sourceUrl,
			sourceName,
			canonicalTitle,
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
