import { classifyKind } from '../detector/classify'
import { appendHistory, getDownloadTasks, getSettings } from '../../shared/storage'
import type { DownloadKind, DownloadTask, MediaKind } from '../../shared/types'
import { isDirectKind, suggestDownloadFilename } from './filename'
import { startOffscreenHls } from './offscreen'
import { RECORD_FALLBACK } from './parseStream'
import { createDownloadTask, findInProgressByUrl, getDownloadTask, patchDownloadTask, upsertDownloadTask } from './tasks'

export interface DownloadStartInput {
  url: string
  name?: string
  taskId?: string
  kind?: MediaKind
  canDirectDownload?: boolean
  mediaUrl?: string
  quality?: string
}

export const DOWNLOAD_NOT_DIRECT = '未实现'

function interruptMessage(error?: chrome.downloads.InterruptReason): string {
  if (!error) {
    return '下载失败'
  }
  const map: Partial<Record<chrome.downloads.InterruptReason, string>> = {
    NETWORK_FAILED: '网络失败',
    NETWORK_TIMEOUT: '网络超时',
    NETWORK_DISCONNECTED: '网络已断开',
    NETWORK_SERVER_DOWN: '服务器无响应',
    NETWORK_INVALID_REQUEST: '请求无效',
    SERVER_BAD_CONTENT: '资源无效或已失效',
    SERVER_UNAUTHORIZED: '无权限下载该资源',
    SERVER_FORBIDDEN: '无权限下载该资源',
    SERVER_NOT_FOUND: '资源不存在',
    FILE_ACCESS_DENIED: '无法写入下载目录',
    FILE_NO_SPACE: '磁盘空间不足',
    USER_CANCELED: '已取消',
  }
  return map[error] ?? '下载失败'
}

export { interruptMessage }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function prepareTask(
  input: DownloadStartInput,
  kind: DownloadKind,
  mediaKind: MediaKind,
): Promise<{ task: DownloadTask; filename: string }> {
  const filename = suggestDownloadFilename(input.url, input.name, mediaKind)
  const existingActive = await findInProgressByUrl(input.url)
  if (existingActive && existingActive.id !== input.taskId) {
    return { task: existingActive, filename }
  }

  if (input.taskId) {
    const tasks = await getDownloadTasks()
    const found = tasks.find((item) => item.id === input.taskId)
    if (!found) {
      throw new Error('任务不存在')
    }
    const task: DownloadTask = {
      ...found,
      name: filename,
      url: input.url,
      kind,
      status: 'waiting',
      progress: 0,
      error: undefined,
      chromeDownloadId: undefined,
      segmentCurrent: 0,
      segmentTotal: undefined,
    }
    await upsertDownloadTask(task)
    return { task, filename }
  }

  const task = createDownloadTask({ url: input.url, name: filename, kind })
  await upsertDownloadTask(task)
  return { task, filename }
}

export async function startDirectDownload(input: DownloadStartInput): Promise<DownloadTask> {
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    throw new Error('链接无效')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('链接无效')
  }

  const mediaKind = input.kind ?? classifyKind(input.url)
  const { task, filename } = await prepareTask(input, 'direct', mediaKind)

  try {
    const downloadId = await chrome.downloads.download({
      url: input.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    })
    const updated = await patchDownloadTask(task.id, {
      chromeDownloadId: downloadId,
      status: 'downloading',
    })
    return updated ?? task
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '下载失败'
    const updated = await patchDownloadTask(task.id, {
      status: 'failed',
      error: message,
    })
    if (updated) {
      return updated
    }
    throw new Error(message)
  }
}

export async function startHlsDownload(input: DownloadStartInput): Promise<DownloadTask> {
  const playlistUrl = input.mediaUrl || input.url
  if (input.taskId) {
    const existing = await getDownloadTask(input.taskId)
    if (existing && (existing.status === 'paused' || existing.status === 'downloading')) {
      const filename = suggestDownloadFilename(existing.url, existing.name, 'hls')
      const startIndex = existing.segmentCurrent ?? 0
      await patchDownloadTask(existing.id, { status: 'downloading', error: undefined })
      await startOffscreenHls({
        taskId: existing.id,
        url: existing.url,
        filename,
        startIndex,
      })
      return existing
    }
  }

  const { task, filename } = await prepareTask(
    { ...input, url: playlistUrl, name: input.quality ? `${input.name ?? ''} ${input.quality}`.trim() : input.name },
    'hls',
    'hls',
  )
  if (task.status === 'downloading' || task.status === 'merging') {
    return task
  }

  await patchDownloadTask(task.id, {
    status: 'downloading',
    error: undefined,
    segmentCurrent: 0,
  })

  try {
    await startOffscreenHls({
      taskId: task.id,
      url: playlistUrl,
      filename,
      startIndex: 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '下载失败'
    const updated = await patchDownloadTask(task.id, { status: 'failed', error: message })
    if (updated) {
      return updated
    }
    throw new Error(message)
  }

  return (await patchDownloadTask(task.id, { status: 'downloading' })) ?? task
}

export async function startDownload(input: DownloadStartInput): Promise<DownloadTask> {
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    throw new Error('链接无效')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('链接无效')
  }

  const kind = input.kind ?? classifyKind(input.url)
  if (kind === 'hls') {
    return startHlsDownload(input)
  }
  if (kind === 'dash') {
    const target = input.mediaUrl
    if (!target) {
      throw new Error(RECORD_FALLBACK)
    }
    return startDirectDownload({
      ...input,
      url: target,
      kind: 'mp4',
      canDirectDownload: true,
      name: input.quality ? `${input.name ?? ''} ${input.quality}`.trim() : input.name,
    })
  }
  if (!isDirectKind(kind) && !input.canDirectDownload) {
    throw new Error(DOWNLOAD_NOT_DIRECT)
  }
  return startDirectDownload(input)
}

export async function notifyDownloadComplete(task: DownloadTask): Promise<void> {
  await appendHistory({
    id: crypto.randomUUID(),
    kind: 'download',
    name: task.name,
    source: `${hostOf(task.url)} · ${task.kind}`,
    url: task.url,
    createdAt: Date.now(),
  })

  const settings = await getSettings()
  if (settings.autoOpenFolder && task.chromeDownloadId !== undefined) {
    chrome.downloads.show(task.chromeDownloadId)
  }
  if (!settings.notifyOnComplete) {
    return
  }
  try {
    await chrome.notifications.create(`dl-${task.id}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Edge Video Assistant',
      message: '已保存到下载目录',
    })
  } catch {
    // 通知权限被拒时不影响任务状态
  }
}
