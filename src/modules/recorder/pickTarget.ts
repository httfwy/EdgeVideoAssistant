/** 找不到 video 时尝试的播放器容器，覆盖常见站点 */
const FALLBACK_SELECTORS = [
  '.bpx-player-video-area',
  '.bpx-player-video-wrap',
  '#movie_player',
  '.html5-video-player',
  '#live-player',
  '.live-player-mounter',
]

function collectVideos(root: Document | ShadowRoot, into: HTMLVideoElement[]) {
  into.push(...root.querySelectorAll('video'))
  for (const node of root.querySelectorAll('*')) {
    if (node.shadowRoot) {
      collectVideos(node.shadowRoot, into)
    }
  }
}

/** 把 iframe 内坐标换算到顶层视口 */
export function rectInTopWindow(element: Element): DOMRect {
  const rect = element.getBoundingClientRect()
  const view = element.ownerDocument.defaultView
  if (!view || view === window) {
    return rect
  }
  const frame = view.frameElement
  if (!frame) {
    return rect
  }
  const frameRect = rectInTopWindow(frame)
  return new DOMRect(rect.x + frameRect.x, rect.y + frameRect.y, rect.width, rect.height)
}

function isUsable(element: Element): boolean {
  const rect = rectInTopWindow(element)
  if (rect.width < 16 || rect.height < 16) {
    return false
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!style || style.display === 'none' || style.visibility === 'hidden') {
    return false
  }
  return Number(style.opacity) > 0
}

function scoreVideo(video: HTMLVideoElement): number {
  const rect = rectInTopWindow(video)
  const area = Math.max(0, rect.width) * Math.max(0, rect.height)
  const playing = !video.paused && !video.ended && video.readyState >= 2 ? 1e12 : 0
  const inView =
    rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
      ? 1e9
      : 0
  return playing + inView + area
}

function videosOnPage(): HTMLVideoElement[] {
  const list: HTMLVideoElement[] = []
  collectVideos(document, list)
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const doc = iframe.contentDocument
      if (doc) {
        collectVideos(doc, list)
      }
    } catch {
      // 跨域 iframe 无法读取
    }
  }
  return list.filter(isUsable)
}

function fallbackPlayer(): HTMLElement | null {
  for (const selector of FALLBACK_SELECTORS) {
    const node = document.querySelector(selector)
    if (node instanceof HTMLElement && isUsable(node)) {
      return node
    }
  }
  return null
}

/** 选取当前应录制的播放器：优先正在播放且面积最大的 video */
export function pickRecordTarget(): HTMLElement | null {
  const videos = videosOnPage()
  if (videos.length === 1) {
    return videos[0]
  }
  if (videos.length > 1) {
    return videos.reduce((best, item) => (scoreVideo(item) > scoreVideo(best) ? item : best))
  }
  return fallbackPlayer()
}
