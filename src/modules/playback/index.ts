import { PLAYBACK_RATES, DEFAULT_SETTINGS } from '../../shared/constants'
import { MessageType } from '../../shared/messages'
import type { Settings } from '../../shared/types'

const HOST_ID = 'eva-speed-overlay'
const STORAGE_KEY = 'settings'

function pickVideo(): HTMLVideoElement | undefined {
  const active = document.activeElement
  if (active instanceof HTMLVideoElement) {
    return active
  }
  return document.querySelector('video') ?? undefined
}

export function applyPlaybackRate(rate: number): { ok: true } | { ok: false; error: string } {
  const video = pickVideo()
  if (!video) {
    return { ok: false, error: '当前页没有可调速的视频' }
  }
  video.playbackRate = rate
  const select = document.querySelector<HTMLSelectElement>(`#${HOST_ID} select`)
  if (select) {
    select.value = String(rate)
  }
  return { ok: true }
}

function currentRate(settings: Settings): number {
  if (settings.rememberPlaybackRate && settings.lastPlaybackRate) {
    return settings.lastPlaybackRate
  }
  return 1
}

function placeOverlay(host: HTMLElement, video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect()
  host.style.top = `${Math.max(8, rect.top + 8 + window.scrollY)}px`
  host.style.left = `${Math.max(8, rect.right - 208 + window.scrollX)}px`
}

async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] as Settings | undefined) }
}

/** 在视频右上角插入可拖动倍速浮层；关闭后本页会话不再出现 */
export async function setupOverlay(): Promise<void> {
  let dismissed = false
  let dragging = false
  let offsetX = 0
  let offsetY = 0

  const settings = await readSettings()
  if (!settings.showPageSpeedControl) {
    return
  }

  function ensure() {
    if (dismissed || document.getElementById(HOST_ID)) {
      return
    }
    const video = pickVideo()
    if (!video) {
      return
    }

    const host = document.createElement('div')
    host.id = HOST_ID
    host.innerHTML = `
      <span>速度</span>
      <select aria-label="播放速度"></select>
      <button type="button" aria-label="关闭">×</button>
    `
    const select = host.querySelector('select') as HTMLSelectElement
    const close = host.querySelector('button') as HTMLButtonElement
    for (const rate of PLAYBACK_RATES) {
      const option = document.createElement('option')
      option.value = String(rate)
      option.textContent = `${rate}x`
      select.appendChild(option)
    }
    select.value = String(currentRate(settings))
    if (settings.rememberPlaybackRate) {
      video.playbackRate = Number(select.value)
    }

    select.addEventListener('change', () => {
      const rate = Number(select.value)
      applyPlaybackRate(rate)
      if (settings.rememberPlaybackRate) {
        void chrome.runtime.sendMessage({
          type: MessageType.PATCH_SETTINGS,
          payload: { lastPlaybackRate: rate },
        })
      }
    })
    close.addEventListener('click', () => {
      dismissed = true
      host.remove()
    })
    host.addEventListener('mousedown', (event) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) {
        return
      }
      dragging = true
      offsetX = event.clientX - host.getBoundingClientRect().left
      offsetY = event.clientY - host.getBoundingClientRect().top
      event.preventDefault()
    })
    document.addEventListener('mousemove', (event) => {
      if (!dragging) {
        return
      }
      host.style.left = `${event.clientX - offsetX + window.scrollX}px`
      host.style.top = `${event.clientY - offsetY + window.scrollY}px`
    })
    document.addEventListener('mouseup', () => {
      dragging = false
    })

    document.documentElement.appendChild(host)
    placeOverlay(host, video)
  }

  ensure()
  const observer = new MutationObserver(() => ensure())
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
