interface HeaderProps {
  detecting: boolean
  onRefresh: () => void
}

/** Popup 顶栏：名称 + 刷新 */
function Header({ detecting, onRefresh }: HeaderProps) {
  return (
    <header className="popup-header">
      <h1>Edge Video Assistant</h1>
      <button
        type="button"
        className="btn-text"
        onClick={onRefresh}
        disabled={detecting}
        aria-busy={detecting}
      >
        <span className={detecting ? 'refresh-icon is-spinning' : 'refresh-icon'} aria-hidden>
          ↻
        </span>
        {detecting ? '正在检测…' : '刷新'}
      </button>
    </header>
  )
}

export default Header
