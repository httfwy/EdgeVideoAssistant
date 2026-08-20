import { MessageType, type RecordControlPayload, type RecordStatePayload } from '../../shared/messages'
import { appendHistory, getActiveRecord, getSettings, setActiveRecord } from '../../shared/storage'
import { sendToOffscreen } from '../downloader/offscreen'
import { createRecordTask, getRecordTask, patchRecordTask, upsertRecordTask } from './tasks'

export const CAPTURE_DENIED = '请允许标签页捕获后重试'

function fileBase(mode: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `record-${mode}-${stamp}`
}

export async function applyRecordState(update: RecordStatePayload): Promise<void> {
  const current = await getRecordTask(update.taskId)
  if (current?.status === 'completed' && update.status === 'failed') {
    return
  }

  const patched = await patchRecordTask(update.taskId, {
    status: update.status === 'recording' || update.status === 'paused' ? update.status : update.status,
    durationMs: update.elapsedMs,
    estimatedSizeBytes: update.estimatedSizeBytes,
    segmentIndex: update.segmentIndex,
    error: update.error,
  })

  if (update.status === 'recording' || update.status === 'paused') {
    const current = await getActiveRecord()
    await setActiveRecord({
      taskId: update.taskId,
      mode: current?.mode ?? 'tab',
      status: update.status,
      startedAt: current?.startedAt ?? Date.now(),
      elapsedMs: update.elapsedMs,
    })
  }

  if (update.status === 'completed' || update.status === 'failed') {
    await setActiveRecord(null)
    if (update.status === 'completed' && patched) {
      await appendHistory({
        id: crypto.randomUUID(),
        kind: 'record',
        name: patched.name,
        source: patched.mode,
        createdAt: Date.now(),
      })
      const settings = await getSettings()
      if (settings.notifyOnComplete) {
        try {
          await chrome.notifications.create(`rec-${patched.id}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Edge Video Assistant',
            message: '已保存到下载目录',
          })
        } catch {
          // 通知失败不影响任务
        }
      }
      if (settings.autoOpenFolder && update.chromeDownloadId !== undefined) {
        chrome.downloads.show(update.chromeDownloadId)
      }
    }
  }
}

export async function controlRecord(payload: RecordControlPayload): Promise<void> {
  if (payload.action === 'start') {
    const existing = await getActiveRecord()
    if (existing) {
      const existingTask = await getRecordTask(existing.taskId)
      if (existingTask && (existingTask.status === 'recording' || existingTask.status === 'paused')) {
        throw new Error('已有录制进行中')
      }
      await setActiveRecord(null)
    }
    const mode = payload.mode === 'live' && !payload.url ? 'tab' : (payload.mode ?? 'tab')
    const task = createRecordTask({ name: payload.name || fileBase(mode), mode })
    await upsertRecordTask(task)
    await setActiveRecord({
      taskId: task.id,
      mode,
      status: 'recording',
      startedAt: Date.now(),
      elapsedMs: 0,
    })

    const settings = await getSettings()
    let streamId: string | undefined
    if (mode === 'tab') {
      const tabId = payload.tabId
      if (tabId === undefined) {
        throw new Error(CAPTURE_DENIED)
      }
      try {
        streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
      } catch {
        await patchRecordTask(task.id, { status: 'failed', error: CAPTURE_DENIED })
        await setActiveRecord(null)
        throw new Error(CAPTURE_DENIED)
      }
    }

    try {
      await sendToOffscreen(MessageType.RECORD_CONTROL, {
        action: 'start',
        taskId: task.id,
        mode,
        streamId,
        filename: task.name,
        url: payload.url,
        segmentMinutes: settings.liveSegmentMinutes,
      })
    } catch {
      await patchRecordTask(task.id, { status: 'failed', error: CAPTURE_DENIED })
      await setActiveRecord(null)
      throw new Error(CAPTURE_DENIED)
    }
    return
  }

  const active = await getActiveRecord()
  const taskId = payload.taskId ?? active?.taskId
  if (!taskId) {
    throw new Error('没有进行中的录制')
  }

  if (payload.action === 'pause') {
    await sendToOffscreen(MessageType.RECORD_CONTROL, { action: 'pause', taskId })
    await patchRecordTask(taskId, { status: 'paused' })
    if (active) {
      await setActiveRecord({ ...active, status: 'paused' })
    }
    return
  }
  if (payload.action === 'resume') {
    await sendToOffscreen(MessageType.RECORD_CONTROL, { action: 'resume', taskId })
    await patchRecordTask(taskId, { status: 'recording' })
    if (active) {
      await setActiveRecord({ ...active, status: 'recording' })
    }
    return
  }
  if (payload.action === 'stop') {
    try {
      await sendToOffscreen(MessageType.RECORD_CONTROL, {
        action: 'stop',
        taskId,
        mode: payload.mode ?? active?.mode,
      })
    } catch {
      await applyRecordState({
        taskId,
        status: 'failed',
        elapsedMs: active?.elapsedMs ?? 0,
        error: '录制已中断',
      })
      return
    }
    await setActiveRecord(null)
  }
}
