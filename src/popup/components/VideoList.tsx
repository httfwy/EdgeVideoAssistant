import { formatDownloadProgress } from '../../modules/downloader/format'
import type { DownloadTask, VideoResource } from '../../shared/types'

interface VideoListProps {
  resources: VideoResource[]
  downloadTasks: DownloadTask[]
  detecting: boolean
  error: string
  pendingUrl?: string
  onRetry: () => void
  onDownload: (resource: VideoResource, taskId?: string) => void
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
  onClick,
}: {
  busy: boolean
  failed: boolean
  paused?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="btn-primary" disabled={busy} onClick={onClick}>
      {paused ? '已暂停' : busy ? '下载中' : failed ? '重试' : '下载'}
    </button>
  )
}

/** 当前页视频列表；直链与 HLS 可下载，失败可重试 */
function VideoList({
  resources,
  downloadTasks,
  detecting,
  error,
  pendingUrl,
  onRetry,
  onDownload,
}: VideoListProps) {
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
                <div className="card-actions">
                  {resource.isLive ? (
                    <button type="button" className="btn-primary" disabled>
                      录制
                    </button>
                  ) : resource.kind === 'hls' ? (
                    <>
                      <button type="button" className="btn-secondary" disabled>
                        解析
                      </button>
                      <DownloadButton
                        busy={busy}
                        failed={failed}
                        paused={paused}
                        onClick={() => onDownload(resource, failed ? task?.id : undefined)}
                      />
                    </>
                  ) : resource.needsParse ? (
                    <>
                      <button type="button" className="btn-secondary" disabled>
                        解析
                      </button>
                      <button type="button" className="btn-primary" disabled>
                        下载
                      </button>
                    </>
                  ) : resource.canDirectDownload ? (
                    <DownloadButton
                      busy={busy}
                      failed={failed}
                      paused={paused}
                      onClick={() => onDownload(resource, failed ? task?.id : undefined)}
                    />
                  ) : (
                    <button type="button" className="btn-secondary" disabled>
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
