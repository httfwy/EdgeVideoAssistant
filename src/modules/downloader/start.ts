import { classifyKind } from '../detector/classify'
import { getDownloadTasks, getSettings } from '../../shared/storage'
import type { DownloadTask, MediaKind } from '../../shared/types'
import { isDirectKind, suggestDownloadFilename } from './filename'
import { createDownloadTask, findInProgressByUrl, patchDownloadTask, upsertDownloadTask } from './tasks'

export interface DownloadStartInput {
  url: string
  name?: string
  taskId?: string
  kind?: MediaKind
  canDirectDownload?: boolean
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

  const kind = input.kind ?? classifyKind(input.url)
  if (kind === 'hls' || kind === 'dash' || (!isDirectKind(kind) && !input.canDirectDownload)) {
    throw new Error(DOWNLOAD_NOT_DIRECT)
  }

  const filename = suggestDownloadFilename(input.url, input.name, kind)
  const existingActive = await findInProgressByUrl(input.url)
  if (existingActive && existingActive.id !== input.taskId) {
    return existingActive
  }

  let task: DownloadTask
  if (input.taskId) {
    const tasks = await getDownloadTasks()
    const found = tasks.find((item) => item.id === input.taskId)
    if (!found) {
      throw new Error('任务不存在')
    }
    task = {
      ...found,
      name: filename,
      url: input.url,
      kind: 'direct',
      status: 'waiting',
      progress: 0,
      error: undefined,
      chromeDownloadId: undefined,
    }
    await upsertDownloadTask(task)
  } else {
    task = createDownloadTask({ url: input.url, name: filename, kind: 'direct' })
    await upsertDownloadTask(task)
  }

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

export async function notifyDownloadComplete(task: DownloadTask): Promise<void> {
  const settings = await getSettings()
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
