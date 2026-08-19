import { getRecordTasks, setRecordTasks } from '../../shared/storage'
import type { RecordMode, RecordTask } from '../../shared/types'

function now(): number {
  return Date.now()
}

export function createRecordTask(input: {
  name: string
  mode: RecordMode
}): RecordTask {
  const timestamp = now()
  return {
    id: crypto.randomUUID(),
    name: input.name,
    mode: input.mode,
    status: 'recording',
    durationMs: 0,
    format: 'webm',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function upsertRecordTask(task: RecordTask): Promise<void> {
  const tasks = await getRecordTasks()
  const index = tasks.findIndex((item) => item.id === task.id)
  const next = { ...task, updatedAt: now() }
  if (index >= 0) {
    tasks[index] = next
  } else {
    tasks.unshift(next)
  }
  await setRecordTasks(tasks)
}

export async function patchRecordTask(
  taskId: string,
  patch: Partial<RecordTask>,
): Promise<RecordTask | undefined> {
  const tasks = await getRecordTasks()
  const index = tasks.findIndex((item) => item.id === taskId)
  if (index < 0) {
    return undefined
  }
  const next = { ...tasks[index], ...patch, updatedAt: now() }
  tasks[index] = next
  await setRecordTasks(tasks)
  return next
}

export async function getRecordTask(taskId: string): Promise<RecordTask | undefined> {
  const tasks = await getRecordTasks()
  return tasks.find((item) => item.id === taskId)
}
