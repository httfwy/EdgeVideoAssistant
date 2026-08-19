import type { DownloadTask } from '../../shared/types'

/** 直链百分比或 HLS 分片进度 */
export function formatDownloadProgress(task: DownloadTask): string {
  if (task.kind === 'hls') {
    if (task.status === 'merging') {
      return '合并中'
    }
    if (task.segmentTotal) {
      return `分片 ${task.segmentCurrent ?? 0}/${task.segmentTotal}`
    }
    return '准备中'
  }
  if (task.progress > 0) {
    return `${task.progress}%`
  }
  return task.status === 'downloading' ? '下载中' : '—'
}

export function downloadStatusLabel(status: DownloadTask['status']): string {
  const map = {
    waiting: '等待',
    downloading: '下载中',
    merging: '合并中',
    paused: '暂停',
    completed: '完成',
    failed: '失败',
  }
  return map[status]
}
