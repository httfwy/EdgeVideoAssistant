import type { MediaDraft } from '../modules/detector/classify'
import type { MediaKind, RecordMode, Settings, Snapshot } from './types'

/** Content Script / 刷新扫描上报 */
export interface DetectScanPayload {
  items: MediaDraft[]
  pageTitle?: string
  pageUrl?: string
  tabId?: number
  /** 用当前稿件的 playurl 结果替换已缓存的 B 站媒体，去掉「接下来播放」预加载 */
  replaceBili?: boolean
}

/** 拉流后封装：仅视频、仅音频、音视频合并，或保留文件内全部轨道 */
export type FetchOutputMode = 'video' | 'audio' | 'mux' | 'file'

export interface DownloadStartPayload {
  url: string
  name?: string
  resourceId?: string
  taskId?: string
  kind?: MediaKind
  canDirectDownload?: boolean
  /** 选定的 media playlist 或轨道地址 */
  mediaUrl?: string
  quality?: string
  referrer?: string
  backupUrls?: string[]
  outputMode?: FetchOutputMode
  audioUrl?: string
  audioBackupUrls?: string[]
}

export interface ParseStreamPayload {
  url: string
  kind?: MediaKind
  resourceId?: string
  tabId?: number
}

export type RecordControlAction = 'start' | 'pause' | 'resume' | 'stop'

export interface RecordControlPayload {
  action: RecordControlAction
  mode?: RecordMode
  tabId?: number
  taskId?: string
  url?: string
  name?: string
}

/** 视频区域相对当前视口的矩形，供 Offscreen 画布裁切 */
export interface CropRectPayload {
  taskId: string
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export interface RecordPrepareCropPayload {
  taskId: string
  tabId?: number
}

/** Offscreen 与裁切桥页之间传递 CropTarget */
export const CROP_CHANNEL = 'eva-crop-target'

export interface RecordStatePayload {
  taskId: string
  status: 'recording' | 'paused' | 'completed' | 'failed'
  elapsedMs: number
  estimatedSizeBytes?: number
  segmentIndex?: number
  chromeDownloadId?: number
  error?: string
}

export interface PlaybackRatePayload {
  rate: number
  tabId?: number
}

export type DownloadControlAction =
  | 'pause'
  | 'resume'
  | 'delete'
  | 'show'
  | 'pauseAll'
  | 'resumeAll'
  | 'clearCompleted'
  | 'deleteHistory'
  | 'redownload'

export interface DownloadControlPayload {
  action: DownloadControlAction
  taskId?: string
  historyId?: string
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
  PARSE_STREAM: 'PARSE_STREAM',
  HLS_START: 'HLS_START',
  HLS_PAUSE: 'HLS_PAUSE',
  HLS_ABORT: 'HLS_ABORT',
  HLS_PROGRESS: 'HLS_PROGRESS',
  RECORD_CONTROL: 'RECORD_CONTROL',
  RECORD_STATE: 'RECORD_STATE',
  RECORD_PREPARE_CROP: 'RECORD_PREPARE_CROP',
  RECORD_CROP_RECT: 'RECORD_CROP_RECT',
  RECORD_STOP_CROP: 'RECORD_STOP_CROP',
  SET_PLAYBACK_RATE: 'SET_PLAYBACK_RATE',
  HLS_LIVE_START: 'HLS_LIVE_START',
  PAGE_MEDIA: 'PAGE_MEDIA',
  /** Offscreen 无 chrome.downloads，委托 Service Worker 保存 Blob */
  SAVE_BLOB: 'SAVE_BLOB',
  /** Offscreen 带 Referer 拉取原始媒体文件 */
  FETCH_SAVE: 'FETCH_SAVE',
  FETCH_PROGRESS: 'FETCH_PROGRESS',
} as const

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType]

export interface ExtensionMessage<T = unknown> {
  type: string
  payload?: T
  /** 仅 Service Worker → Offscreen 的命令带此标记，避免 Popup 消息被 Offscreen 误回「任务无效」 */
  target?: 'offscreen'
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

export interface SaveBlobPayload {
  url: string
  filename: string
}

export interface SaveBlobResponse extends OkResponse {
  downloadId: number
}

export interface FetchSavePayload {
  taskId: string
  url: string
  filename: string
  referrer?: string
  backupUrls?: string[]
  outputMode?: FetchOutputMode
  audioUrl?: string
  audioBackupUrls?: string[]
}

export interface FetchProgressUpdate {
  taskId: string
  status: 'downloading' | 'merging' | 'completed' | 'failed'
  progress: number
  chromeDownloadId?: number
  error?: string
}

export type MessageResponse =
  | OkResponse
  | ErrorResponse
  | SnapshotResponse
  | SettingsResponse
  | SaveBlobResponse

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
