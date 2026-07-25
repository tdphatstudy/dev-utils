export const PORT_MIN = 1
export const PORT_MAX = 65_535
export const PRIVILEGED_PORT_MAX = 1023

export const PORT_SCAN_TIMEOUT_MS = 15_000
export const PORT_SCAN_MAX_BUFFER_BYTES = 12 * 1024 * 1024
export const PORT_KILL_GRACE_MS = 150

export const PROTECTED_PIDS = [0, 1, 2, 3, 4] as const
