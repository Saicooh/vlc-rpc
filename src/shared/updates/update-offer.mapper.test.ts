import { describe, expect, it } from "vitest"
import { describeUpdateOffer } from "./update-offer.mapper"
import type { UpdateAvailability, UpdateInstallKind } from "./update.types"

const STATES: UpdateAvailability[] = [
	{ kind: "none" },
	{ kind: "available", version: "5.0.0" },
	{ kind: "downloading", version: "5.0.0", percent: 42 },
	{ kind: "ready", version: "5.0.0" },
	{ kind: "failed", version: "5.0.0" },
]

const KINDS: UpdateInstallKind[] = ["setup", "portable", "unknown"]

describe("describeUpdateOffer", () => {
	it("offers nothing while there is no release to act on", () => {
		for (const install of KINDS) {
			expect(describeUpdateOffer(install, { kind: "none" })).toEqual({ kind: "none" })
		}
	})

	it("offers nothing until the install kind is known", () => {
		for (const availability of STATES) {
			expect(describeUpdateOffer(null, availability)).toEqual({ kind: "none" })
		}
	})

	it("sends a portable copy to the release page in every state it can reach", () => {
		for (const availability of STATES.filter((state) => state.kind !== "none")) {
			expect(describeUpdateOffer("portable", availability).kind).toBe("release-page")
		}
	})

	it("never offers a portable copy an install it cannot apply", () => {
		const kinds = STATES.map((availability) => describeUpdateOffer("portable", availability).kind)

		expect(kinds).not.toContain("install")
		expect(kinds).not.toContain("working")
	})

	it("explains why an unidentified copy needs a manual update", () => {
		const offer = describeUpdateOffer("unknown", { kind: "available", version: "5.0.0" })
		expect(offer.kind).toBe("release-page")
		expect(offer.kind === "release-page" && offer.detailKey).toContain("could not tell")
	})

	it("offers an installed copy the install, and nothing else", () => {
		expect(describeUpdateOffer("setup", { kind: "available", version: "5.0.0" }).kind).toBe(
			"install",
		)
		expect(describeUpdateOffer("setup", { kind: "failed", version: "5.0.0" }).kind).toBe("install")
		expect(
			describeUpdateOffer("setup", { kind: "available", version: "5.0.0" }),
		).not.toHaveProperty("percent")
	})

	it("stops offering an action once the install is under way", () => {
		expect(
			describeUpdateOffer("setup", { kind: "downloading", version: "5.0.0", percent: 7 }),
		).toEqual({
			kind: "working",
			version: "5.0.0",
			labelKey: "Updating to {version}",
			detailKey: "Downloading {version}. The app restarts on its own to finish.",
			percent: 7,
		})
		expect(describeUpdateOffer("setup", { kind: "ready", version: "5.0.0" }).kind).toBe("working")
	})

	it("carries the percent through, and reads a downloaded update as finished", () => {
		const downloading = describeUpdateOffer("setup", {
			kind: "downloading",
			version: "5.0.0",
			percent: 63,
		})
		const ready = describeUpdateOffer("setup", { kind: "ready", version: "5.0.0" })

		expect(downloading.kind === "working" && downloading.percent).toBe(63)
		expect(ready.kind === "working" && ready.percent).toBe(100)
	})

	it("names the version on the button, in every state that has one", () => {
		for (const install of KINDS) {
			for (const availability of STATES) {
				const offer = describeUpdateOffer(install, availability)
				if (offer.kind === "none") continue

				expect(offer.labelKey).toContain("{version}")
				expect(offer.version).toBe("5.0.0")
			}
		}
	})

	it("says what pressing it does, including the restart", () => {
		const installed = describeUpdateOffer("setup", { kind: "available", version: "5.0.0" })
		const portable = describeUpdateOffer("portable", { kind: "available", version: "5.0.0" })

		expect(installed.kind === "install" && installed.detailKey).toContain("restarts")
		expect(portable.kind === "release-page" && portable.detailKey).toContain("release page")
		expect(portable.kind === "release-page" && portable.detailKey).not.toContain("restarts")
	})

	it("gives every offer a label and a detail", () => {
		for (const install of KINDS) {
			for (const availability of STATES) {
				const offer = describeUpdateOffer(install, availability)
				if (offer.kind === "none") continue

				expect(offer.labelKey.length).toBeGreaterThan(0)
				expect(offer.detailKey.length).toBeGreaterThan(0)
			}
		}
	})
})
