/// <reference types="vite/client" />
/// <reference types="chrome" />

declare module '*.json' {
  const value: Record<string, unknown>
  export default value
}

/** Region Capture：由元素生成的可结构化克隆裁切目标 */
interface CropTarget {}

interface CropTargetConstructor {
  fromElement(element: Element): Promise<CropTarget>
}

declare const CropTarget: CropTargetConstructor

interface BrowserCaptureMediaStreamTrack extends MediaStreamTrack {
  cropTo(cropTarget: CropTarget | null): Promise<void>
}
