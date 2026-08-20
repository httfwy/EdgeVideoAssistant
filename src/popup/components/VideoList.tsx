import { useState } from 'react'
import { formatDownloadProgress } from '../../modules/downloader/format'
import type { FetchOutputMode } from '../../shared/messages'
import type { DownloadTask, StreamTrack, StreamVariant, VideoResource } from '../../shared/types'

export interface DownloadOptions {
  taskId?: string
  mediaUrl?: string
  quality?: string
  outputMode?: FetchOutputMode
  audioUrl?: string
  audioBackupUrls?: string[]
  backupUrls?: string[]
  name?: string
}

interface VideoListProps {
  resources: VideoResource[]
  downloadTasks: DownloadTask[]
  detecting: boolean
  error: string
  pendingUrl?: string
  parsingId?: string
  onRetry: () => void
  onDownload: (resource: VideoResource, options?: DownloadOptions) => void
  onParse: (resource: VideoResource) => void
  onGoRecord: () => void
  onLive: (resource: VideoResource) => void
}

function formatSize(sizeBytes?: number): string {
  if (sizeBytes === undefined) {
    return '—'
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function kindLabel(resource: VideoResource): string {
  if (resource.isLive) {
    return '直播'
  }
  try {
    const path = new URL(resource.url).pathname.toLowerCase()
    if (path.endsWith('.m4s') || path.includes('.m4s')) {
      return 'MP4'
    }
  } catch {
    // 保持 kind 文案
  }
  return resource.kind.toUpperCase()
}

function latestTaskForUrl(url: string, tasks: DownloadTask[]): DownloadTask | undefined {
  return tasks
    .filter((task) => task.url === url)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

function isTaskBusy(task?: DownloadTask, pendingUrl?: string, url?: string): boolean {
  return (
    pendingUrl === url ||
    task?.status === 'waiting' ||
    task?.status === 'downloading' ||
    task?.status === 'merging' ||
    task?.status === 'paused'
  )
}

function isM4sResource(resource: VideoResource): boolean {
  if (resource.isLive || !resource.canDirectDownload) {
    return false
  }
  try {
    return new URL(resource.url).pathname.toLowerCase().includes('.m4s')
  } catch {
    return false
  }
}

function isAudioResource(resource: VideoResource): boolean {
  return (resource.quality ?? '').startsWith('音频')
}

function qualityRank(resource: VideoResource): number {
  const n = Number((resource.quality ?? '').replace(/\D/g, ''))
  return Number.isFinite(n) ? n : 0
}

function dashTitle(resource: VideoResource): string {
  const page = resource.pageTitle
  if (page) {
    const cleaned = page
      .replace(/[_-]?哔哩哔哩.*$/u, '')
      .replace(/\s*[-_]\s*bilibili.*$/iu, '')
      .trim()
    if (cleaned) {
      return cleaned
    }
  }
  return resource.title.replace(/\s*·\s*(?:\d+p|音频).*$/u, '').trim() || resource.title
}

type ListItem =
  | { type: 'single'; resource: VideoResource }
  | { type: 'dash'; id: string; title: string; videos: VideoResource[]; audios: VideoResource[] }

function buildListItems(resources: VideoResource[]): ListItem[] {
  const groups = new Map<string, VideoResource[]>()
  for (const resource of resources) {
    if (!isM4sResource(resource)) {
      continue
    }
    const key = resource.pageUrl || `tab:${resource.tabId}`
    const list = groups.get(key) ?? []
    list.push(resource)
    groups.set(key, list)
  }

  const items: ListItem[] = []
  const used = new Set<string>()
  for (const resource of resources) {
    if (!isM4sResource(resource)) {
      items.push({ type: 'single', resource })
      continue
    }
    const key = resource.pageUrl || `tab:${resource.tabId}`
    if (used.has(key)) {
      continue
    }
    used.add(key)
    const group = groups.get(key) ?? [resource]
    const videos = group
      .filter((item) => !isAudioResource(item))
      .sort((a, b) => qualityRank(b) - qualityRank(a))
    const audios = group.filter(isAudioResource).sort((a, b) => qualityRank(b) - qualityRank(a))
    items.push({
      type: 'dash',
      id: `dash:${key}`,
      title: dashTitle(videos[0] ?? audios[0] ?? resource),
      videos,
      audios,
    })
  }
  return items
}

function DownloadButton({
  busy,
  failed,
  paused,
  disabled,
  label,
  onClick,
}: {
  busy: boolean
  failed: boolean
  paused?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className="btn-primary" disabled={busy || disabled} onClick={onClick}>
      {paused ? '已暂停' : busy ? '下载中' : failed ? '重试' : label}
    </button>
  )
}

function pickResource(list: VideoResource[], selectedId?: string): VideoResource | undefined {
  return list.find((item) => item.id === selectedId) ?? list[0]
}

function DashCard({
  item,
  downloadTasks,
  pendingUrl,
  onDownload,
}: {
  item: Extract<ListItem, { type: 'dash' }>
  downloadTasks: DownloadTask[]
  pendingUrl?: string
  onDownload: (resource: VideoResource, options?: DownloadOptions) => void
}) {
  const [videoId, setVideoId] = useState(item.videos[0]?.id ?? '')
  const [audioId, setAudioId] = useState(item.audios[0]?.id ?? '')
  const video = pickResource(item.videos, videoId)
  const audio = pickResource(item.audios, audioId)
  const videoTask = video ? latestTaskForUrl(video.url, downloadTasks) : undefined
  const audioTask = audio ? latestTaskForUrl(audio.url, downloadTasks) : undefined
  const muxUrl = video ? `${video.url}#eva-mux` : ''
  const muxTask = muxUrl ? latestTaskForUrl(muxUrl, downloadTasks) : undefined
  const busyVideo = isTaskBusy(videoTask, pendingUrl, video?.url)
  const busyAudio = isTaskBusy(audioTask, pendingUrl, audio?.url)
  const busyMux = isTaskBusy(muxTask, pendingUrl, muxUrl)
  const progressTask = [muxTask, videoTask, audioTask].find(
    (task) =>
      task &&
      (task.status === 'downloading' ||
        task.status === 'merging' ||
        task.status === 'paused' ||
        task.status === 'waiting'),
  )
  const failedTask = [muxTask, videoTask, audioTask].find((task) => task?.status === 'failed')
  const titleResource = video ?? audio
  if (!titleResource) {
    return null
  }

  function startDownload(mode: FetchOutputMode) {
    if (mode === 'audio') {
      if (!audio) {
        return
      }
      onDownload(audio, {
        taskId: audioTask?.status === 'failed' ? audioTask.id : undefined,
        mediaUrl: audio.url,
        quality: audio.quality,
        backupUrls: audio.backupUrls,
        outputMode: 'audio',
        name: item.title,
      })
      return
    }
    if (mode === 'mux') {
      if (!video || !audio) {
        return
      }
      onDownload(video, {
        taskId: muxTask?.status === 'failed' ? muxTask.id : undefined,
        mediaUrl: video.url,
        quality: [video.quality, audio.quality].filter(Boolean).join(' '),
        backupUrls: video.backupUrls,
        audioUrl: audio.url,
        audioBackupUrls: audio.backupUrls,
        outputMode: 'mux',
        name: item.title,
      })
      return
    }
    if (!video) {
      return
    }
    onDownload(video, {
      taskId: videoTask?.status === 'failed' ? videoTask.id : undefined,
      mediaUrl: video.url,
      quality: video.quality,
      backupUrls: video.backupUrls,
      outputMode: 'video',
      name: item.title,
    })
  }

  return (
    <li className="video-card">
      <p className="video-title">{item.title}</p>
      <p className="video-meta">
        <span className="tag">MP4</span>
        <span>{item.audios.length ? '视频 + 音频' : '视频'}</span>
      </p>
      {progressTask ? <p className="video-progress">{formatDownloadProgress(progressTask)}</p> : null}
      {failedTask?.error ? <p className="video-unsupported">{failedTask.error}</p> : null}

      {item.videos.length > 0 ? (
        <label className="dash-field">
          <span>视频</span>
          <select value={video?.id ?? ''} onChange={(event) => setVideoId(event.target.value)}>
            {item.videos.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.quality || '视频'}
                {entry.sizeBytes ? ` · ${formatSize(entry.sizeBytes)}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {item.audios.length > 0 ? (
        <label className="dash-field">
          <span>音频</span>
          <select value={audio?.id ?? ''} onChange={(event) => setAudioId(event.target.value)}>
            {item.audios.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.quality || '音频'}
                {entry.sizeBytes ? ` · ${formatSize(entry.sizeBytes)}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="card-actions card-actions-wrap">
        {video ? (
          <DownloadButton
            busy={busyVideo}
            failed={videoTask?.status === 'failed'}
            paused={videoTask?.status === 'paused'}
            label="下载视频"
            onClick={() => startDownload('video')}
          />
        ) : null}
        {audio ? (
          <DownloadButton
            busy={busyAudio}
            failed={audioTask?.status === 'failed'}
            paused={audioTask?.status === 'paused'}
            label="下载音频"
            onClick={() => startDownload('audio')}
          />
        ) : null}
        {video && audio ? (
          <DownloadButton
            busy={busyMux}
            failed={muxTask?.status === 'failed'}
            paused={muxTask?.status === 'paused'}
            label="下载二合一"
            onClick={() => startDownload('mux')}
          />
        ) : null}
      </div>
    </li>
  )
}

/** 当前页视频列表；B 站分离流合并为一张卡，可分别或合并下载 MP4 */
function VideoList({
  resources,
  downloadTasks,
  detecting,
  error,
  pendingUrl,
  parsingId,
  onRetry,
  onDownload,
  onParse,
  onGoRecord,
  onLive,
}: VideoListProps) {
  const [openId, setOpenId] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const items = buildListItems(resources)

  return (
    <section className="popup-section" aria-label="当前页面视频">
      <div className="section-title">
        <span>当前页面视频</span>
        <span className="section-count">{items.length} 个</span>
      </div>

      {detecting && (
        <div className="empty-state">
          <p>正在检测…</p>
        </div>
      )}

      {!detecting && error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-text" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!detecting && !error && resources.length === 0 && (
        <div className="empty-state">
          <p>当前页未检测到视频，可尝试刷新或使用录制。</p>
        </div>
      )}

      {!detecting && !error && resources.length > 0 && (
        <ul className="video-list">
          {items.map((item) => {
            if (item.type === 'dash') {
              return (
                <DashCard
                  key={item.id}
                  item={item}
                  downloadTasks={downloadTasks}
                  pendingUrl={pendingUrl}
                  onDownload={onDownload}
                />
              )
            }

            const resource = item.resource
            const task = latestTaskForUrl(resource.url, downloadTasks)
            const busy = isTaskBusy(task, pendingUrl, resource.url)
            const failed = task?.status === 'failed'
            const paused = task?.status === 'paused'
            const showProgress =
              task &&
              (task.status === 'downloading' ||
                task.status === 'merging' ||
                task.status === 'paused' ||
                task.status === 'waiting')
            const expanded = openId === resource.id || Boolean(resource.parsed)
            const variants = resource.variants ?? []
            const tracks = resource.tracks ?? []
            const chosenVariant: StreamVariant | undefined =
              variants.find((entry) => entry.id === selected[resource.id]) ?? variants[0]
            const downloadableTracks = tracks.filter((entry: StreamTrack) => entry.downloadable && entry.url)

            return (
              <li key={resource.id} className="video-card">
                <p className="video-title">{resource.title}</p>
                <p className="video-meta">
                  <span className="tag">{kindLabel(resource)}</span>
                  {resource.quality ? <span>{resource.quality}</span> : null}
                  <span>{formatSize(resource.sizeBytes)}</span>
                </p>
                {showProgress ? <p className="video-progress">{formatDownloadProgress(task)}</p> : null}
                {resource.unsupportedReason ? (
                  <p className="video-unsupported">{resource.unsupportedReason}</p>
                ) : null}
                {failed && task?.error ? <p className="video-unsupported">{task.error}</p> : null}

                {expanded && variants.length > 0 ? (
                  <ul className="variant-list">
                    {variants.map((entry) => (
                      <li key={entry.id}>
                        <label className="variant-row">
                          <input
                            type="radio"
                            name={`v-${resource.id}`}
                            checked={(chosenVariant?.id ?? '') === entry.id}
                            onChange={() => setSelected((prev) => ({ ...prev, [resource.id]: entry.id }))}
                          />
                          <span>{entry.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {expanded && tracks.length > 0 ? (
                  <ul className="variant-list">
                    {tracks.map((entry) => (
                      <li key={entry.id} className="variant-row">
                        <span>{entry.label}</span>
                        {entry.downloadable && entry.url ? (
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() =>
                              onDownload(resource, { mediaUrl: entry.url, quality: entry.label })
                            }
                          >
                            下载
                          </button>
                        ) : (
                          <span className="video-unsupported">不可直链</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="card-actions">
                  {resource.isLive ? (
                    <button type="button" className="btn-primary" onClick={() => onLive(resource)}>
                      录制
                    </button>
                  ) : resource.kind === 'hls' ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={parsingId === resource.id}
                        onClick={() => {
                          setOpenId(resource.id)
                          onParse(resource)
                        }}
                      >
                        {parsingId === resource.id ? '解析中' : '解析'}
                      </button>
                      <DownloadButton
                        busy={busy}
                        failed={failed}
                        paused={paused}
                        label="下载"
                        onClick={() =>
                          onDownload(resource, {
                            taskId: failed ? task?.id : undefined,
                            mediaUrl: chosenVariant?.url,
                            quality: chosenVariant?.label,
                          })
                        }
                      />
                    </>
                  ) : resource.kind === 'dash' ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={parsingId === resource.id}
                        onClick={() => {
                          setOpenId(resource.id)
                          onParse(resource)
                        }}
                      >
                        {parsingId === resource.id ? '解析中' : '解析'}
                      </button>
                      {downloadableTracks.length === 0 ? (
                        <button type="button" className="btn-secondary" onClick={onGoRecord}>
                          去录制
                        </button>
                      ) : null}
                    </>
                  ) : resource.canDirectDownload ? (
                    <DownloadButton
                      busy={busy}
                      failed={failed}
                      paused={paused}
                      label="下载"
                      onClick={() => onDownload(resource, { taskId: failed ? task?.id : undefined })}
                    />
                  ) : (
                    <button type="button" className="btn-secondary" onClick={onGoRecord}>
                      去录制
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default VideoList
