import { useCallback, useEffect, useMemo, useState } from 'react'
import Footer from './components/Footer'
import Header from './components/Header'
import RecordSection from './components/RecordSection'
import SpeedChips from './components/SpeedChips'
import VideoList from './components/VideoList'
import { MessageType, sendMessage } from '../shared/messages'
import type { Snapshot } from '../shared/types'

const TASKS_PAGE = 'src/pages/tasks/index.html'
const OPTIONS_PAGE = 'src/pages/options/index.html'

function countInProgress(snapshot: Snapshot): number {
  const downloads = snapshot.downloadTasks.filter(
    (task) =>
      task.status === 'waiting' || task.status === 'downloading' || task.status === 'merging',
  ).length
  const records = snapshot.recordTasks.filter(
    (task) => task.status === 'recording' || task.status === 'paused',
  ).length
  return downloads + records
}

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const runDetect = useCallback(async () => {
    setDetecting(true)
    setError('')
    try {
      const response = await sendMessage(MessageType.DETECT_REFRESH)
      if (!response || !response.ok) {
        const message =
          response && 'error' in response && response.error
            ? response.error
            : '当前页无法检测，请在普通网页重试'
        setError(message)
        setStatus('error')
        return
      }
      if ('snapshot' in response) {
        setSnapshot(response.snapshot)
      }
      setStatus('ready')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '当前页无法检测，请在普通网页重试')
      setStatus('error')
    } finally {
      setDetecting(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    sendMessage(MessageType.GET_SNAPSHOT)
      .then((response) => {
        if (cancelled) {
          return
        }
        if (response?.ok && 'snapshot' in response) {
          setSnapshot(response.snapshot)
        }
      })
      .finally(() => {
        if (!cancelled) {
          void runDetect()
        }
      })

    return () => {
      cancelled = true
    }
  }, [runDetect])

  function handleRefresh() {
    if (detecting) {
      return
    }
    void runDetect()
  }

  function openExtensionPage(path: string) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(path) })
  }

  const badgeCount = useMemo(() => (snapshot ? countInProgress(snapshot) : 0), [snapshot])
  const resources = snapshot?.detected ?? []
  const listError = status === 'error' ? error : ''
  const isDetecting = detecting || status === 'loading'

  return (
    <main className="popup-root">
      <Header detecting={isDetecting} onRefresh={handleRefresh} />
      <div className="popup-body">
        <VideoList
          resources={resources}
          detecting={isDetecting}
          error={listError}
          onRetry={handleRefresh}
        />
        <RecordSection />
        <SpeedChips value={playbackRate} onChange={setPlaybackRate} />
      </div>
      <Footer
        badgeCount={badgeCount}
        onOpenTasks={() => openExtensionPage(TASKS_PAGE)}
        onOpenSettings={() => openExtensionPage(OPTIONS_PAGE)}
      />
    </main>
  )
}

export default App
