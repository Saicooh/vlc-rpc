import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type {
	Resolver as CatalogResolver,
	CatalogResult,
	ParsedVideo,
} from "@main/features/catalog"
import { parse as parseVideo, takeTrailingSeason } from "@main/features/catalog"
import type { EpisodeTitleLookup } from "@main/features/catalog/catalog.episode"
import type { EpisodeThumbnailLookup } from "@main/features/cover/cover.episode"
import type { CorrectedTags } from "@main/features/overrides"
import type { AppConfig } from "@shared/config/app-config"
import type { ResolvedLayout, VideoFacts } from "@shared/presence/layout"
import { renderLine, resolveLayout, videoVariables } from "@shared/presence/layout"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import { bluRayFolderTitle, isBluRaySource } from "@shared/vlc/bluray"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import type { CoverOutcome, VideoCoverResult } from "@main/features/cover"
import { ActivityType } from "discord-api-types/v10"
import type { SyncplayStatus } from "./presence.syncplay"
import type { TimelineWindow } from "./presence.timeline"

const SYNCPLAY_IMAGE =
	"https://raw.githubusercontent.com/Syncplay/syncplay/master/syncplay/resources/syncplay.png"

interface VideoArtwork {
	resolve(status: VlcStatus, catalogResult: CatalogResult | null): Promise<VideoCoverResult>
}

interface LocalVideoArtwork {
	fetch(status: VlcStatus): Promise<CoverOutcome>
}

const NO_LOCAL_VIDEO_ARTWORK: LocalVideoArtwork = {
	fetch: async () => ({ kind: "no-artwork" }),
}

const NO_VIDEO_ARTWORK: VideoArtwork = {
	resolve: async () => ({
		imageUrl: null,
		sourceUrl: null,
		sourceName: null,
		canonicalTitle: null,
	}),
}

const NO_SYNCPLAY: SyncplayStatus = { isRunning: async () => false }

// A parse that found no title yields "", which `??` would happily pick over the
// raw VLC title, so empty counts as absent here.
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
	return values.find((value) => value !== undefined && value !== "")
}

// Discord fetches the large image itself, so a path only this machine can read
// draws nothing at all, where the fallback it replaced would have drawn something.
function reachableByDiscord(candidate: string | null | undefined): boolean {
	if (!candidate) {
		return false
	}

	try {
		const { protocol } = new URL(candidate)
		return protocol === "http:" || protocol === "https:"
	} catch {
		return false
	}
}

// The one gate for the image key, candidates in falling order of preference, so
// playing and paused cannot disagree about what Discord is allowed to be handed.
function largeImageFor(fallback: string, ...candidates: (string | null | undefined)[]): string {
	return candidates.find(reachableByDiscord) ?? fallback
}

interface PresenceLines {
	details: string
	state: string
	/** Empty when the layout has nothing to name the activity after. */
	activityName: string
	/** Empty when the layout put nothing on Discord's last line. */
	largeText: string
}

function videoFacts(
	media: VlcStatus["media"],
	catalogResult: CatalogResult | null,
	localParse: ParsedVideo | null,
	canonicalTitle: string | null,
	disc: VlcStatus["disc"],
	externalEpisodeTitle: string | null,
): VideoFacts {
	const isTvShow = catalogResult
		? catalogResult.mediaKind === "tv"
		: media.showName !== undefined ||
			media.season !== undefined ||
			media.episode !== undefined ||
			localParse?.season !== undefined ||
			localParse?.episode !== undefined

	const season = isTvShow
		? (media.season ?? catalogResult?.season ?? localParse?.season)
		: undefined
	const rawTitle =
		firstNonEmpty(
			catalogResult?.title,
			canonicalTitle ?? undefined,
			media.showName,
			localParse?.title,
			media.title,
		) ?? ""
	const trailingSeason = takeTrailingSeason(rawTitle)
	const title =
		season !== undefined && trailingSeason?.season === season ? trailingSeason.title : rawTitle
	const subtitle = firstNonEmpty(
		media.episodeTitle,
		localParse?.subtitle,
		externalEpisodeTitle ?? undefined,
	)
	const distinctSubtitle =
		subtitle && !title.toLocaleLowerCase().includes(subtitle.toLocaleLowerCase())
			? subtitle
			: undefined

	return {
		title: !isTvShow && distinctSubtitle ? `${title}: ${distinctSubtitle}` : title,
		episodeTitle: isTvShow ? distinctSubtitle : undefined,
		// A film whose filename happens to parse a season must not grow an episode.
		season,
		episode: isTvShow
			? (media.episode ?? catalogResult?.episode ?? localParse?.episode)
			: undefined,
		year: localParse?.year,
		discTitle: disc?.title,
		chapter: disc?.chapter,
	}
}

/**
 * What the user typed a file is, for audio whose own tags say nothing. Asked of
 * the music feature, which owns how a correction is keyed, because every music
 * template below reads tags and a file with none has nothing else to read.
 */
export interface AudioCorrections {
	correctedTagsFor(status: VlcStatus): Promise<CorrectedTags | null>
}

// Both states build the same lines from the same layout, so a preset reads the same
// whether playback is running or paused.
function buildLines(
	layout: ResolvedLayout,
	mediaInfo: VlcStatus,
	catalogResult: CatalogResult | null,
	localParse: ParsedVideo | null,
	corrected: CorrectedTags | null,
	canonicalTitle: string | null,
	externalEpisodeTitle: string | null,
): PresenceLines {
	const media = mediaInfo.media

	if (mediaInfo.mediaType === "video") {
		const variables = videoVariables(
			videoFacts(
				media,
				catalogResult,
				localParse,
				canonicalTitle,
				mediaInfo.disc,
				externalEpisodeTitle,
			),
		)
		return {
			details: renderLine(layout.video.details, variables),
			state: renderLine(layout.video.state, variables),
			activityName: "",
			largeText: "",
		}
	}

	// Field by field: a correction that names only the artist leaves the title
	// the file reported, which for this case is usually its own name and is
	// still the best thing there is to show.
	const variables = {
		title: firstNonEmpty(corrected?.title, media.title) ?? "",
		artist: firstNonEmpty(corrected?.artist, media.artist) ?? "",
		album: media.album ?? "",
		nowPlaying: media.nowPlaying ?? "",
	}

	return {
		details: renderLine(layout.music.details, variables),
		state: renderLine(layout.music.state, variables),
		activityName: renderLine(layout.music.activityName, variables),
		largeText: renderLine(layout.music.largeText, variables),
	}
}

// The two preset names are the whole of what is stored, so the lines are composed on
// every read and cannot fall behind the choice they came from.
function layoutFrom(config: AppConfig): ResolvedLayout {
	return resolveLayout({ music: config.layoutPreset, video: config.videoLayoutPreset })
}

function customButtonFor(
	config: AppConfig,
	isAniListAnime: boolean,
): DiscordPresenceData["buttons"] {
	const url = config.customButtonUrl?.trim()
	if (!isAniListAnime || !config.customButtonEnabled || !url) return undefined

	return [
		{
			label: config.customButtonLabel?.trim() || "My Profile",
			url,
		},
	]
}

function buttonsFor(
	config: AppConfig,
	videoCover: VideoCoverResult | null,
	catalogResult: CatalogResult | null,
): DiscordPresenceData["buttons"] {
	const buttons: NonNullable<DiscordPresenceData["buttons"]> = []
	if (videoCover?.sourceUrl && videoCover.sourceName) {
		buttons.push({ label: `View on ${videoCover.sourceName}`, url: videoCover.sourceUrl })
	}

	const isAniListAnime =
		videoCover?.sourceName === "AniList" || catalogResult?.sourceName === "AniList"
	const customButton = customButtonFor(config, isAniListAnime)
	if (customButton) buttons.push(...customButton)

	return buttons.length > 0 ? buttons.slice(0, 2) : undefined
}

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

	public abstract updatePresence(
		mediaInfo: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null>
}

class StoppedState extends MediaState {
	public async updatePresence(
		_mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (VLC stopped)")
		return null
	}
}

class NoStatusState extends MediaState {
	public async updatePresence(
		_mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (no status data)")
		return null
	}
}

class PlayingState extends MediaState {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly corrections: AudioCorrections,
		private readonly videoArtwork: VideoArtwork,
		private readonly syncplay: SyncplayStatus,
		private readonly localVideoArtwork: LocalVideoArtwork,
		private readonly episodeTitles: EpisodeTitleLookup,
		private readonly episodeThumbnails: EpisodeThumbnailLookup,
	) {
		super()
	}

	public async updatePresence(
		mediaInfo: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get()

		const media = mediaInfo.media
		const mediaType = mediaInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const catalogResult = mediaType === "video" ? await this.catalog.resolve(mediaInfo) : null
		// Parsed even on a catalog hit: the providers never report the year of the
		// concrete file being played, and parsing is pure and local.
		const videoName = media.filename || media.title || ""
		const localParse =
			mediaType === "video" &&
			(!isBluRaySource(media.sourceUri) || bluRayFolderTitle(media.sourceUri))
				? parseVideo(videoName, mediaInfo.playback.duration)
				: null
		const videoCover =
			mediaType === "video" ? await this.videoArtwork.resolve(mediaInfo, catalogResult) : null
		const localCover = mediaType === "video" ? await this.localVideoArtwork.fetch(mediaInfo) : null
		const externalEpisodeTitle =
			mediaType === "video" ? await this.episodeTitles.resolve(mediaInfo, catalogResult) : null
		const episodeThumbnail =
			config.showEpisodeThumbnails === true &&
			mediaType === "video" &&
			localCover?.kind !== "published" &&
			localCover?.kind !== "publish-failed"
				? await this.episodeThumbnails.resolve(mediaInfo, catalogResult)
				: null

		// The artwork first, and the text after it. Both can come from the same
		// acoustic match, and the lookup that learns it happens inside this call:
		// asked in the other order the text would answer from the poll before,
		// leaving the right cover beside the file name for one turn of the loop.
		const cover = mediaType === "audio" ? await this.artwork.resolve(mediaInfo) : null
		const corrected =
			mediaType === "audio" ? await this.corrections.correctedTagsFor(mediaInfo) : null

		const lines = buildLines(
			layoutFrom(config),
			mediaInfo,
			catalogResult,
			localParse,
			corrected,
			videoCover?.canonicalTitle ?? null,
			externalEpisodeTitle,
		)

		const details = this.formatText(lines.details)
		const state = this.formatText(lines.state)

		const { start: startTimestamp, end: endTimestamp } = window

		// Discord shows this on hover over the small image, so it is a word, not the
		// asset key that picks the image itself.
		let smallText = "Playing"

		const videoInfo = mediaInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += `, ${resolution}`
		}

		const largeImage = largeImageFor(
			config.largeImage,
			cover,
			localCover?.kind === "published" ? localCover.url : null,
			episodeThumbnail,
			localCover?.kind === "publish-failed" ? null : videoCover?.imageUrl,
			localCover?.kind === "publish-failed" ? null : catalogResult?.poster,
			media.artworkUrl,
		)
		const isSyncplay = await this.syncplay.isRunning()
		const buttons = buttonsFor(
			config,
			mediaType === "video" ? videoCover : null,
			mediaType === "video" ? catalogResult : null,
		)

		const presenceData: DiscordPresenceData = {
			details,
			state,
			large_image: largeImage,
			small_image: isSyncplay ? SYNCPLAY_IMAGE : config.playingImage,
			small_text: isSyncplay ? "Watching Together" : smallText,
			start_timestamp: startTimestamp,
			end_timestamp: endTimestamp,
			activity_type: activityType,
		}

		if (buttons) presenceData.buttons = buttons

		if (lines.activityName !== "") {
			presenceData.name = lines.activityName
		}

		// A line the arrangement did not fill is a line Discord must not draw. It used to
		// carry the album or, failing that, words this app made up, and those words were
		// read on a profile as a line of their own.
		const largeText = this.formatText(lines.largeText)
		if (largeText !== "") {
			presenceData.large_text = largeText
		}

		const verb = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence: ${verb} ${details} - ${state}`)

		return presenceData
	}
}

class PausedState extends MediaState {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly corrections: AudioCorrections,
		private readonly videoArtwork: VideoArtwork,
		private readonly syncplay: SyncplayStatus,
		private readonly localVideoArtwork: LocalVideoArtwork,
		private readonly episodeTitles: EpisodeTitleLookup,
		private readonly episodeThumbnails: EpisodeThumbnailLookup,
	) {
		super()
	}

	public async updatePresence(
		mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get()

		const media = mediaInfo.media
		const mediaType = mediaInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Paused activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const catalogResult = mediaType === "video" ? await this.catalog.resolve(mediaInfo) : null
		// Parsed even on a catalog hit: the providers never report the year of the
		// concrete file being played, and parsing is pure and local.
		const videoName = media.filename || media.title || ""
		const localParse =
			mediaType === "video" &&
			(!isBluRaySource(media.sourceUri) || bluRayFolderTitle(media.sourceUri))
				? parseVideo(videoName, mediaInfo.playback.duration)
				: null
		const videoCover =
			mediaType === "video" ? await this.videoArtwork.resolve(mediaInfo, catalogResult) : null
		const localCover = mediaType === "video" ? await this.localVideoArtwork.fetch(mediaInfo) : null
		const externalEpisodeTitle =
			mediaType === "video" ? await this.episodeTitles.resolve(mediaInfo, catalogResult) : null
		const episodeThumbnail =
			config.showEpisodeThumbnails === true &&
			mediaType === "video" &&
			localCover?.kind !== "published" &&
			localCover?.kind !== "publish-failed"
				? await this.episodeThumbnails.resolve(mediaInfo, catalogResult)
				: null

		// The artwork first, and the text after it. Both can come from the same
		// acoustic match, and the lookup that learns it happens inside this call:
		// asked in the other order the text would answer from the poll before,
		// leaving the right cover beside the file name for one turn of the loop.
		const cover = mediaType === "audio" ? await this.artwork.resolve(mediaInfo) : null
		const corrected =
			mediaType === "audio" ? await this.corrections.correctedTagsFor(mediaInfo) : null

		const lines = buildLines(
			layoutFrom(config),
			mediaInfo,
			catalogResult,
			localParse,
			corrected,
			videoCover?.canonicalTitle ?? null,
			externalEpisodeTitle,
		)

		const details = this.formatText(lines.details)
		const state = this.formatText(lines.state)

		let smallText = "Paused"

		const videoInfo = mediaInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += `, ${resolution}`
		}

		const largeImage = largeImageFor(
			config.largeImage,
			cover,
			localCover?.kind === "published" ? localCover.url : null,
			episodeThumbnail,
			localCover?.kind === "publish-failed" ? null : videoCover?.imageUrl,
			localCover?.kind === "publish-failed" ? null : catalogResult?.poster,
			media.artworkUrl,
		)
		const isSyncplay = await this.syncplay.isRunning()
		const buttons = buttonsFor(
			config,
			mediaType === "video" ? videoCover : null,
			mediaType === "video" ? catalogResult : null,
		)

		const presenceData: DiscordPresenceData = {
			details,
			state,
			large_image: largeImage,
			small_image: isSyncplay ? SYNCPLAY_IMAGE : config.pausedImage,
			small_text: isSyncplay ? "Watching Together" : smallText,
			activity_type: activityType,
		}

		if (buttons) presenceData.buttons = buttons

		if (lines.activityName !== "") {
			presenceData.name = lines.activityName
		}

		const largeText = this.formatText(lines.largeText)
		if (largeText !== "") {
			presenceData.large_text = largeText
		}

		const verb = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence (paused): ${verb} ${details} - ${state}`)

		return presenceData
	}
}

/**
 * Service to manage media state and update Discord presence
 */
interface MediaStates {
	stopped: MediaState
	noStatus: MediaState
	playing: MediaState
	paused: MediaState
}

export class Service {
	private states: MediaStates

	constructor(
		artwork: ArtworkResolver,
		catalog: CatalogResolver,
		corrections: AudioCorrections,
		videoArtwork: VideoArtwork = NO_VIDEO_ARTWORK,
		syncplay: SyncplayStatus = NO_SYNCPLAY,
		localVideoArtwork: LocalVideoArtwork = NO_LOCAL_VIDEO_ARTWORK,
		episodeTitles: EpisodeTitleLookup = { resolve: async () => null },
		episodeThumbnails: EpisodeThumbnailLookup = { resolve: async () => null },
	) {
		this.states = {
			stopped: new StoppedState(),
			noStatus: new NoStatusState(),
			playing: new PlayingState(
				artwork,
				catalog,
				corrections,
				videoArtwork,
				syncplay,
				localVideoArtwork,
				episodeTitles,
				episodeThumbnails,
			),
			paused: new PausedState(
				artwork,
				catalog,
				corrections,
				videoArtwork,
				syncplay,
				localVideoArtwork,
				episodeTitles,
				episodeThumbnails,
			),
		}

		logger.info("Media state service initialized")
	}

	public async getDiscordPresence(
		vlcStatus: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!vlcStatus) {
			return this.states.noStatus.updatePresence(null, window)
		}

		if (!vlcStatus.active) {
			return this.states.stopped.updatePresence(vlcStatus, window)
		}

		switch (vlcStatus.status) {
			case "playing":
				return this.states.playing.updatePresence(vlcStatus, window)
			case "paused":
				return this.states.paused.updatePresence(vlcStatus, window)
			default:
				return this.states.stopped.updatePresence(vlcStatus, window)
		}
	}
}
