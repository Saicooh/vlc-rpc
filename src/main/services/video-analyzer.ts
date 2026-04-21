import type { VlcStatus } from "@shared/types/vlc"
import { logger } from "./logger"

// Import types from the ESM module
type ParsedFilename = import("@ctrl/video-filename-parser").ParsedFilename
type ParsedShow = import("@ctrl/video-filename-parser").ParsedShow

export interface VideoAnalysis {
	isVideo: boolean
	isTvShow: boolean
	isMovie: boolean
	title: string
	season?: number
	episode?: number
	year?: string
	duration?: number
	originalFilename?: string
}

/**
 * Check if parsed result is a TV show
 */
function isParsedShow(parsed: ParsedFilename): parsed is ParsedShow {
	return "isTv" in parsed && parsed.isTv === true
}

/**
 * Service to analyze video content and determine its type (TV show, movie, etc.)
 */
export class VideoAnalyzerService {
	private static instance: VideoAnalyzerService | null = null
	private filenameParse: ((filename: string, isTv?: boolean) => ParsedFilename) | null = null
	private parserReady: Promise<void>

	private constructor() {
		logger.info("Video analyzer service initialized")
		this.parserReady = this.initializeParser()
	}

	/**
	 * Initialize the filename parser with dynamic import
	 */
	private async initializeParser(): Promise<void> {
		try {
			const module = await import("@ctrl/video-filename-parser")
			this.filenameParse = module.filenameParse
			logger.info("Video filename parser initialized")
		} catch (error) {
			logger.error("Failed to initialize video filename parser:", error)
		}
	}

	/**
	 * Get the singleton instance of the video analyzer service
	 */
	public static getInstance(): VideoAnalyzerService {
		if (!VideoAnalyzerService.instance) {
			VideoAnalyzerService.instance = new VideoAnalyzerService()
		}
		return VideoAnalyzerService.instance
	}

	/**
	 * Analyze video content to determine type and metadata
	 */
	public analyzeVideo(vlcStatus: VlcStatus, filename?: string): VideoAnalysis {
		// Ensure parser is loaded (non-blocking — if not ready yet, we use fallback cleaning)
		this.parserReady.catch(() => {})
		if (vlcStatus.mediaType !== "video") {
			return {
				isVideo: false,
				isTvShow: false,
				isMovie: false,
				title: vlcStatus.media.title || "Unknown",
			}
		}

		const title = vlcStatus.media.title || ""
		const mediaFilename = vlcStatus.media.filename || ""
		const duration = vlcStatus.playback?.duration || 0
		const actualFilename = filename || mediaFilename || title

		logger.info(`Analyzing video: "${actualFilename}" with duration: ${duration}s`)

		// First, let's try to determine if it's a TV show based on duration heuristics
		const durationMinutes = duration / 60
		let likelyTvShow = false

		// TV show episodes are typically 20-90 minutes
		// Movies are typically 90+ minutes
		if (durationMinutes > 0 && durationMinutes < 90) {
			likelyTvShow = true
			logger.info(`Duration ${durationMinutes.toFixed(1)} minutes suggests TV show`)
		}

		// Parse filename to get detailed information
		let parsedInfo: ParsedFilename | null = null
		let isTvShow = likelyTvShow

		if (actualFilename && this.filenameParse) {
			try {
				// Parse based on our initial heuristics (duration + VLC metadata + filename patterns)
				// IMPORTANT: do not default to false here, otherwise short episodic content
				// gets parsed as movies unless the filename explicitly contains S/E markers.
				parsedInfo = this.filenameParse(actualFilename, likelyTvShow)
				logger.info(`Parsed filename with isTvShow=${isTvShow}: ${JSON.stringify(parsedInfo)}`)

				// If we heavily suspected a movie but the parser confidently found seasons/episodes,
				// and it's not obviously a year mistaken as a season (e.g. S20E25 from 2025),
				// we might reconsider, but it's safer to trust our initial heuristics.
				if (!isTvShow && isParsedShow(parsedInfo)) {
					const hasSeasons = parsedInfo.seasons && parsedInfo.seasons.length > 0
					const hasEpisodes = parsedInfo.episodeNumbers && parsedInfo.episodeNumbers.length > 0

					// Ensure it's not a garbage parse (like 2025 -> S20E25)
					if (hasSeasons && hasEpisodes) {
						if (parsedInfo.seasons[0] < 19) {
							// Prevent parsing years 19xx/20xx as seasons
							isTvShow = true
							logger.info("Re-classified as TV show based on parser findings")
						}
					}
				}
			} catch (error) {
				logger.warn(`Error parsing filename "${actualFilename}": ${error}`)
			}
		} else if (actualFilename && !this.filenameParse) {
			logger.warn("Filename parser not yet initialized, falling back to basic analysis")
		}

		// Combine heuristics with parsed data
		if (!isTvShow && likelyTvShow) {
			// Duration suggests TV show but filename parser didn't detect it
			// This could be a TV show with non-standard naming
			logger.info("Duration heuristic suggests TV show despite filename parsing")
		}

		if (isTvShow && !likelyTvShow && durationMinutes > 120) {
			// Filename suggests TV show but duration is very long (might be a movie)
			logger.info("Long duration suggests movie despite TV show filename pattern")
			isTvShow = false
		}

		// Extract information for display
		let displayTitle = title
		let season: number | undefined
		let episode: number | undefined
		let year: string | undefined

		if (parsedInfo) {
			if (parsedInfo.title && parsedInfo.title !== displayTitle) {
				displayTitle = parsedInfo.title
			}

			if (isParsedShow(parsedInfo)) {
				if (parsedInfo.seasons && parsedInfo.seasons.length > 0) {
					season = parsedInfo.seasons[0]
				}

				if (parsedInfo.episodeNumbers && parsedInfo.episodeNumbers.length > 0) {
					episode = parsedInfo.episodeNumbers[0]
				}
			}

			if (parsedInfo.year) {
				year = parsedInfo.year.toString()
			}
		}

		const episodicSubtitle = this.extractEpisodicSubtitle(actualFilename)
		if (isTvShow && episodicSubtitle) {
			displayTitle = this.stripTrailingYear(displayTitle)
		}
		if (
			isTvShow &&
			episodicSubtitle &&
			!this.normalizedContains(displayTitle, episodicSubtitle)
		) {
			displayTitle = `${displayTitle}: ${episodicSubtitle}`
		}

		const analysis: VideoAnalysis = {
			isVideo: true,
			isTvShow,
			isMovie: !isTvShow,
			title: this.cleanTitle(displayTitle),
			season,
			episode,
			year,
			duration: durationMinutes,
			originalFilename: actualFilename,
		}

		logger.info(`Video analysis result: ${JSON.stringify(analysis)}`)
		return analysis
	}

	private stripTrailingYear(value: string): string {
		return value.replace(/\s+(19|20)\d{2}\s*$/g, "").trim()
	}

	private extractEpisodicSubtitle(filename: string): string | undefined {
		if (!filename) return undefined

		const withoutExtension = filename.replace(/\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i, "")
		const normalized = withoutExtension.replace(/[._]/g, " ")
		const episodeMatch = normalized.match(/\bS\d{1,2}E\d{1,3}\b/i)

		if (!episodeMatch?.index) {
			if (episodeMatch?.index !== 0) {
				return undefined
			}
		}

		let suffix = normalized.slice(episodeMatch.index + episodeMatch[0].length)
		suffix = suffix.replace(/^[\s\-–—:]+/, "")
		suffix = suffix.replace(
			/\b(\d{3,4}p|4K|UHD|WEB(?:-DL|RIP)?|WEB|NF|AMZN|CR|BD|BDRIP|BLURAY|BLU-RAY|HEVC|x264|x265|AAC|FLAC|DUAL|DUB|SUBBED|MULTI|REMUX|HDR|SDR|DD(?:P)?(?:5|7)?(?:[.\s]?1)?)\b.*$/i,
			"",
		)
		suffix = suffix.replace(/\s{2,}/g, " ").trim()

		if (!suffix) return undefined

		const wordCount = suffix.split(/\s+/).filter(Boolean).length
		if (wordCount < 2) return undefined

		if (suffix === suffix.toUpperCase()) {
			suffix = suffix
				.toLowerCase()
				.replace(/\b\w/g, (char) => char.toUpperCase())
		}

		logger.info(`Recovered episodic subtitle from filename: "${suffix}"`)
		return suffix
	}

	private normalizedContains(base: string, candidate: string): boolean {
		const normalizedBase = this.normalizeForComparison(base)
		const normalizedCandidate = this.normalizeForComparison(candidate)
		return normalizedBase.includes(normalizedCandidate)
	}

	private normalizeForComparison(value: string): string {
		return value
			.normalize("NFKD")
			.replace(/[^\w\s]/g, " ")
			.replace(/_/g, " ")
			.toLowerCase()
			.replace(/\s{2,}/g, " ")
			.trim()
	}

	/**
	 * Clean a video title by removing common release tags, fansub groups,
	 * file extensions, and other noise from filenames
	 */
	private cleanTitle(title: string): string {
		if (!title) return "Unknown"

		let cleaned = title

		// Remove file extension if present
		cleaned = cleaned.replace(/\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i, "")

		// Remove content inside square brackets (fansub groups, codec info, quality tags)
		// e.g., [SubGroup], [BD], [1080p], [HEVC], [x265], [FLAC], [Dual Audio]
		cleaned = cleaned.replace(/\[[^\]]*\]/g, "")

		// Remove unclosed/orphan brackets (VLC may truncate titles mid-bracket)
		// e.g., "Title [BD[" or "Title [" → "Title"
		cleaned = cleaned.replace(/\[[^\]]*$/g, "")

		// Remove stray bracket characters
		cleaned = cleaned.replace(/[\[\]]/g, "")

		// Remove content inside parentheses that looks like release info
		// e.g., (BD 1080p), (720p), (BDRip), but keep years like (2021)
		cleaned = cleaned.replace(/\((?!\d{4}\))[^)]*\)/g, "")

		// Remove common standalone release tags not in brackets
		// Enhanced to catch tags even if dots were replaced by spaces (e.g., DDP5 1, H 264)
		cleaned = cleaned.replace(
			/\b(BD|BDRip|BluRay|Blu-Ray|WEB-DL|WEBRip|HDTV|DVDRip|HEVC|x264|x265|[HhXx]\s*\.?\s*26[45]?|AAC|FLAC|10bit|Hi10P|DUAL|DUB|DUBBED|SUB|SUBBED|MULTI|REMUX|SDR|HDR|DTS|AC3|DD(?:P)?(?:5|7)[\.\s]?1|AMZN|NF|CR|VOSTFR|S\d{1,2}E\d{1,2})\b/gi,
			"",
		)

		// Remove resolution patterns like 1080p, 720p, 480p, 2160p, 4K
		cleaned = cleaned.replace(/\b(\d{3,4}p|4K|UHD)\b/gi, "")

		// Remove isolated single letters at the end (often leftovers from split codecs like "H 264" -> "H")
		cleaned = cleaned.replace(/\s+\b[a-zA-Z]\b\s*$/g, "")

		// Remove 4-digit years at the end (the app extracts year independently, we don't need it in the title)
		cleaned = cleaned.replace(/\s+(19|20)\d{2}\s*$/g, "")

		// Remove hash-like strings (CRC32 checksums common in anime releases)
		cleaned = cleaned.replace(/\b[A-Fa-f0-9]{8}\b/g, "")

		// Remove redundant content type suffixes (the app shows these separately)
		// e.g., "Jujutsu Kaisen 0 - Movie" → "Jujutsu Kaisen 0"
		cleaned = cleaned.replace(
			/[\s\-–—]+(Movie|Film|The Movie|OVA|ONA|Special|Specials|Pelicula|Película)\s*$/gi,
			"",
		)
		// Also handle "Title Movie" without dash separator
		cleaned = cleaned.replace(/\s+(The Movie|Movie|Film)\s*$/gi, "")

		// Safely strip episode markers that confuse strict metadata APIs (AniList)
		cleaned = cleaned.replace(
			/[\s\-–—]+(Capitulo|Capítulo|Episode|Episodio|Ep|Cap|Part|Parte)\s*\d+$/gi,
			"",
		)
		// Remove separated padded 2/3-digit episode numbers like " - 01", " - 12", " — 005"
		// or raw zero-padded like " 01" without matching "Mob Psycho 100" or "Jujutsu Kaisen 0"
		cleaned = cleaned.replace(/\s+[-–—]+\s*\d{1,4}$/, "")
		cleaned = cleaned.replace(/\s+0\d{1,3}$/, "")

		// Clean up separators: replace dots and underscores with spaces (common in filenames)
		// But only if the title looks like a filename (has multiple dots/underscores)
		if ((cleaned.match(/[._]/g) || []).length >= 2) {
			cleaned = cleaned.replace(/[._]/g, " ")
		}

		// Remove trailing dashes, dots, spaces and leading/trailing whitespace
		cleaned = cleaned.replace(/[\s.\-–—]+$/g, "").trim()
		cleaned = cleaned.replace(/^[\s.\-–—]+/g, "").trim()

		// Collapse multiple spaces into one
		cleaned = cleaned.replace(/\s{2,}/g, " ")

		// Final trim
		cleaned = cleaned.trim()

		if (!cleaned) return title.trim() || "Unknown"

		logger.info(`Title cleaned: "${title}" → "${cleaned}"`)
		return cleaned
	}

	/**
	 * Format video title for Discord display based on analysis
	 */
	public formatVideoTitle(analysis: VideoAnalysis): { details: string; state: string } {
		if (!analysis.isVideo) {
			return {
				details: analysis.title,
				state: "Watching",
			}
		}

		if (analysis.isTvShow && analysis.season && analysis.episode) {
			// TV Show with season and episode
			return {
				details: `${analysis.title} S${analysis.season.toString().padStart(2, "0")}E${analysis.episode.toString().padStart(2, "0")}`,
				state: "Watching",
			}
		}

		if (analysis.isTvShow && analysis.episode) {
			// TV Show with episode only
			return {
				details: `${analysis.title} - Episode ${analysis.episode}`,
				state: "Watching",
			}
		}

		if (analysis.isMovie && analysis.year) {
			// Movie with year
			return {
				details: `${analysis.title} (${analysis.year})`,
				state: "Watching",
			}
		}

		return {
			details: analysis.title,
			state: "Watching",
		}
	}

	/**
	 * Get appropriate large text for Discord based on analysis
	 */
	public getLargeText(analysis: VideoAnalysis): string {
		if (!analysis.isVideo) {
			return "Watching Video"
		}

		if (analysis.isTvShow) {
			return "Watching TV Show"
		}

		if (analysis.isMovie) {
			return "Watching Movie"
		}

		return "Watching Video"
	}
}

export const videoAnalyzerService = VideoAnalyzerService.getInstance()
