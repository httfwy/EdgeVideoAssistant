const RULE_ID_START = 1001

const URL_FILTERS = [
  '||bilivideo.com/',
  '||bilivideo.cn/',
  '||akamaized.net/',
  '||hdslb.com/',
]

function referrerRules(): chrome.declarativeNetRequest.Rule[] {
  const types: chrome.declarativeNetRequest.ResourceType[] = [
    chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
    chrome.declarativeNetRequest.ResourceType.MEDIA,
    chrome.declarativeNetRequest.ResourceType.OTHER,
    chrome.declarativeNetRequest.ResourceType.OBJECT,
  ]
  return URL_FILTERS.map((urlFilter, index) => ({
    id: RULE_ID_START + index,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: [
        {
          header: 'Referer',
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: 'https://www.bilibili.com/',
        },
        {
          header: 'Origin',
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: 'https://www.bilibili.com',
        },
      ],
    },
    condition: {
      urlFilter,
      resourceTypes: types,
    },
  }))
}

/** Offscreen 的 fetch 无法可靠带上页面 Referer，用 DNR 给 B 站 CDN 补防盗链头 */
export async function ensureBiliReferrerRules(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return
  }
  const rules = referrerRules()
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map((rule) => rule.id),
      addRules: rules,
    })
  } catch {
    // 旧版浏览器不支持改请求头时忽略，后续仍会尝试 fetch
  }
}
