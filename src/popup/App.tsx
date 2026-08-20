import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Footer from './components/Footer'
import Header from './components/Header'
import RecordSection from './components/RecordSection'
import SpeedChips from './components/SpeedChips'
import VideoList, { type DownloadOptions } from './components/VideoList'
import { DETECTED_KEY_PREFIX, STORAGE_KEYS } from '../shared/constants'
import { MessageType, sendMessage, type MessageResponse } from '../shared/messages'
import type { Snapshot, VideoResource } from '../shared/types'

const TASKS_PAGE = 'src/pages/tasks/index.html'
const OPTIONS_PAGE = 'src/pages/options/index.html'

function countInProgress(snapshot: Snapshot): number {
  const downloads = snapshot.downloadTasks.filter(
    (task) =>
      task.status === 'waiting' ||
      task.status === 'downloading' ||
      task.status === 'merging' ||
      task.status === 'paused',
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
  const [parsingId, setParsingId] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [toast, setToast] = useState('')
  const [recordError, setRecordError] = useState('')
  const toastTimer = useRef(0)

  const applySnapshot = useCallback((response: MessageResponse) => {
    if (response?.ok && 'snapshot' in response) {
      setSnapshot(response.snapshot)
    }
  }, [])

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 2000)
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
        if (response.ok && 'snapshot' in response) {
          const settings = response.snapshot.settings
          setPlaybackRate(
            settings.rememberPlaybackRate && settings.lastPlaybackRate
              ? settings.lastPlaybackRate
              : 1,
          )
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
  }, [applySnapshot, runDetect])

  useEffect(() => {
    function onStorageChanged(
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) {
      if (area !== 'local') {
        return
      }
      if (
        changes[STORAGE_KEYS.downloadTasks] ||
        changes[STORAGE_KEYS.settings] ||
        changes[STORAGE_KEYS.recordTasks] ||
        changes[STORAGE_KEYS.activeRecord] ||
        changes[STORAGE_KEYS.history] ||
        Object.keys(changes).some((key) => key.startsWith(DETECTED_KEY_PREFIX))
      ) {
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

  async function handleDownload(resource: VideoResource, options?: DownloadOptions) {
    if (pendingUrl) {
      return
    }
    const mediaUrl = options?.mediaUrl || resource.url
    const pendingKey = options?.outputMode === 'mux' ? `${mediaUrl}#eva-mux` : mediaUrl
    setPendingUrl(pendingKey)
    try {
      const response = await sendMessage(MessageType.DOWNLOAD_START, {
        url: resource.url,
        name: options?.name ?? resource.title,
        resourceId: resource.id,
        taskId: options?.taskId,
        kind: resource.kind,
        canDirectDownload: resource.canDirectDownload,
        mediaUrl: options?.mediaUrl,
        quality: options?.quality,
        referrer: resource.pageUrl,
        backupUrls: options?.backupUrls ?? resource.backupUrls,
        outputMode: options?.outputMode,
        audioUrl: options?.audioUrl,
        audioBackupUrls: options?.audioBackupUrls,
      })
      if (!response?.ok) {
        showToast(response && 'error' in response && response.error ? response.error : '下载失败')
        return
      }
      applySnapshot(response)
    } finally {
      setPendingUrl('')
    }
  }

  async function handleParse(resource: VideoResource) {
    setParsingId(resource.id)
    try {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      const response = await sendMessage(MessageType.PARSE_STREAM, {
        url: resource.url,
        kind: resource.kind,
        resourceId: resource.id,
        tabId: tab?.id,
      })
      if (!response?.ok) {
        showToast(response && 'error' in response && response.error ? response.error : '解析失败')
        return
      }
      applySnapshot(response)
    } finally {
      setParsingId('')
    }
  }

  function handleGoRecord() {
    document.getElementById('record-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleRecord(
    action: 'start' | 'pause' | 'resume' | 'stop',
    mode?: 'tab' | 'screen' | 'live',
    liveResource?: VideoResource,
  ) {
    setRecordError('')
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    const live =
      liveResource ?? (snapshot?.detected ?? []).find((item) => item.isLive && item.kind === 'hls')
    const resolvedMode = action === 'start' && mode === 'live' && !live ? 'tab' : mode
    try {
      const response = await sendMessage(MessageType.RECORD_CONTROL, {
        action,
        mode: resolvedMode,
        tabId: tab?.id,
        taskId: snapshot?.activeRecord?.taskId,
        url: resolvedMode === 'live' ? live?.url : undefined,
        name: resolvedMode === 'live' ? live?.title : undefined,
      })
      if (!response?.ok) {
        setRecordError(response && 'error' in response && response.error ? response.error : '录制失败')
        await refreshSnapshot()
        return
      }
      if ('snapshot' in response) {
        applySnapshot(response)
      } else {
        await refreshSnapshot()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '请允许标签页捕获后重试'
      if (!/message port closed|receiving end does not exist/i.test(message)) {
        setRecordError(message)
      }
      await refreshSnapshot()
    }
  }

  async function handleRecordVideoOnly(value: boolean) {
    if (snapshot) {
      setSnapshot({ ...snapshot, settings: { ...snapshot.settings, recordVideoOnly: value } })
    }
    try {
      const response = await sendMessage(MessageType.PATCH_SETTINGS, { recordVideoOnly: value })
      if (response?.ok && 'settings' in response) {
        const settings = response.settings
        setSnapshot((current) => (current ? { ...current, settings } : current))
      }
    } catch {
      void refreshSnapshot()
    }
  }

  async function handleSpeed(rate: number) {
    setPlaybackRate(rate)
    try {
      const response = await sendMessage(MessageType.SET_PLAYBACK_RATE, { rate })
      if (!response?.ok) {
        showToast(
          response && 'error' in response && response.error
            ? response.error
            : '当前页没有可调速的视频',
        )
      }
    } catch {
      showToast('当前页没有可调速的视频')
    }
  }

  function openExtensionPage(path: string) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(path) })
  }

  const badgeCount = useMemo(() => (snapshot ? countInProgress(snapshot) : 0), [snapshot])
  const resources = snapshot?.detected ?? []
  const downloadTasks = snapshot?.downloadTasks ?? []
  const activeRecord = snapshot?.activeRecord ?? null
  const recordTask = snapshot?.recordTasks.find((item) => item.id === activeRecord?.taskId)
  const liveAvailable = resources.some((item) => item.isLive && item.kind === 'hls')
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
          parsingId={parsingId}
          onRetry={handleRefresh}
          onDownload={handleDownload}
          onParse={handleParse}
          onGoRecord={handleGoRecord}
          onLive={(resource) => void handleRecord('start', 'live', resource)}
        />
        <RecordSection
          active={activeRecord}
          task={recordTask}
          liveAvailable={liveAvailable}
          liveSegmentMinutes={snapshot?.settings.liveSegmentMinutes ?? 30}
          recordVideoOnly={snapshot?.settings.recordVideoOnly ?? true}
          error={recordError}
          onStart={(mode) => void handleRecord('start', mode)}
          onPause={() => void handleRecord('pause')}
          onResume={() => void handleRecord('resume')}
          onStop={() => void handleRecord('stop')}
          onToggleVideoOnly={(value) => void handleRecordVideoOnly(value)}
        />
        <SpeedChips value={playbackRate} onChange={(rate) => void handleSpeed(rate)} />
      </div>
      {toast ? <div className="popup-toast">{toast}</div> : null}
      <Footer
        badgeCount={badgeCount}
        onOpenTasks={() => openExtensionPage(TASKS_PAGE)}
        onOpenSettings={() => openExtensionPage(OPTIONS_PAGE)}
      />
    </main>
  )
}

export default App
