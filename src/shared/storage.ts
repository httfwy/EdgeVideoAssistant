import { DEFAULT_SETTINGS, DETECTED_KEY_PREFIX, STORAGE_KEYS } from './constants'
import type {
  ActiveRecord,
  DownloadTask,
  HistoryEntry,
  RecordTask,
  Settings,
  Snapshot,
  VideoResource,
} from './types'

function detectedKey(tabId: number): string {
  return `${DETECTED_KEY_PREFIX}${tabId}`
}

async function getLocal<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key)
  return result[key] as T | undefined
}

async function setLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

/** 读取用户设置；缺省时返回默认值 */
export async function getSettings(): Promise<Settings> {
  const stored = await getLocal<Partial<Settings>>(STORAGE_KEYS.settings)
  return { ...DEFAULT_SETTINGS, ...stored }
}

/** 浅合并并写入设置 */
export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch }
  await setLocal(STORAGE_KEYS.settings, next)
  return next
}

/** 若尚未写入过设置，则落盘默认值 */
export async function ensureDefaultSettings(): Promise<Settings> {
  const stored = await getLocal<Partial<Settings>>(STORAGE_KEYS.settings)
  if (stored) {
    return { ...DEFAULT_SETTINGS, ...stored }
  }
  await setLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function getDownloadTasks(): Promise<DownloadTask[]> {
  return (await getLocal<DownloadTask[]>(STORAGE_KEYS.downloadTasks)) ?? []
}

export async function setDownloadTasks(tasks: DownloadTask[]): Promise<void> {
  await setLocal(STORAGE_KEYS.downloadTasks, tasks)
}

export async function getRecordTasks(): Promise<RecordTask[]> {
  return (await getLocal<RecordTask[]>(STORAGE_KEYS.recordTasks)) ?? []
}

export async function setRecordTasks(tasks: RecordTask[]): Promise<void> {
  await setLocal(STORAGE_KEYS.recordTasks, tasks)
}

/** 组合读取下载与录制任务 */
export async function getTasks(): Promise<{
  downloadTasks: DownloadTask[]
  recordTasks: RecordTask[]
}> {
  const [downloadTasks, recordTasks] = await Promise.all([getDownloadTasks(), getRecordTasks()])
  return { downloadTasks, recordTasks }
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return (await getLocal<HistoryEntry[]>(STORAGE_KEYS.history)) ?? []
}

export async function setHistory(entries: HistoryEntry[]): Promise<void> {
  await setLocal(STORAGE_KEYS.history, entries)
}

export async function getDetectedByTab(tabId: number): Promise<VideoResource[]> {
  return (await getLocal<VideoResource[]>(detectedKey(tabId))) ?? []
}

export async function setDetectedByTab(tabId: number, resources: VideoResource[]): Promise<void> {
  await setLocal(detectedKey(tabId), resources)
}

export async function getActiveRecord(): Promise<ActiveRecord | null> {
  return (await getLocal<ActiveRecord | null>(STORAGE_KEYS.activeRecord)) ?? null
}

export async function setActiveRecord(record: ActiveRecord | null): Promise<void> {
  await setLocal(STORAGE_KEYS.activeRecord, record)
}

/**
 * 读取 UI 快照。detected 需传入当前 tabId；本步检测未接通时传 undefined 则返回空列表。
 */
export async function getSnapshot(tabId?: number): Promise<Snapshot> {
  const [settings, downloadTasks, recordTasks, activeRecord, detected] = await Promise.all([
    getSettings(),
    getDownloadTasks(),
    getRecordTasks(),
    getActiveRecord(),
    tabId === undefined ? Promise.resolve([] as VideoResource[]) : getDetectedByTab(tabId),
  ])

  return {
    settings,
    downloadTasks,
    recordTasks,
    detected,
    activeRecord,
  }
}
