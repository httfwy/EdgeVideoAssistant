import { saveObjectUrl } from '../modules/downloader/saveBlob'
import { runFetchSave } from '../modules/downloader/fetchSave'
import { MessageType, type ExtensionMessage, type FetchSavePayload, type RecordStatePayload } from '../shared/messages'
import {
  abortHlsSession,
  abortLiveSession,
  hasLiveSession,
  pauseHlsSession,
  pauseLiveSession,
  resumeLiveSession,
  runHlsDownload,
  runHlsLive,
  type HlsProgressUpdate,
  type LiveProgressUpdate,
} from '../modules/hls'

export interface HlsStartPayload {
  taskId: string
  url: string
  filename: string
  startIndex: number
}

interface RecordStartPayload {
  action: 'start' | 'pause' | 'resume' | 'stop'
  taskId: string
  mode?: 'tab' | 'screen' | 'live'
  streamId?: string
  filename?: string
  url?: string
  segmentMinutes?: number
}

interface CaptureConstraints {
  mandatory: {
    chromeMediaSource: string
    chromeMediaSourceId: string
  }
}

interface TabMediaConstraints {
  audio: CaptureConstraints
  video: CaptureConstraints
}

interface RecSession {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  taskId: string
  filename: string
  startedAt: number
  pausedAt?: number
  pausedMs: number
  timer: number
}

let recSession: RecSession | null = null
let stoppingTaskId: string | null = null

function reportHls(update: HlsProgressUpdate) {
  void chrome.runtime.sendMessage(
    { type: MessageType.HLS_PROGRESS, payload: update } satisfies ExtensionMessage<HlsProgressUpdate>,
    () => {
      void chrome.runtime.lastError
    },
  )
}

function reportRecord(update: RecordStatePayload) {
  void chrome.runtime.sendMessage(
    { type: MessageType.RECORD_STATE, payload: update } satisfies ExtensionMessage<RecordStatePayload>,
    () => {
      void chrome.runtime.lastError
    },
  )
}

function reportLive(update: LiveProgressUpdate) {
  reportRecord({
    taskId: update.taskId,
    status: update.phase === 'recording' ? 'recording' : update.phase === 'paused' ? 'paused' : update.phase === 'completed' ? 'completed' : 'failed',
    elapsedMs: update.elapsedMs,
    estimatedSizeBytes: update.estimatedSizeBytes,
    segmentIndex: update.segmentIndex,
    chromeDownloadId: update.chromeDownloadId,
    error: update.error,
  })
}

function pickMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) ?? 'video/webm'
}

async function captureStream(payload: RecordStartPayload): Promise<MediaStream> {
  if (payload.mode === 'tab') {
    if (!payload.streamId) {
      throw new Error('请允许标签页捕获后重试')
    }
    const constraints: TabMediaConstraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: payload.streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: payload.streamId,
        },
      },
    }
    return navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints)
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
}

function elapsedOf(session: RecSession): number {
  if (session.pausedAt !== undefined) {
    return session.pausedAt - session.startedAt - session.pausedMs
  }
  return Date.now() - session.startedAt - session.pausedMs
}

function startTimer(session: RecSession) {
  window.clearInterval(session.timer)
  session.timer = window.setInterval(() => {
    reportRecord({
      taskId: session.taskId,
      status: session.pausedAt !== undefined ? 'paused' : 'recording',
      elapsedMs: Math.max(0, elapsedOf(session)),
      estimatedSizeBytes: session.chunks.reduce((sum, item) => sum + item.size, 0),
    })
  }, 1000)
}

async function startRecorder(payload: RecordStartPayload) {
  if (payload.mode === 'live') {
    if (!payload.url) {
      throw new Error('无法直接下载，可改用录制')
    }
    void runHlsLive(
      payload.taskId,
      payload.url,
      payload.filename || 'live',
      payload.segmentMinutes ?? 30,
      reportLive,
    ).catch((error: unknown) => {
      reportLive({
        taskId: payload.taskId,
        phase: 'failed',
        elapsedMs: 0,
        estimatedSizeBytes: 0,
        segmentIndex: 1,
        error: error instanceof Error ? error.message : '录制失败',
      })
    })
    return
  }

  const stream = await captureStream(payload)
  const recorder = new MediaRecorder(stream, { mimeType: pickMime() })
  const session: RecSession = {
    recorder,
    stream,
    chunks: [],
    taskId: payload.taskId,
    filename: `${(payload.filename || 'record').replace(/\.webm$/i, '')}.webm`,
    startedAt: Date.now(),
    pausedMs: 0,
    timer: 0,
  }
  recorder.ondataavailable = (event) => {
    if (event.data.size) {
      session.chunks.push(event.data)
    }
  }
  recorder.start(1000)
  recSession = session
  startTimer(session)
}

function pauseRecorder() {
  if (!recSession) {
    return
  }
  if (recSession.recorder.state === 'recording') {
    recSession.recorder.pause()
  }
  recSession.pausedAt = Date.now()
}

function resumeRecorder() {
  if (!recSession) {
    return
  }
  if (recSession.pausedAt !== undefined) {
    recSession.pausedMs += Date.now() - recSession.pausedAt
    recSession.pausedAt = undefined
  }
  if (recSession.recorder.state === 'paused') {
    recSession.recorder.resume()
  }
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => {
    try {
      track.stop()
    } catch {
      // 轨道可能已结束
    }
  })
}

function fallbackAnchorDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

async function collectRecorderBlob(session: RecSession): Promise<Blob> {
  if (session.recorder.state === 'inactive') {
    return new Blob(session.chunks, { type: 'video/webm' })
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(new Blob(session.chunks, { type: 'video/webm' }))
    }, 3000)
    session.recorder.onstop = () => {
      window.clearTimeout(timer)
      resolve(new Blob(session.chunks, { type: 'video/webm' }))
    }
    try {
      session.recorder.stop()
    } catch {
      window.clearTimeout(timer)
      resolve(new Blob(session.chunks, { type: 'video/webm' }))
    }
  })
}

async function stopRecorder(): Promise<void> {
  const session = recSession
  if (!session) {
    return
  }
  recSession = null
  window.clearInterval(session.timer)

  let blob = new Blob(session.chunks, { type: 'video/webm' })
  try {
    blob = await collectRecorderBlob(session)
  } catch {
    blob = new Blob(session.chunks, { type: 'video/webm' })
  }
  stopTracks(session.stream)

  if (!blob.size) {
    reportRecord({
      taskId: session.taskId,
      status: 'failed',
      elapsedMs: Math.max(0, elapsedOf(session)),
      error: '没有可保存的内容',
    })
    return
  }

  const objectUrl = URL.createObjectURL(blob)
  let keepUrl = false
  try {
    let downloadId: number | undefined
    try {
      downloadId = await saveObjectUrl(objectUrl, session.filename)
    } catch {
      fallbackAnchorDownload(objectUrl, session.filename)
      keepUrl = true
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
    reportRecord({
      taskId: session.taskId,
      status: 'completed',
      elapsedMs: Math.max(0, elapsedOf(session)),
      estimatedSizeBytes: blob.size,
      chromeDownloadId: downloadId,
    })
  } catch (error: unknown) {
    reportRecord({
      taskId: session.taskId,
      status: 'failed',
      elapsedMs: Math.max(0, elapsedOf(session)),
      estimatedSizeBytes: blob.size,
      error: error instanceof Error ? error.message : '保存失败',
    })
  } finally {
    if (!keepUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }
}

function endMissingRecord(taskId: string) {
  if (hasLiveSession(taskId)) {
    abortLiveSession(taskId)
    return
  }
  reportRecord({
    taskId,
    status: 'failed',
    elapsedMs: 0,
    error: '录制已中断',
  })
}

async function waitWhile(condition: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

async function handleStop(taskId: string): Promise<void> {
  if (stoppingTaskId === taskId && !recSession) {
    await waitWhile(() => stoppingTaskId === taskId, 15_000)
    return
  }
  stoppingTaskId = taskId
  try {
    if (recSession) {
      await stopRecorder()
      return
    }
    if (hasLiveSession(taskId)) {
      abortLiveSession(taskId)
      await waitWhile(() => hasLiveSession(taskId), 15_000)
      return
    }
    endMissingRecord(taskId)
  } finally {
    if (stoppingTaskId === taskId) {
      stoppingTaskId = null
    }
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return
  }
  if (message.type === MessageType.HLS_PAUSE) {
    const taskId = (message.payload as { taskId?: string } | undefined)?.taskId
    if (taskId) {
      pauseHlsSession(taskId)
      pauseLiveSession(taskId)
    }
    sendResponse({ ok: true })
    return
  }

  if (message.type === MessageType.HLS_ABORT) {
    const taskId = (message.payload as { taskId?: string } | undefined)?.taskId
    if (taskId) {
      abortHlsSession(taskId)
      abortLiveSession(taskId)
    }
    sendResponse({ ok: true })
    return
  }

  if (message.type === MessageType.HLS_LIVE_START) {
    const payload = message.payload as HlsStartPayload & { segmentMinutes?: number } | undefined
    if (!payload?.taskId || !payload.url) {
      sendResponse({ ok: false, error: '任务无效' })
      return
    }
    sendResponse({ ok: true })
    void runHlsLive(payload.taskId, payload.url, payload.filename, payload.segmentMinutes ?? 30, reportLive).catch(
      (error: unknown) => {
        reportLive({
          taskId: payload.taskId,
          phase: 'failed',
          elapsedMs: 0,
          estimatedSizeBytes: 0,
          segmentIndex: 1,
          error: error instanceof Error ? error.message : '录制失败',
        })
      },
    )
    return
  }

  if (message.type === MessageType.RECORD_CONTROL) {
    const payload = message.payload as RecordStartPayload | undefined
    if (!payload?.taskId) {
      sendResponse({ ok: false, error: '任务无效' })
      return
    }
    if (payload.action === 'stop') {
      void handleStop(payload.taskId)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : '保存失败',
          })
        })
      return true
    }
    sendResponse({ ok: true })
    if (payload.action === 'start') {
      void startRecorder(payload).catch((error: unknown) => {
        reportRecord({
          taskId: payload.taskId,
          status: 'failed',
          elapsedMs: 0,
          error: error instanceof Error ? error.message : '请允许标签页捕获后重试',
        })
      })
      return
    }
    if (payload.action === 'pause') {
      if (recSession) {
        pauseRecorder()
      } else {
        pauseLiveSession(payload.taskId)
      }
      return
    }
    if (payload.action === 'resume') {
      if (recSession) {
        resumeRecorder()
      } else {
        resumeLiveSession(payload.taskId)
      }
    }
    return
  }

  if (message.type === MessageType.FETCH_SAVE) {
    const payload = message.payload as FetchSavePayload | undefined
    if (!payload?.taskId || !payload.url || !payload.filename) {
      sendResponse({ ok: false, error: '任务无效' })
      return
    }
    sendResponse({ ok: true })
    void runFetchSave(payload).catch((error: unknown) => {
      void chrome.runtime.sendMessage(
        {
          type: MessageType.FETCH_PROGRESS,
          payload: {
            taskId: payload.taskId,
            status: 'failed',
            progress: 0,
            error: error instanceof Error ? error.message : '下载失败',
          },
        },
        () => {
          void chrome.runtime.lastError
        },
      )
    })
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
    reportHls,
  ).catch((error: unknown) => {
    reportHls({
      taskId: payload.taskId,
      phase: 'error',
      current: 0,
      total: 0,
      error: error instanceof Error ? error.message : '无法跨域下载分片，可改用录制',
    })
  })
})
