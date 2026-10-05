import { useStore } from "@nanostores/react"
import { mediaStore } from "../media.store"
import { useProxiedImage } from "./use-proxied-image"

/** The resolved cover wins over VLC's own, which is the coarser of the two. */
export function useProxiedArtwork(): string | null {
	const media = useStore(mediaStore)
	return useProxiedImage(media.contentImageUrl || media.artwork)
}
