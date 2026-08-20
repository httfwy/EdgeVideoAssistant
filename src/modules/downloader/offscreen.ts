import { MessageType, type FetchSavePayload } from '../../shared/messages'

const OFFSCREEN_URL = 'src/offscreen/index.html'

/** 确保 Offscreen 文档存在，可复用 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error('当前浏览器不支持 Offscreen')
  }

  if (chrome.offscreen.hasDocument) {
    const exists = await chrome.offscreen.hasDocument()
    if (exists) {
      return
    }
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [
        chrome.offscreen.Reason.BLOBS,
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.DISPLAY_MEDIA,
      ],
      justification: 'HLS 分片合并、音视频封装与页面录制',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('already') || message.includes('single offscreen')) {
      return
    }
    throw error
  }
}

export async function sendToOffscreen(type: string, payload: unknown): Promise<void> {
  await ensureOffscreenDocument()
  const message = { type, payload, target: 'offscreen' as const }
  try {
    await chrome.runtime.sendMessage(message)
  } catch {
    await ensureOffscreenDocument()
    await chrome.runtime.sendMessage(message)
  }
}

export async function startOffscreenHls(payload: {
  taskId: string
  url: string
  filename: string
  startIndex: number
}): Promise<void> {
  await sendToOffscreen(MessageType.HLS_START, payload)
}

export async function startOffscreenFetch(payload: FetchSavePayload): Promise<void> {
  await sendToOffscreen(MessageType.FETCH_SAVE, payload)
}
