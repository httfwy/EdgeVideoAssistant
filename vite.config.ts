import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

/** 扩展页不支持带 crossorigin 的 modulepreload，会触发 isolated world 报错 */
function extensionHtmlFix() {
  return {
    name: 'extension-html-fix',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        return html
          .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
          .replace(/ crossorigin/g, '')
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), extensionHtmlFix()],
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        tasks: 'src/pages/tasks/index.html',
        options: 'src/pages/options/index.html',
        offscreen: 'src/offscreen/index.html',
      },
    },
  },
})
