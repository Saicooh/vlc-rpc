import { useStore } from "@nanostores/react"
import { mediaStore } from "../media.store"
import { useProxiedImage } from "./use-proxied-image"

/** The resolved cover wins over VLC's own, which is the coarser of the two. */
export function useProxiedArtwork(): string | null {
	const media = useStore(mediaStore)
	const image = useProxiedImage(
		media.privacy?.hidden ? null : media.contentImageUrl || media.artwork,
	)
	return media.privacy?.hidden ? null : image
}
