import { MessageType, type DetectScanPayload, type ExtensionMessage } from '../shared/messages'
import { scanDom } from '../modules/detector'

const OBSERVE_DEBOUNCE_MS = 300

function collect(): DetectScanPayload {
  return {
    items: scanDom(document, location.href),
    pageTitle: document.title,
    pageUrl: location.href,
  }
}

function reportToBackground() {
  const payload = collect()
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
  if (message?.type !== MessageType.DETECT_REFRESH) {
    return
  }
  sendResponse({ ok: true, ...collect() })
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
