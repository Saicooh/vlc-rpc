const DISC_INDEX = /^index\.bdmv$/i
const DISC_FOLDER = /^bdmv$/i
const DRIVE_ROOT = /^[a-z]:$/i
const PRODUCT_CODE = /^[a-z]{2,8}[-_ ]?\d{3,}$/i

export function isBluRaySource(uri: string | undefined): boolean {
	return !!uri && (/^bluray:\/\//i.test(uri) || /\/BDMV(?:\/index\.bdmv)?\/?(?:\?.*)?$/i.test(uri))
}

/** A named rip folder can identify a disc; a drive root or product code cannot. */
export function bluRayFolderTitle(uri: string | undefined): string | null {
	if (!isBluRaySource(uri)) return null

	try {
		const segments = decodeURIComponent(new URL(uri as string).pathname)
			.split("/")
			.filter(Boolean)
		while (
			segments.length &&
			(DISC_INDEX.test(segments.at(-1) ?? "") || DISC_FOLDER.test(segments.at(-1) ?? ""))
		) {
			segments.pop()
		}
		const name = segments.at(-1)?.replace(/[._]+/g, " ").trim()
		return name && !DRIVE_ROOT.test(name) && !PRODUCT_CODE.test(name) ? name : null
	} catch {
		return null
	}
}
