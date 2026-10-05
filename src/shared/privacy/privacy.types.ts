export interface ContentExclusion {
	kind: "file" | "folder"
	path: string
}

export interface ContentPrivacy {
	sourceUri: string | null
	path: string | null
	folder: string | null
	exclusion: ContentExclusion | null
	hidden: boolean
}
