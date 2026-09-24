import type { UpdateAvailability, UpdateInstallKind } from "./update.types"

/**
 * What the header button offers, if anything. There are two destinations and
 * never a third: an installed copy installs and restarts, a portable copy goes
 * to the release page. `working` is that same install already in flight, which
 * is why it carries no action.
 *
 * The renderer formats each message key with the version. The label goes on
 * the button and the detail says what pressing it does.
 */
export type UpdateOffer =
	| { kind: "none" }
	| { kind: "install"; version: string; labelKey: string; detailKey: string }
	| { kind: "release-page"; version: string; labelKey: string; detailKey: string }
	| { kind: "working"; version: string; labelKey: string; detailKey: string; percent: number }

const NONE: UpdateOffer = { kind: "none" }

/**
 * Nothing to act on means no button at all. A greyed out control saying the app
 * is up to date is a permanent piece of furniture for a message that is true
 * almost always, and it teaches the eye to stop reading the header.
 *
 * The install kind is answered by the main process before this is asked, so
 * `null` here means the answer has not arrived yet: offering a portable copy an
 * install it cannot apply is the bug this guard exists to prevent.
 */
export function describeUpdateOffer(
	install: UpdateInstallKind | null,
	availability: UpdateAvailability,
): UpdateOffer {
	if (install === null || availability.kind === "none") return NONE

	const { version } = availability

	if (install !== "setup") {
		return {
			kind: "release-page",
			version,
			labelKey: "Get {version}",
			detailKey:
				install === "portable"
					? "Opens the release page. This copy is portable, so it cannot replace itself: download {version} there and swap the file."
					: "Opens the release page. The app could not tell how this copy was installed, so download {version} manually.",
		}
	}

	switch (availability.kind) {
		case "available":
			return {
				kind: "install",
				version,
				labelKey: "Update to {version}",
				detailKey: "Downloads {version}, installs it and restarts the app. VLC is not touched.",
			}
		case "failed":
			return {
				kind: "install",
				version,
				labelKey: "Retry update to {version}",
				detailKey:
					"The download of {version} did not finish. Pressing again starts it over, then the app restarts to install it.",
			}
		case "downloading":
			return {
				kind: "working",
				version,
				labelKey: "Updating to {version}",
				detailKey: "Downloading {version}. The app restarts on its own to finish.",
				percent: availability.percent,
			}
		case "ready":
			return {
				kind: "working",
				version,
				labelKey: "Updating to {version}",
				detailKey: "Restarting to install {version}.",
				percent: 100,
			}
	}
}
