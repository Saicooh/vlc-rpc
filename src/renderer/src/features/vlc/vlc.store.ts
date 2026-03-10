import type { ConnectionStatus, VlcConfig } from "@shared/types"
import { atom } from "nanostores"

export const vlcConfigStore = atom<VlcConfig | null>(null)
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")
export const vlcErrorStore = atom<string | null>(null)
