import { logger } from "@main/core/logger"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { parse } from "./catalog.parser"
import type { CatalogResult } from "./catalog.types"

const TVMAZE_SEARCH = "https://api.tvmaze.com/singlesearch/shows?q="
const ANILIST_ENDPOINT = "https://graphql.anilist.co"
const ANILIST_EPISODES = "query ($id: Int) { Media(id: $id) { streamingEpisodes { title site } } }"
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
	if (!title || /^episode\s+\d+(?:\s*\([^)]*\))?$/i.test(title)) return null
	if (/^e(?:pisode)?\s*\d+$/i.test(title) || title === String(episode)) return null
	return title
}

function anilistId(sourceUrl: string | undefined): number | null {
	const match = sourceUrl?.match(/^https:\/\/(?:www\.)?anilist\.co\/anime\/(\d+)(?:\/|$)/i)
	return match ? Number(match[1]) : null
}

export class EpisodeTitleResolver implements EpisodeTitleLookup {
	private readonly cache = new Map<string, { value: string | null; expiresAt: number }>()
	private readonly inflight = new Map<string, Promise<string | null>>()

	public async resolve(status: VlcStatus, catalog: CatalogResult | null): Promise<string | null> {
		if (status.mediaType !== "video" || catalog?.mediaKind === "movie") return null
		const filename = status.media.filename || status.media.title || ""
		const parsed = parse(filename, status.playback.duration)
		if (status.media.episodeTitle || parsed.subtitle) return null
		const season = status.media.season ?? catalog?.season ?? parsed.season
		const episode = status.media.episode ?? catalog?.episode ?? parsed.episode
		if (episode === undefined || episode < 1) return null

		const title = status.media.showName || parsed.title || catalog?.title || ""
		const id = anilistId(catalog?.sourceUrl)
		const key = `${words(title).join("")}|${season ?? "absolute"}|${episode}|${id ?? ""}`
		const cached = this.cache.get(key)
		if (cached && Date.now() < cached.expiresAt) return cached.value
		const pending = this.inflight.get(key)
		if (pending) return pending

		const lookup = this.lookup(title, season, episode, id)
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
		title: string,
		season: number | undefined,
		episode: number,
		id: number | null,
	): Promise<string | null> {
		try {
			if (season !== undefined && season >= 1 && title.trim()) {
				return await this.fromTvMaze(title, season, episode)
			}
			if (season === undefined && id !== null) {
				try {
					const streamingTitle = await this.fromAniList(id, episode)
					if (streamingTitle) return streamingTitle
				} catch (error) {
					logger.warn(`AniList episode title lookup failed: ${error}`)
				}
			}
			if (season === undefined && title.trim()) {
				try {
					return await this.fromTvMaze(title, undefined, episode)
				} catch (error) {
					logger.warn(`TVMaze episode title lookup failed: ${error}`)
				}
			}
		} catch (error) {
			logger.warn(`Episode title lookup failed: ${error}`)
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
