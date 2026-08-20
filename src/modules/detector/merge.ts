import type { VideoResource } from '../../shared/types'
import { filenameFromUrl, normalizeUrl, type MediaDraft } from './classify'

export function resourceId(tabId: number, url: string): string {
  return `${tabId}:${url}`
}

export function draftToResource(
  draft: MediaDraft,
  tabId: number,
  pageTitle?: string,
  pageUrl?: string,
): VideoResource {
  const title = draft.title || (pageTitle && pageTitle.trim()) || filenameFromUrl(draft.url)
  return {
    id: resourceId(tabId, draft.url),
    url: draft.url,
    title,
    kind: draft.kind,
    tabId,
    pageTitle,
    pageUrl,
    sizeBytes: draft.sizeBytes,
    quality: draft.quality,
    isLive: draft.isLive === true,
    needsParse: draft.needsParse,
    canDirectDownload: draft.canDirectDownload,
    unsupportedReason: draft.unsupportedReason,
    backupUrls: draft.backupUrls,
    detectedAt: Date.now(),
  }
}

function pickPreferred(current: VideoResource, incoming: VideoResource): VideoResource {
  return {
    ...current,
    ...incoming,
    title: incoming.title || current.title,
    pageTitle: incoming.pageTitle || current.pageTitle,
    pageUrl: incoming.pageUrl || current.pageUrl,
    quality: incoming.quality || current.quality,
    sizeBytes: incoming.sizeBytes ?? current.sizeBytes,
    unsupportedReason: incoming.unsupportedReason || current.unsupportedReason,
    canDirectDownload: incoming.canDirectDownload || current.canDirectDownload,
    needsParse: incoming.needsParse && current.needsParse,
    isLive: incoming.isLive || current.isLive,
    variants: incoming.variants?.length ? incoming.variants : current.variants,
    tracks: incoming.tracks?.length ? incoming.tracks : current.tracks,
    parsed: incoming.parsed || current.parsed,
    kind: incoming.kind !== 'unknown' ? incoming.kind : current.kind,
    backupUrls:
      incoming.backupUrls?.length || current.backupUrls?.length
        ? [...new Set([...(current.backupUrls ?? []), ...(incoming.backupUrls ?? [])])]
        : undefined,
    detectedAt: Math.min(current.detectedAt, incoming.detectedAt),
  }
}

/** 按规范化 URL 去重合并 */
export function mergeResources(
  existing: VideoResource[],
  incoming: VideoResource[],
): VideoResource[] {
  const map = new Map<string, VideoResource>()
  for (const item of existing) {
    const key = normalizeUrl(item.url) ?? item.url
    map.set(key, item)
  }
  for (const item of incoming) {
    const key = normalizeUrl(item.url) ?? item.url
    const prev = map.get(key)
    map.set(key, prev ? pickPreferred(prev, item) : item)
  }
  return [...map.values()]
}
