const FLAG = '__evaPageHookInstalled'

declare global {
  interface Window {
    __evaPageHookInstalled?: boolean
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
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    this.__evaUrl = String(url)
    return originalOpen.call(this, method, url, ...(rest as []))
  }

  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
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
    return originalSend.apply(this, args as [])
  }
}

install()

export {}

declare global {
  interface XMLHttpRequest {
    __evaUrl?: string
  }
}
