import { Button } from "@renderer/components/ui/button"
import { Panel } from "@renderer/components/ui/panel"
import { useT } from "@renderer/i18n"
import { loadConfig } from "@renderer/stores/config.store"
import { useState } from "react"
import { refreshAfterPrivacyChange } from "../media.actions"
import type { MediaState } from "../media.store"

/** Uses the existing panel and button styles; paths wrap so the exclusion's scope stays visible. */
export function ContentVisibility({ media }: { media: MediaState }): JSX.Element | null {
	const t = useT()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState(false)
	const privacy = media.privacy
	if (media.mediaStatus === "stopped" || !privacy) return null
	const exclusion = privacy.exclusion

	async function change(kind: "file" | "folder" | "restore"): Promise<void> {
		if (!privacy?.sourceUri) return
		setBusy(true)
		setError(false)
		try {
			const saved =
				kind === "restore" && exclusion
					? await window.api.privacy.remove(exclusion)
					: kind !== "restore" && (await window.api.privacy.excludeCurrent(privacy.sourceUri, kind))
			if (!saved) throw new Error("Content changed or exclusion could not be saved")
			await loadConfig()
			await refreshAfterPrivacyChange()
		} catch {
			setError(true)
		} finally {
			setBusy(false)
		}
	}

	return (
		<Panel label={t("Discord visibility")} className="max-w-[calc(100vw-3rem)]">
			<div className="flex flex-col gap-3 px-4 py-3">
				<output className="type-body block text-body">
					{t(
						privacy.hidden
							? "This content is hidden from Discord"
							: "This content can appear on Discord",
					)}
				</output>
				{privacy.path ? (
					<>
						<p className="type-caption break-all select-text text-muted-foreground">
							{exclusion?.path ?? privacy.path}
						</p>
						{exclusion?.kind === "folder" && (
							<p className="type-caption text-muted-foreground">
								{t("This folder and its subfolders are excluded.")}
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							{exclusion ? (
								<Button
									size="sm"
									variant="secondary"
									className="border border-muted-foreground"
									disabled={busy}
									onClick={() => void change("restore")}
								>
									{t(
										exclusion.kind === "folder"
											? "Stop excluding this folder"
											: "Show this file again",
									)}
								</Button>
							) : (
								<>
									<Button
										size="sm"
										variant="secondary"
										className="border border-muted-foreground"
										disabled={busy}
										onClick={() => void change("file")}
									>
										{t("Hide this file")}
									</Button>
									<Button
										size="sm"
										variant="secondary"
										className="border border-muted-foreground"
										disabled={busy}
										onClick={() => void change("folder")}
									>
										{t("Exclude this folder")}
									</Button>
								</>
							)}
						</div>
						{!exclusion && (
							<p className="type-caption text-muted-foreground">
								{t("Folder exclusions also cover subfolders. Manage exclusions in Settings.")}
							</p>
						)}
					</>
				) : (
					<p className="type-caption text-muted-foreground">
						{t(
							privacy.sourceUri
								? "File exclusions are available for local files."
								: "Checking the playing file before sharing it.",
						)}
					</p>
				)}
				{busy && (
					<output className="type-caption block text-muted-foreground">
						{t("Updating visibility")}
					</output>
				)}
				{error && (
					<p className="type-caption text-danger-text" role="alert">
						{t("Could not change visibility. The playing file may have changed. Try again.")}
					</p>
				)}
			</div>
		</Panel>
	)
}
