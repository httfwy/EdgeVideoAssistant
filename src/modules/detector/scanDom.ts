import { draftFromUrl, type MediaDraft } from './classify'

function isEncryptedVideo(video: HTMLVideoElement): boolean {
  return video.mediaKeys !== null
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

/** 扫描页面中的 video / source，跳过 blob/data */
export function scanDom(root: ParentNode = document, base: string = location.href): MediaDraft[] {
  const drafts: MediaDraft[] = []
  const seen = new Set<string>()
  const videos = root.querySelectorAll('video')
  for (const video of videos) {
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
