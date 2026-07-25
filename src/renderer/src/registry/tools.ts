import { lazy, type LazyExoticComponent, type ComponentType } from 'react'
import {
  Braces,
  FileCode2,
  Binary,
  Shield,
  Network,
  File,
  GitCompare,
  Search,
  KeyRound,
  Fingerprint,
  Lock,
  Globe,
  Image as ImageIcon,
  Info,
  Settings,
  Server,
  WrapText,
  type LucideIcon
} from 'lucide-react'

export type ToolGroupId =
  | 'json'
  | 'yaml'
  | 'base64'
  | 'security'
  | 'network'
  | 'file'
  | 'app'

export interface ToolGroup {
  id: ToolGroupId
  name: string
  icon: LucideIcon
  order: number
}

export interface ToolDefinition {
  id: string
  group: ToolGroupId
  name: string
  description: string
  keywords: string[]
  icon: LucideIcon
  component: LazyExoticComponent<ComponentType>
}

export const toolGroups: ToolGroup[] = [
  { id: 'json', name: 'JSON', icon: Braces, order: 0 },
  { id: 'yaml', name: 'YAML', icon: FileCode2, order: 1 },
  { id: 'base64', name: 'Base64', icon: Binary, order: 2 },
  { id: 'security', name: 'Security', icon: Shield, order: 3 },
  { id: 'network', name: 'Network', icon: Network, order: 4 },
  { id: 'file', name: 'File', icon: File, order: 5 },
  { id: 'app', name: 'App', icon: Info, order: 6 }
]

export const tools: ToolDefinition[] = [
  {
    id: 'json.studio',
    group: 'json',
    name: 'JSON Studio',
    description: 'Format, validate, and explore JSON as a tree',
    keywords: ['json', 'format', 'beautify', 'minify', 'validate', 'tree', 'pretty'],
    icon: Braces,
    component: lazy(() => import('@renderer/features/tools/json/JsonStudio'))
  },
  {
    id: 'json.diff',
    group: 'json',
    name: 'JSON Diff',
    description: 'Structural compare of two JSON documents',
    keywords: ['json', 'diff', 'compare', 'delta'],
    icon: GitCompare,
    component: lazy(() => import('@renderer/features/tools/json/JsonDiff'))
  },
  {
    id: 'json.path',
    group: 'json',
    name: 'JSONPath',
    description: 'Query JSON with a JSONPath subset',
    keywords: ['json', 'jsonpath', 'query', 'path', 'filter'],
    icon: Search,
    component: lazy(() => import('@renderer/features/tools/json/JsonPathTool'))
  },
  {
    id: 'yaml.studio',
    group: 'yaml',
    name: 'YAML Studio',
    description: 'Format, validate YAML and convert to JSON',
    keywords: ['yaml', 'yml', 'format', 'validate', 'convert', 'tree'],
    icon: FileCode2,
    component: lazy(() => import('@renderer/features/tools/yaml/YamlStudio'))
  },
  {
    id: 'yaml.diff',
    group: 'yaml',
    name: 'YAML Diff',
    description: 'Structural compare of two YAML documents',
    keywords: ['yaml', 'diff', 'compare'],
    icon: GitCompare,
    component: lazy(() => import('@renderer/features/tools/yaml/YamlDiff'))
  },
  {
    id: 'base64.codec',
    group: 'base64',
    name: 'Base64 Encode / Decode',
    description: 'Encode and decode Base64 text (std & URL-safe)',
    keywords: ['base64', 'encode', 'decode', 'url-safe'],
    icon: Binary,
    component: lazy(() => import('@renderer/features/tools/base64/Base64Codec'))
  },
  {
    id: 'base64.image',
    group: 'base64',
    name: 'Base64 Image',
    description: 'Image ↔ Base64 with live preview',
    keywords: ['base64', 'image', 'png', 'jpeg', 'dataurl'],
    icon: ImageIcon,
    component: lazy(() => import('@renderer/features/tools/base64/Base64Image'))
  },
  {
    id: 'security.random',
    group: 'security',
    name: 'Secure Random',
    description: 'CSPRNG random bytes, passwords, and UUIDs',
    keywords: ['random', 'password', 'uuid', 'csprng', 'secure', 'token'],
    icon: Shield,
    component: lazy(() => import('@renderer/features/tools/security/SecureRandom'))
  },
  {
    id: 'security.hash',
    group: 'security',
    name: 'Hash',
    description: 'MD5, SHA-1, SHA-256, SHA-512 for text',
    keywords: ['hash', 'md5', 'sha', 'sha256', 'checksum'],
    icon: Fingerprint,
    component: lazy(() => import('@renderer/features/tools/security/HashTool'))
  },
  {
    id: 'security.hmac',
    group: 'security',
    name: 'HMAC',
    description: 'HMAC-SHA with Web Crypto',
    keywords: ['hmac', 'mac', 'sha256', 'sign'],
    icon: KeyRound,
    component: lazy(() => import('@renderer/features/tools/security/HmacTool'))
  },
  {
    id: 'security.jwt',
    group: 'security',
    name: 'JWT Decode',
    description: 'Inspect JWT header & payload (no verify)',
    keywords: ['jwt', 'token', 'decode', 'bearer', 'auth'],
    icon: KeyRound,
    component: lazy(() => import('@renderer/features/tools/security/JwtTool'))
  },
  {
    id: 'security.aes',
    group: 'security',
    name: 'AES-GCM',
    description: 'Encrypt / decrypt with PBKDF2 + AES-256-GCM',
    keywords: ['aes', 'gcm', 'encrypt', 'decrypt', 'password'],
    icon: Lock,
    component: lazy(() => import('@renderer/features/tools/security/AesTool'))
  },
  {
    id: 'network.url',
    group: 'network',
    name: 'URL Tools',
    description: 'Parse, encode, and decode URLs',
    keywords: ['url', 'encode', 'decode', 'query', 'parse'],
    icon: Network,
    component: lazy(() => import('@renderer/features/tools/network/UrlTools'))
  },
  {
    id: 'network.ip',
    group: 'network',
    name: 'IP / CIDR',
    description: 'IPv4/IPv6 info and CIDR basics',
    keywords: ['ip', 'ipv4', 'ipv6', 'cidr', 'private'],
    icon: Globe,
    component: lazy(() => import('@renderer/features/tools/network/IpTools'))
  },
  {
    id: 'network.dns',
    group: 'network',
    name: 'DNS Lookup',
    description: 'Resolve A/AAAA/MX/TXT via system DNS',
    keywords: ['dns', 'resolve', 'a', 'aaaa', 'mx', 'lookup'],
    icon: Server,
    component: lazy(() => import('@renderer/features/tools/network/DnsLookup'))
  },
  {
    id: 'network.http',
    group: 'network',
    name: 'HTTP Client',
    description: 'Simple request/response explorer',
    keywords: ['http', 'rest', 'api', 'fetch', 'get', 'post'],
    icon: Globe,
    component: lazy(() => import('@renderer/features/tools/network/HttpClient'))
  },
  {
    id: 'file.hash',
    group: 'file',
    name: 'File Hash',
    description: 'Compute file checksums locally via OS',
    keywords: ['file', 'hash', 'sha256', 'checksum', 'md5'],
    icon: File,
    component: lazy(() => import('@renderer/features/tools/file/FileHash'))
  },
  {
    id: 'file.lineendings',
    group: 'file',
    name: 'Line Endings',
    description: 'Detect and convert LF / CRLF / CR',
    keywords: ['crlf', 'lf', 'newline', 'line ending', 'dos', 'unix'],
    icon: WrapText,
    component: lazy(() => import('@renderer/features/tools/file/LineEndings'))
  },
  {
    id: 'app.settings',
    group: 'app',
    name: 'Settings',
    description: 'Theme, session history, shortcuts',
    keywords: ['settings', 'preferences', 'theme', 'history'],
    icon: Settings,
    component: lazy(() =>
      import('@renderer/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
    )
  },
  {
    id: 'app.about',
    group: 'app',
    name: 'About & Privacy',
    description: 'Local processing notes and shortcuts',
    keywords: ['about', 'privacy', 'shortcuts', 'help'],
    icon: Info,
    component: lazy(() =>
      import('@renderer/pages/AboutPage').then((m) => ({ default: m.AboutPage }))
    )
  }
]

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id)
}

export function getToolsByGroup(group: ToolGroupId): ToolDefinition[] {
  return tools.filter((t) => t.group === group)
}

export function searchTools(query: string): ToolDefinition[] {
  const q = query.trim().toLowerCase()
  if (!q) return tools
  return tools.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.includes(q)) ||
      t.group.includes(q)
  )
}
