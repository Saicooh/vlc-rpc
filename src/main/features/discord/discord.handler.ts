import { isDeepStrictEqual } from "node:util"
import type { Clock } from "@main/core/clock"
import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { parse as parseVideo } from "@main/features/catalog/catalog.parser"
import { Timeline, presenceKey } from "@main/features/presence"
import type { Service as PresenceService } from "@main/features/presence"
import type { Client as VlcClient } from "@main/features/vlc"
import type { LastSentPresence, PresenceClearReason } from "@shared/presence/presence.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Client as DiscordClient } from "./discord.client"

const ARTWORK_RETRY_MS = 30_000
const EPISODE_RETRY_MS = 5 * 60_000

function needsEpisodeRetry(status: VlcStatus): boolean {
	if (status.mediaType !== "video" || status.media.episodeTitle) return false
	const parsed = parseVideo(
		status.media.filename || status.media.title || "",
		status.playback.duration,
	)
	return (status.media.episode ?? parsed.episode) !== undefined && !parsed.subtitle
}

export class DiscordRpcHandler {
	private pollIntervalId: NodeJS.Timeout | null = null
	private statusRead: Promise<VlcStatus | null> | null = null
	private publishTail: Promise<void> = Promise.resolve()
	private pendingUpdate: { key: string; revision: number; promise: Promise<boolean> } | null = null
	private desiredKey: string | null = null
	private revision = 0
	private readonly timeline: Timeline
	private lastSentKey: string | null = null
	private wasConnected = false
	private presenceCleared = false
	private nextArtworkRetryAt = 0
	private nextEpisodeRetryAt = 0
	private lastPresence: LastSentPresence = { kind: "unknown" }

	constructor(
		private readonly discord: DiscordClient,
		private readonly vlc: VlcClient,
		private readonly presence: PresenceService,
		private readonly clock: Clock,
	) {
		this.timeline = new Timeline(clock)
		this.registerHandlers()
	}

	/**
	 * Resend on the next tick even though nothing VLC reports has changed. The
	 * poll skips Discord whenever `presenceKey` is unchanged, and a manual
	 * correction touches none of what that key is built from, so a cover
	 * corrected two minutes into an episode would otherwise wait for the next one.
	 */
	public forceNextUpdate(): void {
		this.lastSentKey = null
		this.desiredKey = null
		this.revision++
	}

	private registerHandlers(): void {
		registerHandler("discord:connect", async () => {
			return await this.discord.connect()
		})

		registerHandler("discord:disconnect", async () => {
			await this.discord.close()
			return true
		})

		registerHandler("discord:status", () => {
			return this.discord.isConnected()
		})

		registerHandler("discord:update", async () => {
			return await this.updatePresence(true)
		})

		registerHandler("discord:start-loop", async () => {
			return this.startUpdateLoop()
		})

		registerHandler("discord:stop-loop", () => {
			this.stopUpdateLoop()
			return true
		})

		registerHandler("discord:reconnect", async () => {
			logger.info("Forcing Discord reconnection")
			return await this.discord.forceReconnect()
		})

		registerHandler("discord:presence:last", () => {
			return this.getLastPresence()
		})
	}

	/**
	 * What Discord was actually given, so the renderer can show the presence
	 * instead of rebuilding it from the same status and hoping the two agree.
	 */
	public getLastPresence(): LastSentPresence {
		return this.lastPresence
	}

	private pollIntervalMs(): number {
		const configured = configService.get("presenceUpdateInterval")
		const raw = typeof configured === "number" && configured <= 10 ? configured * 1000 : configured
		return Math.max(1500, Math.min(10000, raw || 1500))
	}

	public startUpdateLoop(): boolean {
		if (this.pollIntervalId !== null) {
			return true
		}

		try {
			this.discord.connect().catch((error) => {
				logger.error(`Initial Discord connection failed: ${error}`)
			})

			logger.info("Starting Discord presence update loop")
			this.updatePresence(false)
			this.scheduleNextUpdate()

			return true
		} catch (error) {
			logger.error(`Failed to start Discord presence update loop: ${error}`)
			return false
		}
	}

	private scheduleNextUpdate(): void {
		this.pollIntervalId = setTimeout(() => {
			this.updatePresence(false)
			this.scheduleNextUpdate()
		}, this.pollIntervalMs())
	}

	public stopUpdateLoop(): void {
		logger.info("Stopping Discord presence update loop")

		if (this.pollIntervalId !== null) {
			clearTimeout(this.pollIntervalId)
			this.pollIntervalId = null
		}

		this.forceNextUpdate()
		this.wasConnected = false
		this.presenceCleared = false
		this.nextArtworkRetryAt = 0
		this.nextEpisodeRetryAt = 0
		this.lastPresence = { kind: "cleared", reason: "loop-stopped" }

		this.pushClear("loop-stopped").catch((error) => {
			logger.error(`Error clearing Discord presence: ${error}`)
		})
	}

	/**
	 * Update Discord presence based on current VLC status. Diffs by
	 * presenceKey so an unchanged status skips the actual Discord call, and
	 * always resends right after a reconnect since Discord has lost state.
	 */
	private updatePresence(force: boolean): Promise<boolean> {
		if (force) this.forceNextUpdate()
		return this.performUpdatePresence(force)
	}

	private async readCurrentStatus(force: boolean): Promise<VlcStatus | null> {
		if (this.statusRead) return this.statusRead
		const read = this.vlc.readStatus(force)
		this.statusRead = read
		try {
			return await read
		} finally {
			if (this.statusRead === read) this.statusRead = null
		}
	}

	private setDesiredKey(key: string): void {
		if (this.desiredKey !== key) {
			this.desiredKey = key
			this.revision++
		}
	}

	// Only Discord writes are ordered. Catalog lookups must not hold up the next VLC read.
	private publish(work: () => Promise<boolean>): Promise<boolean> {
		const result = this.publishTail.then(work)
		this.publishTail = result.then(
			() => {},
			() => {},
		)
		return result
	}

	private async performUpdatePresence(force: boolean): Promise<boolean> {
		try {
			if (!this.discord.isRpcEnabled()) {
				// Skipping the update is not enough: the last activity would stay
				// pinned on Discord while the user believes they are hidden.
				return await this.pushClear("rpc-disabled")
			}

			const isConnected = this.discord.isConnected()
			const justReconnected = isConnected && !this.wasConnected
			this.wasConnected = isConnected
			if (justReconnected) this.presenceCleared = false

			const readRevision = this.revision
			const vlcStatus = await this.readCurrentStatus(force)
			if (readRevision !== this.revision) return false
			if (!vlcStatus) {
				return this.pushClear("vlc-unavailable")
			}
			if (
				vlcStatus.active &&
				vlcStatus.status === "paused" &&
				configService.get("hideActivityWhenPaused") === true
			) {
				return this.pushClear("playback-paused")
			}

			const window = this.timeline.update(vlcStatus)
			const mediaKey = presenceKey(vlcStatus, this.timeline.currentEpoch)
			const key =
				vlcStatus.mediaType === "video"
					? `${mediaKey}|es:${configService.get("preferSpanishEpisodeTitles") === true}|thumb:${configService.get("showEpisodeThumbnails") === true}`
					: mediaKey
			this.setDesiredKey(key)
			const sameKey = key === this.lastSentKey
			const retryArtwork =
				sameKey &&
				this.lastPresence.kind === "sent" &&
				this.lastPresence.presence.large_image === configService.get("largeImage") &&
				this.clock.now() >= this.nextArtworkRetryAt
			const retryEpisode =
				sameKey && this.nextEpisodeRetryAt > 0 && this.clock.now() >= this.nextEpisodeRetryAt

			if (!force && !justReconnected && sameKey && !retryArtwork && !retryEpisode) {
				return true
			}

			const revision = this.revision
			if (this.pendingUpdate?.key === key && this.pendingUpdate.revision === revision) {
				return await this.pendingUpdate.promise
			}
			const update = (async () => {
				const presenceData = await this.presence.getDiscordPresence(vlcStatus, window)
				if (revision !== this.revision) return false
				if (!presenceData) {
					return this.pushClear("playback-stopped")
				}
				if (
					(retryArtwork || retryEpisode) &&
					!force &&
					!justReconnected &&
					this.lastPresence.kind === "sent" &&
					isDeepStrictEqual(presenceData, this.lastPresence.presence)
				) {
					if (retryArtwork) this.nextArtworkRetryAt = this.clock.now() + ARTWORK_RETRY_MS
					if (retryEpisode) this.nextEpisodeRetryAt = this.clock.now() + EPISODE_RETRY_MS
					return true
				}

				return this.publish(async () => {
					if (revision !== this.revision || !this.discord.isRpcEnabled()) return false
					if (revision !== this.revision) return false
					const sent = await this.discord.update(presenceData)
					if (sent) this.presenceCleared = false
					if (revision !== this.revision) return false
					if (sent) {
						this.lastSentKey = key
						this.presenceCleared = false
						this.nextArtworkRetryAt =
							presenceData.large_image === configService.get("largeImage")
								? this.clock.now() + ARTWORK_RETRY_MS
								: 0
						this.nextEpisodeRetryAt = needsEpisodeRetry(vlcStatus)
							? this.clock.now() + EPISODE_RETRY_MS
							: 0
						// Recorded only once Discord accepted it, so a refused update never
						// shows up as an activity nobody can see.
						this.lastPresence = {
							kind: "sent",
							presence: presenceData,
							sentAt: this.clock.now(),
							applicationName: this.discord.applicationName(),
						}
					}
					return sent
				})
			})()
			this.pendingUpdate = { key, revision, promise: update }
			try {
				return await update
			} finally {
				if (this.pendingUpdate?.promise === update) this.pendingUpdate = null
			}
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			return false
		}
	}

	/**
	 * A disable can last half an hour at a poll every second and a half, so the
	 * clear is sent once and repeated only if it failed, for example because
	 * Discord was not connected at the time.
	 */
	private async pushClear(reason: PresenceClearReason): Promise<boolean> {
		this.setDesiredKey(`clear:${reason}`)
		this.lastSentKey = null
		this.nextArtworkRetryAt = 0
		this.nextEpisodeRetryAt = 0
		this.lastPresence = { kind: "cleared", reason }
		const revision = this.revision
		return this.publish(async () => {
			if (revision !== this.revision) return false
			return this.clearPresence(reason)
		})
	}

	private async clearPresence(reason: PresenceClearReason): Promise<boolean> {
		this.lastSentKey = null
		this.nextArtworkRetryAt = 0
		this.nextEpisodeRetryAt = 0
		this.lastPresence = { kind: "cleared", reason }
		if (this.presenceCleared) {
			return true
		}

		this.presenceCleared = await this.discord.clear()
		return this.presenceCleared
	}
}
