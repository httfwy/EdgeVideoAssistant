export const LIVE_STREAM_ERROR = '当前为直播流，请等待后续版本的直播录制'
export const ENCRYPTED_STREAM_ERROR = '不支持直接下载，可改用录制'
export const CORS_SEGMENT_ERROR = '无法跨域下载分片，可改用录制'

export interface MediaPlaylist {
  kind: 'media'
  isLive: boolean
  encrypted: boolean
  segments: string[]
}

export interface MasterVariant {
  bandwidth: number
  uri: string
}

function resolveUri(uri: string, baseUrl: string): string {
  return new URL(uri, baseUrl).href
}

function parseAttributes(line: string): Record<string, string> {
  const result: Record<string, string> = {}
  const body = line.replace(/^#EXT[^:]+:/, '')
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(body))) {
    result[match[1].toUpperCase()] = match[2] ?? match[3] ?? ''
  }
  return result
}

function isMaster(text: string): boolean {
  return text.includes('#EXT-X-STREAM-INF')
}

export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const segments: string[] = []
  let encrypted = false
  let isLive = true

  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY')) {
      encrypted = true
    }
    if (line === '#EXT-X-ENDLIST') {
      isLive = false
    }
    if (line.startsWith('#')) {
      continue
    }
    segments.push(resolveUri(line, baseUrl))
  }

  return { kind: 'media', isLive, encrypted, segments }
}

export function parseMasterVariants(text: string, baseUrl: string): MasterVariant[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const variants: MasterVariant[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.startsWith('#EXT-X-STREAM-INF')) {
      continue
    }
    const attrs = parseAttributes(line)
    const next = lines[i + 1]
    if (!next || next.startsWith('#')) {
      continue
    }
    variants.push({
      bandwidth: Number(attrs.BANDWIDTH) || 0,
      uri: resolveUri(next, baseUrl),
    })
  }
  return variants
}

export function pickHighestVariant(variants: MasterVariant[]): MasterVariant | undefined {
  return [...variants].sort((a, b) => b.bandwidth - a.bandwidth)[0]
}

export async function fetchText(url: string, referrer?: string): Promise<string> {
  try {
    const response = await fetch(url, referrer ? { referrer } : undefined)
    if (!response.ok) {
      throw new Error(CORS_SEGMENT_ERROR)
    }
    return response.text()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === CORS_SEGMENT_ERROR) {
      throw error
    }
    throw new Error(CORS_SEGMENT_ERROR)
  }
}

/** 解析 master/media，master 时自动选择码率最高的媒体列表 */
export async function resolveMediaPlaylist(url: string): Promise<MediaPlaylist> {
  const text = await fetchText(url, url)
  if (isMaster(text)) {
    const best = pickHighestVariant(parseMasterVariants(text, url))
    if (!best) {
      throw new Error('无法解析播放列表')
    }
    const mediaText = await fetchText(best.uri, url)
    return parseMediaPlaylist(mediaText, best.uri)
  }
  return parseMediaPlaylist(text, url)
}
