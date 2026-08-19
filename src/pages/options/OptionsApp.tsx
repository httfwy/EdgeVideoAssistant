import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '../../shared/constants'
import { MessageType, sendMessage, type MessageResponse } from '../../shared/messages'
import type { Settings } from '../../shared/types'

const LIVE_SEGMENTS = [15, 30, 60] as const

function settingsFrom(response: MessageResponse): Settings | null {
  if (response?.ok && 'settings' in response) {
    return response.settings
  }
  return null
}

/** 设置页：分组即时保存 */
function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const version = chrome.runtime.getManifest().version

  const load = useCallback(async () => {
    try {
      const response = await sendMessage(MessageType.GET_SETTINGS)
      const next = settingsFrom(response)
      if (next) {
        setSettings(next)
        setError('')
      } else if (response && 'error' in response && response.error) {
        setError(response.error)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '读取设置失败')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(partial: Partial<Settings>) {
    const previous = settings
    setSettings({ ...previous, ...partial })
    setError('')
    try {
      const response = await sendMessage(MessageType.PATCH_SETTINGS, partial)
      const next = settingsFrom(response)
      if (next) {
        setSettings(next)
        return
      }
      setSettings(previous)
      setError(response && 'error' in response && response.error ? response.error : '保存失败')
    } catch (err: unknown) {
      setSettings(previous)
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <main className="page-root options-root">
      <header className="page-header">
        <h1>设置</h1>
      </header>

      {error ? (
        <div className="page-error" role="alert">
          {error}
        </div>
      ) : null}

      <fieldset className="option-group" disabled={!loaded}>
        <legend>下载</legend>
        <div className="option-row">
          <span>默认保存目录</span>
          <span className="option-hint">跟随浏览器下载设置</span>
        </div>
        <label className="option-row">
          <span>完成后通知</span>
          <input
            type="checkbox"
            checked={settings.notifyOnComplete}
            onChange={(event) => void patch({ notifyOnComplete: event.target.checked })}
          />
        </label>
        <label className="option-row">
          <span>自动打开所在文件夹</span>
          <input
            type="checkbox"
            checked={settings.autoOpenFolder}
            onChange={(event) => void patch({ autoOpenFolder: event.target.checked })}
          />
        </label>
      </fieldset>

      <fieldset className="option-group" disabled={!loaded}>
        <legend>录制</legend>
        <label className="option-row">
          <span>默认方式</span>
          <select
            value={settings.recordMode}
            onChange={(event) =>
              void patch({ recordMode: event.target.value as Settings['recordMode'] })
            }
          >
            <option value="tab">标签页</option>
            <option value="screen">屏幕</option>
          </select>
        </label>
        <label className="option-row">
          <span>输出格式</span>
          <select
            value={settings.recordFormat}
            onChange={(event) =>
              void patch({ recordFormat: event.target.value as Settings['recordFormat'] })
            }
          >
            <option value="webm">WebM</option>
            <option value="mp4">MP4</option>
          </select>
        </label>
        <label className="option-row">
          <span>直播自动分段</span>
          <select
            value={settings.liveSegmentMinutes}
            onChange={(event) => void patch({ liveSegmentMinutes: Number(event.target.value) })}
          >
            {LIVE_SEGMENTS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} 分钟
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="option-group" disabled={!loaded}>
        <legend>播放</legend>
        <label className="option-row">
          <span>记住上次倍率</span>
          <input
            type="checkbox"
            checked={settings.rememberPlaybackRate}
            onChange={(event) => void patch({ rememberPlaybackRate: event.target.checked })}
          />
        </label>
        <label className="option-row">
          <span>显示页面控件</span>
          <input
            type="checkbox"
            checked={settings.showPageSpeedControl}
            onChange={(event) => void patch({ showPageSpeedControl: event.target.checked })}
          />
        </label>
      </fieldset>

      <section className="option-group">
        <h2 className="option-title">关于</h2>
        <p className="option-about">版本 {version}</p>
        <p className="option-about">
          本扩展使用存储、标签页、网络检测、下载、通知与 Offscreen
          权限，用于识别当前页视频、保存文件和显示完成提示。不申请调试器权限。
        </p>
        <p className="option-about">视频处理均在本地完成，不会上传内容。</p>
      </section>

      <footer className="page-footer">视频处理均在本地完成，不会上传内容。</footer>
    </main>
  )
}

export default OptionsApp
