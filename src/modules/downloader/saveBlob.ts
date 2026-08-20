import {
  MessageType,
  sendMessage,
  type ErrorResponse,
  type SaveBlobPayload,
  type SaveBlobResponse,
} from '../../shared/messages'

/** 等待 chrome.downloads 任务结束；仅应在 Service Worker 中调用 */
export async function waitForChromeDownload(downloadId: number): Promise<void> {
  const items = await chrome.downloads.search({ id: downloadId })
  const current = items[0]?.state
  if (current === 'complete') {
    return
  }
  if (current === 'interrupted') {
    throw new Error('下载失败')
  }

  await new Promise<void>((resolve, reject) => {
    function listener(delta: chrome.downloads.DownloadDelta) {
      if (delta.id !== downloadId) {
        return
      }
      if (delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(listener)
        resolve()
      } else if (delta.state?.current === 'interrupted') {
        chrome.downloads.onChanged.removeListener(listener)
        reject(new Error('下载失败'))
      }
    }
    chrome.downloads.onChanged.addListener(listener)
  })
}

/**
 * Offscreen 文档没有 chrome.downloads，把 blob URL 交给 Service Worker 落盘。
 * 返回后再 revokeObjectURL，避免文件尚未写入就被释放。
 */
export async function saveObjectUrl(url: string, filename: string): Promise<number> {
  const response = await sendMessage<SaveBlobResponse | ErrorResponse>(MessageType.SAVE_BLOB, {
    url,
    filename,
  } satisfies SaveBlobPayload)
  if (!response.ok) {
    throw new Error(response.error || '下载失败')
  }
  return response.downloadId
}

/** Service Worker：触发下载并等到完成 */
export async function handleSaveBlob(
  payload: SaveBlobPayload | undefined,
): Promise<SaveBlobResponse | ErrorResponse> {
  if (!payload?.url || !payload.filename) {
    return { ok: false, error: '保存参数无效' }
  }
  try {
    const downloadId = await chrome.downloads.download({
      url: payload.url,
      filename: payload.filename,
      conflictAction: 'uniquify',
      saveAs: false,
    })
    await waitForChromeDownload(downloadId)
    return { ok: true, downloadId }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '下载失败'
    return { ok: false, error: message }
  }
}
