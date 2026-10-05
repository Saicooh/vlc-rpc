// Remaster labels describe the edition; live takes and remixes remain part of
// the recording's identity. Require a separator so a song named "Remastered"
// or "The Remaster" keeps its complete name.
const REMASTER_SUFFIX =
	/\s*(?:\(\s*|\[\s*|\s[-–—]\s)(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\s*[)\]]?\s*$/i

export function recordingTitle(title: string): string {
	const cleaned = title.replace(REMASTER_SUFFIX, "").trim()
	return cleaned || title
}
