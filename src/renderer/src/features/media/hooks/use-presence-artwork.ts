import { useProxiedImage } from "./use-proxied-image"

/**
 * The image Discord was actually handed, not the one this screen would have picked:
 * right after a correction is saved the two differ, which is the case the card exists
 * to reveal.
 *
 * `large_image` is either an address or one of the Discord application's own asset keys.
 * An asset key is not something the renderer can fetch, and the page's CSP blocks remote
 * images anyway, so an address goes through the proxy and anything else falls back to the
 * card's placeholder.
 */
export function usePresenceArtwork(largeImage: string | undefined): string | null {
	return useProxiedImage(largeImage && /^https?:\/\//i.test(largeImage) ? largeImage : null)
}
