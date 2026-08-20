import type { CropRectPayload } from '../../shared/messages'

export interface CanvasCropHandle {
  stream: MediaStream
  updateRect: (rect: CropRectPayload) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

function mapRect(
  frameWidth: number,
  frameHeight: number,
  rect: CropRectPayload,
): { sx: number; sy: number; sw: number; sh: number } {
  const scaleX = frameWidth / Math.max(1, rect.viewportWidth)
  const scaleY = frameHeight / Math.max(1, rect.viewportHeight)
  let sx = rect.x * scaleX
  let sy = rect.y * scaleY
  let sw = rect.width * scaleX
  let sh = rect.height * scaleY
  sx = Math.min(Math.max(0, sx), Math.max(0, frameWidth - 2))
  sy = Math.min(Math.max(0, sy), Math.max(0, frameHeight - 2))
  sw = Math.min(Math.max(2, sw), frameWidth - sx)
  sh = Math.min(Math.max(2, sh), frameHeight - sy)
  return { sx, sy, sw, sh }
}

function waitVideoReady(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.videoWidth > 0) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('标签页画面未就绪')), timeoutMs)
    video.addEventListener(
      'loadedmetadata',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/** 用画布按视口矩形裁切标签页捕获流。Offscreen 中 rAF 会被暂停，必须用定时器画帧。 */
export async function startCanvasCrop(
  source: MediaStream,
  firstRect: CropRectPayload,
): Promise<CanvasCropHandle> {
  const video = document.createElement('video')
  video.muted = true
  video.autoplay = true
  video.playsInline = true
  video.srcObject = source

  const canvas = document.createElement('canvas')
  const maybeCtx = canvas.getContext('2d', { alpha: false })
  if (!maybeCtx) {
    throw new Error('无法创建画布')
  }
  const context: CanvasRenderingContext2D = maybeCtx
  document.body.append(video, canvas)

  let rect = firstRect
  let timer = 0
  let paused = false

  function paint(): boolean {
    const frameW = video.videoWidth
    const frameH = video.videoHeight
    if (!frameW || !frameH) {
      return false
    }
    const mapped = mapRect(frameW, frameH, rect)
    const outW = Math.max(2, Math.round(mapped.sw))
    const outH = Math.max(2, Math.round(mapped.sh))
    if (canvas.width !== outW) {
      canvas.width = outW
    }
    if (canvas.height !== outH) {
      canvas.height = outH
    }
    context.drawImage(video, mapped.sx, mapped.sy, mapped.sw, mapped.sh, 0, 0, outW, outH)
    return true
  }

  try {
    await video.play()
    await waitVideoReady(video, 1500)
    if (!paint()) {
      throw new Error('无法裁切视频区域')
    }
  } catch (error: unknown) {
    video.remove()
    canvas.remove()
    throw error instanceof Error ? error : new Error('无法裁切视频区域')
  }

  timer = window.setInterval(() => {
    if (!paused) {
      paint()
    }
  }, 33)

  const canvasStream = canvas.captureStream(30)
  const videoTrack = canvasStream.getVideoTracks()[0]
  if (videoTrack?.muted) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 400)
      videoTrack.addEventListener(
        'unmute',
        () => {
          window.clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  }
  const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...source.getAudioTracks()])

  return {
    stream: mixed,
    updateRect(next) {
      rect = next
    },
    pause() {
      paused = true
    },
    resume() {
      paused = false
    },
    stop() {
      paused = true
      window.clearInterval(timer)
      mixed.getVideoTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // 画布轨道可能已结束
        }
      })
      video.pause()
      video.srcObject = null
      video.remove()
      canvas.remove()
    },
  }
}
