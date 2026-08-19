import { useState } from 'react'
import { formatDownloadProgress } from '../../modules/downloader/format'
import type { DownloadTask, StreamTrack, StreamVariant, VideoResource } from '../../shared/types'

interface VideoListProps {
  resources: VideoResource[]
  downloadTasks: DownloadTask[]
  detecting: boolean
  error: string
  pendingUrl?: string
  parsingId?: string
  onRetry: () => void
  onDownload: (resource: VideoResource, options?: { taskId?: string; mediaUrl?: string; quality?: string }) => void
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

function DownloadButton({
  busy,
  failed,
  paused,
  disabled,
  onClick,
}: {
  busy: boolean
  failed: boolean
  paused?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="btn-primary" disabled={busy || disabled} onClick={onClick}>
      {paused ? '已暂停' : busy ? '下载中' : failed ? '重试' : '下载'}
    </button>
  )
}

/** 当前页视频列表；支持 HLS 清晰度与 DASH 轨道展开 */
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

  return (
    <section className="popup-section" aria-label="当前页面视频">
      <div className="section-title">
        <span>当前页面视频</span>
        <span className="section-count">{resources.length} 个</span>
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
          {resources.map((resource) => {
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
              variants.find((item) => item.id === selected[resource.id]) ?? variants[0]
            const downloadableTracks = tracks.filter((item: StreamTrack) => item.downloadable && item.url)

            return (
              <li key={resource.id} className="video-card">
                <p className="video-title">{resource.title}</p>
                <p className="video-meta">
                  <span className="tag">{kindLabel(resource)}</span>
                  {resource.quality ? <span>{resource.quality}</span> : null}
                  <span>{formatSize(resource.sizeBytes)}</span>
                </p>
                {showProgress ? (
                  <p className="video-progress">{formatDownloadProgress(task)}</p>
                ) : null}
                {resource.unsupportedReason ? (
                  <p className="video-unsupported">{resource.unsupportedReason}</p>
                ) : null}
                {failed && task?.error ? <p className="video-unsupported">{task.error}</p> : null}

                {expanded && variants.length > 0 ? (
                  <ul className="variant-list">
                    {variants.map((item) => (
                      <li key={item.id}>
                        <label className="variant-row">
                          <input
                            type="radio"
                            name={`v-${resource.id}`}
                            checked={(chosenVariant?.id ?? '') === item.id}
                            onChange={() => setSelected((prev) => ({ ...prev, [resource.id]: item.id }))}
                          />
                          <span>{item.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {expanded && tracks.length > 0 ? (
                  <ul className="variant-list">
                    {tracks.map((item) => (
                      <li key={item.id} className="variant-row">
                        <span>{item.label}</span>
                        {item.downloadable && item.url ? (
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() =>
                              onDownload(resource, { mediaUrl: item.url, quality: item.label })
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
