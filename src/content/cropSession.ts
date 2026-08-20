import { MessageType, type CropRectPayload, type ExtensionMessage } from '../shared/messages'
import { pickRecordTarget, rectInTopWindow } from '../modules/recorder/pickTarget'

const BRIDGE_ID = 'eva-crop-bridge'
const OVERLAY_ID = 'eva-speed-overlay'

let watch: { stop: () => void } | null = null
let overlayDisplay = ''

function cropCtor(): CropTargetConstructor | undefined {
  return (globalThis as unknown as { CropTarget?: CropTargetConstructor }).CropTarget
}

function toRect(taskId: string, element: Element): CropRectPayload {
  const rect = rectInTopWindow(element)
  return {
    taskId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

function postRect(taskId: string, element: Element) {
  void chrome.runtime.sendMessage(
    {
      type: MessageType.RECORD_CROP_RECT,
      payload: toRect(taskId, element),
    } satisfies ExtensionMessage<CropRectPayload>,
    () => {
      void chrome.runtime.lastError
    },
  )
}

function hideSpeedOverlay() {
  const host = document.getElementById(OVERLAY_ID)
  if (!host) {
    return
  }
  overlayDisplay = host.style.display
  host.style.display = 'none'
}

function restoreSpeedOverlay() {
  const host = document.getElementById(OVERLAY_ID)
  if (!host) {
    return
  }
  host.style.display = overlayDisplay
}

function ensureBridge(): HTMLIFrameElement {
  let iframe = document.getElementById(BRIDGE_ID) as HTMLIFrameElement | null
  if (iframe) {
    return iframe
  }
  iframe = document.createElement('iframe')
  iframe.id = BRIDGE_ID
  iframe.src = chrome.runtime.getURL('src/content/crop-bridge.html')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText =
    'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:0;top:0;'
  document.documentElement.appendChild(iframe)
  return iframe
}

function waitBridge(iframe: HTMLIFrameElement, timeoutMs: number): Promise<boolean> {
  if (iframe.dataset.ready === '1') {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), timeoutMs)
    iframe.addEventListener(
      'load',
      () => {
        iframe.dataset.ready = '1'
        window.clearTimeout(timer)
        resolve(true)
      },
      { once: true },
    )
    iframe.addEventListener(
      'error',
      () => {
        window.clearTimeout(timer)
        resolve(false)
      },
      { once: true },
    )
  })
}

async function sendCropTarget(taskId: string, element: Element): Promise<void> {
  const ctor = cropCtor()
  if (!ctor?.fromElement) {
    return
  }
  let target: CropTarget
  try {
    target = await ctor.fromElement(element)
  } catch {
    return
  }
  const iframe = ensureBridge()
  const loaded = await waitBridge(iframe, 1500)
  if (!loaded || !iframe.contentWindow) {
    return
  }
  const origin = new URL(iframe.src).origin
  iframe.contentWindow.postMessage({ source: 'eva-crop', type: 'crop-target', taskId, target }, origin)
}

function startWatch(taskId: string, element: Element) {
  let current = element

  const tick = () => {
    if (!current.isConnected) {
      const next = pickRecordTarget()
      if (!next) {
        return
      }
      current = next
      void sendCropTarget(taskId, current)
    }
    postRect(taskId, current)
  }

  const timer = window.setInterval(tick, 400)
  window.addEventListener('scroll', tick, true)
  window.addEventListener('resize', tick)
  watch = {
    stop() {
      window.clearInterval(timer)
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    },
  }
}

/** 开始向 Offscreen 提供 CropTarget 与视口矩形 */
export async function startCropSession(taskId: string): Promise<{ ok: true; found: boolean }> {
  stopCropSession()
  const element = pickRecordTarget()
  if (!element) {
    return { ok: true, found: false }
  }
  hideSpeedOverlay()
  postRect(taskId, element)
  void sendCropTarget(taskId, element)
  startWatch(taskId, element)
  return { ok: true, found: true }
}

export function stopCropSession() {
  watch?.stop()
  watch = null
  restoreSpeedOverlay()
}
