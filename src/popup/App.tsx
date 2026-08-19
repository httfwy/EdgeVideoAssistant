import { useEffect, useState } from 'react'
import { MessageType, sendMessage } from '../shared/messages'
import type { Snapshot } from '../shared/types'

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    sendMessage(MessageType.GET_SNAPSHOT)
      .then((response) => {
        if (cancelled) {
          return
        }
        if (!response || !response.ok || !('snapshot' in response)) {
          const message =
            response && 'error' in response && response.error ? response.error : '读取快照失败'
          setError(message)
          setStatus('error')
          return
        }
        setSnapshot(response.snapshot)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : '读取快照失败')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="popup-root">
      <h1>Edge Video Assistant</h1>
      {status === 'loading' && <p className="popup-meta">正在读取快照…</p>}
      {status === 'error' && <p className="popup-error">{error}</p>}
      {status === 'ready' && snapshot && (
        <>
          <p className="popup-meta">下载任务：{snapshot.downloadTasks.length}</p>
          <p className="popup-meta">
            完成后通知：{snapshot.settings.notifyOnComplete ? '开' : '关'}
          </p>
        </>
      )}
    </main>
  )
}

export default App
