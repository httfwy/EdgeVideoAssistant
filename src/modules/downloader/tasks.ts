import { getDownloadTasks, setDownloadTasks } from '../../shared/storage'
import type { DownloadKind, DownloadTask } from '../../shared/types'

function now(): number {
  return Date.now()
}

export function createDownloadTask(input: {
  url: string
  name: string
  kind?: DownloadKind
}): DownloadTask {
  const timestamp = now()
  return {
    id: crypto.randomUUID(),
    name: input.name,
    url: input.url,
    kind: input.kind ?? 'direct',
    status: 'waiting',
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function upsertDownloadTask(task: DownloadTask): Promise<DownloadTask[]> {
  const tasks = await getDownloadTasks()
  const index = tasks.findIndex((item) => item.id === task.id)
  const next = { ...task, updatedAt: now() }
  if (index >= 0) {
    tasks[index] = next
  } else {
    tasks.unshift(next)
  }
  await setDownloadTasks(tasks)
  return tasks
}

export async function patchDownloadTask(
  taskId: string,
  patch: Partial<DownloadTask>,
): Promise<DownloadTask | undefined> {
  const tasks = await getDownloadTasks()
  const index = tasks.findIndex((item) => item.id === taskId)
  if (index < 0) {
    return undefined
  }
  const next: DownloadTask = { ...tasks[index], ...patch, updatedAt: now() }
  tasks[index] = next
  await setDownloadTasks(tasks)
  return next
}

export async function findTaskByDownloadId(downloadId: number): Promise<DownloadTask | undefined> {
  const tasks = await getDownloadTasks()
  return tasks.find((item) => item.chromeDownloadId === downloadId)
}

export async function findInProgressByUrl(url: string): Promise<DownloadTask | undefined> {
  const tasks = await getDownloadTasks()
  return tasks.find(
    (item) =>
      item.url === url && (item.status === 'waiting' || item.status === 'downloading'),
  )
}
