import {
  draftsFromPlayurlJson,
  formatBiliDraftTitle,
  isCurrentPagePlayurl,
} from '../modules/detector/bilibili'
import { startCropSession, stopCropSession } from './cropSession'
import { MessageType, type DetectScanPayload, type ExtensionMessage } from '../shared/messages'
import { scanDom } from '../modules/detector'
import { applyPlaybackRate, setupOverlay } from '../modules/playback'

const OBSERVE_DEBOUNCE_MS = 300

function collect(): DetectScanPayload {
  return {
    items: scanDom(document, location.href),
    pageTitle: document.title,
    pageUrl: location.href,
  }
}

function reportToBackground(payload: DetectScanPayload = collect()) {
  void chrome.runtime.sendMessage(
    {
      type: MessageType.DETECT_RESULT,
      payload,
    } satisfies ExtensionMessage<DetectScanPayload>,
    () => {
      void chrome.runtime.lastError
    },
  )
}

let debounceTimer = 0

function scheduleReport() {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    reportToBackground()
  }, OBSERVE_DEBOUNCE_MS)
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message?.type === MessageType.DETECT_REFRESH) {
    window.postMessage({ source: 'eva-request-playinfo' }, '*')
    sendResponse({ ok: true, ...collect() })
    return
  }
  if (message?.type === MessageType.SET_PLAYBACK_RATE) {
    const rate = Number((message.payload as { rate?: number } | undefined)?.rate)
    const result = applyPlaybackRate(Number.isFinite(rate) ? rate : 1)
    sendResponse(result)
    return true
  }
  if (message?.type === MessageType.RECORD_PREPARE_CROP) {
    const taskId = (message.payload as { taskId?: string } | undefined)?.taskId
    if (!taskId) {
      sendResponse({ ok: false, error: '任务无效' })
      return
    }
    void startCropSession(taskId).then(sendResponse)
    return true
  }
  if (message?.type === MessageType.RECORD_STOP_CROP) {
    stopCropSession()
    sendResponse({ ok: true })
  }
})

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) {
    return
  }
  const data = event.data as { source?: string; url?: string; data?: unknown } | undefined
  if (data?.source !== 'eva-page-media') {
    return
  }
  const requestUrl = data.url || location.href
  if (!isCurrentPagePlayurl(requestUrl, location.href, data.data)) {
    return
  }
  const items = draftsFromPlayurlJson(data.data, location.href).map((item) => ({
    ...item,
    title: formatBiliDraftTitle(document.title, item.quality) || item.title,
  }))
  if (!items.length) {
    return
  }
  reportToBackground({
    items,
    pageTitle: document.title,
    pageUrl: location.href,
    replaceBili: true,
  })
})

const observer = new MutationObserver(() => {
  scheduleReport()
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src'],
})

document.addEventListener(
  'encrypted',
  () => {
    scheduleReport()
  },
  true,
)

reportToBackground()
void setupOverlay()
