/** 媒体资源类型（按 URL 后缀 / 路径识别） */
export type MediaKind = 'mp4' | 'webm' | 'mov' | 'avi' | 'hls' | 'dash' | 'unknown'

/** 下载任务来源种类 */
export type DownloadKind = 'direct' | 'hls' | 'dash'

/** 下载任务状态 */
export type DownloadStatus =
  | 'waiting'
  | 'downloading'
  | 'merging'
  | 'paused'
  | 'completed'
  | 'failed'

/** 录制方式 */
export type RecordMode = 'tab' | 'screen' | 'live'

/** 录制任务状态 */
export type RecordStatus = 'idle' | 'recording' | 'paused' | 'completed' | 'failed'

/** 录制输出格式 */
export type RecordFormat = 'webm' | 'mp4'

/** 当前页检测到的视频资源 */
export interface VideoResource {
  id: string
  url: string
  title: string
  kind: MediaKind
  tabId: number
  pageTitle?: string
  pageUrl?: string
  quality?: string
  sizeBytes?: number
  isLive: boolean
  needsParse: boolean
  canDirectDownload: boolean
  /** DRM / 加密等无法直链保存时的说明，不含破解相关措辞 */
  unsupportedReason?: string
  detectedAt: number
}

/** 下载任务 */
export interface DownloadTask {
  id: string
  name: string
  url: string
  kind: DownloadKind
  status: DownloadStatus
  /** 0～100；未知时为 0 */
  progress: number
  segmentCurrent?: number
  segmentTotal?: number
  chromeDownloadId?: number
  error?: string
  createdAt: number
  updatedAt: number
}

/** 录制任务 */
export interface RecordTask {
  id: string
  name: string
  mode: RecordMode
  status: RecordStatus
  durationMs: number
  format: RecordFormat
  estimatedSizeBytes?: number
  segmentIndex?: number
  error?: string
  createdAt: number
  updatedAt: number
}

/** 历史记录条目 */
export interface HistoryEntry {
  id: string
  kind: 'download' | 'record'
  name: string
  source?: string
  sizeBytes?: number
  url?: string
  createdAt: number
}

/** 进行中的录制快照（便于 Popup 恢复） */
export interface ActiveRecord {
  taskId: string
  mode: RecordMode
  status: Extract<RecordStatus, 'recording' | 'paused'>
  startedAt: number
  elapsedMs: number
}

/** 用户设置 */
export interface Settings {
  notifyOnComplete: boolean
  autoOpenFolder: boolean
  recordMode: Extract<RecordMode, 'tab' | 'screen'>
  recordFormat: RecordFormat
  liveSegmentMinutes: number
  rememberPlaybackRate: boolean
  showPageSpeedControl: boolean
  lastPlaybackRate?: number
}

/** Popup / 任务页读取的存储快照 */
export interface Snapshot {
  settings: Settings
  downloadTasks: DownloadTask[]
  recordTasks: RecordTask[]
  detected: VideoResource[]
  activeRecord: ActiveRecord | null
}
