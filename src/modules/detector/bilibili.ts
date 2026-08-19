import { DRM_UNSUPPORTED_REASON, draftFromUrl, type MediaDraft } from './classify'

const PLAYURL_HINT = /playurl|pgc\/player|dash/i
const BILI_HOST = /bilibili\.com|bilivideo\.com/i

export const PAGE_MEDIA_EVENT = 'EVA_PAGE_MEDIA'

interface RawStream {
  url?: string
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
  id?: number | string
  codecs?: string
  width?: number
  height?: number
  bandwidth?: number
  id_str?: string
}

function firstUrl(item: RawStream | undefined): string | undefined {
  if (!item) {
    return undefined
  }
  return item.baseUrl || item.base_url || item.url || item.backupUrl?.[0] || item.backup_url?.[0]
}

function looksEncrypted(data: unknown): boolean {
  const text = JSON.stringify(data).toLowerCase()
  return (
    text.includes('"is_drm":true') ||
    (text.includes('"drm_type"') && !text.includes('"drm_type":0')) ||
    text.includes('widevine') ||
    text.includes('contentprotection')
  )
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function dashNode(root: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!root) {
    return undefined
  }
  return (
    asRecord(root.dash) ??
    asRecord(asRecord(root.data)?.dash) ??
    asRecord(asRecord(root.result)?.dash) ??
    asRecord(asRecord(asRecord(root.data)?.result)?.dash)
  )
}

function durlList(root: Record<string, unknown> | undefined): RawStream[] {
  const data = asRecord(root?.data) ?? asRecord(root?.result) ?? root
  const list = data?.durl
  return Array.isArray(list) ? (list as RawStream[]) : []
}

/** 从页面已发出的 playurl JSON 中提取可播地址，不请求新接口 */
export function draftsFromPlayurlJson(data: unknown, pageUrl?: string): MediaDraft[] {
  if (looksEncrypted(data)) {
    const draft = draftFromUrl(pageUrl || 'https://www.bilibili.com/video', { drm: true })
    return draft
      ? [
          {
            ...draft,
            kind: 'dash',
            needsParse: false,
            canDirectDownload: false,
            unsupportedReason: DRM_UNSUPPORTED_REASON,
          },
        ]
      : []
  }

  const root = asRecord(data)
  const dash = dashNode(root)
  const drafts: MediaDraft[] = []
  const seen = new Set<string>()

  const push = (url: string | undefined, quality?: string, audio = false) => {
    const draft = draftFromUrl(url ?? '')
    if (!draft || seen.has(draft.url)) {
      return
    }
    seen.add(draft.url)
    drafts.push({
      ...draft,
      kind: draft.kind === 'unknown' ? 'mp4' : draft.kind,
      needsParse: false,
      canDirectDownload: true,
      quality: quality ? (audio ? `音频 ${quality}` : quality) : audio ? '音频' : undefined,
    })
  }

  if (dash) {
    const videos = Array.isArray(dash.video) ? (dash.video as RawStream[]) : []
    const audios = Array.isArray(dash.audio) ? (dash.audio as RawStream[]) : []
    for (const item of videos) {
      const label = item.height ? `${item.height}p` : item.id != null ? String(item.id) : undefined
      push(firstUrl(item), label, false)
    }
    for (const item of audios) {
      push(firstUrl(item), item.id != null ? String(item.id) : undefined, true)
    }
  }

  for (const item of durlList(root)) {
    push(firstUrl(item))
  }

  return drafts
}

export function isBilibiliPlayurl(url: string): boolean {
  return BILI_HOST.test(url) && PLAYURL_HINT.test(url)
}

export function isBilibiliMedia(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const path = parsed.pathname.toLowerCase()
    if (host.includes('bilivideo.com') || host.includes('bilibili.com')) {
      return path.endsWith('.m4s') || path.endsWith('.mp4') || path.endsWith('.m4s/') || path.includes('.m4s')
    }
    return path.endsWith('.m4s')
  } catch {
    return false
  }
}
