declare global {
  interface Window {
    __evaPageHookInstalled?: boolean
    __playinfo__?: unknown
  }
  interface XMLHttpRequest {
    __evaUrl?: string
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.href
  }
  return input.url
}

function isPlayurl(url: string): boolean {
  return /bilibili|bilivideo/i.test(url) && /playurl|pgc\/player|\/dash/i.test(url)
}

function emit(url: string, data: unknown) {
  window.postMessage({ source: 'eva-page-media', url, data }, '*')
}

function emitPlayinfo(): boolean {
  const playinfo = window.__playinfo__
  if (!playinfo || typeof playinfo !== 'object') {
    return false
  }
  emit(location.href, playinfo)
  return true
}

function watchPlayinfo() {
  if (emitPlayinfo()) {
    return
  }
  let tries = 0
  const timer = window.setInterval(() => {
    tries += 1
    if (emitPlayinfo() || tries >= 40) {
      window.clearInterval(timer)
    }
  }, 500)
}

/** 仅转发页面已发出的播放地址 JSON，不发起新请求 */
function install() {
  if (window.__evaPageHookInstalled) {
    return
  }
  window.__evaPageHookInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args)
    try {
      const url = requestUrl(args[0])
      if (isPlayurl(url)) {
        void response
          .clone()
          .json()
          .then((data) => emit(url, data))
      }
    } catch {
      // 忽略非 JSON
    }
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.__evaUrl = String(url)
    if (arguments.length <= 2) {
      return originalOpen.call(this, method, url)
    }
    return originalOpen.call(this, method, url, async !== false, username, password)
  }

  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', () => {
      const url = this.__evaUrl ?? ''
      if (!isPlayurl(url)) {
        return
      }
      try {
        emit(url, JSON.parse(this.responseText))
      } catch {
        // 忽略非 JSON
      }
    })
    return originalSend.call(this, body)
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) {
      return
    }
    if ((event.data as { source?: string } | undefined)?.source === 'eva-request-playinfo') {
      emitPlayinfo()
    }
  })

  watchPlayinfo()
}

install()

export {}
