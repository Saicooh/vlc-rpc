import type { IpcChannel, IpcEvent, IpcEventPayload, IpcRequest, IpcResponse } from "@shared/ipc"
import { ipcRenderer } from "electron"

/**
 * Create a type-safe invoke function for a given IPC channel.
 *
 * Returns a function whose arguments and return type are inferred from the
 * `IpcInvokeChannelMap` contract.
 *
 * @example
 *   const getConfig = typedInvoke("config:get")
 *   const cfg = await getConfig()        // → AppConfig
 *   const val = await getConfig("vlc")   // → unknown
 */
export function typedInvoke<C extends IpcChannel>(
	channel: C,
): (...args: IpcRequest<C>) => Promise<IpcResponse<C>> {
	return (...args: IpcRequest<C>) => ipcRenderer.invoke(channel, ...args)
}

/**
 * Subscribe to a typed push event from the main process.
 *
 * Returns a cleanup function that removes the listener.
 *
 * @example
 *   const unsub = onEvent("window:maximized-change", (isMax) => { … })
 *   // later:
 *   unsub()
 */
export function onEvent<E extends IpcEvent>(
	event: E,
	callback: (payload: IpcEventPayload<E>) => void,
): () => void {
	const handler = (_: unknown, payload: IpcEventPayload<E>) => callback(payload)
	ipcRenderer.on(event, handler)
	return () => {
		ipcRenderer.removeListener(event, handler)
	}
}
