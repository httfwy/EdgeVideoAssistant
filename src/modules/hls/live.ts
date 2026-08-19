import {
  CORS_SEGMENT_ERROR,
  ENCRYPTED_STREAM_ERROR,
  fetchText,
  parseMediaPlaylist,
  parseMasterVariants,
  pickHighestVariant,
} from './playlist'

export interface LiveProgressUpdate {
  taskId: string
  phase: 'recording' | 'paused' | 'completed' | 'failed'
  elapsedMs: number
  estimatedSizeBytes: number
  segmentIndex: number
  chromeDownloadId?: number
  error?: string
}

interface LiveSession {
  paused: boolean
  aborted: boolean
  buffers: ArrayBuffer[]
  seen: Set<string>
  partStartedAt: number
  segmentIndex: number
  startedAt: number
}

const lives = new Map<string, LiveSession>()

export function pauseLiveSession(taskId: string) {
  const session = lives.get(taskId)
  if (session) {
    session.paused = true
  }
}

export function resumeLiveSession(taskId: string) {
  const session = lives.get(taskId)
  if (session) {
    session.paused = false
  }
}

export function abortLiveSession(taskId: string) {
  const session = lives.get(taskId)
  if (session) {
    session.aborted = true
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mediaPlaylistUrl(url: string): Promise<string> {
  const text = await fetchText(url, url)
  if (text.includes('#EXT-X-STREAM-INF')) {
    const best = pickHighestVariant(parseMasterVariants(text, url))
    if (!best) {
      throw new Error('无法解析播放列表')
    }
    return best.uri
  }
  return url
}

async function savePart(
  buffers: ArrayBuffer[],
  filename: string,
): Promise<number> {
  const blob = new Blob(buffers, { type: 'video/mp2t' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await chrome.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
}

async function fetchSegment(url: string, referrer: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { referrer })
  if (!response.ok) {
    throw new Error(CORS_SEGMENT_ERROR)
  }
  return response.arrayBuffer()
}

function partName(base: string, index: number): string {
  const padded = String(index).padStart(2, '0')
  const clean = base.replace(/\.ts$/i, '')
  return `${clean}-part-${padded}.ts`
}

/** HLS 直播：持续拉新分片，按时长切分；暂停后同一分段接着写 */
export async function runHlsLive(
  taskId: string,
  playlistUrl: string,
  filenameBase: string,
  segmentMinutes: number,
  report: (update: LiveProgressUpdate) => void,
): Promise<void> {
  const mediaUrl = await mediaPlaylistUrl(playlistUrl)
  const firstText = await fetchText(mediaUrl, playlistUrl)
  const first = parseMediaPlaylist(firstText, mediaUrl)
  if (first.encrypted) {
    throw new Error(ENCRYPTED_STREAM_ERROR)
  }

  let session = lives.get(taskId)
  if (!session) {
    session = {
      paused: false,
      aborted: false,
      buffers: [],
      seen: new Set(),
      partStartedAt: Date.now(),
      segmentIndex: 1,
      startedAt: Date.now(),
    }
    lives.set(taskId, session)
  } else {
    session.paused = false
    session.aborted = false
  }

  const splitMs = Math.max(1, segmentMinutes) * 60_000
  let retries = 0

  const tick = () => {
    report({
      taskId,
      phase: session!.paused ? 'paused' : 'recording',
      elapsedMs: Date.now() - session!.startedAt,
      estimatedSizeBytes: session!.buffers.reduce((sum, item) => sum + item.byteLength, 0),
      segmentIndex: session!.segmentIndex,
    })
  }

  while (!session.aborted) {
    if (session.paused) {
      tick()
      await sleep(800)
      continue
    }

    try {
      const text = await fetchText(mediaUrl, playlistUrl)
      const playlist = parseMediaPlaylist(text, mediaUrl)
      for (const segment of playlist.segments) {
        if (session.seen.has(segment) || session.aborted || session.paused) {
          continue
        }
        session.buffers.push(await fetchSegment(segment, mediaUrl))
        session.seen.add(segment)
      }
      retries = 0
    } catch {
      retries += 1
      if (retries >= 5) {
        if (session.buffers.length) {
          await savePart(session.buffers, partName(filenameBase, session.segmentIndex))
        }
        lives.delete(taskId)
        throw new Error(CORS_SEGMENT_ERROR)
      }
    }

    if (Date.now() - session.partStartedAt >= splitMs && session.buffers.length) {
      await savePart(session.buffers, partName(filenameBase, session.segmentIndex))
      session.buffers = []
      session.segmentIndex += 1
      session.partStartedAt = Date.now()
    }

    tick()
    await sleep(2000)
  }

  let downloadId: number | undefined
  if (session.buffers.length) {
    downloadId = await savePart(session.buffers, partName(filenameBase, session.segmentIndex))
  }
  lives.delete(taskId)
  report({
    taskId,
    phase: 'completed',
    elapsedMs: Date.now() - session.startedAt,
    estimatedSizeBytes: 0,
    segmentIndex: session.segmentIndex,
    chromeDownloadId: downloadId,
  })
}
