import { logger } from "@main/core/logger"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { parse, takeTrailingSeason } from "./catalog.parser"
import type { CatalogResult } from "./catalog.types"

const TVMAZE_SEARCH = "https://api.tvmaze.com/singlesearch/shows?q="
const ANILIST_ENDPOINT = "https://graphql.anilist.co"
const ANILIST_EPISODES = "query ($id: Int) { Media(id: $id) { streamingEpisodes { title site } } }"
const JUSTWATCH_ENDPOINT = "https://apis.justwatch.com/graphql"
const JUSTWATCH_SEARCH = `
	query EpisodeTitleSearch(
		$searchTitlesFilter: TitleFilter!
		$country: Country!
		$first: Int!
	) {
		popularTitles(
			country: $country
			filter: $searchTitlesFilter
			first: $first
			sortBy: POPULAR
			sortRandomSeed: 0
		) {
			edges {
				node { id }
			}
		}
	}`
const JUSTWATCH_EPISODES = `
	query EpisodeTitleShow($nodeId: ID!, $country: Country!, $language: Language!) {
		node(id: $nodeId) {
			... on Show {
				seasons(sortDirection: ASC) {
					content(country: $country, language: $language) {
						... on SeasonContent { seasonNumber }
					}
					episodes(sortDirection: ASC) {
						content(country: $country, language: $language) {
							title
							... on EpisodeContent { seasonNumber episodeNumber }
						}
					}
				}
			}
		}
	}`
const REQUEST_TIMEOUT_MS = 4000
const HIT_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 100

interface TvMazeShow {
	id?: number
	name?: string
}

interface TvMazeAlias {
	name?: string
}

interface TvMazeSeason {
	number?: number
}

interface EpisodeReply {
	name?: string | null
}

interface StreamingEpisode {
	title?: string | null
	site?: string | null
}

interface JustWatchSearchReply {
	data?: {
		popularTitles?: {
			edges?: Array<{ node?: { id?: string | null } | null }> | null
		} | null
	}
}

interface JustWatchEpisodeContent {
	title?: string | null
	seasonNumber?: number | null
	episodeNumber?: number | null
}

interface JustWatchSeason {
	content?: { seasonNumber?: number | null } | null
	episodes?: Array<{ content?: JustWatchEpisodeContent | null }> | null
}

interface JustWatchEpisodesReply {
	data?: {
		node?: { seasons?: JustWatchSeason[] | null } | null
	}
}

export interface EpisodeTitleLookup {
	resolve(status: VlcStatus, catalog: CatalogResult | null): Promise<string | null>
}

function words(title: string): string[] {
	return title
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
}

function sameShow(requested: string, found: string): boolean {
	const requestedWords = words(requested)
	const foundWords = words(found)
	if (requestedWords.join("") === foundWords.join("")) return true
	return (
		requestedWords.length >= 2 &&
		requestedWords.join("").length >= 6 &&
		requestedWords.every((word, index) => foundWords[index] === word)
	)
}

function actualTitle(value: string | null | undefined, episode: number): string | null {
	const title = value?.trim()
	if (!title) return null
	if (/^(?:episode|episodio|cap[ií]tulo)\s+\d+(?:\s*\([^)]*\))?$/i.test(title)) return null
	if (/^(?:e(?:pisode)?|ep(?:isode)?|episodio|cap[ií]tulo)\s*\d+$/i.test(title)) return null
	if (title === String(episode)) return null
	return title
}

function anilistId(sourceUrl: string | undefined): number | null {
	const match = sourceUrl?.match(/^https:\/\/(?:www\.)?anilist\.co\/anime\/(\d+)(?:\/|$)/i)
	return match ? Number(match[1]) : null
}

export class EpisodeTitleResolver implements EpisodeTitleLookup {
	private readonly cache = new Map<string, { value: string | null; expiresAt: number }>()
	private readonly inflight = new Map<string, Promise<string | null>>()
	private readonly preferSpanish: () => boolean

	public constructor(preferSpanish: () => boolean = () => false) {
		this.preferSpanish = preferSpanish
	}

	public async resolve(status: VlcStatus, catalog: CatalogResult | null): Promise<string | null> {
		if (status.mediaType !== "video" || catalog?.mediaKind === "movie") return null
		const filename = status.media.filename || status.media.title || ""
		const parsed = parse(filename, status.playback.duration)
		if (status.media.episodeTitle || parsed.subtitle) return null
		const season = status.media.season ?? catalog?.season ?? parsed.season
		const episode = status.media.episode ?? catalog?.episode ?? parsed.episode
		if (episode === undefined || episode < 1) return null

		const titles = [
			catalog?.title,
			status.media.showName,
			parsed.title,
			...(parsed.title ? [] : [status.media.title]),
		].filter((title): title is string => Boolean(title?.trim()))
		const candidates = [
			...new Set(
				titles.flatMap((title) => {
					const trailingSeason = takeTrailingSeason(title)
					return trailingSeason && trailingSeason.season === season
						? [title, trailingSeason.title]
						: [title]
				}),
			),
		]
		const id = anilistId(catalog?.sourceUrl)
		const preferSpanish = this.preferSpanish()
		const key = `${preferSpanish ? "es" : "en"}|${candidates.map((title) => words(title).join("")).join("|")}|${season ?? "absolute"}|${episode}|${id ?? ""}`
		const cached = this.cache.get(key)
		if (cached && Date.now() < cached.expiresAt) return cached.value
		const pending = this.inflight.get(key)
		if (pending) return pending

		const lookup = this.lookup(candidates, season, episode, id, preferSpanish)
		this.inflight.set(key, lookup)
		try {
			const value = await lookup
			this.cache.set(key, {
				value,
				expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS),
			})
			if (this.cache.size > MAX_CACHE_ENTRIES) {
				const oldest = this.cache.keys().next().value
				if (oldest) this.cache.delete(oldest)
			}
			return value
		} finally {
			this.inflight.delete(key)
		}
	}

	private async lookup(
		titles: string[],
		season: number | undefined,
		episode: number,
		id: number | null,
		preferSpanish: boolean,
	): Promise<string | null> {
		if (season !== undefined && season < 1) return null
		if (preferSpanish) {
			try {
				const localized = await this.fromJustWatch(titles, season, episode)
				if (localized) return localized
			} catch (error) {
				logger.warn(`JustWatch Spanish episode title lookup failed: ${error}`)
			}
		}
		if (season === undefined && id !== null) {
			try {
				const streamingTitle = await this.fromAniList(id, episode)
				if (streamingTitle) return streamingTitle
			} catch (error) {
				logger.warn(`AniList episode title lookup failed: ${error}`)
			}
		}
		for (const title of titles) {
			try {
				const found = await this.fromTvMaze(title, season, episode)
				if (found) return found
			} catch (error) {
				logger.warn(`TVMaze episode title lookup failed: ${error}`)
			}
		}
		return null
	}

	private async fromJustWatch(
		titles: string[],
		season: number | undefined,
		episode: number,
	): Promise<string | null> {
		for (const title of titles.slice(0, 2)) {
			const searchResponse = await this.get(JUSTWATCH_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JUSTWATCH_SEARCH,
					variables: {
						searchTitlesFilter: { searchQuery: title, objectTypes: ["SHOW"] },
						country: "ES",
						first: 3,
					},
				}),
			})
			if (!searchResponse?.ok) continue
			const search = (await searchResponse.json()) as JustWatchSearchReply
			const showId = search.data?.popularTitles?.edges?.[0]?.node?.id
			if (!showId) continue

			const episodesResponse = await this.get(JUSTWATCH_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JUSTWATCH_EPISODES,
					variables: { nodeId: showId, country: "ES", language: "es" },
				}),
			})
			if (!episodesResponse?.ok) continue
			const show = (await episodesResponse.json()) as JustWatchEpisodesReply
			const seasons = show.data?.node?.seasons ?? []
			const regularSeasons = seasons.filter((item) => (item.content?.seasonNumber ?? 0) > 0)
			const selected =
				season === undefined
					? regularSeasons.length === 1
						? regularSeasons[0]
						: undefined
					: regularSeasons.find((item) => item.content?.seasonNumber === season)
			if (!selected) continue
			const found = selected.episodes?.find(
				(item) =>
					item.content?.episodeNumber === episode &&
					(season === undefined || item.content.seasonNumber === season),
			)
			const localized = actualTitle(found?.content?.title, episode)
			if (localized) return localized
		}
		return null
	}

	private async fromTvMaze(
		title: string,
		season: number | undefined,
		episode: number,
	): Promise<string | null> {
		const showResponse = await this.get(`${TVMAZE_SEARCH}${encodeURIComponent(title)}`)
		if (!showResponse?.ok) return null
		const show = (await showResponse.json()) as TvMazeShow
		if (!show.id || !show.name) return null
		if (!sameShow(title, show.name)) {
			const aliasesResponse = await this.get(`https://api.tvmaze.com/shows/${show.id}/akas`)
			if (!aliasesResponse?.ok) return null
			const aliases = (await aliasesResponse.json()) as TvMazeAlias[]
			if (
				!Array.isArray(aliases) ||
				!aliases.some((alias) => alias.name && sameShow(title, alias.name))
			) {
				return null
			}
		}

		if (season === undefined) {
			const seasonsResponse = await this.get(`https://api.tvmaze.com/shows/${show.id}/seasons`)
			if (!seasonsResponse?.ok) return null
			const seasons = (await seasonsResponse.json()) as TvMazeSeason[]
			const regularSeasons = Array.isArray(seasons)
				? seasons.filter((item) => item.number !== 0)
				: []
			if (regularSeasons.length !== 1 || regularSeasons[0]?.number !== 1) return null
		}

		const url = `https://api.tvmaze.com/shows/${show.id}/episodebynumber?season=${season ?? 1}&number=${episode}`
		const episodeResponse = await this.get(url)
		if (!episodeResponse?.ok) return null
		const found = (await episodeResponse.json()) as EpisodeReply
		return actualTitle(found.name, episode)
	}

	private async fromAniList(id: number, episode: number): Promise<string | null> {
		const response = await this.get(ANILIST_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: ANILIST_EPISODES, variables: { id } }),
		})
		if (!response?.ok) return null
		const body = (await response.json()) as {
			data?: { Media?: { streamingEpisodes?: StreamingEpisode[] | null } | null }
		}
		const matches = (body.data?.Media?.streamingEpisodes ?? [])
			.map((item) => {
				const match = item.title?.match(/^Episode\s+(\d+)\s*[-–—:]\s*(.+)$/i)
				return match && Number(match[1]) === episode
					? { title: actualTitle(match[2], episode), site: item.site }
					: null
			})
			.filter((item): item is { title: string; site: string | null | undefined } =>
				Boolean(item?.title),
			)
		const crunchyroll = matches.find((item) => item.site?.toLocaleLowerCase() === "crunchyroll")
		return crunchyroll?.title ?? (matches.length === 1 ? (matches[0]?.title ?? null) : null)
	}

	private async get(url: string, init: RequestInit = {}): Promise<Response | null> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		try {
			return await fetch(url, { ...init, signal: controller.signal })
		} finally {
			clearTimeout(timeoutId)
		}
	}
}
