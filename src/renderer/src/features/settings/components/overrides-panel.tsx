import { useStore } from "@nanostores/react"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { useT } from "@renderer/i18n"
import { logger } from "@renderer/lib/utils"
import { configStore } from "@renderer/stores/config.store"
import type { OverrideListEntry, SavedOverride } from "@shared/ipc/channels"
import { useCallback, useEffect, useState } from "react"
import { Link } from "wouter"
import type { OverrideMatch } from "../overrides.key"
import { describeOverrideScope, matchHeadline, readOverrideKey } from "../overrides.key"

type ListState =
	| { kind: "loading" }
	| { kind: "ready"; entries: OverrideListEntry[] }
	| { kind: "failed" }

const REMOVE_BUTTON = "text-danger-text hover:bg-danger-wash hover:text-danger-text"

export function OverridesPanel(): JSX.Element {
	const t = useT()
	const [list, setList] = useState<ListState>({ kind: "loading" })
	const [pendingKey, setPendingKey] = useState<string | null>(null)
	const [removeFailed, setRemoveFailed] = useState(false)

	const load = useCallback(async (): Promise<void> => {
		try {
			const entries = await window.api.overrides.list()
			const newestFirst = [...entries].sort((a, b) => b.override.savedAt - a.override.savedAt)
			setList({ kind: "ready", entries: newestFirst })
		} catch (error) {
			logger.error(`Failed to read the saved corrections: ${error}`)
			setList({ kind: "failed" })
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	async function handleRemove(key: string): Promise<void> {
		setPendingKey(key)
		setRemoveFailed(false)

		try {
			const removed = await window.api.overrides.remove(key)

			if (!removed) {
				// The store no longer holds what the screen is showing, so take the store's word for it.
				await load()
				return
			}

			setList((current) =>
				current.kind === "ready"
					? { kind: "ready", entries: current.entries.filter((entry) => entry.key !== key) }
					: current,
			)
		} catch (error) {
			logger.error(`Failed to remove a correction: ${error}`)
			setRemoveFailed(true)
		} finally {
			setPendingKey(null)
		}
	}

	return (
		<Panel label={t("Corrections")}>
			{list.kind === "loading" && (
				<p className="type-caption px-4 py-3 text-muted-foreground">
					{t("Loading your corrections")}
				</p>
			)}

			{list.kind === "failed" && (
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<p className="type-caption text-pretty text-muted-foreground">
						{t("Could not read your corrections.")}
					</p>
					<Button variant="secondary" size="sm" onClick={load}>
						{t("Try again")}
					</Button>
				</div>
			)}

			{list.kind === "ready" && list.entries.length === 0 && <EmptyCorrections />}

			{list.kind === "ready" &&
				list.entries.map((entry) => (
					<OverrideRow
						key={entry.key}
						entry={entry}
						isRemoving={pendingKey === entry.key}
						onRemove={handleRemove}
					/>
				))}

			{removeFailed && (
				<p className="type-caption px-4 py-3 text-danger-text">
					{t("Could not remove that correction. Try again.")}
				</p>
			)}

			{list.kind === "ready" && list.entries.length > 0 && (
				<p className="type-caption text-pretty px-4 py-3 text-muted-foreground">
					{t(
						"Most corrections are matched on what the app reads from the file, so another release of the same title reads differently and needs one of its own. Music that carries no tags is held against the file itself, and ends if that file moves.",
					)}
				</p>
			)}
		</Panel>
	)
}

interface OverrideRowProps {
	entry: OverrideListEntry
	isRemoving: boolean
	onRemove: (key: string) => void
}

function OverrideRow({ entry, isRemoving, onRemove }: OverrideRowProps): JSX.Element {
	const t = useT()
	const spanish = useStore(configStore)?.interfaceLanguage === "es"
	const match = readOverrideKey(entry.key)
	const headline = headlineFor(entry, match)

	return (
		<Row
			label={
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate">{headline}</span>
					<Badge>{t(entry.override.kind === "video" ? "Video" : "Music")}</Badge>
				</span>
			}
			description={
				<>
					<span className="block" title={entry.key}>
						{spanish ? describeChangesSpanish(entry.override) : describeChanges(entry.override)}{" "}
						{spanish ? describeScopeSpanish(match) : describeOverrideScope(match)}
					</span>
					<span className="block truncate" title={entry.override.sourceFilename}>
						{t("Saved from ")}
						<span className="select-text">{entry.override.sourceFilename}</span>
					</span>
				</>
			}
			control={
				<Button
					variant="ghost"
					size="sm"
					className={REMOVE_BUTTON}
					isLoading={isRemoving}
					onClick={() => onRemove(entry.key)}
					aria-label={t("Remove the correction for {headline}", { headline })}
				>
					{t("Remove")}
				</Button>
			}
		/>
	)
}

function describeScopeSpanish(match: OverrideMatch): string {
	switch (match.kind) {
		case "file":
			return `Se aplica solo a ${match.path}. Si mueves o renombras el archivo, deja de aplicarse.`
		case "unreadable":
			return `Se aplica a ${match.key}.`
		case "tv":
			return `Se aplica a la serie ${match.title}, temporada ${match.season}.`
		case "movie":
			return `Se aplica a la película ${match.title} de ${match.year}.`
		case "video":
			return `Se aplica al vídeo ${match.title}.`
		case "audio":
			return `Se aplica a la música de ${match.artist}, del disco ${match.record}.`
	}
}

function describeChangesSpanish(override: SavedOverride): string {
	if (override.kind === "audio") return "Establece la portada."
	if (override.kind === "as-is")
		return "Ignora la identificación automática y usa los datos del archivo."
	const fields: string[] = []
	if (override.title)
		fields.push(override.kind === "untagged-audio" ? "el título de la canción" : "el título")
	if (override.kind === "untagged-audio" && override.artist) fields.push("el artista")
	if (override.cover) fields.push("la portada")
	const changes = fields.length ? `Establece ${fields.join(" y ")}.` : ""
	if (override.kind === "untagged-audio")
		return `${changes}${override.cover ? "" : " La portada se busca con esos datos."}`
	return [
		changes,
		override.mediaKind === "movie"
			? "Se muestra como película."
			: override.mediaKind === "tv"
				? "Se muestra como serie."
				: "",
	]
		.filter(Boolean)
		.join(" ")
}

function EmptyCorrections(): JSX.Element {
	const t = useT()
	return (
		<div className="flex flex-col gap-2 px-4 py-6">
			<p className="type-label text-body">{t("You have not corrected anything yet.")}</p>
			<p className="type-caption text-pretty text-muted-foreground">
				{t(
					"When the app reads the wrong title or shows the wrong cover art, correct it on Home while the file is playing. What you correct is listed here, so you can see it and take it back.",
				)}
			</p>
			<Link
				href="/"
				className="focus-discord type-label w-fit rounded-xs text-brand-text underline-offset-4 hover:underline"
			>
				{t("Open Home")}
			</Link>
		</div>
	)
}

/** What the row leads with: what the user typed, or failing that the key's own name for the thing. */
function headlineFor(entry: OverrideListEntry, match: OverrideMatch): string {
	const { override } = entry
	const title =
		override.kind === "video" || override.kind === "untagged-audio" ? override.title : undefined
	if (title !== undefined && title.length > 0) {
		return title
	}
	return matchHeadline(match)
}

function describeChanges(override: SavedOverride): string {
	if (override.kind === "audio") {
		return "Sets the cover art."
	}

	// A refusal names nothing, so the row says what it stops rather than what it
	// sets. "Corrected to nothing" would be the sentence to avoid.
	if (override.kind === "as-is") {
		return "Ignores what the app matched this audio to, so the file speaks for itself."
	}

	if (override.kind === "untagged-audio") {
		const named = listFields([
			[override.title, "the song title"],
			[override.artist, "the artist"],
			[override.cover, "the cover art"],
		])
		// The search reaching the artwork is the reason for typing two words
		// rather than going to find an image, so the row says when it did.
		const rest =
			override.cover === undefined || override.cover.length === 0
				? " The cover comes from searching those."
				: ""
		return named === "" ? "" : `Sets ${named}.${rest}`
	}

	const named = listFields([
		[override.title, "the title"],
		[override.cover, "the cover art"],
	])

	const sentences: string[] = []
	if (named !== "") {
		sentences.push(`Sets ${named}.`)
	}
	if (override.mediaKind === "movie") {
		sentences.push("Shows it as a movie.")
	}
	if (override.mediaKind === "tv") {
		sentences.push("Shows it as a series.")
	}

	return sentences.join(" ")
}

function listFields(fields: [string | undefined, string][]): string {
	const named = fields
		.filter(([value]) => value !== undefined && value.length > 0)
		.map(([, label]) => label)
	if (named.length === 0) return ""
	if (named.length === 1) return named[0] ?? ""
	return `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
}
