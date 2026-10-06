export type ToolLoadingMode = 'on-demand' | 'preload'

export const MAX_RECENT_TOOLS = 10
export const MAX_FAVORITE_TOOLS = 12

export interface AppPreferences {
  theme: 'dark' | 'light' | 'system'
  sidebarCollapsed: boolean
  lastToolId: string | null
  recentToolIds: string[]
  favoriteToolIds: string[]
  launchMode: 'home' | 'last'
  toolLoadingMode: ToolLoadingMode
  sshDir: string | null
  sshConfigPath: string | null
}

/** Preferences contain tool IDs only. Tool inputs never belong in this store. */
export function isPreferenceToolId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value)
}

function toolIds(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(value.slice(0, 128).filter(isPreferenceToolId))].slice(0, limit)
}

function isPreferencePath(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0'))
}

/** Only known, well-formed metadata may replace defaults during hydration. */
export function readAppPreferences(value: unknown): Partial<AppPreferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const result: Partial<AppPreferences> = {}
  if (raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system') result.theme = raw.theme
  if (typeof raw.sidebarCollapsed === 'boolean') result.sidebarCollapsed = raw.sidebarCollapsed
  if (raw.lastToolId === null || isPreferenceToolId(raw.lastToolId)) result.lastToolId = raw.lastToolId
  const recent = toolIds(raw.recentToolIds, MAX_RECENT_TOOLS)
  if (recent) result.recentToolIds = recent
  const favorites = toolIds(raw.favoriteToolIds, MAX_FAVORITE_TOOLS)
  if (favorites) result.favoriteToolIds = favorites
  if (raw.launchMode === 'home' || raw.launchMode === 'last') result.launchMode = raw.launchMode
  if (raw.toolLoadingMode === 'on-demand' || raw.toolLoadingMode === 'preload') result.toolLoadingMode = raw.toolLoadingMode
  if (isPreferencePath(raw.sshDir)) result.sshDir = raw.sshDir
  if (isPreferencePath(raw.sshConfigPath)) result.sshConfigPath = raw.sshConfigPath
  return result
}
