import type { DownloadTask } from '../../shared/types'
import { MessageType, type DownloadControlPayload } from '../../shared/messages'
import { getDownloadTasks, getHistory, removeHistory, setDownloadTasks } from '../../shared/storage'
import { sendToOffscreen } from './offscreen'
import { startDownload, startHlsDownload } from './start'
import { getDownloadTask, patchDownloadTask, removeDownloadTask } from './tasks'

async function pauseTask(task: DownloadTask): Promise<void> {
  if (task.kind === 'hls') {
    await sendToOffscreen(MessageType.HLS_PAUSE, { taskId: task.id })
    await patchDownloadTask(task.id, { status: 'paused' })
    return
  }
  if (task.chromeDownloadId !== undefined) {
    try {
      await chrome.downloads.pause(task.chromeDownloadId)
    } catch {
      // 已结束的下载可能无法暂停
    }
  }
  await patchDownloadTask(task.id, { status: 'paused' })
}

async function resumeTask(task: DownloadTask): Promise<void> {
  if (task.kind === 'hls') {
    await startHlsDownload({
      url: task.url,
      name: task.name,
      taskId: task.id,
      kind: 'hls',
    })
    return
  }
  if (task.chromeDownloadId !== undefined) {
    try {
      await chrome.downloads.resume(task.chromeDownloadId)
      await patchDownloadTask(task.id, { status: 'downloading' })
      return
    } catch {
      await startDownload({ url: task.url, name: task.name, taskId: task.id, canDirectDownload: true })
      return
    }
  }
  await startDownload({ url: task.url, name: task.name, taskId: task.id, canDirectDownload: true })
}

async function deleteTask(task: DownloadTask): Promise<void> {
  if (task.kind === 'hls') {
    await sendToOffscreen(MessageType.HLS_ABORT, { taskId: task.id })
  }
  if (task.chromeDownloadId !== undefined) {
    try {
      await chrome.downloads.cancel(task.chromeDownloadId)
    } catch {
      // 忽略已结束任务
    }
  }
  await removeDownloadTask(task.id)
}

export async function controlDownload(payload: DownloadControlPayload): Promise<void> {
  const { action, taskId, historyId } = payload

  if (action === 'pauseAll') {
    const tasks = await getDownloadTasks()
    for (const task of tasks) {
      if (task.status === 'downloading' || task.status === 'waiting' || task.status === 'merging') {
        await pauseTask(task)
      }
    }
    return
  }

  if (action === 'resumeAll') {
    const tasks = await getDownloadTasks()
    for (const task of tasks) {
      if (task.status === 'paused' || task.status === 'failed') {
        await resumeTask(task)
      }
    }
    return
  }

  if (action === 'clearCompleted') {
    const tasks = await getDownloadTasks()
    await setDownloadTasks(tasks.filter((item) => item.status !== 'completed'))
    return
  }

  if (action === 'deleteHistory' && historyId) {
    await removeHistory(historyId)
    return
  }

  if (action === 'redownload' && historyId) {
    const entries = await getHistory()
    const entry = entries.find((item) => item.id === historyId)
    if (!entry?.url) {
      throw new Error('无法重新下载')
    }
    await startDownload({ url: entry.url, name: entry.name })
    return
  }

  if (!taskId) {
    throw new Error('任务不存在')
  }
  const task = await getDownloadTask(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  if (action === 'pause') {
    await pauseTask(task)
    return
  }
  if (action === 'resume') {
    await resumeTask(task)
    return
  }
  if (action === 'delete') {
    await deleteTask(task)
    return
  }
  if (action === 'show') {
    if (task.chromeDownloadId === undefined) {
      throw new Error('文件尚未保存')
    }
    chrome.downloads.show(task.chromeDownloadId)
  }
}
