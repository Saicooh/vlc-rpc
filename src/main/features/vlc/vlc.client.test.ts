import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

// vi.mock is hoisted above regular declarations, so the mutable config the
// factory closes over has to be created through vi.hoisted to exist in time.
const { mockVlcConfig, mockStatusTimeout } = vi.hoisted(() => ({
	mockVlcConfig: { httpPort: 9080, httpPassword: "secret", httpEnabled: true },
	mockStatusTimeout: { value: 2000 },
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => {
			if (key === "vlc") return mockVlcConfig
			if (key === "statusTimeout") return mockStatusTimeout.value
			return {}
		},
		set: () => {},
		delete: () => {},
	},
}))

// vi.mock is hoisted above the imports, so this ordinary import already
// receives the mocked modules.
import { Client } from "./vlc.client"

const vlcStatusService = new Client()

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string, status = 200): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ status, text: async () => body })),
	)
}

function throwOnFetch(error: unknown): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			throw error
		}),
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
	mockVlcConfig.httpEnabled = true
	mockStatusTimeout.value = 2000
})

// Characterization tests. Every fixture is a real capture from a Spanish
// language VLC, which is the point: see the mediaType test below.

describe("readStatus", () => {
	it("retries a transient playlist failure even when the status body has not changed", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-09-22T00:00:00Z"))
		const client = new Client()
		const raw = JSON.parse(fixture("video-movie.status"))
		raw.information.category.meta.title = "UPXX-1016"
		raw.information.category.meta.filename = "index.bdmv"
		const statusBody = JSON.stringify(raw)
		let playlistReads = 0
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.endsWith("playlist.json")) {
					playlistReads++
					return {
						status: playlistReads === 1 ? 503 : 200,
						text: async () =>
							JSON.stringify({
								ro: "ro",
								type: "node",
								name: "Playlist",
								id: "0",
								children: [
									{
										ro: "ro",
										type: "leaf",
										name: "Disc",
										id: "3",
										current: "current",
										uri: "bluray:///D:/The.Matrix.1999/BDMV/",
									},
								],
							}),
					}
				}
				return { status: 200, text: async () => statusBody }
			}),
		)

		const first = await client.readStatus(false)
		const beforeRetry = await client.readStatus(false)
		expect(beforeRetry?.media.sourceUri).toBeUndefined()
		expect(playlistReads).toBe(1)
		vi.setSystemTime(new Date("2026-09-22T00:00:05Z"))
		const recovered = await client.readStatus(false)
		expect(first?.media.sourceUri).toBeUndefined()
		expect(recovered?.media.title).toBe("The Matrix 1999")
		expect(playlistReads).toBe(2)
	})

	it("reads a Blu-Ray URI once and uses a named folder instead of a disc product code", async () => {
		const client = new Client()
		const raw = JSON.parse(fixture("video-movie.status"))
		raw.information.category.meta.title = "UPXX-1016"
		raw.information.category.meta.filename = "index.bdmv"
		raw.information.title = 0
		raw.information.chapter = 2
		const statusBody = JSON.stringify(raw)
		const fetchMock = vi.fn(async (url: string) => ({
			status: 200,
			text: async () =>
				url.endsWith("playlist.json")
					? JSON.stringify({
							ro: "ro",
							type: "node",
							name: "Playlist",
							id: "0",
							children: [
								{
									ro: "ro",
									type: "leaf",
									name: "Disc",
									id: "3",
									current: "current",
									uri: "bluray:///D:/The.Matrix.1999/BDMV/",
								},
							],
						})
					: statusBody,
		}))
		vi.stubGlobal("fetch", fetchMock)

		const first = await client.readStatus(true)
		const second = await client.readStatus(true)
		expect(first?.media.title).toBe("The Matrix 1999")
		expect(first?.media.sourceUri).toBe("bluray:///D:/The.Matrix.1999/BDMV/")
		expect(first?.disc).toEqual({ title: 1, chapter: 3 })
		expect(second?.media.title).toBe("The Matrix 1999")
		expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("playlist.json"))).toHaveLength(1)
	})
	it("maps an untagged mp3 using the filename, without its extension", async () => {
		respondWith(fixture("audio-untagged.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status).not.toBeNull()
		expect(status?.active).toBe(true)
		expect(status?.status).toBe("playing")
		expect(status?.mediaType).toBe("audio")
		// The extension is dropped because this string goes on the user's profile,
		// and reading the tags exists precisely so a filename does not land there raw.
		expect(status?.media.title).toBe("Christian Nodal - Probablemente (Official Lyric Video)")
		expect(status?.media.artist).toBe("")
		expect(status?.media.album).toBe("")
		expect(status?.media.artworkUrl).toBeUndefined()
		expect(status?.playback.time).toBe(42)
		expect(status?.playback.duration).toBe(233)
		expect(status?.playback.position).toBeCloseTo(0.1802, 4)
	})

	it("prefers the title VLC derived over the raw filename", async () => {
		respondWith(fixture("video-tv-show.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.media.title).toBe("Some Show S01E03")
		expect(status?.media.filename).toBe("Some.Show.S01E03.1080p.WEB-DL.mp4")
	})

	it("reports paused without losing the media info", async () => {
		respondWith(fixture("paused.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.active).toBe(true)
		expect(status?.status).toBe("paused")
		expect(status?.playback.time).toBe(30)
	})

	it("returns null when VLC answers with a non 200", async () => {
		respondWith("", 404)
		expect(await vlcStatusService.readStatus(true)).toBeNull()
	})

	it("returns the cached status when the payload hash is unchanged", async () => {
		respondWith(fixture("audio-no-art.status"))
		const first = await vlcStatusService.readStatus(true)
		const second = await vlcStatusService.readStatus(false)

		expect(second).toBe(first)
	})

	it("handles a stream with no known duration", async () => {
		// length: 0 from VLC, distinct from the -1 a VBR file with no Xing
		// header reports (see the untagged mp3 fixture). Both mean "no bar",
		// but for different reasons: this one never has a duration to report.
		respondWith(fixture("stream-no-duration.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.active).toBe(true)
		expect(status?.mediaType).toBe("audio")
		expect(status?.playback.duration).toBe(0)
		expect(status?.playback.time).toBe(0)
		expect(status?.media.title).toContain("Groove Salad")
		expect(status?.media.nowPlaying).toBe("Big Url: - Broadcasting Around The Worl")
	})

	it("maps plid and rate from the raw status", async () => {
		respondWith(fixture("audio-untagged.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.plid).toBe(3)
		expect(status?.playback.rate).toBe(1)
	})

	it("maps a missing or negative currentplid to null, not -1 or undefined", async () => {
		const raw = JSON.parse(fixture("audio-untagged.status"))
		raw.currentplid = -1
		respondWith(JSON.stringify(raw))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.plid).toBeNull()
	})

	it("defaults rate to 1 when VLC omits it", async () => {
		const raw = JSON.parse(fixture("audio-untagged.status"))
		raw.rate = undefined
		respondWith(JSON.stringify(raw))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.playback.rate).toBe(1)
	})
})

describe("media type detection", () => {
	// All three fixtures are real video files captured from a Spanish VLC,
	// where information.category uses "Tipo": "Vídeo", not "Type": "Video".
	// Detection matches by the resolution value's shape instead, so it holds
	// regardless of VLC's interface language. See vlc.mapper.ts.
	it.each([
		["video-tv-show", 1280, 720],
		["video-movie", 1280, 720],
		["video-anime", 1280, 720],
	])("detects %s as video with its resolution", async (name, width, height) => {
		respondWith(fixture(`${name}.status`))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.mediaType).toBe("video")
		expect(status?.videoInfo).toEqual({ width, height })
	})

	it("detects untagged and embedded art audio as audio, with no videoInfo", async () => {
		for (const name of ["audio-no-art", "audio-embedded-art"]) {
			respondWith(fixture(`${name}.status`))
			const status = await vlcStatusService.readStatus(true)

			expect(status?.mediaType).toBe("audio")
			expect(status?.videoInfo).toBeUndefined()
		}
	})
})

describe("checkVlcStatus", () => {
	it("reports not-configured without making a request when httpEnabled is false", async () => {
		mockVlcConfig.httpEnabled = false
		const fetchSpy = vi.fn()
		vi.stubGlobal("fetch", fetchSpy)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status).toEqual({ isRunning: false, reason: "not-configured" })
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("reports running on a 200", async () => {
		respondWith("{}")
		const status = await vlcStatusService.checkVlcStatus()

		expect(status.isRunning).toBe(true)
		expect(status.reason).toBe("running")
	})

	it.each([
		[401, "auth-failed"],
		[404, "misconfigured-endpoint"],
		[500, "unexpected-status"],
	])("reports %s as %s", async (httpStatus, reason) => {
		respondWith("", httpStatus)
		const status = await vlcStatusService.checkVlcStatus()

		expect(status.isRunning).toBe(false)
		expect(status.reason).toBe(reason)
	})

	it("reports not-running when the connection is refused", async () => {
		const refused = Object.assign(new Error("connect ECONNREFUSED"), {
			name: "Error",
			code: "ECONNREFUSED",
		})
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw refused
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("not-running")
	})

	it("reports timeout on an aborted request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw Object.assign(new Error("aborted"), { name: "AbortError" })
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("timeout")
	})

	// Node's fetch never throws the socket error itself. It throws
	// `TypeError: fetch failed` and hangs the real one off `cause`, which is how
	// the commonest case of all, VLC not being open, reported itself as an
	// unknown error and put "fetch failed" in front of the user.
	it.each([
		["ECONNREFUSED", "not-running"],
		["ECONNRESET", "not-running"],
		["UND_ERR_CONNECT_TIMEOUT", "timeout"],
	])("reads %s out of the cause chain as %s", async (code, reason) => {
		throwOnFetch(
			Object.assign(new TypeError("fetch failed"), {
				cause: Object.assign(new Error("connect failed"), { code }),
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe(reason)
	})

	it("reads an abort out of the cause chain as a timeout", async () => {
		throwOnFetch(
			Object.assign(new TypeError("fetch failed"), {
				cause: Object.assign(new Error("This operation was aborted"), { name: "AbortError" }),
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("timeout")
	})

	it("reports unknown-error when nothing in the chain is recognized", async () => {
		throwOnFetch(new TypeError("fetch failed"))

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("unknown-error")
	})

	it("stops walking a cause chain that points at itself", async () => {
		const looping: { name: string; cause?: unknown } = { name: "Whatever" }
		looping.cause = looping
		throwOnFetch(looping)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("unknown-error")
	})
})

describe("getCurrentFileUri", () => {
	it("finds the item flagged as current, however deep it is nested", async () => {
		respondWith(fixture("video-tv-show.playlist"))
		const uri = await vlcStatusService.getCurrentFileUri()

		expect(uri).toMatch(/^file:\/\/\//)
		expect(uri).toContain("Some.Show.S01E03.1080p.WEB-DL.mp4")
	})

	it("returns null when nothing is playing", async () => {
		respondWith(JSON.stringify({ ro: "rw", type: "node", name: "Playlist", id: "0" }))
		expect(await vlcStatusService.getCurrentFileUri()).toBeNull()
	})

	it("returns a stream URL as is, not just file:// paths", async () => {
		respondWith(fixture("stream-no-duration.playlist"))
		const uri = await vlcStatusService.getCurrentFileUri()

		expect(uri).toBe("http://ice1.somafm.com/groovesalad-128-mp3")
	})
})

describe("status request timeout", () => {
	it("uses statusTimeout from config for the abort timeout", async () => {
		mockStatusTimeout.value = 4000
		const setTimeoutSpy = vi.spyOn(global, "setTimeout")
		respondWith(fixture("audio-untagged.status"))

		await vlcStatusService.readStatus(true)

		const abortCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 4000)
		expect(abortCall).toBeDefined()

		setTimeoutSpy.mockRestore()
	})

	it("clamps an out of range statusTimeout into [500, 10000]", async () => {
		mockStatusTimeout.value = 50
		const setTimeoutSpy = vi.spyOn(global, "setTimeout")
		respondWith(fixture("audio-untagged.status"))

		await vlcStatusService.readStatus(true)

		const abortCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 500)
		expect(abortCall).toBeDefined()

		setTimeoutSpy.mockRestore()
	})
})
