/** 录制区占位：标签页 / 屏幕录制；直播行禁用 */
function RecordSection() {
  return (
    <section className="popup-section" aria-label="录制">
      <div className="section-title">
        <span>录制</span>
      </div>
      <div className="record-actions">
        <button type="button" className="btn-primary">
          标签页录制
        </button>
        <button type="button" className="btn-secondary">
          屏幕录制
        </button>
      </div>
      <div className="live-row">
        <span>直播</span>
        <button type="button" className="btn-secondary" disabled>
          开始
        </button>
        <span className="live-segment">分段：开</span>
      </div>
    </section>
  )
}

export default RecordSection
