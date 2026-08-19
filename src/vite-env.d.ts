/// <reference types="vite/client" />
/// <reference types="chrome" />

declare module '*.json' {
  const value: Record<string, unknown>
  export default value
}
