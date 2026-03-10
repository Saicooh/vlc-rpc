import type { AppStatus } from "@shared/types"
import { atom } from "nanostores"

export const appStatusStore = atom<AppStatus>("idle")
export const errorStore = atom<string | null>(null)
