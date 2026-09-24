import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { Panel } from "@renderer/components/ui/panel"
import { useT } from "@renderer/i18n"
import { configStore, loadConfig } from "@renderer/stores/config.store"
import { useState } from "react"
import { refreshMediaInfo } from "../media.actions"
import type { MediaState } from "../media.store"

type Preview = Awaited<ReturnType<typeof window.api.media.previewFrames>>

/** Frame capture starts only when opened, and preview bytes never leave this machine. */
export function EpisodeFramePicker({ media }: { media: MediaState }): JSX.Element | null {
	const t = useT()
	const config = useStore(configStore)
	const [preview, setPreview] = useState<Preview>(null)
	const [busy, setBusy] = useState<"idle" | "loading" | "saving">("idle")
	const [error, setError] = useState<string | null>(null)

	if (
		config?.showEpisodeThumbnails !== true ||
		media.mediaType !== "video" ||
		media.episode === null ||
		!media.sourceUri?.startsWith("file://")
	)
		return null

	const selected = preview ? config.episodeFrameChoices?.[preview.key] : undefined

	async function load(): Promise<void> {
		setBusy("loading")
		setError(null)
		try {
			const result = await window.api.media.previewFrames()
			if (!result) throw new Error("No frames")
			setPreview(result)
		} catch {
			setError(t("Could not capture frames from this file."))
		} finally {
			setBusy("idle")
		}
	}

	async function choose(position: number | null): Promise<void> {
		if (!preview) return
		setBusy("saving")
		setError(null)
		try {
			const saved =
				position === null
					? await window.api.media.resetFrame(preview.key)
					: await window.api.media.selectFrame(preview.key, position)
			if (!saved) throw new Error("The episode changed")
			await loadConfig()
			await Promise.all([refreshMediaInfo(), window.api.discord.updatePresence()])
		} catch {
			setError(t("Could not apply the frame. Check that this episode is still playing."))
		} finally {
			setBusy("idle")
		}
	}

	return (
		<Panel label={t("Episode thumbnail")}>
			<div className="space-y-3 px-4 py-3">
				<p className="type-caption text-muted-foreground">
					{t(
						"Pick a frame for this episode. Previews stay on your PC; the chosen image is uploaded for Discord.",
					)}
				</p>
				{!preview && (
					<Button size="sm" variant="secondary" isLoading={busy === "loading"} onClick={load}>
						{t("Preview frames")}
					</Button>
				)}
				{preview && (
					<>
						<div className="grid grid-cols-3 gap-2">
							{preview.frames.map(({ position, dataUrl }) => (
								<button
									key={position}
									type="button"
									disabled={busy !== "idle"}
									onClick={() => void choose(position)}
									aria-label={t("Use frame at {percent} percent", {
										percent: Math.round(position * 100),
									})}
									aria-pressed={selected === position}
									className="overflow-hidden rounded-md border border-divider text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
								>
									<img src={dataUrl} alt="" className="aspect-video w-full object-cover" />
									<span className="block px-2 py-1 type-caption">
										{Math.round(position * 100)}%{" "}
										{selected === position ? `· ${t("Selected")}` : ""}
									</span>
								</button>
							))}
						</div>
						<div className="flex gap-2">
							<Button size="sm" variant="secondary" disabled={busy !== "idle"} onClick={load}>
								{t("Capture again")}
							</Button>
							{selected !== undefined && (
								<Button
									size="sm"
									variant="secondary"
									disabled={busy !== "idle"}
									onClick={() => void choose(null)}
								>
									{t("Use automatic image")}
								</Button>
							)}
						</div>
					</>
				)}
				{error && (
					<p role="alert" className="type-caption text-danger-text">
						{error}
					</p>
				)}
			</div>
		</Panel>
	)
}
