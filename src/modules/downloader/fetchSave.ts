import { MessageType, type FetchProgressUpdate, type FetchSavePayload } from '../../shared/messages'
import type { RemuxMode } from '../transcode/remux'
import { saveObjectUrl } from './saveBlob'

export type FetchProgressReporter = (update: FetchProgressUpdate) => void

function reportFetch(update: FetchProgressUpdate) {
  void chrome.runtime.sendMessage(
    { type: MessageType.FETCH_PROGRESS, payload: update },
    () => {
      void chrome.runtime.lastError
    },
  )
}

function uniqueUrls(url: string, backupUrls?: string[]): string[] {
  const urls = [url, ...(backupUrls ?? [])]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const item of urls) {
    if (!item || seen.has(item)) {
      continue
    }
    seen.add(item)
    unique.push(item)
  }
  return unique
}

async function fetchMedia(url: string, referrer: string, withRange: boolean): Promise<Response> {
  const headers: HeadersInit = {}
  if (withRange) {
    headers.Range = 'bytes=0-'
  }
  return fetch(url, {
    referrer,
    referrerPolicy: 'unsafe-url',
    credentials: 'include',
    headers,
  })
}

function concatChunks(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

async function readBody(
  response: Response,
  taskId: string,
  report: FetchProgressReporter,
  range: { from: number; to: number },
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length')) || 0
  const chunks: Uint8Array[] = []
  let received = 0
  let lastAt = 0
  const span = Math.max(1, range.to - range.from)

  const mapProgress = (ratio: number) => range.from + Math.round(ratio * span)

  if (!response.body) {
    const buffer = await response.arrayBuffer()
    report({ taskId, status: 'downloading', progress: range.to })
    return buffer
  }

  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value) {
      chunks.push(value)
      received += value.byteLength
    }
    const now = Date.now()
    if (now - lastAt >= 400) {
      lastAt = now
      const ratio = total ? Math.min(1, received / total) : 0
      report({
        taskId,
        status: 'downloading',
        progress: Math.min(range.to, mapProgress(ratio)),
      })
    }
  }
  report({ taskId, status: 'downloading', progress: range.to })
  return concatChunks(chunks)
}

async function fetchBuffer(
  url: string,
  backupUrls: string[] | undefined,
  referrer: string,
  taskId: string,
  report: FetchProgressReporter,
  range: { from: number; to: number },
): Promise<ArrayBuffer> {
  const urls = uniqueUrls(url, backupUrls)
  let lastError = '下载失败'

  for (const candidate of urls) {
    for (const withRange of [true, false]) {
      try {
        const response = await fetchMedia(candidate, referrer, withRange)
        if (!response.ok && response.status !== 206) {
          lastError = `下载失败（HTTP ${response.status}）`
          continue
        }
        report({ taskId, status: 'downloading', progress: range.from })
        const buffer = await readBody(response, taskId, report, range)
        if (!buffer.byteLength) {
          lastError = '下载失败'
          continue
        }
        return buffer
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : '下载失败'
      }
    }
  }

  throw new Error(lastError)
}

function mimeForMode(mode: RemuxMode): string {
  return mode === 'audio' ? 'audio/mp4' : 'video/mp4'
}

async function encapsulate(
  primary: ArrayBuffer,
  mode: RemuxMode,
  audio: ArrayBuffer | undefined,
  taskId: string,
  report: FetchProgressReporter,
): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const mime = mimeForMode(mode)
  report({ taskId, status: 'merging', progress: 90 })
  try {
    const { remuxToMp4 } = await import('../transcode/remux')
    const buffer = await remuxToMp4(primary, {
      mode,
      audio,
      onProgress: (ratio) => {
        report({
          taskId,
          status: 'merging',
          progress: Math.min(99, 90 + Math.round(ratio * 9)),
        })
      },
    })
    return { buffer, mime }
  } catch (error: unknown) {
    if (mode === 'mux') {
      throw error instanceof Error ? error : new Error('封装失败')
    }
    return { buffer: primary, mime }
  }
}

/** 在 Offscreen 中拉取码流并封装为可播放 MP4 / M4A */
export async function runFetchSave(
  payload: FetchSavePayload,
  report: FetchProgressReporter = reportFetch,
): Promise<void> {
  const referrer = payload.referrer || 'https://www.bilibili.com/'
  const mode: RemuxMode = payload.outputMode ?? 'file'

  let primary: ArrayBuffer
  let audio: ArrayBuffer | undefined

  if (mode === 'mux') {
    if (!payload.audioUrl) {
      throw new Error('缺少音频流')
    }
    primary = await fetchBuffer(
      payload.url,
      payload.backupUrls,
      referrer,
      payload.taskId,
      report,
      { from: 1, to: 45 },
    )
    audio = await fetchBuffer(
      payload.audioUrl,
      payload.audioBackupUrls,
      referrer,
      payload.taskId,
      report,
      { from: 46, to: 85 },
    )
  } else {
    primary = await fetchBuffer(
      payload.url,
      payload.backupUrls,
      referrer,
      payload.taskId,
      report,
      { from: 1, to: 85 },
    )
  }

  const { buffer, mime } = await encapsulate(primary, mode, audio, payload.taskId, report)
  const blob = new Blob([new Uint8Array(buffer)], { type: mime })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const downloadId = await saveObjectUrl(objectUrl, payload.filename)
    report({
      taskId: payload.taskId,
      status: 'completed',
      progress: 100,
      chromeDownloadId: downloadId,
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
