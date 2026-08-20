import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  type DiscardedTrack,
} from 'mediabunny'

export type RemuxMode = 'video' | 'audio' | 'mux' | 'file'

function createInput(data: ArrayBuffer): Input {
  return new Input({
    source: new BufferSource(data),
    formats: ALL_FORMATS,
  })
}

function discardedMessage(tracks: DiscardedTrack[], fallback: string): string {
  const reasons = tracks
    .filter((item) => item.reason !== 'discarded_by_user')
    .map((item) => item.reason)
  if (reasons.includes('undecodable_source_codec')) {
    return '当前编码无法封装为 MP4'
  }
  if (reasons.includes('unknown_source_codec')) {
    return '无法识别媒体编码'
  }
  if (reasons.includes('no_encodable_target_codec')) {
    return '当前环境无法封装该编码'
  }
  return fallback
}

function createOutput(): { output: Output; target: BufferTarget } {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  return { output, target }
}

function takeBuffer(target: BufferTarget): ArrayBuffer {
  if (!target.buffer?.byteLength) {
    throw new Error('封装失败')
  }
  return target.buffer
}

/** 将 fMP4 / 分离轨转封装为可播放的 MP4（能拷贝则拷贝，否则再解码） */
export async function remuxToMp4(
  primary: ArrayBuffer,
  options?: {
    mode?: RemuxMode
    audio?: ArrayBuffer
    onProgress?: (ratio: number) => void
  },
): Promise<ArrayBuffer> {
  const mode = options?.mode ?? 'file'
  const inputs: Input[] = []

  try {
    if (mode === 'mux') {
      if (!options?.audio?.byteLength) {
        throw new Error('缺少音频流')
      }
      const { output, target } = createOutput()
      const videoInput = createInput(primary)
      const audioInput = createInput(options.audio)
      inputs.push(videoInput, audioInput)

      const videoConv = await Conversion.init({
        input: videoInput,
        output,
        composable: true,
        audio: { discard: true },
        showWarnings: false,
      })
      const audioConv = await Conversion.init({
        input: audioInput,
        output,
        composable: true,
        video: { discard: true },
        showWarnings: false,
      })

      if (!videoConv.utilizedTracks.length) {
        throw new Error(discardedMessage(videoConv.discardedTracks, '无法封装视频轨道'))
      }
      if (!audioConv.utilizedTracks.length) {
        throw new Error(discardedMessage(audioConv.discardedTracks, '无法封装音频轨道'))
      }

      let videoProgress = 0
      let audioProgress = 0
      videoConv.onProgress = (ratio) => {
        videoProgress = ratio
        options?.onProgress?.(videoProgress * 0.7 + audioProgress * 0.3)
      }
      audioConv.onProgress = (ratio) => {
        audioProgress = ratio
        options?.onProgress?.(videoProgress * 0.7 + audioProgress * 0.3)
      }

      await output.start()
      await Promise.all([videoConv.execute(), audioConv.execute()])
      await output.finalize()
      return takeBuffer(target)
    }

    const { output, target } = createOutput()
    const input = createInput(primary)
    inputs.push(input)
    const conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: mode === 'audio' ? { discard: true } : undefined,
      audio: mode === 'video' ? { discard: true } : undefined,
    })

    if (!conversion.isValid || !conversion.utilizedTracks.length) {
      throw new Error(discardedMessage(conversion.discardedTracks, '无法封装为 MP4'))
    }

    conversion.onProgress = (ratio) => {
      options?.onProgress?.(ratio)
    }
    await conversion.execute()
    return takeBuffer(target)
  } catch (error: unknown) {
    if (error instanceof Error && error.message) {
      throw error
    }
    throw new Error('封装失败')
  } finally {
    for (const input of inputs) {
      input.dispose()
    }
  }
}
