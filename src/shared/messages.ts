import type { MediaDraft } from '../modules/detector/classify'
import type { MediaKind, Settings, Snapshot } from './types'

/** Content Script / 刷新扫描上报 */
export interface DetectScanPayload {
  items: MediaDraft[]
  pageTitle?: string
  pageUrl?: string
  tabId?: number
}

export interface DownloadStartPayload {
  url: string
  name?: string
  resourceId?: string
  taskId?: string
  kind?: MediaKind
  canDirectDownload?: boolean
}

/** 消息 type 常量，避免各模块各写一套字符串 */
export const MessageType = {
  PING: 'PING',
  GET_SNAPSHOT: 'GET_SNAPSHOT',
  GET_SETTINGS: 'GET_SETTINGS',
  PATCH_SETTINGS: 'PATCH_SETTINGS',
  DETECT_REFRESH: 'DETECT_REFRESH',
  DETECT_RESULT: 'DETECT_RESULT',
  DOWNLOAD_START: 'DOWNLOAD_START',
  DOWNLOAD_CONTROL: 'DOWNLOAD_CONTROL',
  HLS_PROGRESS: 'HLS_PROGRESS',
  RECORD_CONTROL: 'RECORD_CONTROL',
  RECORD_STATE: 'RECORD_STATE',
  SET_PLAYBACK_RATE: 'SET_PLAYBACK_RATE',
} as const

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType]

export interface ExtensionMessage<T = unknown> {
  type: string
  payload?: T
}

export interface OkResponse {
  ok: true
}

export interface ErrorResponse {
  ok: false
  error: string
}

export interface SnapshotResponse extends OkResponse {
  snapshot: Snapshot
}

export interface SettingsResponse extends OkResponse {
  settings: Settings
}

export type MessageResponse =
  | OkResponse
  | ErrorResponse
  | SnapshotResponse
  | SettingsResponse

/** 已知但本步尚未实现的功能统一返回此文案 */
export const UNIMPLEMENTED_ERROR = '未实现'

const KNOWN_TYPES = new Set<string>(Object.values(MessageType))

export function isKnownMessageType(type: unknown): type is MessageTypeValue {
  return typeof type === 'string' && KNOWN_TYPES.has(type)
}

/**
 * 向 Service Worker 发送消息并等待回复。
 * 未实现或业务失败时 Promise 仍 resolve，由调用方根据 ok 判断。
 */
export function sendMessage<T extends MessageResponse = MessageResponse>(
  type: string,
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload } satisfies ExtensionMessage, (response: T) => {
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(new Error(lastError.message))
        return
      }
      resolve(response)
    })
  })
}
