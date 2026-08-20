import { draftFromUrl, type MediaDraft } from './classify'

function isEncryptedVideo(video: HTMLVideoElement): boolean {
  return video.mediaKeys !== null
}

function areaOf(video: HTMLVideoElement): number {
  return Math.max(0, video.clientWidth) * Math.max(0, video.clientHeight)
}

/** 只保留当前正在观看的播放器，忽略推荐栏预览 */
function pickWatchVideos(root: ParentNode): HTMLVideoElement[] {
  const videos = [...root.querySelectorAll('video')].filter((video) => areaOf(video) > 0)
  if (videos.length <= 1) {
    return videos
  }
  const playing = videos.filter((video) => !video.paused && !video.ended)
  const pool = playing.length ? playing : videos
  const main = pool.reduce((best, item) => (areaOf(item) > areaOf(best) ? item : best))
  return [main]
}

function collectFromElement(video: HTMLVideoElement, base: string): MediaDraft[] {
  const drm = isEncryptedVideo(video)
  const candidates = [video.currentSrc, video.src]
  for (const source of video.querySelectorAll('source')) {
    candidates.push(source.getAttribute('src') ?? '')
  }

  const drafts: MediaDraft[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const draft = draftFromUrl(candidate, { base, drm })
    if (!draft || seen.has(draft.url)) {
      continue
    }
    seen.add(draft.url)
    drafts.push(draft)
  }
  return drafts
}

/** 扫描当前正在观看的 video，跳过 blob/data 与推荐预览 */
export function scanDom(root: ParentNode = document, base: string = location.href): MediaDraft[] {
  const drafts: MediaDraft[] = []
  const seen = new Set<string>()
  for (const video of pickWatchVideos(root)) {
    for (const draft of collectFromElement(video, base)) {
      if (seen.has(draft.url)) {
        continue
      }
      seen.add(draft.url)
      drafts.push(draft)
    }
  }
  return drafts
}
