import type { IpcEventMap, IpcInvokeChannelMap } from "./channels"

// ─── Utility Types ──────────────────────────────────────────────────────────

/** Union of all invoke channel strings */
export type IpcChannel = keyof IpcInvokeChannelMap

/** Extract the request args tuple for a given channel */
export type IpcRequest<C extends IpcChannel> = IpcInvokeChannelMap[C]["request"]

/** Extract the response type for a given channel */
export type IpcResponse<C extends IpcChannel> = IpcInvokeChannelMap[C]["response"]

/** Union of all push-event channel strings */
export type IpcEvent = keyof IpcEventMap

/** Extract the payload type for a given event */
export type IpcEventPayload<E extends IpcEvent> = IpcEventMap[E]
