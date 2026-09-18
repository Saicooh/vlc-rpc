import { describe, expect, it } from "vitest"
import { buildAnilistSearchCandidates, findBestAnilistMatch } from "./catalog.anilist-matcher"
import type { Candidate } from "./catalog.types"

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		provider: "anilist",
		id: "42",
		title: "Demon Slayer: Kimetsu no Yaiba",
		aliases: [],
		year: 2019,
		mediaKind: "tv",
		posterUrl: "https://example.test/poster.jpg",
		...overrides,
	}
}

describe("AniList title matcher", () => {
	it("builds descriptor and subtitle fallback queries", () => {
		const values = buildAnilistSearchCandidates("Demon Slayer Movie Infinity Castle")
		const queryValues = values.map((value) => value.value)

		expect(queryValues).toContain("Demon Slayer Movie Infinity Castle")
		expect(
			values.some((value) => value.value === "Infinity Castle" && value.isSubtitleFallback),
		).toBe(true)
		expect(values.some((value) => value.isSubtitleFallback)).toBe(true)
	})

	it("keeps a descriptor-free query when Movie is a trailing release token", () => {
		const values = buildAnilistSearchCandidates("Chainsaw Man - Reze-hen - Movie")
		expect(values.map((value) => value.value)).toContain("Chainsaw Man - Reze-hen")
	})

	it("keeps a descriptor-free query when SP is a trailing release token", () => {
		const values = buildAnilistSearchCandidates("Fate Strange Fake - Whispers of Dawn - SP")
		expect(values.map((value) => value.value)).toContain("Fate Strange Fake - Whispers of Dawn")
	})

	it("accepts an alias match even when the filename uses a different title", () => {
		const searchCandidate = buildAnilistSearchCandidates("Red River Movie")[0]
		if (!searchCandidate) throw new Error("expected a search candidate")
		const match = findBestAnilistMatch("Red River Movie", searchCandidate, [
			candidate({ title: "Sora wa Akai Kawa no Hotori", aliases: ["Red River"] }),
		])

		expect(match?.candidate.title).toBe("Sora wa Akai Kawa no Hotori")
	})

	it("matches a descriptor title against AniList punctuation and spacing", () => {
		const searchCandidate = buildAnilistSearchCandidates(
			"Zombieland Saga Movie Yumeginga Paradise",
		)[0]
		if (!searchCandidate) throw new Error("expected a search candidate")
		const match = findBestAnilistMatch(
			"Zombieland Saga Movie Yumeginga Paradise",
			searchCandidate,
			[candidate({ title: "Zombie Land Saga: Yume Ginga Paradise" })],
		)

		expect(match?.candidate.title).toBe("Zombie Land Saga: Yume Ginga Paradise")
	})

	it("rejects an unrelated subtitle-only result", () => {
		const title = "Totally Different Movie Yumeginga Paradise"
		const candidates = buildAnilistSearchCandidates(title)
		const match = candidates.reduce<ReturnType<typeof findBestAnilistMatch>>(
			(best, searchCandidate) => {
				const current = findBestAnilistMatch(title, searchCandidate, [
					candidate({ title: "Yume Ginga Paradise" }),
				])
				return current && (!best || current.score > best.score) ? current : best
			},
			null,
		)

		expect(match).toBeNull()
	})

	it("requires series context for a one-token subtitle", () => {
		const title = "Zombieland Saga Movie Paradise"
		const searchCandidates = buildAnilistSearchCandidates(title)
		const subtitleCandidate = searchCandidates.find((value) => value.isSubtitleFallback)
		if (!subtitleCandidate) throw new Error("expected a subtitle fallback")

		const unrelated = findBestAnilistMatch(title, subtitleCandidate, [
			candidate({ title: "Paradise" }),
		])
		const series = searchCandidates.reduce<ReturnType<typeof findBestAnilistMatch>>(
			(best, searchCandidate) => {
				const current = findBestAnilistMatch(title, searchCandidate, [
					candidate({ title: "Zombie Land Saga: Paradise" }),
				])
				return current && (!best || current.score > best.score) ? current : best
			},
			null,
		)

		expect(unrelated).toBeNull()
		expect(series?.candidate.title).toBe("Zombie Land Saga: Paradise")
	})
})
