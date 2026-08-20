import { DRM_UNSUPPORTED_REASON, draftFromUrl, type MediaDraft } from './classify'

const PLAYURL_HINT = /playurl|pgc\/player|dash/i
const BILI_HOST = /bilibili\.com|bilivideo\.com/i

export function extractBvid(url: string): string | undefined {
  const fromPath = url.match(/\/video\/(BV[0-9A-Za-z]+)/i)
  if (fromPath) {
    return fromPath[1]
  }
  try {
    return new URL(url).searchParams.get('bvid') ?? undefined
  } catch {
    return undefined
  }
}

export function extractAid(url: string): string | undefined {
  const fromPath = url.match(/\/video\/av(\d+)/i)
  if (fromPath) {
    return fromPath[1]
  }
  try {
    return new URL(url).searchParams.get('aid') ?? undefined
  } catch {
    return undefined
  }
}

export function extractEpid(url: string): string | undefined {
  const fromPath = url.match(/\/bangumi\/play\/ep(\d+)/i)
  if (fromPath) {
    return fromPath[1]
  }
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('ep_id') ?? parsed.searchParams.get('epId') ?? undefined
  } catch {
    return undefined
  }
}

function idFromJson(data: unknown, key: string): string | undefined {
  const root = asRecord(data)
  const node = asRecord(root?.data) ?? asRecord(root?.result) ?? root
  const value = node?.[key] ?? root?.[key]
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  return String(value)
}

export function isBiliWatchPage(url?: string): boolean {
  if (!url) {
    return false
  }
  return /bilibili\.com\/(video|bangumi|cheese)\//i.test(url)
}

/** 只保留当前正在观看的稿件，忽略「接下来播放」预加载的 playurl */
export function isCurrentPagePlayurl(requestUrl: string, pageUrl: string, data?: unknown): boolean {
  const pageBvid = extractBvid(pageUrl)
  const reqBvid = extractBvid(requestUrl) ?? idFromJson(data, 'bvid')
  if (pageBvid && reqBvid) {
    return pageBvid.toLowerCase() === reqBvid.toLowerCase()
  }

  const pageEpid = extractEpid(pageUrl)
  const reqEpid = extractEpid(requestUrl) ?? idFromJson(data, 'ep_id') ?? idFromJson(data, 'epid')
  if (pageEpid && reqEpid) {
    return pageEpid === reqEpid
  }

  const pageAid = extractAid(pageUrl)
  const reqAid = extractAid(requestUrl) ?? idFromJson(data, 'aid')
  if (pageAid && reqAid) {
    return pageAid === reqAid
  }

  if (pageBvid || pageEpid || pageAid) {
    return !reqBvid && !reqEpid && !reqAid
  }
  return true
}

export function formatBiliDraftTitle(pageTitle?: string, quality?: string): string | undefined {
  const base = (pageTitle || '')
    .replace(/[_-]?哔哩哔哩.*$/u, '')
    .replace(/\s*[-_]\s*bilibili.*$/iu, '')
    .trim()
  if (quality && base) {
    return `${base} · ${quality}`
  }
  return quality || base || undefined
}

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

function streamUrls(item: RawStream | undefined): string[] {
  if (!item) {
    return []
  }
  const raw = [
    item.baseUrl,
    item.base_url,
    item.url,
    ...(Array.isArray(item.backupUrl) ? item.backupUrl : []),
    ...(Array.isArray(item.backup_url) ? item.backup_url : []),
  ]
  const urls: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    urls.push(value)
  }
  return urls
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

  const push = (urls: string[], quality?: string, audio = false) => {
    const draft = draftFromUrl(urls[0] ?? '')
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
      backupUrls: urls.slice(1),
    })
  }

  if (dash) {
    const videos = Array.isArray(dash.video) ? (dash.video as RawStream[]) : []
    const audios = Array.isArray(dash.audio) ? (dash.audio as RawStream[]) : []
    for (const item of videos) {
      const label = item.height ? `${item.height}p` : item.id != null ? String(item.id) : undefined
      push(streamUrls(item), label, false)
    }
    for (const item of audios) {
      push(streamUrls(item), item.id != null ? String(item.id) : undefined, true)
    }
  }

  for (const item of durlList(root)) {
    push(streamUrls(item))
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
    if (host.includes('bilivideo.com') || host.includes('bilivideo.cn') || host.includes('bilibili.com') || host.includes('akamaized.net') || host.includes('hdslb.com')) {
      return /\.(m4s|mp4|flv|m4a)(\/|$)/i.test(path) || path.includes('.m4s')
    }
    return path.endsWith('.m4s') || path.includes('.m4s')
  } catch {
    return false
  }
}

/** CDN 防盗链：必须带页面 Referer 拉取原始编码文件，不能走浏览器直接下载 */
export function needsReferrerFetch(url: string): boolean {
  return isBilibiliMedia(url)
}

export function defaultReferrerFor(url: string, pageUrl?: string): string {
  if (pageUrl) {
    return pageUrl
  }
  try {
    const host = new URL(url).hostname
    if (host.includes('bilibili') || host.includes('bilivideo') || host.includes('akamaized') || host.includes('hdslb')) {
      return 'https://www.bilibili.com/'
    }
  } catch {
    // 保持原 URL 作为 referrer
  }
  return url
}
