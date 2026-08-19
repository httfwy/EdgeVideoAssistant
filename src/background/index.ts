import {
  isKnownMessageType,
  MessageType,
  UNIMPLEMENTED_ERROR,
  type DetectScanPayload,
  type ErrorResponse,
  type ExtensionMessage,
  type MessageResponse,
} from '../shared/messages'
import {
  ensureDefaultSettings,
  getDetectedByTab,
  getSettings,
  getSnapshot,
  patchSettings,
  removeDetectedByTab,
  setDetectedByTab,
} from '../shared/storage'
import type { Settings, VideoResource } from '../shared/types'
import { draftFromUrl, type MediaDraft } from '../modules/detector/classify'
import { draftToResource, mergeResources } from '../modules/detector/merge'

const unimplemented: ErrorResponse = { ok: false, error: UNIMPLEMENTED_ERROR }
const RESTRICTED_ERROR = '当前页无法检测，请在普通网页重试'

function isRestrictedUrl(url?: string): boolean {
  if (!url) {
    return true
  }
  return (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://microsoftedge.microsoft.com/')
  )
}

function headerValue(
  headers: chrome.webRequest.HttpHeader[] | undefined,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  return headers?.find((item) => item.name.toLowerCase() === target)?.value
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function upsertDrafts(
  tabId: number,
  drafts: MediaDraft[],
  pageTitle?: string,
  pageUrl?: string,
): Promise<VideoResource[]> {
  const incoming = drafts.map((draft) => draftToResource(draft, tabId, pageTitle, pageUrl))
  const existing = await getDetectedByTab(tabId)
  const merged = mergeResources(existing, incoming)
  await setDetectedByTab(tabId, merged)
  return merged
}

async function requestDomScan(tab: chrome.tabs.Tab): Promise<DetectScanPayload> {
  const tabId = tab.id
  if (tabId === undefined) {
    throw new Error(RESTRICTED_ERROR)
  }

  const sendScan = () =>
    chrome.tabs.sendMessage(tabId, { type: MessageType.DETECT_REFRESH }) as Promise<
      { ok?: boolean } & DetectScanPayload
    >

  try {
    const result = await sendScan()
    return {
      items: result.items ?? [],
      pageTitle: result.pageTitle ?? tab.title,
      pageUrl: result.pageUrl ?? tab.url,
    }
  } catch {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js
    if (!files?.length) {
      throw new Error(RESTRICTED_ERROR)
    }
    await chrome.scripting.executeScript({ target: { tabId }, files })
    const result = await sendScan()
    return {
      items: result.items ?? [],
      pageTitle: result.pageTitle ?? tab.title,
      pageUrl: result.pageUrl ?? tab.url,
    }
  }
}

async function refreshDetection(tabId?: number): Promise<MessageResponse> {
  const tab = tabId !== undefined ? await chrome.tabs.get(tabId) : await getActiveTab()
  if (!tab?.id || isRestrictedUrl(tab.url)) {
    return { ok: false, error: RESTRICTED_ERROR }
  }

  try {
    const scan = await requestDomScan(tab)
    await upsertDrafts(tab.id, scan.items, scan.pageTitle ?? tab.title, scan.pageUrl ?? tab.url)
    const snapshot = await getSnapshot(tab.id)
    return { ok: true, snapshot }
  } catch {
    return { ok: false, error: RESTRICTED_ERROR }
  }
}

async function handleDetectResult(
  payload: DetectScanPayload | undefined,
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = payload?.tabId ?? sender.tab?.id
  if (tabId === undefined) {
    return { ok: true }
  }
  const pageTitle = payload?.pageTitle ?? sender.tab?.title
  const pageUrl = payload?.pageUrl ?? sender.tab?.url
  await upsertDrafts(tabId, payload?.items ?? [], pageTitle, pageUrl)
  return { ok: true }
}

async function ingestWebRequest(details: chrome.webRequest.WebResponseHeadersDetails) {
  if (details.tabId < 0) {
    return
  }

  const contentType = headerValue(details.responseHeaders, 'content-type')
  const lengthRaw = headerValue(details.responseHeaders, 'content-length')
  const sizeBytes = lengthRaw ? Number(lengthRaw) : undefined
  const draft = draftFromUrl(details.url, {
    contentType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
  })
  if (!draft) {
    return
  }

  let pageTitle: string | undefined
  let pageUrl: string | undefined
  try {
    const tab = await chrome.tabs.get(details.tabId)
    pageTitle = tab.title
    pageUrl = tab.url
  } catch {
    pageTitle = undefined
  }

  await upsertDrafts(details.tabId, [draft], pageTitle, pageUrl)
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  switch (message.type) {
    case MessageType.PING:
      return { ok: true }
    case MessageType.GET_SNAPSHOT: {
      const payload = message.payload as { tabId?: number } | undefined
      const tabId = payload?.tabId ?? (await getActiveTab())?.id
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
    case MessageType.DETECT_REFRESH: {
      const payload = message.payload as { tabId?: number } | undefined
      return refreshDetection(payload?.tabId)
    }
    case MessageType.DETECT_RESULT:
      return handleDetectResult(message.payload as DetectScanPayload | undefined, sender)
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

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string' || !isKnownMessageType(message.type)) {
    return
  }

  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '处理消息失败'
      sendResponse({ ok: false, error: errorMessage } satisfies ErrorResponse)
    })

  return true
})

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    void ingestWebRequest(details)
  },
  {
    urls: ['http://*/*', 'https://*/*'],
    types: ['xmlhttprequest', 'media', 'other', 'object'],
  },
  ['responseHeaders'],
)

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeDetectedByTab(tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    void setDetectedByTab(tabId, [])
  }
})
