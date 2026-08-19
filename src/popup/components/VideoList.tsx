import type { VideoResource } from '../../shared/types'

interface VideoListProps {
  resources: VideoResource[]
  detecting: boolean
  error: string
  onRetry: () => void
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

/** 当前页视频列表；检测未接通时展示空状态与加载态 */
function VideoList({ resources, detecting, error, onRetry }: VideoListProps) {
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
          {resources.map((resource) => (
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
                  <button type="button" className="btn-primary" disabled>
                    下载
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" disabled>
                    去录制
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default VideoList
