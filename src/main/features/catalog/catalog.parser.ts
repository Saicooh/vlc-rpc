import { filenameParse } from "@ctrl/video-filename-parser"
import type { ParsedVideo } from "./catalog.types"

type ParsedFilename = import("@ctrl/video-filename-parser").ParsedFilename
type ParsedShow = import("@ctrl/video-filename-parser").ParsedShow

const GROUP_TAG_PREFIX = /^\[[^\]]+\]/
const SEASON_EPISODE = /\bS\d{1,2}E\d{1,3}\b/i
const YEAR = /\b(19|20)\d{2}\b/
const LEADING_DASH = /^-\s*/
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/
const TRAILING_EMPTY_BRACKETS = /\s*\[\s*\]\s*$/
const TRAILING_OPEN_BRACKET = /\s*[([{]\s*$/
const TRAILING_FORMAT_DESCRIPTOR = /[-–—]\s*(?:the\s+movie|movie|film|ova|ona|sp|specials?)\s*$/i
const VIDEO_EXTENSION = /\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i
const EPISODE_MARKER = /\bS\d{1,2}E\d{1,3}\b/i
const TRAILING_ABSOLUTE_EPISODE = /\s[-–—]\s*(\d{1,3})\s*$/
const EPISODE_RELEASE_NOISE =
	/\b(?:\d{3,4}p|4K|UHD|WEB(?:-DL|RIP)?|WEB|NF|AMZN|CR|BD|BDRIP|BLURAY|BLU-RAY|HEVC|x264|x265|AAC|FLAC|DUAL|DUBBED?|SUBBED?|MULTI|REMUX|HDR|SDR|DD(?:P)?(?:5|7)?(?:[.\s]?1)?)\b.*$/i
const TV_DURATION_LIMIT_SECONDS = 90 * 60

// The library only reads S02 style seasons, so fansub markers stay glued to the
// title. Keep this narrow: the digits must carry a keyword or the S prefix, or a
// title that simply ends in a number (Mob Psycho 100, Steins;Gate 0, 86) loses it.
const TRAILING_SEASON =
	/\s+(?:(?:season|part)\s*(\d{1,2})|s(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+season)\s*$/i

function isParsedShow(parsed: ParsedFilename): parsed is ParsedShow {
	return "isTv" in parsed && parsed.isTv === true
}

function classifySignal(filename: string): ParsedVideo["signal"] {
	const hasGroupTag = GROUP_TAG_PREFIX.test(filename)
	const hasSeasonEpisode = SEASON_EPISODE.test(filename)
	if (hasGroupTag && hasSeasonEpisode) return "ambiguous"
	if (hasGroupTag) return "fansub"
	return "western"
}

// Only a marker at the very end is a season: in the middle it belongs to the
// title, as in "Made in Abyss Season 2 The Golden City".
function takeTrailingSeason(title: string): { season: number; title: string } | undefined {
	const match = title.match(TRAILING_SEASON)
	if (!match) return undefined

	const season = Number(match[1] ?? match[2] ?? match[3])
	const stripped = title.replace(TRAILING_SEASON, "").trim()
	if (!Number.isFinite(season) || stripped.length === 0) return undefined

	return { season, title: stripped }
}

function takeTrailingAbsoluteEpisode(
	filename: string,
): { episode: number; title: string } | undefined {
	const withoutExtension = filename.replace(VIDEO_EXTENSION, "")
	const match = withoutExtension.match(TRAILING_ABSOLUTE_EPISODE)
	if (!match || match.index === undefined) return undefined

	const episode = Number(match[1])
	const title = withoutExtension.slice(0, match.index).trim()
	if (!Number.isFinite(episode) || episode >= 1900 || title.length === 0) return undefined

	return { episode, title }
}

function cleanTitle(raw: string): string {
	return (
		raw
			// The library stripped the release group itself up to 5.4.1 and stopped
			// doing it later, so relying on that put "[SubsPlease]" in a title the
			// moment the range resolved higher. Ours to remove, in one regex we own.
			.replace(GROUP_TAG_PREFIX, "")
			.trim()
			.replace(/_+/g, " ")
			.replace(LEADING_DASH, "")
			.replace(TRAILING_PAREN, "")
			.replace(TRAILING_OPEN_BRACKET, "")
			.replace(TRAILING_EMPTY_BRACKETS, "")
			.replace(TRAILING_FORMAT_DESCRIPTOR, "")
			.trim()
	)
}

function stripDirectory(filename: string): string {
	const normalized = filename.replace(/\\/g, "/")
	const hasDrive = /^[A-Z]:\//i.test(normalized)
	const slashCount = (normalized.match(/\//g) ?? []).length

	if (!hasDrive && slashCount < 2 && !filename.includes("\\")) return filename

	return normalized.split("/").filter(Boolean).at(-1) ?? filename
}

function extractEpisodeSubtitle(filename: string): string | undefined {
	const normalized = filename.replace(VIDEO_EXTENSION, "").replace(/[._]/g, " ")
	const episode = normalized.match(EPISODE_MARKER)
	if (!episode || episode.index === undefined) return undefined

	let subtitle = normalized.slice(episode.index + episode[0].length)
	subtitle = subtitle.replace(/^[\s\-–—:]+/, "").replace(EPISODE_RELEASE_NOISE, "")
	subtitle = subtitle.replace(/\s{2,}/g, " ").trim()
	if (subtitle.split(/\s+/).filter(Boolean).length < 2) return undefined

	return subtitle === subtitle.toUpperCase()
		? subtitle.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
		: subtitle
}

// A movie mode parse of a fansub name can read a release hash as a year.
function toYear(raw: string | null | undefined): number | undefined {
	if (!raw) return undefined
	const value = Number(raw)
	return Number.isFinite(value) ? value : undefined
}

export function parse(filename: string, durationSeconds = 0): ParsedVideo {
	const actualFilename = stripDirectory(filename).replace(/_+/g, " ")
	const signal = classifySignal(actualFilename)
	const likelyTvShow = durationSeconds > 0 && durationSeconds < TV_DURATION_LIMIT_SECONDS
	const treatAsTv =
		signal === "fansub" ||
		signal === "ambiguous" ||
		SEASON_EPISODE.test(actualFilename) ||
		likelyTvShow

	let parsed = filenameParse(actualFilename, treatAsTv)
	let season: number | undefined
	let episode: number | undefined
	let title = parsed.title ?? ""

	if (treatAsTv && isParsedShow(parsed)) {
		const parsedSeason = parsed.seasons?.[0]
		const parsedEpisode = parsed.episodeNumbers?.[0]
		const validSeason = parsedSeason === undefined || parsedSeason < 19

		if (validSeason) {
			season = parsedSeason
			episode = parsedEpisode
		}
	}

	if (treatAsTv && season === undefined) {
		const bare = takeTrailingSeason(title)
		if (bare) {
			season = bare.season
			title = bare.title
		}
	}

	if (treatAsTv && signal !== "western" && episode === undefined && season === undefined) {
		const absolute = takeTrailingAbsoluteEpisode(actualFilename)
		if (absolute) {
			episode = absolute.episode
			title = absolute.title
		}
	}

	// A TV mode parse of a movie filename yields an empty title, so fall back to
	// movie mode whenever the TV attempt found neither a season nor an episode.
	if (episode === undefined && season === undefined && treatAsTv) {
		parsed = filenameParse(actualFilename, false)
		title = parsed.title ?? ""
	}

	let year = toYear(parsed.year)

	if (year === undefined) {
		const yearMatch = actualFilename.match(YEAR)
		if (yearMatch) {
			year = Number(yearMatch[0])
			title = title.replace(new RegExp(String.raw`\s*${yearMatch[0]}\s*$`), "")
		}
	}

	return {
		title: cleanTitle(title),
		subtitle: extractEpisodeSubtitle(actualFilename),
		season,
		episode,
		year,
		signal,
	}
}
