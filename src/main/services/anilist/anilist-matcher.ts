export interface AnilistTitle {
	romaji: string | null
	english: string | null
	native: string | null
}

export interface AnilistCoverImage {
	extraLarge: string | null
	large: string | null
}

export interface AnilistMedia {
	id: number
	title: AnilistTitle | null
	synonyms: string[] | null
	coverImage: AnilistCoverImage | null
	siteUrl: string | null
}

export interface AnilistSearchCandidate {
	value: string
	isSubtitleFallback: boolean
	seriesContext?: string
}

export interface AnilistAcceptedMatch {
	media: AnilistMedia
	score: number
	candidate: AnilistSearchCandidate
	canonicalTitle: string
}

const ANILIST_FORMAT_DESCRIPTORS = new Set(["movie", "film", "ova", "ona", "special", "specials"])

const ANILIST_GENERIC_SUBTITLE_TOKENS = new Set([
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
	"special",
	"specials",
])

const ANILIST_DESCRIPTOR_PATTERN = /\b(?:the\s+movie|movie|film|ova|ona|specials?|pel[ií]cula)\b/gi

const ANILIST_RELEASE_NOISE_PATTERN =
	/\b(?:\d{3,4}p|4k|uhd|web(?:-dl|rip)?|bdrip|bluray|blu-ray|hevc|x26[45]|aac|flac|dual|dub(?:bed)?|sub(?:bed)?|multi|remux|hdr|sdr)\b/gi

export function buildAnilistSearchCandidates(title: string): AnilistSearchCandidate[] {
	const cleanedTitle = cleanAnilistSearchText(title)
	const descriptorSplit = splitOnFormatDescriptor(cleanedTitle)
	const seriesContext = descriptorSplit?.series
	const candidates: AnilistSearchCandidate[] = []
	const addCandidate = (
		value: string,
		isSubtitleFallback = false,
		seriesContext?: string,
	): void => {
		const cleanedValue = cleanAnilistSearchText(value)
		if (!cleanedValue) return

		const normalizedValue = normalizeAnilistText(cleanedValue).compact
		if (
			candidates.some(
				(candidate) => normalizeAnilistText(candidate.value).compact === normalizedValue,
			)
		) {
			return
		}

		candidates.push({ value: cleanedValue, isSubtitleFallback, seriesContext })
	}

	addCandidate(title, false, seriesContext)
	addCandidate(cleanedTitle, false, seriesContext)

	const withoutDescriptors = removeAnilistDescriptors(cleanedTitle)
	addCandidate(withoutDescriptors, false, seriesContext)

	if (descriptorSplit) {
		const { series, subtitle } = descriptorSplit
		addCandidate(`${series}: ${subtitle}`, false, series)
		addCandidate(`${series} ${subtitle}`, false, series)
		addCandidate(subtitle, true, series)
	}

	return candidates.slice(0, 8)
}

export function findBestAnilistMatch(
	originalTitle: string,
	candidate: AnilistSearchCandidate,
	mediaResults: AnilistMedia[],
): AnilistAcceptedMatch | null {
	let bestMatch: AnilistAcceptedMatch | null = null

	for (const media of mediaResults) {
		const canonicalTitle = getCanonicalAnilistTitle(media)
		if (!canonicalTitle) continue

		const titles = getAnilistComparableTitles(media)
		const candidateScore = Math.max(
			...titles.map((mediaTitle) => scoreAnilistTitle(candidate.value, mediaTitle)),
		)
		const originalScore = Math.max(
			...titles.map((mediaTitle) => scoreAnilistTitle(originalTitle, mediaTitle)),
		)
		const seriesContextScore = candidate.seriesContext
			? Math.max(
					...titles.map((mediaTitle) =>
						scoreAnilistTitle(candidate.seriesContext ?? "", mediaTitle),
					),
				)
			: 0
		const score = Math.max(candidateScore, originalScore)

		if (
			!isAnilistMatchAccepted(candidate, candidateScore, originalScore, seriesContextScore, score)
		) {
			continue
		}

		if (!bestMatch || score > bestMatch.score) {
			bestMatch = { media, score, candidate, canonicalTitle }
		}
	}

	return bestMatch
}

export function getCanonicalAnilistTitle(media: AnilistMedia): string | null {
	return media.title?.english || media.title?.romaji || null
}

export function getAnilistComparableTitles(media: AnilistMedia): string[] {
	const titles = [
		media.title?.romaji,
		media.title?.english,
		media.title?.native,
		...(media.synonyms ?? []),
	]

	return titles.filter((title): title is string => Boolean(title?.trim()))
}

function cleanAnilistSearchText(value: string): string {
	return value
		.replace(/\.(mkv|mp4|avi|wmv|flv|webm|m4v|mov|ts|mpg|mpeg)$/i, "")
		.replace(/\[[^\]]*\]/g, " ")
		.replace(/\((?!\d{4}\))[^)]*\)/g, " ")
		.replace(ANILIST_RELEASE_NOISE_PATTERN, " ")
		.replace(/[._]+/g, " ")
		.replace(/[\s\-–—]+$/g, "")
		.replace(/^[\s\-–—]+/g, "")
		.replace(/\s{2,}/g, " ")
		.trim()
}

function removeAnilistDescriptors(value: string): string {
	return value
		.replace(ANILIST_DESCRIPTOR_PATTERN, " ")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([:;,.!?])/g, "$1")
		.trim()
}

function splitOnFormatDescriptor(value: string): { series: string; subtitle: string } | null {
	const tokens = value.split(/\s+/).filter(Boolean)
	const descriptorIndex = tokens.findIndex((token) =>
		ANILIST_FORMAT_DESCRIPTORS.has(normalizeToken(token)),
	)

	if (descriptorIndex <= 0 || descriptorIndex >= tokens.length - 1) {
		return null
	}

	const series = tokens.slice(0, descriptorIndex).join(" ").trim()
	const subtitle = tokens
		.slice(descriptorIndex + 1)
		.join(" ")
		.trim()

	if (!series || !subtitle) {
		return null
	}

	return { series, subtitle }
}

function isAnilistMatchAccepted(
	candidate: AnilistSearchCandidate,
	candidateScore: number,
	originalScore: number,
	seriesContextScore: number,
	score: number,
): boolean {
	if (candidate.isSubtitleFallback) {
		return (
			hasSpecificSubtitleFallback(candidate.value) &&
			candidateScore >= 0.8 &&
			originalScore >= 0.9 &&
			seriesContextScore >= 0.72
		)
	}

	if (candidate.seriesContext) {
		return score >= 0.78 && seriesContextScore >= 0.72
	}

	return score >= 0.78
}

function hasSpecificSubtitleFallback(value: string): boolean {
	const normalized = normalizeAnilistText(value)
	const meaningfulTokens = normalized.tokens.filter(
		(token) => !ANILIST_GENERIC_SUBTITLE_TOKENS.has(token),
	)

	return normalized.compact.length >= 12 && meaningfulTokens.length >= 2
}

function scoreAnilistTitle(inputTitle: string, mediaTitle: string): number {
	const input = normalizeAnilistText(removeAnilistDescriptors(inputTitle))
	const media = normalizeAnilistText(removeAnilistDescriptors(mediaTitle))

	if (!input.compact || !media.compact) {
		return 0
	}

	if (input.compact === media.compact) {
		return 1
	}

	const compactContainment = getContainmentScore(input.compact, media.compact)
	const tokenCoverage = getTokenCoverageScore(input.tokens, media.tokens)
	const diceScore = getDiceCoefficient(input.compact, media.compact)

	return Math.max(compactContainment, tokenCoverage, diceScore)
}

function normalizeAnilistText(value: string): { compact: string; tokens: string[] } {
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
		.map((token) => normalizeToken(token))
		.filter((token) => token && !ANILIST_FORMAT_DESCRIPTORS.has(token))

	return {
		compact: tokens.join(""),
		tokens,
	}
}

function normalizeToken(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]/gu, "")
		.toLowerCase()
}

function getContainmentScore(left: string, right: string): number {
	const shorter = left.length <= right.length ? left : right
	const longer = left.length > right.length ? left : right

	if (shorter.length < 6 || !longer.includes(shorter)) {
		return 0
	}

	return 0.72 + 0.2 * (shorter.length / longer.length)
}

function getTokenCoverageScore(inputTokens: string[], mediaTokens: string[]): number {
	if (inputTokens.length === 0 || mediaTokens.length === 0) {
		return 0
	}

	const inputCompact = inputTokens.join("")
	const mediaCompact = mediaTokens.join("")
	const matchedInputTokens = inputTokens.filter((token) => mediaCompact.includes(token)).length
	const matchedMediaTokens = mediaTokens.filter((token) => inputCompact.includes(token)).length
	const inputCoverage = matchedInputTokens / inputTokens.length
	const mediaCoverage = matchedMediaTokens / mediaTokens.length

	return (inputCoverage + mediaCoverage) / 2
}

function getDiceCoefficient(left: string, right: string): number {
	if (left.length < 2 || right.length < 2) {
		return left === right ? 1 : 0
	}

	const leftBigrams = getBigrams(left)
	const rightBigrams = getBigrams(right)
	const remainingRightBigrams = [...rightBigrams]
	let intersection = 0

	for (const bigram of leftBigrams) {
		const index = remainingRightBigrams.indexOf(bigram)
		if (index >= 0) {
			intersection += 1
			remainingRightBigrams.splice(index, 1)
		}
	}

	return (2 * intersection) / (leftBigrams.length + rightBigrams.length)
}

function getBigrams(value: string): string[] {
	const bigrams: string[] = []
	for (let index = 0; index < value.length - 1; index += 1) {
		bigrams.push(value.slice(index, index + 2))
	}
	return bigrams
}
