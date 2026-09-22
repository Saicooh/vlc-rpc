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

const WIKIPEDIA_TIMEOUT_MS = 5000
const TVMAZE_TIMEOUT_MS = 5000
const VIDEO_CACHE_TTL_SECONDS = 10 * 60
const VIDEO_MISS_TTL_SECONDS = 30
const TVMAZE_SEARCH_URL = "https://api.tvmaze.com/singlesearch/shows?q="
const CAMEL_POSSESSIVE = /\b([A-Z][a-z]{1,})([A-Z][a-z]{1,})s\b/g

interface TvMazeShow {
	name: string
	url?: string | null
	image?: { original?: string | null; medium?: string | null } | null
}

interface WikipediaPage {
	title: string
	missing?: boolean
	thumbnail?: { source?: string; width?: number; height?: number }
}

interface WikipediaReply {
	query?: {
		redirects?: Array<{ from: string; to: string }>
		pages?: WikipediaPage[]
	}
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

/** Video artwork uses named catalogs and Wikipedia's page image API as a fallback. */
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

		const result = await this.fetchWikipediaPoster(parsed)
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

	private async fetchWikipediaPoster(parsed: ParsedVideo): Promise<VideoCoverResult> {
		const isSeries = parsed.season !== undefined || parsed.episode !== undefined
		const titles = isSeries
			? [`${parsed.title} (TV series)`, `${parsed.title} (television series)`]
			: [
					...(parsed.year ? [`${parsed.title} (${parsed.year} film)`] : []),
					`${parsed.title} (film)`,
				]
		const query = new URLSearchParams({
			action: "query",
			format: "json",
			formatversion: "2",
			prop: "pageimages",
			pithumbsize: "512",
			pilicense: "any",
			redirects: "1",
			titles: titles.join("|"),
		})
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), WIKIPEDIA_TIMEOUT_MS)

		try {
			const response = await fetch(`https://en.wikipedia.org/w/api.php?${query}`, {
				headers: { "User-Agent": "VLCDiscordRP/5.0 (https://github.com/Saicooh/vlc-rpc)" },
				signal: controller.signal,
			})
			if (!response.ok) return emptyResult()
			const reply = (await response.json()) as WikipediaReply
			const redirects = new Map(reply.query?.redirects?.map(({ from, to }) => [from, to]))
			for (const title of titles) {
				const resolved = redirects.get(title) ?? title
				const page = reply.query?.pages?.find(
					(candidate) => candidate.title === resolved && !candidate.missing,
				)
				const image = page?.thumbnail?.source
				if (
					image &&
					usableImageUrl(image) &&
					(page?.thumbnail?.width ?? 0) >= 100 &&
					(page?.thumbnail?.height ?? 0) >= 100
				) {
					return {
						imageUrl: image,
						sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
						sourceName: "Wikipedia",
						canonicalTitle: null,
					}
				}
			}
			return emptyResult()
		} catch (error) {
			logger.warn(`Wikipedia video cover lookup failed: ${error}`)
			return emptyResult()
		} finally {
			clearTimeout(timeoutId)
		}
	}
}
