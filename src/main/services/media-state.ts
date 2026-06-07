import { applyTemplate, getDefaultLayout, getLayoutByPreset } from "@shared/constants/layouts"
import type { AppConfig, PresenceLayout } from "@shared/types"
import type { DetectedMediaInfo, DiscordPresenceData } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import { ActivityType } from "discord-api-types/v10"
import { configService } from "./config"
import { type VideoCoverResult, coverArtService } from "./cover-art"
import { logger } from "./logger"
import { syncplayDetector } from "./syncplay-detector"
import { type VideoAnalysis, VideoAnalyzerService } from "./video-analyzer"

/**
 * Base class for media states
 */
abstract class MediaState {
	protected formatText(text: string, maxLength = 128): string {
		if (!text) return ""
		if (text.length > maxLength) {
			return `${text.substring(0, maxLength - 3)}...`
		}
		return text
	}

	protected getConfiguredLayout(config: AppConfig): PresenceLayout {
		return (
			config.presenceLayout ||
			(config.layoutPreset ? getLayoutByPreset(config.layoutPreset) : getDefaultLayout())
		)
	}

	protected buildMusicTemplateVariables(media: VlcStatus["media"]): Record<string, string> {
		return {
			title: media.title || "Unknown Song",
			artist: media.artist || "Unknown Artist",
			album: media.album || "",
		}
	}

	protected buildVideoEpisodeInfo(videoAnalysis: VideoAnalysis): string {
		if (!videoAnalysis.isTvShow) {
			return "Movie"
		}

		if (videoAnalysis.season && videoAnalysis.episode) {
			return `S${videoAnalysis.season}E${videoAnalysis.episode}`
		}

		if (videoAnalysis.season) {
			return `Season ${videoAnalysis.season}`
		}

		if (videoAnalysis.episode) {
			return `Episode ${videoAnalysis.episode}`
		}

		return "TV Show"
	}

	protected buildVideoTemplateVariables(
		mediaInfo: VlcStatus,
		correctedTitle?: string,
	): Record<string, string> {
		const videoAnalyzer = VideoAnalyzerService.getInstance()
		const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)

		return {
			title: correctedTitle || videoAnalysis.title,
			episodeInfo: this.buildVideoEpisodeInfo(videoAnalysis),
			year: videoAnalysis.year || "",
			season: videoAnalysis.season?.toString() || "",
			episode: videoAnalysis.episode?.toString() || "",
		}
	}

	protected buildPresenceText(
		mediaInfo: VlcStatus & DetectedMediaInfo,
		config: AppConfig,
		activityType: number,
		correctedVideoTitle?: string,
	): { details: string; state: string } {
		const layout = this.getConfiguredLayout(config)

		if (activityType === ActivityType.Listening) {
			const variables = this.buildMusicTemplateVariables(mediaInfo.media)

			return {
				details: this.formatText(applyTemplate(layout.musicDetails, variables)),
				state: this.formatText(applyTemplate(layout.musicState, variables)),
			}
		}

		const variables = this.buildVideoTemplateVariables(mediaInfo, correctedVideoTitle)

		return {
			details: this.formatText(applyTemplate(layout.videoDetails, variables)),
			state: this.formatText(applyTemplate(layout.videoState, variables)),
		}
	}

	protected async resolveVideoCover(
		mediaInfo: VlcStatus & DetectedMediaInfo,
		mediaType: string,
	): Promise<VideoCoverResult | null> {
		if (mediaType !== "video") {
			return null
		}

		return coverArtService.fetchVideoCover(mediaInfo)
	}

	protected async buildBasePresence(
		mediaInfo: VlcStatus & DetectedMediaInfo,
		config: AppConfig,
		activityType: number,
		details: string,
		state: string,
		smallImageFallback: string,
		videoCover: VideoCoverResult | null = null,
	): Promise<DiscordPresenceData> {
		const media = mediaInfo.media
		const mediaType = mediaInfo.mediaType || "unknown"
		const currentTime = Math.floor(Date.now() / 1000)

		let startTimestamp: number | undefined
		let endTimestamp: number | undefined

		const playback = mediaInfo.playback

		if (playback) {
			const duration = playback.duration
			const position = playback.time

			if (position >= 0 && duration > 0 && duration < 86400) {
				startTimestamp = currentTime - position
				endTimestamp = currentTime + (duration - position)
			} else {
				startTimestamp = currentTime
			}
		}

		let smallText = smallImageFallback
		let largeImage = config.largeImage
		let largeText = "VLC Media Player"

		// Use artwork from VLC if available
		if (media.artworkUrl) {
			largeImage = media.artworkUrl
		}

		// Detect Syncplay and set appropriate large text
		const isSyncplay = await syncplayDetector.isRunning()

		// Set appropriate large text based on media type
		if (activityType === ActivityType.Listening) {
			largeText = media.album || "Listening to Music"
		} else {
			const videoAnalyzerForText = VideoAnalyzerService.getInstance()
			const videoAnalysisForText = videoAnalyzerForText.analyzeVideo(mediaInfo)
			largeText = videoAnalyzerForText.getLargeText(videoAnalysisForText)
		}

		const videoInfo = mediaInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (mediaType === "audio" && media) {
			const coverArtUrl = await coverArtService.fetch(mediaInfo)
			if (coverArtUrl) {
				largeImage = coverArtUrl
			}
		}

		// For video content, try to fetch cover art and source link
		let sourceUrl: string | null = null
		let sourceName: string | null = null
		if (mediaType === "video" && media) {
			const resolvedVideoCover = videoCover || (await coverArtService.fetchVideoCover(mediaInfo))
			if (resolvedVideoCover.imageUrl) {
				largeImage = resolvedVideoCover.imageUrl
				sourceUrl = resolvedVideoCover.sourceUrl
				sourceName = resolvedVideoCover.sourceName
				logger.info(
					`Using video cover from ${sourceName || "unknown"}: ${resolvedVideoCover.imageUrl}`,
				)
			}
		}

		// Override small icon with Syncplay logo when active
		const smallImage = isSyncplay
			? "https://raw.githubusercontent.com/Syncplay/syncplay/master/syncplay/resources/syncplay.png"
			: smallImageFallback
		const smallImageText = isSyncplay ? "Watching Together" : smallText

		const presenceData: DiscordPresenceData = {
			details,
			state,
			large_image: largeImage,
			large_text: largeText,
			small_image: smallImage,
			small_text: smallImageText,
			start_timestamp: startTimestamp,
			end_timestamp: endTimestamp,
			activity_type: activityType,
		}

		// Initialize buttons array
		const buttons: Array<{ label: string; url: string }> = []

		// 1. Add source button (AniList or IMDB) when available
		if (sourceUrl && sourceName) {
			buttons.push({ label: `View on ${sourceName}`, url: sourceUrl })
		}

		// 2. Add custom button from user config if enabled and configured
		if (config.customButtonEnabled && config.customButtonUrl) {
			buttons.push({
				label: config.customButtonLabel || "My Profile",
				url: config.customButtonUrl,
			})
		}

		if (buttons.length > 0) {
			// Discord limits to exactly 2 buttons
			presenceData.buttons = buttons.slice(0, 2)
		}

		// Set custom activity name based on layout configuration
		const layout = this.getConfiguredLayout(config)
		if (activityType === ActivityType.Listening && layout.activityName) {
			const activityNameVariables = this.buildMusicTemplateVariables(media)
			presenceData.name = applyTemplate(layout.activityName, activityNameVariables)
		}

		return presenceData
	}

	public abstract updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null>
}

class StoppedState extends MediaState {
	public async updatePresence(_mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (VLC stopped)")
		return null
	}
}

class NoStatusState extends MediaState {
	public async updatePresence(_mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (no status data)")
		return null
	}
}

class PlayingState extends MediaState {
	public async updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get<AppConfig>()
		const detectedInfo = mediaInfo as VlcStatus & DetectedMediaInfo
		const mediaType = detectedInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const videoCover = await this.resolveVideoCover(detectedInfo, mediaType)
		const { details, state } = this.buildPresenceText(
			detectedInfo,
			config,
			activityType,
			videoCover?.canonicalTitle || undefined,
		)

		const presenceData = await this.buildBasePresence(
			detectedInfo,
			config,
			activityType,
			details,
			state,
			config.playingImage,
			videoCover,
		)

		const activityName = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence: ${activityName} ${details} - ${state}`)

		return presenceData
	}
}

class PausedState extends MediaState {
	public async updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get<AppConfig>()
		const detectedInfo = mediaInfo as VlcStatus & DetectedMediaInfo
		const mediaType = detectedInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Paused activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const videoCover = await this.resolveVideoCover(detectedInfo, mediaType)
		const { details, state } = this.buildPresenceText(
			detectedInfo,
			config,
			activityType,
			videoCover?.canonicalTitle || undefined,
		)

		const presenceData = await this.buildBasePresence(
			detectedInfo,
			config,
			activityType,
			details,
			state,
			config.pausedImage,
			videoCover,
		)

		const activityName = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence (paused): ${activityName} ${details} - ${state}`)

		return presenceData
	}
}

/**
 * Service to manage media state and update Discord presence
 */
export class MediaStateService {
	private static instance: MediaStateService | null = null
	private states: Record<string, MediaState>

	private constructor() {
		this.states = {
			stopped: new StoppedState(),
			noStatus: new NoStatusState(),
			playing: new PlayingState(),
			paused: new PausedState(),
		}

		logger.info("Media state service initialized")
	}

	public static getInstance(): MediaStateService {
		if (!MediaStateService.instance) {
			MediaStateService.instance = new MediaStateService()
		}
		return MediaStateService.instance
	}

	public async getDiscordPresence(
		vlcStatus: VlcStatus | null,
	): Promise<DiscordPresenceData | null> {
		if (!vlcStatus) {
			return this.states.noStatus.updatePresence(null)
		}

		if (!vlcStatus.active) {
			return this.states.stopped.updatePresence(vlcStatus)
		}

		switch (vlcStatus.status) {
			case "playing":
				return this.states.playing.updatePresence(vlcStatus)
			case "paused":
				return this.states.paused.updatePresence(vlcStatus)
			default:
				return this.states.stopped.updatePresence(vlcStatus)
		}
	}
}

export const mediaStateService = MediaStateService.getInstance()
