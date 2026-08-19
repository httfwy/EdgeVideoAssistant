interface FooterProps {
  badgeCount: number
  onOpenTasks: () => void
  onOpenSettings: () => void
}

/** 底栏：打开任务页与设置页 */
function Footer({ badgeCount, onOpenTasks, onOpenSettings }: FooterProps) {
  return (
    <footer className="popup-footer">
      <button type="button" className="btn-text footer-link" onClick={onOpenTasks}>
        任务
        {badgeCount > 0 ? <span className="badge">{badgeCount}</span> : null}
      </button>
      <button type="button" className="btn-text footer-link" onClick={onOpenSettings}>
        设置
      </button>
    </footer>
  )
}

export default Footer
