import { MessageType } from '../../shared/messages'

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
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'HLS 分片下载与合并',
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
  try {
    await chrome.runtime.sendMessage({ type, payload })
  } catch {
    await ensureOffscreenDocument()
    await chrome.runtime.sendMessage({ type, payload })
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
