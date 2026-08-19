import type { MediaKind } from '../../shared/types'
import { filenameFromUrl } from '../detector/classify'

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

const EXT_BY_KIND: Partial<Record<MediaKind, string>> = {
  mp4: '.mp4',
  webm: '.webm',
  mov: '.mov',
  avi: '.avi',
}

function sanitizeSegment(name: string): string {
  const cleaned = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim()
  return cleaned || 'video'
}

function ensureExtension(name: string, kind?: MediaKind): string {
  if (/\.(mp4|webm|mov|avi|mkv)$/i.test(name)) {
    return name
  }
  const ext = (kind && EXT_BY_KIND[kind]) || '.mp4'
  return `${name}${ext}`
}

/** 生成可交给 chrome.downloads 的文件名（不含目录） */
export function suggestDownloadFilename(url: string, fallbackName?: string, kind?: MediaKind): string {
  const raw = (fallbackName && fallbackName.trim()) || filenameFromUrl(url)
  const base = sanitizeSegment(raw.split(/[/\\]/).pop() ?? raw).slice(0, 120)
  return ensureExtension(base, kind)
}

export const DIRECT_KINDS: MediaKind[] = ['mp4', 'webm', 'mov', 'avi']

export function isDirectKind(kind: MediaKind): boolean {
  return DIRECT_KINDS.includes(kind)
}
