import { useCallback, useEffect, useMemo, useState } from 'react'
import { downloadStatusLabel, formatDownloadProgress } from '../../modules/downloader/format'
import { DETECTED_KEY_PREFIX, STORAGE_KEYS } from '../../shared/constants'
import {
  MessageType,
  sendMessage,
  type DownloadControlAction,
  type DownloadControlPayload,
  type MessageResponse,
} from '../../shared/messages'
import type { DownloadTask, HistoryEntry, RecordTask, Snapshot } from '../../shared/types'

type TabKey = 'download' | 'record' | 'history'

function applyIfSnapshot(
  response: MessageResponse,
  setter: (snapshot: Snapshot) => void,
): string {
  if (response?.ok && 'snapshot' in response) {
    setter(response.snapshot)
    return ''
  }
  if (response && 'error' in response && response.error) {
    return response.error
  }
  return '操作失败'
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function isHttpUrl(url?: string): boolean {
  if (!url) {
    return false
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function statusClass(status: DownloadTask['status']): string {
  if (status === 'downloading' || status === 'waiting' || status === 'merging') {
    return 'is-running'
  }
  if (status === 'paused') {
    return 'is-paused'
  }
  if (status === 'completed') {
    return 'is-done'
  }
  return 'is-failed'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

/** 任务管理：下载队列、录制占位与历史 */
function TasksApp() {
  const [tab, setTab] = useState<TabKey>('download')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const response = await sendMessage(MessageType.GET_SNAPSHOT)
    const message = applyIfSnapshot(response, setSnapshot)
    if (message) {
      setError(message)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
        changes[STORAGE_KEYS.recordTasks] ||
        changes[STORAGE_KEYS.history] ||
        changes[STORAGE_KEYS.activeRecord] ||
        Object.keys(changes).some((key) => key.startsWith(DETECTED_KEY_PREFIX))
      ) {
        void refresh()
      }
    }

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [refresh])

  async function control(payload: DownloadControlPayload) {
    setError('')
    try {
      const response = await sendMessage(MessageType.DOWNLOAD_CONTROL, payload)
      const message = applyIfSnapshot(response, setSnapshot)
      if (message) {
        setError(message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  function run(action: DownloadControlAction, extra?: Partial<DownloadControlPayload>) {
    void control({ action, ...extra })
  }

  async function recordAction(action: 'pause' | 'resume' | 'stop', taskId: string) {
    setError('')
    try {
      const response = await sendMessage(MessageType.RECORD_CONTROL, { action, taskId })
      const message = applyIfSnapshot(response, setSnapshot)
      if (message) {
        setError(message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  const downloadTasks = snapshot?.downloadTasks ?? []
  const recordTasks = snapshot?.recordTasks ?? []
  const history = useMemo(() => {
    const entries = snapshot?.history ?? []
    return [...entries].sort((a, b) => b.createdAt - a.createdAt)
  }, [snapshot])

  return (
    <main className="page-root">
      <header className="page-header">
        <h1>任务管理</h1>
      </header>

      <div className="page-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'download' ? 'page-tab is-active' : 'page-tab'}
          aria-selected={tab === 'download'}
          onClick={() => setTab('download')}
        >
          下载
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'record' ? 'page-tab is-active' : 'page-tab'}
          aria-selected={tab === 'record'}
          onClick={() => setTab('record')}
        >
          录制
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'history' ? 'page-tab is-active' : 'page-tab'}
          aria-selected={tab === 'history'}
          onClick={() => setTab('history')}
        >
          历史
        </button>
      </div>

      {error ? (
        <div className="page-error" role="alert">
          {error}
        </div>
      ) : null}

      {tab === 'download' ? (
        <DownloadTab tasks={downloadTasks} onAction={run} />
      ) : null}
      {tab === 'record' ? <RecordTab tasks={recordTasks} onAction={(action, taskId) => void recordAction(action, taskId)} /> : null}
      {tab === 'history' ? <HistoryTab entries={history} onAction={run} /> : null}
    </main>
  )
}

function DownloadTab({
  tasks,
  onAction,
}: {
  tasks: DownloadTask[]
  onAction: (action: DownloadControlAction, extra?: Partial<DownloadControlPayload>) => void
}) {
  return (
    <section>
      <div className="page-toolbar">
        <button type="button" className="btn-secondary" onClick={() => onAction('pauseAll')}>
          全部暂停
        </button>
        <button type="button" className="btn-secondary" onClick={() => onAction('resumeAll')}>
          全部开始
        </button>
        <button type="button" className="btn-secondary" onClick={() => onAction('clearCompleted')}>
          清空已完成
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="page-empty">
          <p>暂无下载任务。</p>
        </div>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-card">
              <div className="task-main">
                <p className="task-name">{task.name}</p>
                <p className="task-meta">
                  {hostOf(task.url)} / {task.kind}
                </p>
                <p className="task-meta">
                  进度 {formatDownloadProgress(task)}
                  {task.status === 'failed' && task.error ? ` · ${task.error}` : ''}
                </p>
              </div>
              <div className="task-side">
                <span className={`task-status ${statusClass(task.status)}`}>
                  {downloadStatusLabel(task.status)}
                </span>
                <div className="task-actions">
                  {task.status === 'completed' ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onAction('show', { taskId: task.id })}
                    >
                      打开文件夹
                    </button>
                  ) : task.status === 'paused' || task.status === 'failed' ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onAction('resume', { taskId: task.id })}
                    >
                      继续
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onAction('pause', { taskId: task.id })}
                    >
                      暂停
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => onAction('delete', { taskId: task.id })}
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function recordStatusClass(status: RecordTask['status']): string {
  if (status === 'recording') {
    return 'is-running'
  }
  if (status === 'paused') {
    return 'is-paused'
  }
  if (status === 'completed') {
    return 'is-done'
  }
  return 'is-failed'
}

function RecordTab({
  tasks,
  onAction,
}: {
  tasks: RecordTask[]
  onAction: (action: 'pause' | 'resume' | 'stop', taskId: string) => void
}) {
  if (tasks.length === 0) {
    return (
      <div className="page-empty">
        <p>暂无录制任务。</p>
      </div>
    )
  }

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <li key={task.id} className="task-card">
          <div className="task-main">
            <p className="task-name">{task.name}</p>
            <p className="task-meta">
              {task.mode === 'live' ? '直播' : task.mode === 'screen' ? '屏幕' : '标签页'} · {task.format.toUpperCase()}
              {task.segmentIndex ? ` · part-${String(task.segmentIndex).padStart(2, '0')}` : ''}
            </p>
            <p className="task-meta">
              时长 {formatDuration(task.durationMs)}
              {task.estimatedSizeBytes
                ? ` · 约 ${(task.estimatedSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                : ''}
              {task.error ? ` · ${task.error}` : ''}
            </p>
          </div>
          <div className="task-side">
            <span className={`task-status ${recordStatusClass(task.status)}`}>
              {task.status === 'recording'
                ? '录制中'
                : task.status === 'paused'
                  ? '暂停'
                  : task.status === 'completed'
                    ? '完成'
                    : task.status === 'idle'
                      ? '空闲'
                      : '失败'}
            </span>
            <div className="task-actions">
              {task.status === 'recording' ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => onAction('pause', task.id)}>
                    暂停
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => onAction('stop', task.id)}>
                    停止并保存
                  </button>
                </>
              ) : null}
              {task.status === 'paused' ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => onAction('resume', task.id)}>
                    继续
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => onAction('stop', task.id)}>
                    停止并保存
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function HistoryTab({
  entries,
  onAction,
}: {
  entries: HistoryEntry[]
  onAction: (action: DownloadControlAction, extra?: Partial<DownloadControlPayload>) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="page-empty">
        <p>暂无历史记录。</p>
      </div>
    )
  }

  return (
    <ul className="task-list">
      {entries.map((entry) => (
        <li key={entry.id} className="task-card">
          <div className="task-main">
            <p className="task-name">{entry.name}</p>
            <p className="task-meta">
              {formatTime(entry.createdAt)}
              {entry.source ? ` · ${entry.source}` : ''}
              {entry.kind === 'record' ? ' · 录制' : ' · 下载'}
            </p>
          </div>
          <div className="task-actions">
            {entry.kind === 'download' && isHttpUrl(entry.url) ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAction('redownload', { historyId: entry.id })}
              >
                重新下载
              </button>
            ) : null}
            <button
              type="button"
              className="btn-text"
              onClick={() => onAction('deleteHistory', { historyId: entry.id })}
            >
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default TasksApp
