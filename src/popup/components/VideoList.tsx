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

/** 当前页视频列表；直链可下载，失败可重试 */
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
            const busy =
              pendingUrl === resource.url ||
              task?.status === 'waiting' ||
              task?.status === 'downloading'
            const failed = task?.status === 'failed'

            return (
              <li key={resource.id} className="video-card">
                <p className="video-title">{resource.title}</p>
                <p className="video-meta">
                  <span className="tag">{kindLabel(resource)}</span>
                  {resource.quality ? <span>{resource.quality}</span> : null}
                  <span>{formatSize(resource.sizeBytes)}</span>
                </p>
                {resource.unsupportedReason ? (
                  <p className="video-unsupported">{resource.unsupportedReason}</p>
                ) : null}
                {failed && task?.error ? <p className="video-unsupported">{task.error}</p> : null}
                <div className="card-actions">
                  {resource.isLive ? (
                    <button type="button" className="btn-primary" disabled>
                      录制
                    </button>
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
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => onDownload(resource, failed ? task?.id : undefined)}
                    >
                      {busy ? '下载中' : failed ? '重试' : '下载'}
                    </button>
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
