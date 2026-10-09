import { normalizeShortcut, resolvedShortcut, shortcutProblem, type ShortcutPlatform } from './shortcuts'
import type { ClipboardApi } from './clipboard/types'
import type { LocaleId } from './i18n/locales'
import type { CaptureMode, OcrProgress, OcrRequest, OcrResult } from './ocr/types'
import type { MockStatus } from './mock-api/types'

export const QUICK_WIDGETS = ['clipboard', 'color', 'random', 'timestamp', 'transform', 'json', 'base64', 'qr', 'ocr', 'mock'] as const
export type QuickWidget = typeof QUICK_WIDGETS[number]
export const GLOBAL_ACTIONS = [
  { id: 'clipboard', label: 'Clipboard Manager', defaultBinding: 'Mod+Shift+Space' },
  { id: 'color', label: 'Pick screen color', defaultBinding: null },
  { id: 'ocr', label: 'Capture text from a screen region', defaultBinding: null },
  { id: 'transform', label: 'Quick text transforms', defaultBinding: null }
] as const
export type GlobalAction = typeof GLOBAL_ACTIONS[number]['id']
export type GlobalBindings = Record<GlobalAction, string | null>
export const DEFAULT_GLOBAL_BINDINGS: GlobalBindings = Object.fromEntries(GLOBAL_ACTIONS.map(action => [action.id, action.defaultBinding])) as GlobalBindings
export interface GlobalShortcutState { bindings: GlobalBindings; registered: GlobalAction[]; failed: GlobalAction[]; platform: ShortcutPlatform }
export function validateGlobalBindings(value: unknown, platform: ShortcutPlatform): GlobalBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid global shortcuts.')
  const result = {} as GlobalBindings, used = new Set<string>()
  for (const action of GLOBAL_ACTIONS) {
    const raw = (value as GlobalBindings)[action.id]
    if (raw === null) { result[action.id] = null; continue }
    const binding = normalizeShortcut(raw)
    if (!binding || shortcutProblem(binding, null, platform) || !binding.split('+').slice(0, -1).some(part => ['Mod', 'Ctrl', 'Meta', 'Alt'].includes(part))) throw new Error('Choose a non-reserved shortcut with Ctrl, Command or Alt.')
    const resolved = resolvedShortcut(binding, platform)
    if (used.has(resolved)) throw new Error('Global shortcuts cannot share a combination.')
    used.add(resolved); result[action.id] = binding
  }
  return result
}
export function electronAccelerator(binding: string, platform: ShortcutPlatform): string {
  return resolvedShortcut(binding, platform).split('+').map(part => ({ Meta: 'Command', Ctrl: 'Control', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[part] ?? part)).join('+')
}
export interface QuickToolsApi {
  open(kind: QuickWidget): Promise<void>
  shortcuts(): Promise<GlobalShortcutState>
  setShortcuts(bindings: GlobalBindings): Promise<GlobalShortcutState>
  checkShortcut(binding: string): Promise<{ available: boolean; reason: string }>
  onShortcutsChanged(callback: () => void): () => void
}
export interface WidgetApi extends QuickToolsApi {
  clipboard: ClipboardApi
  context(): Promise<{ kind: QuickWidget; locale: LocaleId; dark: boolean; canPaste: boolean }>
  onAppearanceChanged(callback: (dark: boolean) => void): () => void
  onLanguageChanged(callback: (locale: LocaleId) => void): () => void
  onPasteTargetChanged(callback: (available: boolean) => void): () => void
  close(): Promise<void>
  pin(value: boolean): Promise<void>
  copyText(text: string): Promise<void>
  copyImage(png: string): Promise<void>
  pickColor(): Promise<void>
  lastColor(): Promise<string | null>
  ocr: {
    recognize(request: OcrRequest): Promise<OcrResult | null>
    capture(mode: CaptureMode): Promise<void>
    cancel(id: string): Promise<boolean>
    onProgress(callback: (progress: OcrProgress) => void): () => void
  }
  mock: { status(): Promise<MockStatus>; config(): Promise<string | null>; start(yaml: string): Promise<MockStatus>; stop(): Promise<MockStatus> }
}
