import type { FetchProgressUpdate } from '../../shared/messages'
import { notifyDownloadComplete } from './start'
import { getDownloadTask, patchDownloadTask } from './tasks'

export async function applyFetchProgress(update: FetchProgressUpdate): Promise<void> {
  const task = await getDownloadTask(update.taskId)
  if (!task) {
    return
  }

  if (update.status === 'failed') {
    await patchDownloadTask(task.id, {
      status: 'failed',
      error: update.error || '下载失败',
      progress: update.progress,
    })
    return
  }

  if (update.status === 'merging') {
    await patchDownloadTask(task.id, {
      status: 'merging',
      progress: update.progress,
      error: undefined,
    })
    return
  }

  if (update.status === 'completed') {
    const updated = await patchDownloadTask(task.id, {
      status: 'completed',
      progress: 100,
      chromeDownloadId: update.chromeDownloadId,
      error: undefined,
    })
    if (updated) {
      await notifyDownloadComplete(updated)
    }
    return
  }

  await patchDownloadTask(task.id, {
    status: 'downloading',
    progress: update.progress,
    error: undefined,
  })
}
