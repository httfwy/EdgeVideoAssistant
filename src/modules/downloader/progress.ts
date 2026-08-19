import { findTaskByDownloadId, patchDownloadTask } from './tasks'
import { interruptMessage, notifyDownloadComplete } from './start'

async function refreshProgress(downloadId: number): Promise<number> {
  const items = await chrome.downloads.search({ id: downloadId })
  const item = items[0]
  if (!item || item.totalBytes <= 0) {
    return 0
  }
  return Math.min(100, Math.round((item.bytesReceived / item.totalBytes) * 100))
}

/** 注册 chrome.downloads 监听；在 Service Worker 启动时调用一次 */
export function registerDownloadListeners(): void {
  chrome.downloads.onChanged.addListener((delta) => {
    void handleDownloadChanged(delta)
  })
}

async function handleDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  const task = await findTaskByDownloadId(delta.id)
  if (!task) {
    return
  }

  // HLS 分片进度由 Offscreen 上报，避免 Blob 落盘把状态改回下载中或重复通知
  if (task.kind === 'hls') {
    if (delta.state?.current === 'interrupted' && task.status !== 'completed') {
      await patchDownloadTask(task.id, {
        status: 'failed',
        error: interruptMessage(delta.error?.current),
      })
    }
    return
  }

  const progress = await refreshProgress(delta.id)
  const state = delta.state?.current

  if (state === 'complete') {
    const updated = await patchDownloadTask(task.id, {
      status: 'completed',
      progress: 100,
      error: undefined,
    })
    if (updated) {
      await notifyDownloadComplete(updated)
    }
    return
  }

  if (state === 'interrupted') {
    await patchDownloadTask(task.id, {
      status: 'failed',
      error: interruptMessage(delta.error?.current),
    })
    return
  }

  if (progress > 0 && progress !== task.progress) {
    await patchDownloadTask(task.id, {
      status: 'downloading',
      progress,
    })
  }
}
