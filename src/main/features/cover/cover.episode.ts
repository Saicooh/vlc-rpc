import { execFile } from "node:child_process"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { logger } from "@main/core/logger"
import { parse, takeTrailingSeason } from "@main/features/catalog/catalog.parser"
import type { CatalogResult } from "@main/features/catalog/catalog.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

const TVMAZE_SEARCH = "https://api.tvmaze.com/singlesearch/shows?q="
const REQUEST_TIMEOUT_MS = 4000
const CAPTURE_TIMEOUT_MS = 20000
const HIT_TTL_MS = 12 * 60 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000
export const FRAME_POSITIONS = [0.2, 0.4, 0.6] as const

interface EpisodeImage {
	image?: { original?: string | null; medium?: string | null } | null
}

export interface EpisodeThumbnailLookup {
	resolve(status: VlcStatus, catalog: CatalogResult | null): Promise<string | null>
}

function webUrl(value: string | null | undefined): value is string {
	if (!value) return false
	try {
		return ["http:", "https:"].includes(new URL(value).protocol)
	} catch {
		return false
	}
}

function sameShow(left: string, right: string): boolean {
	const normalize = (value: string): string =>
		value
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
	return normalize(left) === normalize(right)
}

async function vlcExecutable(): Promise<string> {
	for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
		if (!root) continue
		const candidate = join(root, "VideoLAN", "VLC", "vlc.exe")
		try {
			await access(candidate)
			return candidate
		} catch {
			// A portable VLC may instead be on PATH.
		}
	}
	return process.platform === "win32" ? "vlc.exe" : "vlc"
}

export async function captureEpisodeFrame(
	status: VlcStatus,
	position = 0.2,
): Promise<Buffer | null> {
	if (!FRAME_POSITIONS.includes(position as (typeof FRAME_POSITIONS)[number])) return null
	const uri = status.media.sourceUri
	if (!uri?.startsWith("file://")) return null
	let videoPath: string
	try {
		videoPath = fileURLToPath(uri)
	} catch {
		return null
	}

	const outputDir = await mkdtemp(join(tmpdir(), "vlc-rpc-episode-"))
	const start = Math.max(1, Math.floor(status.playback.duration * position))
	try {
		const executable = await vlcExecutable()
		await new Promise<void>((done, fail) => {
			execFile(
				executable,
				[
					"--no-one-instance",
					"--intf=dummy",
					"--dummy-quiet",
					"--no-audio",
					"--avcodec-hw=none",
					"--video-filter=scene",
					"--vout=dummy",
					"--scene-ratio=1",
					"--scene-replace",
					"--scene-format=jpg",
					"--scene-width=512",
					"--scene-prefix=episode",
					`--scene-path=${outputDir}`,
					`--start-time=${start}`,
					`--stop-time=${start + 2}`,
					videoPath,
					"vlc://quit",
				],
				{ windowsHide: true, timeout: CAPTURE_TIMEOUT_MS },
				(error) => (error ? fail(error) : done()),
			)
		})
		return await readFile(join(outputDir, "episode.jpg"))
	} catch (error) {
		logger.warn(`Episode frame capture failed: ${error}`)
		return null
	} finally {
		if (
			resolve(dirname(outputDir)) === resolve(tmpdir()) &&
			basename(outputDir).startsWith("vlc-rpc-episode-")
		) {
			try {
				await rm(outputDir, { recursive: true, force: true })
			} catch (error) {
				logger.warn(`Episode frame cleanup failed: ${error}`)
			}
		}
	}
}

/** Stable identity shared by the picker and the resolver; only local episodes qualify. */
export function episodeFrameKey(
	status: VlcStatus,
	catalog: CatalogResult | null = null,
): string | null {
	if (status.mediaType !== "video" || !status.media.sourceUri?.startsWith("file://")) return null
	const parsed = parse(status.media.filename || status.media.title || "", status.playback.duration)
	const episode = status.media.episode ?? catalog?.episode ?? parsed.episode
	if (!episode || episode < 1 || catalog?.mediaKind === "movie") return null
	const season = status.media.season ?? catalog?.season ?? parsed.season
	return `${status.media.sourceUri}|${season ?? "absolute"}|${episode}`
}

export class EpisodeThumbnailResolver implements EpisodeThumbnailLookup {
	private readonly cache = new Map<string, { value: string | null; expiresAt: number }>()
	private readonly inflight = new Map<string, Promise<string | null>>()

	constructor(
		private readonly uploader: {
			uploadImage: (image: Buffer, filename: string, expiryHours?: number) => Promise<string | null>
		},
		private readonly capture: (
			status: VlcStatus,
			position?: number,
		) => Promise<Buffer | null> = captureEpisodeFrame,
		private readonly choiceFor: (key: string) => number | undefined = () => undefined,
	) {}

	public clearCache(): void {
		this.cache.clear()
	}

	public async resolve(status: VlcStatus, catalog: CatalogResult | null): Promise<string | null> {
		if (status.mediaType !== "video" || catalog?.mediaKind === "movie") return null
		const parsed = parse(
			status.media.filename || status.media.title || "",
			status.playback.duration,
		)
		const season = status.media.season ?? catalog?.season ?? parsed.season
		const episode = status.media.episode ?? catalog?.episode ?? parsed.episode
		if (!episode || episode < 1) return null
		const frameKey = episodeFrameKey(status, catalog)
		const chosen = frameKey ? this.choiceFor(frameKey) : undefined
		const position = FRAME_POSITIONS.includes(chosen as (typeof FRAME_POSITIONS)[number])
			? chosen
			: undefined
		const key = `${status.media.sourceUri ?? status.media.filename ?? parsed.title}|${season ?? "absolute"}|${episode}|${position ?? "catalog"}`
		const cached = this.cache.get(key)
		if (cached && Date.now() < cached.expiresAt) return cached.value
		const pending = this.inflight.get(key)
		if (pending) return pending

		const lookup = this.lookup(status, catalog, parsed.title, season, episode, position)
		this.inflight.set(key, lookup)
		try {
			const value = await lookup
			this.cache.set(key, { value, expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS) })
			if (this.cache.size > 50) {
				const oldest = this.cache.keys().next().value
				if (oldest) this.cache.delete(oldest)
			}
			return value
		} finally {
			this.inflight.delete(key)
		}
	}

	private async lookup(
		status: VlcStatus,
		catalog: CatalogResult | null,
		parsedTitle: string,
		season: number | undefined,
		episode: number,
		position?: number,
	): Promise<string | null> {
		if (position === undefined && season && season > 0) {
			const image = await this.tvMazeImage(catalog?.title, parsedTitle, season, episode)
			if (image) return image
		}
		let frame: Buffer | null
		try {
			frame = await this.capture(status, position)
		} catch (error) {
			logger.warn(`Episode frame capture failed: ${error}`)
			return null
		}
		if (!frame) return null
		try {
			const uploaded = await this.uploader.uploadImage(frame, "episode.jpg", 24)
			return webUrl(uploaded) ? uploaded : null
		} catch (error) {
			logger.warn(`Episode thumbnail upload failed: ${error}`)
			return null
		}
	}

	private async tvMazeImage(
		catalogTitle: string | undefined,
		parsedTitle: string,
		season: number,
		episode: number,
	): Promise<string | null> {
		const titles = [catalogTitle, parsedTitle].filter((title): title is string => Boolean(title))
		const candidates = [
			...new Set(
				titles.flatMap((title) => {
					const trailing = takeTrailingSeason(title)
					return trailing && trailing.season === season ? [trailing.title, title] : [title]
				}),
			),
		]
		for (const title of candidates) {
			try {
				const showResponse = await this.get(`${TVMAZE_SEARCH}${encodeURIComponent(title)}`)
				if (!showResponse?.ok) continue
				const show = (await showResponse.json()) as { id?: number; name?: string }
				if (!show.id || !show.name || !sameShow(title, show.name)) continue
				const response = await this.get(
					`https://api.tvmaze.com/shows/${show.id}/episodebynumber?season=${season}&number=${episode}`,
				)
				if (!response?.ok) continue
				const found = (await response.json()) as EpisodeImage
				const image = [found.image?.original, found.image?.medium].find(webUrl)
				if (image) return image
				// A verified episode with no still will not gain one from another spelling.
				return null
			} catch (error) {
				logger.warn(`TVMaze episode image lookup failed: ${error}`)
			}
		}
		return null
	}

	private async get(url: string): Promise<Response | null> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		try {
			return await fetch(url, { signal: controller.signal })
		} finally {
			clearTimeout(timeout)
		}
	}
}
