import type { HlsProgressUpdate } from '../hls'
import { notifyDownloadComplete } from './start'
import { getDownloadTask, patchDownloadTask } from './tasks'

export async function applyHlsProgress(update: HlsProgressUpdate): Promise<void> {
  const task = await getDownloadTask(update.taskId)
  if (!task) {
    return
  }

  if (update.phase === 'error') {
    await patchDownloadTask(task.id, {
      status: 'failed',
      error: update.error || '无法跨域下载分片，可改用录制',
      segmentCurrent: update.current,
      segmentTotal: update.total || task.segmentTotal,
    })
    return
  }

  if (update.phase === 'paused') {
    await patchDownloadTask(task.id, {
      status: 'paused',
      segmentCurrent: update.current,
      segmentTotal: update.total,
      progress: update.total ? Math.round((update.current / update.total) * 100) : task.progress,
    })
    return
  }

  if (update.phase === 'segments') {
    if (task.status === 'paused') {
      return
    }
    await patchDownloadTask(task.id, {
      status: 'downloading',
      segmentCurrent: update.current,
      segmentTotal: update.total,
      progress: update.total ? Math.round((update.current / update.total) * 100) : 0,
    })
    return
  }

  if (update.phase === 'merging') {
    await patchDownloadTask(task.id, {
      status: 'merging',
      segmentCurrent: update.current,
      segmentTotal: update.total,
      progress: 99,
    })
    return
  }

  if (update.phase === 'done') {
    const updated = await patchDownloadTask(task.id, {
      status: 'completed',
      progress: 100,
      segmentCurrent: update.total,
      segmentTotal: update.total,
      chromeDownloadId: update.chromeDownloadId,
      error: undefined,
    })
    if (updated) {
      await notifyDownloadComplete(updated)
    }
  }
}
