import { saveObjectUrl } from '../downloader/saveBlob'
import {
  CORS_SEGMENT_ERROR,
  ENCRYPTED_STREAM_ERROR,
  LIVE_STREAM_ERROR,
  resolveMediaPlaylist,
} from './playlist'

export interface HlsProgressUpdate {
  taskId: string
  phase: 'segments' | 'merging' | 'done' | 'paused' | 'error'
  current: number
  total: number
  error?: string
  chromeDownloadId?: number
}

export type ProgressReporter = (update: HlsProgressUpdate) => void

interface Session {
  paused: boolean
  aborted: boolean
  buffers: ArrayBuffer[]
}

const sessions = new Map<string, Session>()

export function pauseHlsSession(taskId: string) {
  const session = sessions.get(taskId)
  if (session) {
    session.paused = true
  }
}

export function abortHlsSession(taskId: string) {
  const session = sessions.get(taskId)
  if (session) {
    session.aborted = true
  }
  sessions.delete(taskId)
}

async function fetchSegment(url: string, referrer: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url, { referrer })
    if (!response.ok) {
      throw new Error(CORS_SEGMENT_ERROR)
    }
    return response.arrayBuffer()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === CORS_SEGMENT_ERROR) {
      throw error
    }
    throw new Error(CORS_SEGMENT_ERROR)
  }
}

/** 在 Offscreen 中逐片下载并拼接为 .ts */
export async function runHlsDownload(
  taskId: string,
  playlistUrl: string,
  filename: string,
  startIndex: number,
  report: ProgressReporter,
): Promise<void> {
  const playlist = await resolveMediaPlaylist(playlistUrl)
  if (playlist.encrypted) {
    throw new Error(ENCRYPTED_STREAM_ERROR)
  }
  if (playlist.isLive) {
    throw new Error(LIVE_STREAM_ERROR)
  }

  const total = playlist.segments.length
  let session = sessions.get(taskId)
  if (!session || startIndex === 0) {
    session = { paused: false, aborted: false, buffers: [] }
    sessions.set(taskId, session)
  } else {
    session.paused = false
    session.aborted = false
  }

  for (let i = session.buffers.length; i < total; i += 1) {
    if (session.aborted) {
      return
    }
    if (session.paused) {
      report({ taskId, phase: 'paused', current: i, total })
      return
    }
    session.buffers.push(await fetchSegment(playlist.segments[i], playlistUrl))
    if (session.aborted) {
      return
    }
    if (session.paused) {
      report({ taskId, phase: 'paused', current: i + 1, total })
      return
    }
    report({ taskId, phase: 'segments', current: i + 1, total })
  }

  if (session.aborted || session.paused) {
    return
  }

  report({ taskId, phase: 'merging', current: total, total })
  const blob = new Blob(session.buffers, { type: 'video/mp2t' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const downloadId = await saveObjectUrl(objectUrl, filename)
    report({ taskId, phase: 'done', current: total, total, chromeDownloadId: downloadId })
  } finally {
    URL.revokeObjectURL(objectUrl)
    sessions.delete(taskId)
  }
}
