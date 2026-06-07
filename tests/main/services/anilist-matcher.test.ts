import assert from "node:assert/strict"
import { test } from "node:test"
import {
	buildAnilistSearchCandidates,
	findBestAnilistMatch,
	type AnilistAcceptedMatch,
	type AnilistMedia,
} from "../../../src/main/services/anilist/anilist-matcher"

function createMedia(id: number, title: string, synonyms: string[] = []): AnilistMedia {
	return {
		id,
		title: {
			romaji: title,
			english: null,
			native: null,
		},
		synonyms,
		coverImage: {
			extraLarge: `https://example.test/${id}.jpg`,
			large: null,
		},
		siteUrl: `https://anilist.co/anime/${id}`,
	}
}

function findBestMatch(title: string, mediaResults: AnilistMedia[]): AnilistAcceptedMatch | null {
	let bestMatch: AnilistAcceptedMatch | null = null

	for (const candidate of buildAnilistSearchCandidates(title)) {
		const acceptedMatch = findBestAnilistMatch(title, candidate, mediaResults)
		if (acceptedMatch && (!bestMatch || acceptedMatch.score > bestMatch.score)) {
			bestMatch = acceptedMatch
		}
	}

	return bestMatch
}

test("accepts Zombieland Saga Yumeginga Paradise as Zombie Land Saga: Yume Ginga Paradise", () => {
	const match = findBestMatch("Zombieland Saga Movie Yumeginga Paradise", [
		createMedia(1, "Zombie Land Saga: Yume Ginga Paradise"),
	])

	assert.equal(match?.media.id, 1)
	assert.equal(match?.canonicalTitle, "Zombie Land Saga: Yume Ginga Paradise")
})

test("rejects unrelated exact subtitle-only result when series context does not match", () => {
	const match = findBestMatch("Totally Different Movie Yumeginga Paradise", [
		createMedia(2, "Yume Ginga Paradise"),
	])

	assert.equal(match, null)
})

test("protects one-token subtitles after descriptors with series context", () => {
	const subtitleOnlyMatch = findBestMatch("Zombieland Saga Movie Paradise", [
		createMedia(3, "Paradise"),
	])
	assert.equal(subtitleOnlyMatch, null)

	const seriesMatch = findBestMatch("Zombieland Saga Movie Paradise", [
		createMedia(4, "Zombie Land Saga: Paradise"),
	])
	assert.equal(seriesMatch?.media.id, 4)
})

test("matches normal exact and near exact titles", () => {
	const exactMatch = findBestMatch("Frieren: Beyond Journey's End", [
		createMedia(5, "Frieren: Beyond Journey's End"),
	])
	assert.equal(exactMatch?.media.id, 5)

	const nearExactMatch = findBestMatch("Bocchi the Rock", [createMedia(6, "Bocchi the Rock!")])
	assert.equal(nearExactMatch?.media.id, 6)
})

test("builds descriptor-aware candidates with subtitle fallback metadata", () => {
	const candidates = buildAnilistSearchCandidates("Zombieland Saga Movie Yumeginga Paradise")

	assert.ok(
		candidates.some(
			(candidate) =>
				candidate.value.includes("Zombieland Saga") &&
				candidate.value.includes("Yumeginga Paradise") &&
				candidate.seriesContext === "Zombieland Saga" &&
				!candidate.isSubtitleFallback,
		),
	)
	assert.ok(
		candidates.some(
			(candidate) =>
				candidate.value === "Yumeginga Paradise" &&
				candidate.seriesContext === "Zombieland Saga" &&
				candidate.isSubtitleFallback,
		),
	)
})
