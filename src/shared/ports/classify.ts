import { PRIVILEGED_PORT_MAX } from '../core/constants'
import type { PortTier } from './types'

const SYSTEM_PORTS = new Set([
  20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 88, 110, 111, 123, 135, 137, 138, 139, 143,
  161, 162, 389, 443, 445, 464, 465, 500, 514, 587, 631, 636, 853, 993, 995,
  1433, 1434, 1521, 1723, 2049, 3268, 3269, 3389, 5355, 5357, 5985, 5986, 7680, 47001,
  2181, 2375, 2376, 2377, 2380, 3306, 5432, 5672, 5900, 6379, 6443, 9200, 9300, 11211,
  15672, 27017, 27018, 27019
])

export const COMMON_APP_PORTS = new Set([
  3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010,
  4000, 4001, 4173, 4200, 4321, 4444, 4500, 5000, 5001, 5173, 5174, 5251,
  5500, 6000, 6001, 7000, 7001, 8000, 8001, 8002, 8080, 8081, 8082, 8088,
  8090, 8443, 8888, 9000, 9001, 9090, 9229, 9418, 9999
])

const CRITICAL_PROCESS = [
  /^system$/i,
  /^registry$/i,
  /^smss(\.exe)?$/i,
  /^csrss(\.exe)?$/i,
  /^wininit(\.exe)?$/i,
  /^services(\.exe)?$/i,
  /^lsass(\.exe)?$/i,
  /^svchost(\.exe)?$/i,
  /^winlogon(\.exe)?$/i,
  /^dwm(\.exe)?$/i,
  /^fontdrvhost(\.exe)?$/i,
  /^lsaiso(\.exe)?$/i,
  /^memory compression$/i,
  /^secure system$/i,
  /^idle$/i,
  /^system idle process$/i,
  /^ntoskrnl/i,
  /^launchd$/i,
  /^kernel_task$/i,
  /^windowserver$/i,
  /^mdnsresponder$/i,
  /^syslogd$/i,
  /^systemd/i,
  /^init$/i,
  /^kthreadd$/i,
  /^dbus-daemon$/i,
  /^networkd/i,
  /^resolver/i
]

const DEV_PROCESS = [
  /^node(\.exe)?$/i,
  /^nodejs/i,
  /^python(\d*)(\.exe)?$/i,
  /^java(\.exe)?$/i,
  /^ruby(\.exe)?$/i,
  /^php(\.exe)?$/i,
  /^deno(\.exe)?$/i,
  /^bun(\.exe)?$/i,
  /^go(\.exe)?$/i,
  /^cargo/i,
  /^rustc/i,
  /^dotnet(\.exe)?$/i,
  /^webpack/i,
  /^vite/i,
  /^next-server/i,
  /^ng serve/i,
  /^uvicorn/i,
  /^gunicorn/i,
  /^rails/i,
  /^webpack-dev-server/i,
  /^esbuild/i,
  /^electron(\.exe)?$/i,
  /^code(\.exe)?$/i,
  /^code - /i
]

export function classifyPort(input: {
  port: number
  processName: string
  processPath?: string
}): { tier: PortTier; reason: string } {
  const name = (input.processName || '').trim() || 'unknown'
  const path = input.processPath ?? ''
  const combined = `${name} ${path}`

  for (const re of CRITICAL_PROCESS) {
    if (re.test(name) || re.test(combined)) {
      return {
        tier: 'system',
        reason: `Critical process “${name}”`
      }
    }
  }

  if (input.port > 0 && input.port <= PRIVILEGED_PORT_MAX) {
    return {
      tier: 'system',
      reason: `Privileged port ${input.port} (≤ ${PRIVILEGED_PORT_MAX})`
    }
  }

  if (SYSTEM_PORTS.has(input.port)) {
    return {
      tier: 'system',
      reason: `Well-known / infra port ${input.port}`
    }
  }

  if (input.port >= 49152 && /svchost|system|services/i.test(name)) {
    return {
      tier: 'system',
      reason: 'Ephemeral port owned by system service host'
    }
  }

  for (const re of DEV_PROCESS) {
    if (re.test(name) || re.test(combined)) {
      return {
        tier: 'application',
        reason: `Developer runtime “${name}”`
      }
    }
  }

  if (COMMON_APP_PORTS.has(input.port)) {
    return {
      tier: 'application',
      reason: `Common app / dev port ${input.port}`
    }
  }

  return {
    tier: 'application',
    reason: 'User-space / non-critical process'
  }
}

export function systemKillConfirmPhrase(port: number): string {
  return `kill ${port}`
}
