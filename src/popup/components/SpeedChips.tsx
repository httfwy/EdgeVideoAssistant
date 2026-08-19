import { PLAYBACK_RATES } from '../../shared/constants'

interface SpeedChipsProps {
  value: number
  onChange: (rate: number) => void
}

function formatRate(rate: number): string {
  return `${rate}x`
}

/** 倍速芯片，仅本地选中态 */
function SpeedChips({ value, onChange }: SpeedChipsProps) {
  return (
    <section className="popup-section" aria-label="播放速度">
      <div className="section-title">
        <span>播放速度</span>
      </div>
      <div className="speed-chips" role="list">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            role="listitem"
            className={rate === value ? 'chip chip-active' : 'chip'}
            aria-pressed={rate === value}
            onClick={() => onChange(rate)}
          >
            {formatRate(rate)}
          </button>
        ))}
      </div>
    </section>
  )
}

export default SpeedChips
