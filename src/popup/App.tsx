import { useCallback, useEffect, useMemo, useState } from 'react'
import Footer from './components/Footer'
import Header from './components/Header'
import RecordSection from './components/RecordSection'
import SpeedChips from './components/SpeedChips'
import VideoList from './components/VideoList'
import { STORAGE_KEYS } from '../shared/constants'
import { MessageType, sendMessage, type MessageResponse } from '../shared/messages'
import type { Snapshot, VideoResource } from '../shared/types'

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
  const [pendingUrl, setPendingUrl] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)

  const applySnapshot = useCallback((response: MessageResponse) => {
    if (response?.ok && 'snapshot' in response) {
      setSnapshot(response.snapshot)
    }
  }, [])

  const refreshSnapshot = useCallback(async () => {
    const response = await sendMessage(MessageType.GET_SNAPSHOT)
    applySnapshot(response)
  }, [applySnapshot])

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
      applySnapshot(response)
      setStatus('ready')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '当前页无法检测，请在普通网页重试')
      setStatus('error')
    } finally {
      setDetecting(false)
    }
  }, [applySnapshot])

  useEffect(() => {
    let cancelled = false

    sendMessage(MessageType.GET_SNAPSHOT)
      .then((response) => {
        if (cancelled) {
          return
        }
        applySnapshot(response)
      })
      .finally(() => {
        if (!cancelled) {
          void runDetect()
        }
      })

    return () => {
      cancelled = true
    }
  }, [applySnapshot, runDetect])

  useEffect(() => {
    function onStorageChanged(
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) {
      if (area !== 'local') {
        return
      }
      if (changes[STORAGE_KEYS.downloadTasks] || changes[STORAGE_KEYS.settings]) {
        void refreshSnapshot()
      }
    }

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [refreshSnapshot])

  function handleRefresh() {
    if (detecting) {
      return
    }
    void runDetect()
  }

  async function handleDownload(resource: VideoResource, taskId?: string) {
    if (pendingUrl) {
      return
    }
    setPendingUrl(resource.url)
    try {
      const response = await sendMessage(MessageType.DOWNLOAD_START, {
        url: resource.url,
        name: resource.title,
        resourceId: resource.id,
        taskId,
        kind: resource.kind,
        canDirectDownload: resource.canDirectDownload,
      })
      if (!response?.ok) {
        return
      }
      applySnapshot(response)
    } finally {
      setPendingUrl('')
    }
  }

  function openExtensionPage(path: string) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(path) })
  }

  const badgeCount = useMemo(() => (snapshot ? countInProgress(snapshot) : 0), [snapshot])
  const resources = snapshot?.detected ?? []
  const downloadTasks = snapshot?.downloadTasks ?? []
  const listError = status === 'error' ? error : ''
  const isDetecting = detecting || status === 'loading'

  return (
    <main className="popup-root">
      <Header detecting={isDetecting} onRefresh={handleRefresh} />
      <div className="popup-body">
        <VideoList
          resources={resources}
          downloadTasks={downloadTasks}
          detecting={isDetecting}
          error={listError}
          pendingUrl={pendingUrl}
          onRetry={handleRefresh}
          onDownload={handleDownload}
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
