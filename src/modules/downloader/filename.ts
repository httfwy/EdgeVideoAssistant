import type { MediaKind } from '../../shared/types'
import { filenameFromUrl } from '../detector/classify'

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

const EXT_BY_KIND: Partial<Record<MediaKind, string>> = {
  mp4: '.mp4',
  webm: '.webm',
  mov: '.mov',
  avi: '.avi',
  hls: '.ts',
}

function sanitizeSegment(name: string): string {
  const cleaned = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim()
  return cleaned || 'video'
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname
    const match = path.match(/\.(m4s|mp4|webm|mov|avi|mkv|ts|flv|m4a)(?:\/|$)/i)
    return match ? `.${match[1].toLowerCase()}` : undefined
  } catch {
    return undefined
  }
}

function ensureExtension(name: string, kind?: MediaKind, url?: string): string {
  if (/\.(mp4|webm|mov|avi|mkv|ts|m4s|flv|m4a)$/i.test(name)) {
    return name
  }
  const fromUrl = url ? extensionFromUrl(url) : undefined
  if (fromUrl) {
    return `${name}${fromUrl}`
  }
  const ext = (kind && EXT_BY_KIND[kind]) || '.mp4'
  return `${name}${ext}`
}

function withForcedExt(name: string, forceExt: string): string {
  const ext = forceExt.startsWith('.') ? forceExt : `.${forceExt}`
  return `${name}${ext}`
}

/** 生成可交给 chrome.downloads 的文件名（不含目录）；forceExt 用于封装后的 MP4 / M4A */
export function suggestDownloadFilename(
  url: string,
  fallbackName?: string,
  kind?: MediaKind,
  forceExt?: string,
): string {
  const raw = (fallbackName && fallbackName.trim()) || filenameFromUrl(url)
  const namedExt = raw.match(/\.(mp4|webm|mov|avi|mkv|ts|m4s|flv|m4a)$/i)
  const stripped = raw.replace(/\.(m3u8|mpd|m4s|mp4|webm|mov|avi|mkv|ts|flv|m4a)$/i, '')
  const base = sanitizeSegment(stripped.split(/[/\\]/).pop() ?? stripped).slice(0, 120)
  if (forceExt) {
    return withForcedExt(base, forceExt)
  }
  if (namedExt) {
    return `${base}${namedExt[0].toLowerCase()}`
  }
  return ensureExtension(base, kind, url)
}

export const DIRECT_KINDS: MediaKind[] = ['mp4', 'webm', 'mov', 'avi']

export function isDirectKind(kind: MediaKind): boolean {
  return DIRECT_KINDS.includes(kind)
}
