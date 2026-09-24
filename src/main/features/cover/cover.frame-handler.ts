import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import type { Client as VlcClient } from "@main/features/vlc"
import {
	type EpisodeThumbnailResolver,
	FRAME_POSITIONS,
	captureEpisodeFrame,
	episodeFrameKey,
} from "./cover.episode"

/** Preview bytes stay local. Only choosing a frame lets the normal presence path upload it. */
export class EpisodeFrameHandler {
	constructor(
		private readonly vlc: VlcClient,
		private readonly thumbnails: EpisodeThumbnailResolver,
		private readonly forceNextUpdate: () => void,
	) {
		registerHandler("media:preview-frames", async () => {
			if (configService.get("showEpisodeThumbnails") !== true) return null
			const status = await this.vlc.readStatus(true)
			if (!status?.active || status.playback.duration <= 0) return null
			const key = episodeFrameKey(status)
			if (!key) return null
			const captures = await Promise.all(
				FRAME_POSITIONS.map(async (position) => {
					const frame = await captureEpisodeFrame(status, position)
					return frame
						? { position, dataUrl: `data:image/jpeg;base64,${frame.toString("base64")}` }
						: null
				}),
			)
			const frames = captures.filter((item): item is NonNullable<typeof item> => item !== null)
			return frames.length ? { key, frames } : null
		})

		registerHandler("media:select-frame", async (key, position) => {
			if (configService.get("showEpisodeThumbnails") !== true) return false
			if (!FRAME_POSITIONS.includes(position as (typeof FRAME_POSITIONS)[number])) return false
			const status = await this.vlc.readStatus(true)
			if (!status?.active || episodeFrameKey(status) !== key) return false
			const existing = configService.get("episodeFrameChoices") ?? {}
			// Keep the most recent 100 choices; config is written as one JSON file.
			const choices = Object.fromEntries(
				Object.entries(existing)
					.filter(([name]) => name !== key)
					.slice(-99),
			)
			choices[key] = position
			configService.set("episodeFrameChoices", choices)
			this.thumbnails.clearCache()
			this.forceNextUpdate()
			return true
		})

		registerHandler("media:reset-frame", async (key) => {
			const status = await this.vlc.readStatus(true)
			if (!status?.active || episodeFrameKey(status) !== key) return false
			const choices = { ...configService.get("episodeFrameChoices") }
			delete choices[key]
			configService.set("episodeFrameChoices", choices)
			this.thumbnails.clearCache()
			this.forceNextUpdate()
			return true
		})
	}
}
