import { CROP_CHANNEL, type CropRectPayload } from '../../shared/messages'
import { startCanvasCrop, type CanvasCropHandle } from './canvasCrop'

const CROP_WAIT_MS = 800

interface CropChannelMessage {
  type: 'request' | 'crop-target'
  taskId: string
  target?: CropTarget
}

export interface CropSession {
  stream: MediaStream
  handle?: CanvasCropHandle
}

function cropTrack(stream: MediaStream): BrowserCaptureMediaStreamTrack | undefined {
  const track = stream.getVideoTracks()[0] as BrowserCaptureMediaStreamTrack | undefined
  if (!track || typeof track.cropTo !== 'function') {
    return undefined
  }
  return track
}

function trackLooksRecordable(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0]
  if (!track || track.readyState !== 'live') {
    return false
  }
  const width = track.getSettings().width
  return width === undefined || width >= 8
}

function waitCropTarget(taskId: string, timeoutMs: number): Promise<CropTarget | null> {
  const channel = new BroadcastChannel(CROP_CHANNEL)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      channel.close()
      resolve(null)
    }, timeoutMs)

    const onMessage = (event: MessageEvent<CropChannelMessage>) => {
      if (event.data?.type !== 'crop-target' || event.data.taskId !== taskId || !event.data.target) {
        return
      }
      window.clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      channel.close()
      resolve(event.data.target)
    }

    channel.addEventListener('message', onMessage)
    channel.postMessage({ type: 'request', taskId } satisfies CropChannelMessage)
  })
}

function rectReady(rect: CropRectPayload | null | undefined): rect is CropRectPayload {
  return Boolean(rect && rect.width >= 16 && rect.height >= 16)
}

async function tryRegionCrop(source: MediaStream, target: CropTarget): Promise<boolean> {
  const track = cropTrack(source)
  if (!track) {
    return false
  }
  try {
    await track.cropTo(target)
    if (trackLooksRecordable(source)) {
      return true
    }
    await track.cropTo(null)
  } catch {
    try {
      await track.cropTo(null)
    } catch {
      // 恢复整页失败时仍回退原始流
    }
  }
  return false
}

/**
 * 优先 Region Capture；否则用画布裁切。
 * 任一路径得不到可录制画面时返回原始整页流，避免空文件。
 */
export async function applyTabCrop(
  source: MediaStream,
  taskId: string,
  getRect: () => CropRectPayload | null,
): Promise<CropSession> {
  const target = await waitCropTarget(taskId, CROP_WAIT_MS)
  if (target && (await tryRegionCrop(source, target))) {
    return { stream: source }
  }

  const rect = getRect()
  if (rectReady(rect)) {
    try {
      const handle = await startCanvasCrop(source, rect)
      if (trackLooksRecordable(handle.stream)) {
        return { stream: handle.stream, handle }
      }
      handle.stop()
    } catch {
      // 画布裁切失败则录整页
    }
  }

  return { stream: source }
}
