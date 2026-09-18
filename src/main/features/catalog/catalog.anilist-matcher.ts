import type { Candidate } from "./catalog.types"

export interface AnilistSearchCandidate {
	value: string
	isSubtitleFallback: boolean
	seriesContext?: string
}

export interface AnilistAcceptedMatch {
	candidate: Candidate
	score: number
	searchCandidate: AnilistSearchCandidate
}

const FORMAT_DESCRIPTORS = new Set(["movie", "film", "ova", "ona", "sp", "special", "specials"])
const GENERIC_SUBTITLE_TOKENS = new Set([
	"a",
	"an",
	"the",
	"final",
	"season",
	"part",
	"chapter",
	"episode",
	"movie",
	"film",
	"sp",
	"special",
	"specials",
])
const DESCRIPTOR_PATTERN = /\b(?:the\s+movie|movie|film|ova|ona|sp|specials?|pel[ií]cula)\b/gi
const RELEASE_NOISE_PATTERN =
	/\b(?:\d{3,4}p|4k|uhd|web(?:-dl|rip)?|bdrip|bluray|blu-ray|hevc|x26[45]|aac|flac|dual|dub(?:bed)?|sub(?:bed)?|multi|remux|hdr|sdr)\b/gi

export function buildAnilistSearchCandidates(title: string): AnilistSearchCandidate[] {
	const cleanedTitle = cleanSearchText(title)
	const descriptorSplit = splitOnFormatDescriptor(cleanedTitle)
	const candidates: AnilistSearchCandidate[] = []

	const addCandidate = (
		value: string,
		isSubtitleFallback = false,
		seriesContext?: string,
	): void => {
		const cleanedValue = cleanSearchText(value)
		if (!cleanedValue) return

		const normalizedValue = normalizeQuery(cleanedValue)
		if (candidates.some((candidate) => normalizeQuery(candidate.value) === normalizedValue)) {
			return
		}

		candidates.push({
			value: cleanedValue,
			isSubtitleFallback,
			...(seriesContext ? { seriesContext } : {}),
		})
	}

	addCandidate(title, false, descriptorSplit?.series)
	addCandidate(cleanedTitle, false, descriptorSplit?.series)
	addCandidate(removeDescriptors(cleanedTitle), false, descriptorSplit?.series)

	if (descriptorSplit) {
		const { series, subtitle } = descriptorSplit
		addCandidate(`${series}: ${subtitle}`, false, series)
		addCandidate(`${series} ${subtitle}`, false, series)
		addCandidate(subtitle, true, series)
	}

	return candidates.slice(0, 8)
}

function normalizeQuery(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.toLowerCase()
		.replace(/\s{2,}/g, " ")
		.trim()
}

export function findBestAnilistMatch(
	originalTitle: string,
	searchCandidate: AnilistSearchCandidate,
	mediaResults: Candidate[],
): AnilistAcceptedMatch | null {
	let bestMatch: AnilistAcceptedMatch | null = null

	for (const candidate of mediaResults) {
		const titles = [candidate.title, ...candidate.aliases].filter(Boolean)
		const candidateScore = Math.max(
			...titles.map((title) => scoreTitle(searchCandidate.value, title)),
		)
		const originalScore = Math.max(...titles.map((title) => scoreTitle(originalTitle, title)))
		const seriesContextScore = searchCandidate.seriesContext
			? Math.max(...titles.map((title) => scoreTitle(searchCandidate.seriesContext ?? "", title)))
			: 0
		const score = Math.max(candidateScore, originalScore)

		if (!isAccepted(searchCandidate, candidateScore, originalScore, seriesContextScore, score)) {
			continue
		}

		if (!bestMatch || score > bestMatch.score) {
			bestMatch = { candidate, score, searchCandidate }
		}
	}

	return bestMatch
}

function cleanSearchText(value: string): string {
	return value
		.replace(/\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i, "")
		.replace(/\[[^\]]*\]/g, " ")
		.replace(/\((?!\d{4}\))[^)]*\)/g, " ")
		.replace(RELEASE_NOISE_PATTERN, " ")
		.replace(/[._]+/g, " ")
		.replace(/[\s\-–—]+$/g, "")
		.replace(/^[\s\-–—]+/g, "")
		.replace(/\s{2,}/g, " ")
		.trim()
}

function removeDescriptors(value: string): string {
	return value
		.replace(DESCRIPTOR_PATTERN, " ")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([:;,.!?])/g, "$1")
		.trim()
}

function splitOnFormatDescriptor(value: string): { series: string; subtitle: string } | null {
	const tokens = value.split(/\s+/).filter(Boolean)
	const descriptorIndex = tokens.findIndex((token) => FORMAT_DESCRIPTORS.has(normalizeToken(token)))

	if (descriptorIndex <= 0 || descriptorIndex >= tokens.length - 1) return null

	const series = tokens.slice(0, descriptorIndex).join(" ").trim()
	const subtitle = tokens
		.slice(descriptorIndex + 1)
		.join(" ")
		.trim()
	return series && subtitle ? { series, subtitle } : null
}

function isAccepted(
	candidate: AnilistSearchCandidate,
	candidateScore: number,
	originalScore: number,
	seriesContextScore: number,
	score: number,
): boolean {
	if (candidate.isSubtitleFallback) {
		return (
			hasSpecificSubtitle(candidate.value) &&
			candidateScore >= 0.8 &&
			originalScore >= 0.9 &&
			seriesContextScore >= 0.72
		)
	}

	if (candidate.seriesContext) return score >= 0.78 && seriesContextScore >= 0.72
	return score >= 0.78
}

function hasSpecificSubtitle(value: string): boolean {
	const normalized = normalizeText(value)
	const meaningfulTokens = normalized.tokens.filter((token) => !GENERIC_SUBTITLE_TOKENS.has(token))
	return normalized.compact.length >= 12 && meaningfulTokens.length >= 2
}

function scoreTitle(inputTitle: string, mediaTitle: string): number {
	const input = normalizeText(removeDescriptors(inputTitle))
	const media = normalizeText(removeDescriptors(mediaTitle))
	if (!input.compact || !media.compact) return 0
	if (input.compact === media.compact) return 1

	return Math.max(
		containmentScore(input.compact, media.compact),
		tokenCoverageScore(input.tokens, media.tokens),
		diceCoefficient(input.compact, media.compact),
	)
}

function normalizeText(value: string): { compact: string; tokens: string[] } {
	const normalized = value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.toLowerCase()
		.replace(/\s{2,}/g, " ")
		.trim()

	const tokens = normalized
		.split(/\s+/)
		.map(normalizeToken)
		.filter((token) => token && !FORMAT_DESCRIPTORS.has(token))

	return { compact: tokens.join(""), tokens }
}

function normalizeToken(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]/gu, "")
		.toLowerCase()
}

function containmentScore(left: string, right: string): number {
	const shorter = left.length <= right.length ? left : right
	const longer = left.length > right.length ? left : right
	if (shorter.length < 6 || !longer.includes(shorter)) return 0
	return 0.72 + 0.2 * (shorter.length / longer.length)
}

function tokenCoverageScore(inputTokens: string[], mediaTokens: string[]): number {
	if (inputTokens.length === 0 || mediaTokens.length === 0) return 0

	const inputCompact = inputTokens.join("")
	const mediaCompact = mediaTokens.join("")
	const matchedInput = inputTokens.filter((token) => mediaCompact.includes(token)).length
	const matchedMedia = mediaTokens.filter((token) => inputCompact.includes(token)).length
	return (matchedInput / inputTokens.length + matchedMedia / mediaTokens.length) / 2
}

function diceCoefficient(left: string, right: string): number {
	if (left.length < 2 || right.length < 2) return left === right ? 1 : 0

	const remaining = getBigrams(right)
	let intersection = 0
	for (const bigram of getBigrams(left)) {
		const index = remaining.indexOf(bigram)
		if (index >= 0) {
			intersection++
			remaining.splice(index, 1)
		}
	}

	return (2 * intersection) / (left.length - 1 + (right.length - 1))
}

function getBigrams(value: string): string[] {
	const bigrams: string[] = []
	for (let index = 0; index < value.length - 1; index++) {
		bigrams.push(value.slice(index, index + 2))
	}
	return bigrams
}
