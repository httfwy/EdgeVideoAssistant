import { MessageType, type ExtensionMessage } from '../shared/messages'
import {
  abortHlsSession,
  pauseHlsSession,
  runHlsDownload,
  type HlsProgressUpdate,
} from '../modules/hls'

export interface HlsStartPayload {
  taskId: string
  url: string
  filename: string
  startIndex: number
}

function report(update: HlsProgressUpdate) {
  void chrome.runtime.sendMessage(
    { type: MessageType.HLS_PROGRESS, payload: update } satisfies ExtensionMessage<HlsProgressUpdate>,
    () => {
      void chrome.runtime.lastError
    },
  )
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MessageType.HLS_PAUSE) {
    const taskId = (message.payload as { taskId?: string } | undefined)?.taskId
    if (taskId) {
      pauseHlsSession(taskId)
    }
    sendResponse({ ok: true })
    return
  }

  if (message.type === MessageType.HLS_ABORT) {
    const taskId = (message.payload as { taskId?: string } | undefined)?.taskId
    if (taskId) {
      abortHlsSession(taskId)
    }
    sendResponse({ ok: true })
    return
  }

  if (message.type !== MessageType.HLS_START) {
    return
  }

  const payload = message.payload as HlsStartPayload | undefined
  if (!payload?.taskId || !payload.url) {
    sendResponse({ ok: false, error: '任务无效' })
    return
  }

  sendResponse({ ok: true })
  void runHlsDownload(
    payload.taskId,
    payload.url,
    payload.filename,
    payload.startIndex ?? 0,
    report,
  ).catch((error: unknown) => {
    report({
      taskId: payload.taskId,
      phase: 'error',
      current: 0,
      total: 0,
      error: error instanceof Error ? error.message : '无法跨域下载分片，可改用录制',
    })
  })
})
