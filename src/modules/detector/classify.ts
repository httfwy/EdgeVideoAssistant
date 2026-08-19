import type { MediaKind } from '../../shared/types'

const SKIP_PREFIX = /^(blob:|data:|mediastream:)/i
const UNSUPPORTED_DOWNLOAD = '不支持直接下载，可改用录制'

export const DRM_UNSUPPORTED_REASON = UNSUPPORTED_DOWNLOAD

/** 扫描/网络嗅探的中间结果（尚未绑定 tab） */
export interface MediaDraft {
  url: string
  kind: MediaKind
  needsParse: boolean
  canDirectDownload: boolean
  unsupportedReason?: string
  sizeBytes?: number
  quality?: string
  isLive?: boolean
  title?: string
}

/** 去掉 hash；非 http(s) 或 blob/data 返回 null */
export function normalizeUrl(raw: string, base?: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || SKIP_PREFIX.test(trimmed)) {
    return null
  }

  try {
    const parsed = new URL(trimmed, base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    parsed.hash = ''
    return parsed.href
  } catch {
    return null
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function hasExtension(url: string, ext: string): boolean {
  const path = pathnameOf(url)
  return path.endsWith(`.${ext}`) || path.includes(`.${ext}/`)
}

/** 按路径/后缀识别媒体类型 */
export function classifyKind(url: string): MediaKind {
  if (hasExtension(url, 'm3u8')) {
    return 'hls'
  }
  if (hasExtension(url, 'mpd')) {
    return 'dash'
  }
  if (hasExtension(url, 'm4s')) {
    return 'mp4'
  }
  if (hasExtension(url, 'mp4')) {
    return 'mp4'
  }
  if (hasExtension(url, 'webm')) {
    return 'webm'
  }
  if (hasExtension(url, 'mov')) {
    return 'mov'
  }
  if (hasExtension(url, 'avi')) {
    return 'avi'
  }
  return 'unknown'
}

/** 根据 Content-Type 补充类型 */
export function classifyByContentType(contentType: string): MediaKind | null {
  const value = contentType.toLowerCase()
  if (value.includes('mpegurl') || value.includes('x-mpegurl')) {
    return 'hls'
  }
  if (value.includes('dash+xml')) {
    return 'dash'
  }
  if (value.includes('video/mp4')) {
    return 'mp4'
  }
  if (value.includes('video/webm')) {
    return 'webm'
  }
  if (value.includes('video/quicktime')) {
    return 'mov'
  }
  if (value.startsWith('video/')) {
    return 'unknown'
  }
  return null
}

export function kindCapabilities(kind: MediaKind): Pick<MediaDraft, 'needsParse' | 'canDirectDownload'> {
  if (kind === 'hls' || kind === 'dash') {
    return { needsParse: true, canDirectDownload: false }
  }
  if (kind === 'unknown') {
    return { needsParse: false, canDirectDownload: false }
  }
  return { needsParse: false, canDirectDownload: true }
}

export function draftFromUrl(
  raw: string,
  options?: {
    contentType?: string
    sizeBytes?: number
    base?: string
    drm?: boolean
    quality?: string
    isLive?: boolean
    title?: string
  },
): MediaDraft | null {
  const url = normalizeUrl(raw, options?.base)
  if (!url) {
    return null
  }

  let kind = classifyKind(url)
  if (kind === 'unknown' && options?.contentType) {
    kind = classifyByContentType(options.contentType) ?? 'unknown'
  }

  if (kind === 'unknown' && !options?.contentType?.toLowerCase().startsWith('video/')) {
    return null
  }

  const caps = kindCapabilities(kind)
  const drm = options?.drm === true

  return {
    url,
    kind,
    needsParse: caps.needsParse,
    canDirectDownload: drm ? false : caps.canDirectDownload,
    unsupportedReason: drm ? DRM_UNSUPPORTED_REASON : undefined,
    sizeBytes: options?.sizeBytes,
    quality: options?.quality,
    isLive: options?.isLive,
    title: options?.title,
  }
}

export function filenameFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    return name || url
  } catch {
    return url
  }
}
