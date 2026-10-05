import { posix, win32 } from "node:path"
import { fileURLToPath } from "node:url"
import type { AppConfig } from "@shared/config/app-config"
import type { ContentExclusion, ContentPrivacy } from "@shared/privacy/privacy.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

export function localPath(
	uri: string | null | undefined,
	platform = process.platform,
): string | null {
	if (!uri || !/^file:/i.test(uri)) return null
	try {
		return fileURLToPath(uri, { windows: platform === "win32" })
	} catch {
		return null
	}
}

export function matchingExclusion(
	file: string,
	rules: ContentExclusion[],
	platform = process.platform,
): ContentExclusion | null {
	const paths = platform === "win32" ? win32 : posix
	const normalize = (value: string) => {
		const normalized = paths.normalize(value)
		return platform === "win32" ? normalized.toLowerCase() : normalized
	}
	const target = normalize(file)
	return (
		rules.find((rule) => {
			if (!rule || typeof rule.path !== "string" || !paths.isAbsolute(rule.path)) return false
			const excluded = normalize(rule.path)
			if (rule.kind === "file") return target === excluded
			if (rule.kind !== "folder") return false
			const relative = paths.relative(excluded, target)
			return (
				relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
			)
		}) ?? null
	)
}

interface PrivacyConfig {
	get(key: "contentExclusions"): AppConfig["contentExclusions"]
	set(key: "contentExclusions", value: ContentExclusion[]): void
}

interface PrivacyVlc {
	getCurrentFileUri(): Promise<string | null>
}

export class Service {
	private uriKey = ""
	private uriRead: Promise<string | null> | null = null
	private retryAt = 0

	constructor(
		private readonly vlc: PrivacyVlc,
		private readonly config: PrivacyConfig,
	) {}

	public async describe(status: VlcStatus, force = false): Promise<ContentPrivacy> {
		if (!status.active) {
			this.uriKey = ""
			this.uriRead = null
			this.retryAt = 0
			return { sourceUri: null, path: null, folder: null, exclusion: null, hidden: false }
		}
		let uri = status.media.sourceUri ?? null
		if ((!uri || force) && status.active) {
			const key = `${status.plid}|${status.media.filename ?? ""}|${status.media.title ?? ""}`
			if (force || key !== this.uriKey || !this.uriRead || Date.now() >= this.retryAt) {
				this.uriKey = key
				this.retryAt = Number.POSITIVE_INFINITY
				this.uriRead = this.vlc.getCurrentFileUri().catch(() => null)
				const read = this.uriRead
				void read.then((value) => {
					if (!value && this.uriRead === read) this.retryAt = Date.now() + 5000
				})
			}
			uri = await this.uriRead
			status.media.sourceUri = uri ?? undefined
		}
		const path = localPath(uri)
		const rules = this.config.get("contentExclusions") ?? []
		const exclusion = path ? matchingExclusion(path, rules) : null
		return {
			sourceUri: uri,
			path,
			folder: path ? (process.platform === "win32" ? win32 : posix).dirname(path) : null,
			exclusion,
			// With saved exclusions, wait for VLC's URI instead of publishing an unidentified file.
			hidden: exclusion !== null || (rules.length > 0 && (!uri || (/^file:/i.test(uri) && !path))),
		}
	}

	public async isExcluded(status: VlcStatus): Promise<boolean> {
		if (!this.config.get("contentExclusions")?.length) return false
		return (await this.describe(status)).hidden
	}

	public exclude(kind: ContentExclusion["kind"], privacy: ContentPrivacy): boolean {
		const path = kind === "folder" ? privacy.folder : privacy.path
		if (!path || (kind !== "file" && kind !== "folder")) return false
		const rules = this.config.get("contentExclusions") ?? []
		if (!rules.some((rule) => rule.kind === kind && rule.path === path)) {
			this.config.set("contentExclusions", [...rules, { kind, path }])
		}
		return true
	}

	public remove(rule: ContentExclusion): void {
		this.config.set(
			"contentExclusions",
			(this.config.get("contentExclusions") ?? []).filter(
				(entry) => entry.kind !== rule.kind || entry.path !== rule.path,
			),
		)
	}
}
