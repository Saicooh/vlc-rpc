import { logger } from "@main/core/logger"
import type { AniListProvider } from "@main/features/catalog"
import { parse } from "@main/features/catalog/catalog.parser"
import type { Candidate, CatalogResult, ParsedVideo } from "@main/features/catalog/catalog.types"
import { bluRayFolderTitle, isBluRaySource } from "@shared/vlc/bluray"
import type { VlcStatus } from "@shared/vlc/vlc.types"

export interface VideoCoverResult {
	imageUrl: string | null
	sourceUrl: string | null
	sourceName: string | null
	canonicalTitle: string | null
}

interface CachedVideoCover extends VideoCoverResult {
	timestamp: number
	ttl: number
}

const GOOGLE_TIMEOUT_MS = 5000
const TVMAZE_TIMEOUT_MS = 5000
const VIDEO_CACHE_TTL_SECONDS = 10 * 60
const VIDEO_MISS_TTL_SECONDS = 30
const IMDB_SEARCH_URL = "https://www.imdb.com/find/?q="
const TVMAZE_SEARCH_URL = "https://api.tvmaze.com/singlesearch/shows?q="
const CAMEL_POSSESSIVE = /\b([A-Z][a-z]{1,})([A-Z][a-z]{1,})s\b/g

interface TvMazeShow {
	name: string
	url?: string | null
	image?: { original?: string | null; medium?: string | null } | null
}

function emptyResult(): VideoCoverResult {
	return { imageUrl: null, sourceUrl: null, sourceName: null, canonicalTitle: null }
}

function usableImageUrl(value: string | null | undefined): value is string {
	if (!value) return false
	try {
		const { protocol } = new URL(value)
		return protocol === "http:" || protocol === "https:"
	} catch {
		return false
	}
}

function anilistSearchTitles(parsed: ParsedVideo): string[] {
	const titles = [...(parsed.subtitle ? [`${parsed.title} ${parsed.subtitle}`] : []), parsed.title]
	const variants = titles.flatMap((title) => [title, title.replace(CAMEL_POSSESSIVE, "$1$2")])
	return [...new Set(variants)]
}

/** Extract the first content image without adding a DOM parser just for Google fallback HTML. */
export function extractGoogleImageUrl(html: string): string | null {
	const directImages = [...html.matchAll(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)]
		.map((match) => match[1])
		.filter((url): url is string => usableImageUrl(url))

	const gstatic = directImages.find((url) => url.includes("gstatic.com") && !url.endsWith(".gif"))
	if (gstatic) return gstatic

	const scriptImages = html.match(/https?:\/\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png)(?:\?[^"'\\\s<>]*)?/gi)

	return (
		scriptImages?.find(
			(url) => usableImageUrl(url) && !/icon|emoji|favicon|logo|button/i.test(url),
		) ?? null
	)
}

/** Video artwork keeps the old AniList-first, IMDb-linked fallback behavior. */
export class VideoResolver {
	private readonly cache = new Map<string, CachedVideoCover>()

	constructor(private readonly anilist: Pick<AniListProvider, "searchBest">) {}

	public async resolve(
		status: VlcStatus,
		catalogResult: CatalogResult | null = null,
	): Promise<VideoCoverResult> {
		if (status.mediaType !== "video") return emptyResult()
		if (isBluRaySource(status.media.sourceUri) && !bluRayFolderTitle(status.media.sourceUri))
			return emptyResult()

		const sourceName = status.media.filename || status.media.title || ""
		const parsed = parse(sourceName, status.playback.duration)
		if (!parsed.title || parsed.title === "Unknown") return emptyResult()

		const key = `${parsed.title.toLowerCase().trim()}|${parsed.year ?? ""}`
		const cached = this.cache.get(key)
		if (cached && Math.floor(Date.now() / 1000) - cached.timestamp < cached.ttl) {
			return {
				imageUrl: cached.imageUrl,
				sourceUrl: cached.sourceUrl,
				sourceName: cached.sourceName,
				canonicalTitle: cached.canonicalTitle,
			}
		}
		this.cache.delete(key)

		if (catalogResult?.poster) {
			const result: VideoCoverResult = {
				imageUrl: catalogResult.poster,
				sourceUrl: catalogResult.sourceUrl ?? null,
				sourceName: catalogResult.sourceName ?? null,
				canonicalTitle: catalogResult.title,
			}
			this.cacheResult(key, result)
			return result
		}

		try {
			for (const title of anilistSearchTitles(parsed)) {
				const anilistResult = await this.anilist.searchBest(title)
				if (anilistResult?.posterUrl) {
					const result = this.fromCandidate(anilistResult)
					this.cacheResult(key, result)
					return result
				}
			}
		} catch (error) {
			logger.warn(`Video AniList cover lookup failed: ${error}`)
		}

		if (parsed.season !== undefined || parsed.episode !== undefined) {
			const tvMazeShow = await this.fetchTvMazeShow(parsed.title)
			if (tvMazeShow) {
				const imageUrl = [tvMazeShow.image?.original, tvMazeShow.image?.medium].find(
					(value): value is string => usableImageUrl(value),
				)
				const sourceUrl = usableImageUrl(tvMazeShow.url) ? tvMazeShow.url : null
				const result: VideoCoverResult = {
					imageUrl: imageUrl ?? null,
					sourceUrl,
					sourceName: sourceUrl ? "TVMaze" : null,
					canonicalTitle: tvMazeShow.name,
				}
				this.cacheResult(key, result)
				return result
			}
		}

		const searchTerm =
			parsed.season !== undefined || parsed.episode !== undefined
				? `${parsed.title} tv show poster`
				: `${parsed.title}${parsed.year ? ` ${parsed.year}` : ""} movie poster`
		const imageUrl = await this.fetchImageFromGoogle(searchTerm)
		const result: VideoCoverResult = {
			imageUrl,
			sourceUrl: imageUrl ? `${IMDB_SEARCH_URL}${encodeURIComponent(parsed.title)}` : null,
			sourceName: imageUrl ? "IMDB" : null,
			canonicalTitle: null,
		}
		this.cacheResult(key, result)
		return result
	}

	private async fetchTvMazeShow(title: string): Promise<TvMazeShow | null> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), TVMAZE_TIMEOUT_MS)

		try {
			const response = await fetch(`${TVMAZE_SEARCH_URL}${encodeURIComponent(title)}`, {
				signal: controller.signal,
			})
			if (!response.ok) return null

			const show = (await response.json()) as TvMazeShow
			return show.name ? show : null
		} catch (error) {
			logger.warn(`TVMaze video lookup failed: ${error}`)
			return null
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private fromCandidate(candidate: Candidate): VideoCoverResult {
		return {
			imageUrl: candidate.posterUrl,
			sourceUrl: candidate.sourceUrl ?? `https://anilist.co/anime/${candidate.id}`,
			sourceName: candidate.sourceName ?? "AniList",
			canonicalTitle: candidate.title,
		}
	}

	private cacheResult(key: string, result: VideoCoverResult): void {
		this.cache.set(key, {
			...result,
			timestamp: Math.floor(Date.now() / 1000),
			ttl: result.imageUrl ? VIDEO_CACHE_TTL_SECONDS : VIDEO_MISS_TTL_SECONDS,
		})

		if (this.cache.size > 50) {
			const oldestKey = this.cache.keys().next().value
			if (oldestKey) this.cache.delete(oldestKey)
		}
	}

	private async fetchImageFromGoogle(searchTerm: string): Promise<string | null> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS)

		try {
			const response = await fetch(
				`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}&tbm=isch`,
				{
					headers: {
						"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
						Accept: "text/html,application/xhtml+xml",
					},
					signal: controller.signal,
				},
			)
			if (!response.ok) return null
			return extractGoogleImageUrl(await response.text())
		} catch (error) {
			logger.warn(`Google video cover lookup failed: ${error}`)
			return null
		} finally {
			clearTimeout(timeoutId)
		}
	}
}
