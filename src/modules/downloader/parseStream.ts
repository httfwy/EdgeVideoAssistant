import { classifyKind } from '../detector/classify'
import { inspectDash } from '../dash'
import { inspectHls, ENCRYPTED_STREAM_ERROR } from '../hls/playlist'
import { getDetectedByTab, setDetectedByTab } from '../../shared/storage'
import type { StreamTrack, StreamVariant, VideoResource } from '../../shared/types'
import type { ParseStreamPayload } from '../../shared/messages'

export const RECORD_FALLBACK = '无法直接下载，可改用录制'

async function patchResource(
  tabId: number,
  resourceId: string,
  patch: Partial<VideoResource>,
): Promise<VideoResource | undefined> {
  const list = await getDetectedByTab(tabId)
  const index = list.findIndex((item) => item.id === resourceId)
  if (index < 0) {
    return undefined
  }
  const next = { ...list[index], ...patch }
  list[index] = next
  await setDetectedByTab(tabId, list)
  return next
}

/** 解析 HLS / DASH 并写回当前 Tab 检测列表 */
export async function parseStream(payload: ParseStreamPayload): Promise<VideoResource | undefined> {
  const kind = payload.kind ?? classifyKind(payload.url)
  const tabId = payload.tabId
  const resourceId = payload.resourceId

  if (kind === 'hls') {
    const result = await inspectHls(payload.url)
    const variants: StreamVariant[] = result.variants
    const patch: Partial<VideoResource> = {
      parsed: true,
      isLive: result.isLive,
      variants,
      unsupportedReason: result.encrypted ? ENCRYPTED_STREAM_ERROR : undefined,
      canDirectDownload: !result.encrypted && !result.isLive,
    }
    if (tabId !== undefined && resourceId) {
      return patchResource(tabId, resourceId, patch)
    }
    return undefined
  }

  if (kind === 'dash') {
    const result = await inspectDash(payload.url)
    const tracks: StreamTrack[] = result.tracks
    const downloadable = tracks.some((item) => item.downloadable)
    const patch: Partial<VideoResource> = {
      parsed: true,
      isLive: result.isLive,
      tracks,
      canDirectDownload: downloadable,
      unsupportedReason: downloadable ? undefined : RECORD_FALLBACK,
    }
    if (tabId !== undefined && resourceId) {
      return patchResource(tabId, resourceId, patch)
    }
    return undefined
  }

  throw new Error('无法解析该资源')
}
