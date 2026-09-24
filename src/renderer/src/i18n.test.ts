import { DEFAULT_CONFIG } from "@shared/config/defaults"
import { describeUpdateOffer } from "@shared/updates/update-offer.mapper"
import { describe, expect, it } from "vitest"
import { translate } from "./i18n"

describe("interface language", () => {
	it("starts in English and switches UI copy independently of episode title preference", () => {
		expect(DEFAULT_CONFIG.interfaceLanguage).toBe("en")
		expect(DEFAULT_CONFIG.preferSpanishEpisodeTitles).toBe(false)
		expect(translate("en", "Settings")).toBe("Settings")
		expect(translate("es", "Settings")).toBe("Configuración")
		expect(translate("es", "Season {season}, episode {episode}", { season: 3, episode: 4 })).toBe(
			"Temporada 3, episodio 4",
		)
		expect(translate("es", "An unknown media title")).toBe("An unknown media title")
	})

	it("interpolates update versions without parsing formatted English", () => {
		const offer = describeUpdateOffer("setup", { kind: "available", version: "5.1.0-beta.1" })
		expect(offer.kind).toBe("install")
		if (offer.kind !== "install") return
		expect(translate("es", offer.labelKey, { version: offer.version })).toBe(
			"Actualizar a 5.1.0-beta.1",
		)
		expect(translate("es", offer.detailKey, { version: offer.version })).toContain("5.1.0-beta.1")
	})
})
