import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type {
	Resolver as CatalogResolver,
	CatalogResult,
	ParsedVideo,
} from "@main/features/catalog"
import type { EpisodeTitleLookup } from "@main/features/catalog/catalog.episode"
import { parse as parseVideo } from "@main/features/catalog/catalog.parser"
import type { CoverOutcome } from "@main/features/cover"
import { episodeFrameKey } from "@main/features/cover/cover.episode"
import type { CorrectedTags, OverrideTarget } from "@main/features/overrides"
import type { Client as VlcClient } from "@main/features/vlc"
import type { ContentMetadata, ContentType, DetectedMediaInfo } from "@shared/media/media.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import type { ImageProxy } from "./media.image-proxy"

/**
 * The renderer reads an absent field as unknown, so the episode fields are
 * assigned only when VLC's tags or the local filename parse actually found them.
 */
function toVideoMetadata(
	result: CatalogResult,
	status: VlcStatus,
	parsed: ParsedVideo,
): ContentMetadata {
	const metadata: ContentMetadata = { clean_title: result.title }

	if (result.mediaKind === "tv") {
		const season = status.media.season ?? result.season ?? parsed.season
		const episode = status.media.episode ?? result.episode ?? parsed.episode
		if (season !== undefined) metadata.season = season
		if (episode !== undefined) metadata.episode = episode
		const episodeTitle = status.media.episodeTitle ?? parsed.subtitle
		if (
			metadata.episode !== undefined &&
			episodeTitle &&
			!result.title.toLocaleLowerCase().includes(episodeTitle.toLocaleLowerCase())
		) {
			metadata.episode_title = episodeTitle
		}
	}
	return metadata
}

function localVideoMetadata(status: VlcStatus, parsed: ParsedVideo): ContentMetadata | null {
	const season = status.media.season ?? parsed.season
	const episode = status.media.episode ?? parsed.episode
	if (!status.media.showName && season === undefined && episode === undefined) return null
	const title = status.media.showName || parsed.title || status.media.title || ""
	const metadata: ContentMetadata = { clean_title: title }
	if (season !== undefined) metadata.season = season
	if (episode !== undefined) metadata.episode = episode
	const episodeTitle = status.media.episodeTitle ?? parsed.subtitle
	if (
		episode !== undefined &&
		episodeTitle &&
		!title.toLocaleLowerCase().includes(episodeTitle.toLocaleLowerCase())
	) {
		metadata.episode_title = episodeTitle
	}
	return metadata
}

/**
 * The catalog reports a work as film or television. It stays at that grain even
 * though AniList is its only provider today: what the panel and the override
 * form need is the distinction the presence text pivots on, not the genre.
 */
function toContentType(mediaKind: CatalogResult["mediaKind"]): ContentType {
	return mediaKind === "tv" ? "tv_show" : "movie"
}

/**
 * A resolver asked where a correction for this file would be filed, which it can
 * answer without resolving. Declared here so the audio side arrives as the music
 * catalog itself: `artwork` picks a cover and knows nothing about how a record
 * is keyed.
 */
export interface OverrideTargets {
	overrideTargetFor(status: VlcStatus): Promise<OverrideTarget | null>
	/**
	 * What a file reads as when its own tags name nothing, and who says so.
	 * Reported so the form opens on what the user last typed rather than on the
	 * file name, which is the same reason the cover's own address is reported
	 * beside it, and so the screen can say when the words were matched from the
	 * audio instead.
	 */
	correctedTagsFor(status: VlcStatus): Promise<CorrectedTags | null>
}

/**
 * The corrected tags in the shape the renderer already reads resolved values
 * in. It is the same channel the video branch uses for a catalog title: what
 * the app is going to show, beside the raw name the file carries.
 */
function toAudioMetadata(tags: CorrectedTags): ContentMetadata {
	const metadata: ContentMetadata = {}

	if (tags.title !== undefined) {
		metadata.clean_title = tags.title
	}
	if (tags.artist !== undefined) {
		metadata.artist = tags.artist
	}

	return metadata
}

function reportOverrideTarget(info: DetectedMediaInfo, target: OverrideTarget | null): void {
	if (!target) return
	info.override_key = target.key
	info.override_active = target.active
	// What the key is bound to travels with it rather than being read back off
	// the key: the shapes are built in `main`, and a renderer that re-derived
	// them would be a second grammar to keep in step.
	info.override_binding = target.kind
}

export class MediaInfoHandler {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly music: OverrideTargets,
		private readonly vlc: VlcClient,
		private readonly imageProxy: ImageProxy,
		private readonly localVideoArtwork?: { fetch(status: VlcStatus): Promise<CoverOutcome> },
		private readonly episodeTitles?: EpisodeTitleLookup,
		private readonly retryLookup?: (status: VlcStatus) => Promise<void> | void,
		private readonly hasChosenFrame?: (key: string) => boolean,
	) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("media:get-info", async () => {
			try {
				const currentStatus = await this.vlc.readStatus(false)

				if (!currentStatus || !currentStatus.active) {
					return null
				}

				return await this.getMediaInfo(currentStatus)
			} catch (error) {
				logger.error(`Error getting media info: ${error}`)
				return null
			}
		})

		registerHandler("image:proxy", async (url) => {
			return await this.imageProxy.getImageAsDataUrl(url)
		})
		registerHandler("media:retry-lookup", async () => {
			const status = await this.vlc.readStatus(true)
			if (!status?.active || status.mediaType !== "video") return false
			await this.retryLookup?.(status)
			return true
		})
	}

	public async getMediaInfo(
		vlcStatus: VlcStatus | null,
	): Promise<(VlcStatus & DetectedMediaInfo) | null> {
		if (!vlcStatus) {
			return null
		}

		try {
			const mediaInfo: VlcStatus & DetectedMediaInfo = {
				...vlcStatus,
				media: { ...vlcStatus.media },
			}

			if (vlcStatus.mediaType === "audio") {
				const cover = await this.artwork.resolve(vlcStatus)
				if (cover) {
					mediaInfo.content_image_url = cover
				}

				// Audio text comes from the file's own tags, which the renderer already
				// has. A file with no tags is the exception: what it shows is what the
				// user typed, and that has to travel like any resolved title.
				mediaInfo.content_type = "audio"
				reportOverrideTarget(mediaInfo, await this.music.overrideTargetFor(vlcStatus))

				const corrected = await this.music.correctedTagsFor(vlcStatus)
				if (corrected) {
					mediaInfo.content_name_source = corrected.source
					// A refused match names nothing, so it reports the source alone:
					// an empty metadata object would read on the screen as a title and
					// an artist the app has and is not showing.
					if (corrected.title !== undefined || corrected.artist !== undefined) {
						mediaInfo.content_metadata = toAudioMetadata(corrected)
					}
				}
			}

			if (vlcStatus.mediaType === "video") {
				const localCover = await this.localVideoArtwork?.fetch(vlcStatus)
				const catalogResult = await this.catalog.resolve(vlcStatus)
				const videoName = vlcStatus.media.filename || vlcStatus.media.title || ""
				const parsed = parseVideo(videoName, vlcStatus.playback.duration)
				const diagnostic: NonNullable<DetectedMediaInfo["metadata_diagnostic"]> = {
					titleSource: catalogResult?.sourceName ?? (vlcStatus.media.showName ? "VLC" : "Filename"),
					episodeSource: null,
					episodeReason: "no-episode",
					imageSource: catalogResult?.poster ? (catalogResult.sourceName ?? "Catalog") : null,
				}
				if (catalogResult) {
					// A work can be identified without art, so the title and the kind
					// are reported whether or not a poster came with them.
					if (catalogResult.poster && localCover?.kind !== "publish-failed") {
						mediaInfo.content_image_url = catalogResult.poster
					}
					mediaInfo.content_type = toContentType(catalogResult.mediaKind)
					mediaInfo.content_metadata = toVideoMetadata(catalogResult, vlcStatus, parsed)
				} else {
					const metadata = localVideoMetadata(vlcStatus, parsed)
					if (metadata) {
						mediaInfo.content_type = "tv_show"
						mediaInfo.content_metadata = metadata
					}
				}
				if (mediaInfo.content_metadata && !mediaInfo.content_metadata.episode_title) {
					const result = await this.episodeTitles?.diagnose?.(vlcStatus, catalogResult)
					const title =
						result?.title ??
						(result ? null : await this.episodeTitles?.resolve(vlcStatus, catalogResult))
					if (title) {
						mediaInfo.content_metadata.episode_title = title
						diagnostic.episodeSource = result?.source ?? "Catalog"
						diagnostic.episodeReason = "found"
					} else {
						diagnostic.episodeReason = result?.reason ?? "not-found"
					}
				} else if (mediaInfo.content_metadata?.episode_title) {
					diagnostic.episodeSource = vlcStatus.media.episodeTitle ? "VLC" : "Filename"
					diagnostic.episodeReason = "local"
				}

				// Outside the branch above on purpose. A work the catalog identifies
				// as nothing is the case a correction is for, and since TMDB was
				// removed that is all of western film and television.
				reportOverrideTarget(mediaInfo, this.catalog.overrideTargetFor(vlcStatus))
				if (mediaInfo.override_active) diagnostic.titleSource = "Correction"

				if (localCover?.kind === "published") {
					mediaInfo.content_image_url = localCover.url
					diagnostic.imageSource = "Local artwork"
				}
				const frameKey = episodeFrameKey(vlcStatus, catalogResult)
				if (frameKey && this.hasChosenFrame?.(frameKey)) {
					diagnostic.imageSource = "Chosen video frame"
				}
				mediaInfo.metadata_diagnostic = diagnostic
			}

			if (mediaInfo.media?.artworkUrl) {
				const dataUrl = await this.imageProxy.getImageAsDataUrl(mediaInfo.media.artworkUrl)
				if (dataUrl) {
					mediaInfo.media.artworkUrl = dataUrl
				}
			}

			if (mediaInfo.content_image_url) {
				mediaInfo.content_image_source_url = mediaInfo.content_image_url

				const dataUrl = await this.imageProxy.getImageAsDataUrl(mediaInfo.content_image_url)
				if (dataUrl) {
					mediaInfo.content_image_url = dataUrl
				}
			}

			return mediaInfo
		} catch (error) {
			logger.error(`Error processing media info: ${error}`)
			return vlcStatus
		}
	}
}
