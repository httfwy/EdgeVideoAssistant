import type { StreamTrack } from '../../shared/types'
import { ENCRYPTED_STREAM_ERROR } from '../hls/playlist'

export const DASH_SEGMENT_ERROR = '无法直接下载，可改用录制'

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match?.[1]
}

function innerText(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'i'))
  return match?.[1]?.trim()
}

function resolveUri(uri: string, baseUrl: string): string {
  return new URL(uri, baseUrl).href
}

function splitSets(xml: string): string[] {
  const sets: string[] = []
  const regex = /<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml))) {
    sets.push(match[0])
  }
  return sets
}

function splitRepresentations(xml: string): string[] {
  const items: string[] = []
  const regex = /<Representation\b[\s\S]*?<\/Representation>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml))) {
    items.push(match[0])
  }
  return items
}

function setKind(setXml: string): 'video' | 'audio' {
  const content = (attr(setXml.slice(0, 400), 'contentType') ?? '').toLowerCase()
  const mime = (attr(setXml.slice(0, 400), 'mimeType') ?? '').toLowerCase()
  if (content.includes('audio') || mime.startsWith('audio/')) {
    return 'audio'
  }
  return 'video'
}

function representationUrl(repXml: string, setXml: string, mpdXml: string, baseUrl: string): string | undefined {
  const base =
    innerText(repXml, 'BaseURL') ?? innerText(setXml, 'BaseURL') ?? innerText(mpdXml, 'BaseURL')
  if (!base) {
    return undefined
  }
  if (/<SegmentTemplate/i.test(repXml) || /<SegmentTemplate/i.test(setXml)) {
    return undefined
  }
  return resolveUri(base, baseUrl)
}

/** 解析 MPD：列出轨道；仅完整 BaseURL 文件视为可下载 */
export function parseMpd(xml: string, baseUrl: string): {
  isLive: boolean
  encrypted: boolean
  tracks: StreamTrack[]
} {
  const head = xml.slice(0, 800)
  const isLive = /type\s*=\s*"dynamic"/i.test(head)
  const encrypted = /<ContentProtection/i.test(xml)
  const tracks: StreamTrack[] = []

  splitSets(xml).forEach((setXml, setIndex) => {
    const kind = setKind(setXml)
    splitRepresentations(setXml).forEach((repXml, repIndex) => {
      const id = attr(repXml, 'id') ?? `${kind}-${setIndex}-${repIndex}`
      const bandwidth = Number(attr(repXml, 'bandwidth')) || undefined
      const width = attr(repXml, 'width')
      const height = attr(repXml, 'height')
      const mime = attr(repXml, 'mimeType') ?? attr(setXml, 'mimeType')
      const url = representationUrl(repXml, setXml, xml, baseUrl)
      const kbps = bandwidth ? `${Math.round(bandwidth / 1000)} kbps` : ''
      const size = width && height ? `${width}x${height}` : ''
      const label = [kind === 'audio' ? '音频' : '视频', size, kbps].filter(Boolean).join(' · ')
      tracks.push({
        id,
        kind,
        label: label || id,
        url,
        bandwidth,
        mime,
        downloadable: Boolean(url) && !encrypted && !isLive,
      })
    })
  })

  return { isLive, encrypted, tracks }
}

export async function inspectDash(url: string): Promise<{
  isLive: boolean
  encrypted: boolean
  tracks: StreamTrack[]
}> {
  const response = await fetch(url, { referrer: url })
  if (!response.ok) {
    throw new Error(DASH_SEGMENT_ERROR)
  }
  const xml = await response.text()
  const parsed = parseMpd(xml, url)
  if (parsed.encrypted) {
    parsed.tracks = parsed.tracks.map((track) => ({
      ...track,
      downloadable: false,
      url: undefined,
    }))
  }
  return parsed
}

export { ENCRYPTED_STREAM_ERROR }
