import { logger } from "@main/core/logger"
import type { Override, OverrideTarget, VideoOverride } from "@main/features/overrides"
import { bluRayFolderTitle, isBluRaySource } from "@shared/vlc/bluray"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Cache } from "./catalog.cache"
import { catalogKey } from "./catalog.key"
import { readNumberedMovie } from "./catalog.movie"
import { parse } from "./catalog.parser"
import { matchesSeason, pickBest } from "./catalog.scorer"
import type {
	CachedWork,
	Candidate,
	CatalogProvider,
	CatalogResult,
	ParsedVideo,
} from "./catalog.types"

/** The corrections the user typed by hand, keyed the way this feature keys. */
export interface OverrideSource {
	get(key: string): Override | null
	/** Whether a save under this key would be taken, asked before offering it. */
	accepts(key: string): boolean
}

/**
 * A partial override composes with the local parse, never with a resolution.
 * Falling back to the providers for the fields it leaves out would spend the
 * request the override exists to avoid, and would make the same override answer
 * differently depending on what the cache happened to hold. The form is
 * prefilled with what the app deduced, so keeping a deduced cover is a matter of
 * saving it, not of leaving the field empty.
 */
function applyOverride(override: VideoOverride, parsed: ParsedVideo): CachedWork {
	// The same test `presence.state.ts` applies when there is no catalog result
	// at all, so an override that omits the kind formats exactly as the filename
	// alone would have.
	const parsedKind = parsed.season !== undefined || parsed.episode !== undefined ? "tv" : "movie"

	return {
		title: override.title || parsed.title,
		poster: override.cover ?? null,
		mediaKind: override.mediaKind ?? parsedKind,
	}
}

function videoNameFor(status: VlcStatus): string | undefined {
	if (isBluRaySource(status.media.sourceUri) && !bluRayFolderTitle(status.media.sourceUri)) {
		// Every disc has an index.bdmv. Its volume label is the only identity we
		// have for a correction; if VLC reports none, do not file one at all.
		return status.media.title && status.media.title !== "Unknown" ? status.media.title : undefined
	}
	return status.media.filename || status.media.title
}

export class Resolver {
	private readonly inflight = new Map<string, Promise<CatalogResult | null>>()

	constructor(
		private readonly cache: Cache,
		private readonly anilist: CatalogProvider,
		private readonly overrides: OverrideSource,
	) {}

	public async resolve(status: VlcStatus): Promise<CatalogResult | null> {
		const videoName = videoNameFor(status)
		if (status.mediaType !== "video" || !videoName) {
			return null
		}

		const parsed = parse(videoName, status.playback.duration)
		const key = catalogKey(parsed)

		// Ahead of the cache on purpose: the user already answered this question,
		// so there is nothing to look up and no provider worth asking.
		const override = this.overrides.get(key)
		if (override?.kind === "video") {
			const work = applyOverride(override, parsed)
			return { ...work, season: parsed.season, episode: parsed.episode }
		}

		// A disc root only gives us a volume/product code. Searching that as a
		// film title produced unrelated matches; a manual correction still wins above.
		if (isBluRaySource(status.media.sourceUri) && !bluRayFolderTitle(status.media.sourceUri)) {
			return null
		}

		const cached = this.cache.get(key)
		if (cached) {
			if (cached.status === "resolved") {
				return { ...cached.work, season: parsed.season, episode: parsed.episode }
			}
			return null
		}

		const existing = this.inflight.get(key)
		if (existing) {
			const result = await existing
			return result ? { ...result, season: parsed.season, episode: parsed.episode } : null
		}

		const promise = this.resolveUncached(parsed, key)
		this.inflight.set(key, promise)

		try {
			return await promise
		} finally {
			this.inflight.delete(key)
		}
	}

	/**
	 * Where a correction for this file would be filed, without resolving it. The
	 * media that most needs a correction is the media `resolve` answers `null`
	 * for, so a key that travelled only with a result would omit exactly the
	 * files that need a correction.
	 *
	 * `null` when the store would turn the key down, so nothing offers the user a
	 * form that cannot be saved.
	 */
	public overrideTargetFor(status: VlcStatus): OverrideTarget | null {
		const videoName = videoNameFor(status)
		if (status.mediaType !== "video" || !videoName) {
			return null
		}

		const key = catalogKey(parse(videoName, status.playback.duration))
		if (!this.overrides.accepts(key)) {
			return null
		}

		// Always `metadata`: the key is what the parser read out of the file name,
		// and video has no second identity to fall back to. A file whose name
		// carries no title is still refused, which is what keeps one correction
		// from becoming the title of every unparseable file.
		return { kind: "metadata", key, active: this.overrides.get(key)?.kind === "video" }
	}

	/**
	 * Drops what was cached under the identity an override names, so removing the
	 * correction later shows what the app deduces now. A video override is filed
	 * under the very `catalogKey` the cache uses, so one delete is the whole job,
	 * and a key from another feature matches nothing here.
	 */
	public evictOverride(key: string): void {
		this.cache.delete(key)
	}

	/** Recheck the current file without removing any manual correction. */
	public async retryFor(status: VlcStatus): Promise<void> {
		const name = videoNameFor(status)
		if (status.mediaType === "video" && name) {
			const key = catalogKey(parse(name, status.playback.duration))
			// A lookup that started before the button press must not refill the cache afterward.
			await this.inflight.get(key)?.catch(() => undefined)
			this.cache.delete(key)
		}
	}

	private async resolveUncached(parsed: ParsedVideo, key: string): Promise<CatalogResult | null> {
		if (!parsed.title) {
			this.cache.setUnresolved(key, "parse-invalid")
			return null
		}

		// Naming style does not identify the content: ungrouped anime must be
		// searched too. The scorer still requires a close title or alias match.
		const providers = [this.anilist]
		const { candidates, allFailed } = await this.searchProviders(providers, parsed)
		let best = pickBest(parsed, candidates)
		const movie = readNumberedMovie(parsed.title)
		if (!allFailed && !best && movie) {
			// AniList may index the film under its translated subtitle. Search the
			// franchise once, then score its aliases against the original film number.
			const franchise = await this.searchProviders(providers, { ...parsed, title: movie.series })
			if (franchise.allFailed) {
				this.cache.setUnresolved(key, "provider-error")
				return null
			}
			candidates.push(...franchise.candidates)
			best = pickBest(parsed, candidates)
		}
		// A base-title search can fill its first page with the original season.
		// Ask once for the named sequel before accepting that franchise fallback.
		if (
			!allFailed &&
			parsed.season !== undefined &&
			parsed.season > 1 &&
			(!best || !matchesSeason(parsed, best))
		) {
			const sequel = await this.searchProviders(providers, {
				...parsed,
				title: `${parsed.title} Season ${parsed.season}`,
			})
			candidates.push(...sequel.candidates)
			best = pickBest(parsed, candidates)
		}
		if (candidates.length === 0) {
			this.cache.setUnresolved(key, allFailed ? "provider-error" : "no-results")
			return null
		}
		if (!best) {
			this.cache.setUnresolved(key, "no-match")
			return null
		}

		const work: CachedWork = {
			title: best.title,
			poster: best.posterUrl,
			mediaKind: best.mediaKind,
			...(best.sourceUrl ? { sourceUrl: best.sourceUrl } : {}),
			...(best.sourceName ? { sourceName: best.sourceName } : {}),
		}
		this.cache.setResolved(key, work)
		return { ...work, season: parsed.season, episode: parsed.episode }
	}

	private async searchProviders(
		providers: CatalogProvider[],
		parsed: ParsedVideo,
	): Promise<{ candidates: Candidate[]; allFailed: boolean }> {
		const results = await Promise.allSettled(
			providers.map((provider) => provider.search(parsed.title)),
		)

		const candidates: Candidate[] = []
		let failures = 0
		for (const result of results) {
			if (result.status === "fulfilled") {
				candidates.push(...result.value)
			} else {
				failures++
				logger.warn(`Catalog provider search failed: ${result.reason}`)
			}
		}

		return { candidates, allFailed: failures === providers.length }
	}
}
