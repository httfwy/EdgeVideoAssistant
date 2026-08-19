import type { ActiveRecord, RecordTask } from '../../shared/types'

interface RecordSectionProps {
  active: ActiveRecord | null
  task?: RecordTask
  liveAvailable: boolean
  liveSegmentMinutes: number
  error: string
  onStart: (mode: 'tab' | 'screen' | 'live') => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** 录制区：标签页 / 屏幕 / 直播 */
function RecordSection({
  active,
  task,
  liveAvailable,
  liveSegmentMinutes,
  error,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordSectionProps) {
  const recording = active?.status === 'recording'
  const paused = active?.status === 'paused'
  const duration = task?.durationMs ?? active?.elapsedMs ?? 0

  return (
    <section className="popup-section" id="record-section" aria-label="录制">
      <div className="section-title">
        <span>录制</span>
        {active ? (
          <span className={recording ? 'record-dot is-live' : 'record-dot is-paused'} aria-hidden />
        ) : null}
      </div>

      {active ? (
        <>
          <p className="record-timer">{formatDuration(duration)}</p>
          <div className="record-actions">
            {paused ? (
              <button type="button" className="btn-primary" onClick={onResume}>
                继续
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={onPause}>
                暂停
              </button>
            )}
            <button type="button" className="btn-primary" onClick={onStop}>
              停止并保存
            </button>
          </div>
        </>
      ) : (
        <div className="record-actions">
          <button type="button" className="btn-primary" onClick={() => onStart('tab')}>
            标签页录制
          </button>
          <button type="button" className="btn-secondary" onClick={() => onStart('screen')}>
            屏幕录制
          </button>
        </div>
      )}

      <div className="live-row">
        <span>直播</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={Boolean(active) || !liveAvailable}
          onClick={() => onStart('live')}
        >
          开始
        </button>
        <span className="live-segment">分段：{liveSegmentMinutes} 分钟</span>
      </div>
      {error ? <p className="video-unsupported">{error}</p> : null}
    </section>
  )
}

export default RecordSection
