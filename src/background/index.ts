import {
  isKnownMessageType,
  MessageType,
  UNIMPLEMENTED_ERROR,
  type ErrorResponse,
  type ExtensionMessage,
  type MessageResponse,
} from '../shared/messages'
import { ensureDefaultSettings, getSettings, getSnapshot, patchSettings } from '../shared/storage'
import type { Settings } from '../shared/types'

const unimplemented: ErrorResponse = { ok: false, error: UNIMPLEMENTED_ERROR }

/** 读取当前窗口活动标签的 id；无 tabs 权限时仍可拿到 id */
async function getActiveTabId(): Promise<number | undefined> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs[0]?.id
  } catch {
    return undefined
  }
}

async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.type) {
    case MessageType.PING:
      return { ok: true }
    case MessageType.GET_SNAPSHOT: {
      const payload = message.payload as { tabId?: number } | undefined
      const tabId = payload?.tabId ?? (await getActiveTabId())
      const snapshot = await getSnapshot(tabId)
      return { ok: true, snapshot }
    }
    case MessageType.GET_SETTINGS: {
      const settings = await getSettings()
      return { ok: true, settings }
    }
    case MessageType.PATCH_SETTINGS: {
      const patch = (message.payload ?? {}) as Partial<Settings>
      const settings = await patchSettings(patch)
      return { ok: true, settings }
    }
    default:
      return unimplemented
  }
}

void ensureDefaultSettings()

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaultSettings()
})

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaultSettings()
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string' || !isKnownMessageType(message.type)) {
    return
  }

  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '处理消息失败'
      sendResponse({ ok: false, error: errorMessage } satisfies ErrorResponse)
    })

  return true
})
