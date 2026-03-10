import { useStore } from "@nanostores/react"
import { useEffect, useState } from "react"
import { getProxiedImage } from "../media.actions"
import { mediaStore } from "../media.store"

/**
 * Hook that returns a proxied (data URL) version of the current media artwork.
 * Handles both the enriched content image URL and the basic VLC artwork URL.
 * Automatically re-proxies when the source URL changes.
 */
export function useProxiedArtwork(): string | null {
	const media = useStore(mediaStore)
	const [proxiedUrl, setProxiedUrl] = useState<string | null>(null)

	useEffect(() => {
		const artworkUrl = media.contentImageUrl || media.artwork
		if (artworkUrl) {
			getProxiedImage(artworkUrl).then(setProxiedUrl)
		} else {
			setProxiedUrl(null)
		}
	}, [media.contentImageUrl, media.artwork])

	return proxiedUrl
}
