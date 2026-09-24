import type { AppConfig } from "@shared/config/app-config"
import { CONFIG_NAME, DEFAULT_CONFIG } from "@shared/config/defaults"

import { Conf } from "electron-conf/main"
import { registerHandler } from "./ipc"
import { logger } from "./logger"

class ConfigService {
	private static instance: ConfigService | null = null
	private conf: Conf<AppConfig>
	private readonly listeners = new Map<keyof AppConfig, Set<() => void>>()

	private constructor() {
		this.conf = new Conf<AppConfig>({
			name: CONFIG_NAME,
			defaults: DEFAULT_CONFIG,
		})

		logger.info("Configuration loaded", { path: this.conf.fileName })

		this.registerIpcHandlers()
	}

	public static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService()
		}
		return ConfigService.instance
	}

	private registerIpcHandlers(): void {
		registerHandler("config:get", (key?) => {
			if (key) {
				return this.conf.get(key)
			}
			return this.conf.store
		})

		registerHandler("config:set", (key, value) => {
			this.conf.set(key, value)
			// The value stays out of the log: config holds the VLC http password.
			logger.info(`Config updated: ${key}`)
			this.notifyChange(key as keyof AppConfig)
			return true
		})
	}

	public get(): AppConfig
	public get<K extends keyof AppConfig>(key: K): AppConfig[K]
	public get<K extends keyof AppConfig>(key?: K): AppConfig | AppConfig[K] {
		if (key) {
			return this.conf.get(key)
		}
		return this.conf.store
	}

	public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
		this.conf.set(key, value)
		// The value stays out of the log: config holds the VLC http password.
		logger.info(`Config updated: ${key}`)
		this.notifyChange(key)
	}

	public onChange(key: keyof AppConfig, listener: () => void): () => void {
		const listeners = this.listeners.get(key) ?? new Set<() => void>()
		listeners.add(listener)
		this.listeners.set(key, listeners)
		return () => {
			listeners.delete(listener)
			if (listeners.size === 0) this.listeners.delete(key)
		}
	}

	private notifyChange(key: keyof AppConfig): void {
		for (const listener of this.listeners.get(key) ?? []) listener()
	}

	public delete<K extends keyof AppConfig>(key: K): void {
		this.conf.delete(key)
		logger.info(`Config deleted: ${key}`)
		this.notifyChange(key)
	}
}

export const configService = ConfigService.getInstance()
