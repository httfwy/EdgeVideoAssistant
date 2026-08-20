import type { Settings } from './types'

/** Popup / 浮层共用的播放倍率列表 */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3, 4, 8] as const

/** 与 UI 设计文档一致的默认设置 */
export const DEFAULT_SETTINGS: Settings = {
  notifyOnComplete: true,
  autoOpenFolder: false,
  recordMode: 'tab',
  recordFormat: 'webm',
  liveSegmentMinutes: 30,
  rememberPlaybackRate: false,
  showPageSpeedControl: true,
  recordVideoOnly: true,
}

/** chrome.storage.local 键名（与开发计划第 8 节一致） */
export const STORAGE_KEYS = {
  settings: 'settings',
  downloadTasks: 'downloadTasks',
  recordTasks: 'recordTasks',
  history: 'history',
  activeRecord: 'activeRecord',
} as const

/** 按 Tab 缓存检测结果的键前缀 */
export const DETECTED_KEY_PREFIX = 'detected:'
