import { CROP_CHANNEL } from '../shared/messages'

interface CropChannelMessage {
  type: 'request' | 'crop-target'
  taskId: string
  target?: CropTarget
}

const channel = new BroadcastChannel(CROP_CHANNEL)
let pending: CropChannelMessage | null = null

function publish(message: CropChannelMessage) {
  pending = message
  channel.postMessage(message)
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { source?: string; type?: string; taskId?: string; target?: CropTarget }
  if (data?.source !== 'eva-crop' || data.type !== 'crop-target' || !data.taskId || !data.target) {
    return
  }
  publish({ type: 'crop-target', taskId: data.taskId, target: data.target })
})

channel.addEventListener('message', (event: MessageEvent<CropChannelMessage>) => {
  if (event.data?.type !== 'request' || !pending || pending.taskId !== event.data.taskId) {
    return
  }
  channel.postMessage(pending)
})
