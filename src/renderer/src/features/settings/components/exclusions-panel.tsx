import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { Panel } from "@renderer/components/ui/panel"
import { refreshAfterPrivacyChange } from "@renderer/features/media/media.actions"
import { useT } from "@renderer/i18n"
import { configStore, loadConfig } from "@renderer/stores/config.store"
import type { ContentExclusion } from "@shared/privacy/privacy.types"
import { useState } from "react"

export function ExclusionsPanel(): JSX.Element {
	const t = useT()
	const config = useStore(configStore)
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState(false)
	const rules = config?.contentExclusions ?? []
	async function remove(rule: ContentExclusion): Promise<void> {
		setBusy(`${rule.kind}:${rule.path}`)
		setError(false)
		try {
			if (!(await window.api.privacy.remove(rule))) throw new Error("Exclusion not removed")
			await loadConfig()
			await refreshAfterPrivacyChange()
		} catch {
			setError(true)
		} finally {
			setBusy(null)
		}
	}
	return (
		<Panel label={t("Hidden content")} className="max-w-[calc(100vw-3rem)]">
			{!config && (
				<output className="type-body block px-4 py-3 text-muted-foreground">
					{t("Loading your settings")}
				</output>
			)}
			{config && rules.length === 0 && (
				<p className="type-body px-4 py-3 text-muted-foreground">
					{t("No files or folders are excluded.")}
				</p>
			)}
			{rules.map((rule) => (
				<div
					key={`${rule.kind}:${rule.path}`}
					className="flex flex-wrap items-center gap-3 px-4 py-3"
				>
					<div className="min-w-0 flex-1">
						<p className="type-label text-body">
							{t(rule.kind === "folder" ? "Folder and subfolders" : "File")}
						</p>
						<p className="type-caption break-all select-text text-muted-foreground">{rule.path}</p>
					</div>
					<Button
						size="sm"
						variant="secondary"
						className="border border-muted-foreground"
						disabled={busy !== null}
						aria-label={t("Remove exclusion for {path}", { path: rule.path })}
						onClick={() => void remove(rule)}
					>
						{t("Remove exclusion")}
					</Button>
				</div>
			))}
			{busy && (
				<output className="type-caption block px-4 py-3 text-muted-foreground">
					{t("Updating visibility")}
				</output>
			)}
			{error && (
				<p className="type-caption px-4 py-3 text-danger-text" role="alert">
					{t("Could not remove the exclusion. Try again.")}
				</p>
			)}
		</Panel>
	)
}
