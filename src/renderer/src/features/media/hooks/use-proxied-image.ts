import { useEffect, useState } from "react"
import { getProxiedImage } from "../media.actions"

/** Fetch on source changes, retry transient failures, and discard answers from an older source. */
export function useProxiedImage(source: string | null | undefined): string | null {
	const [image, setImage] = useState<{ source: string; dataUrl: string | null } | null>(null)
	useEffect(() => {
		let current = true
		let retry: ReturnType<typeof setTimeout> | undefined
		setImage(null)
		if (!source) return
		const requestedSource = source
		async function load(): Promise<void> {
			const result = await getProxiedImage(requestedSource)
			if (!current) return
			setImage({ source: requestedSource, dataUrl: result })
			if (!result) retry = setTimeout(() => void load(), 30_000)
		}
		void load()
		return () => {
			current = false
			clearTimeout(retry)
		}
	}, [source])
	return image && image.source === source ? image.dataUrl : null
}
