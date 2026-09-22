import { describe, expect, it } from "vitest"
import { coverKey } from "./cover.key"

describe("coverKey", () => {
	it("keys video artwork per file and changes when VLC discovers a cover", () => {
		const first = coverKey({ mediaType: "video", media: { filename: "episode-1.mkv" } })
		const next = coverKey({ mediaType: "video", media: { filename: "episode-2.mkv" } })
		const covered = coverKey({
			mediaType: "video",
			media: { filename: "episode-1.mkv", artworkUrl: "file:///poster.jpg" },
		})
		expect(first).not.toBe(next)
		expect(first).not.toBe(covered)
	})
	it("keys audio by artist and album, not by title", () => {
		const trackThree = coverKey({
			media: { artist: "Christian Nodal", album: "Ahora", title: "Probablemente" },
		})
		const trackFour = coverKey({
			media: { artist: "Christian Nodal", album: "Ahora", title: "Otra Cancion" },
		})

		expect(trackThree).toBe(trackFour)
	})

	it("changes audio's key when the album changes, same artist", () => {
		const albumOne = coverKey({
			media: { artist: "Christian Nodal", album: "Ahora" },
		})
		const albumTwo = coverKey({
			media: { artist: "Christian Nodal", album: "Forajido" },
		})

		expect(albumOne).not.toBe(albumTwo)
	})

	it("falls back to artist and title when audio has no album", () => {
		const withAlbum = coverKey({
			media: { artist: "Christian Nodal", album: "Ahora" },
		})
		const withoutAlbum = coverKey({
			media: { artist: "Christian Nodal", title: "Probablemente" },
		})

		expect(withAlbum).not.toBe(withoutAlbum)
	})
})
