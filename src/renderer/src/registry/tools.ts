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
  ArrowLeftRight,
  Vault,
  CalendarClock,
  Regex,
  QrCode,
  Radio,
  StickyNote,
  Code2,
  FileType2,
  Database,
  type LucideIcon
} from 'lucide-react'

export type ToolGroupId =
  | 'json'
  | 'yaml'
  | 'markup'
  | 'sql'
  | 'convert'
  | 'base64'
  | 'security'
  | 'network'
  | 'file'
  | 'text'
  | 'privatebox'
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
  { id: 'markup', name: 'HTML / XML', icon: Code2, order: 2 },
  { id: 'sql', name: 'SQL', icon: Database, order: 3 },
  { id: 'convert', name: 'Convert', icon: ArrowLeftRight, order: 4 },
  { id: 'base64', name: 'Base64', icon: Binary, order: 5 },
  { id: 'security', name: 'Security', icon: Shield, order: 6 },
  { id: 'network', name: 'Network', icon: Network, order: 7 },
  { id: 'file', name: 'File', icon: File, order: 8 },
  { id: 'text', name: 'Text / Dev', icon: Regex, order: 9 },
  { id: 'privatebox', name: 'Private Box', icon: Vault, order: 10 },
  { id: 'app', name: 'App', icon: Info, order: 11 }
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
    description: 'Line highlight and structural JSON compare',
    keywords: ['json', 'diff', 'compare', 'delta', 'lines', 'tree'],
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
    description: 'Line highlight and structural YAML compare',
    keywords: ['yaml', 'diff', 'compare', 'lines', 'tree'],
    icon: GitCompare,
    component: lazy(() => import('@renderer/features/tools/yaml/YamlDiff'))
  },
  {
    id: 'markup.html',
    group: 'markup',
    name: 'HTML Studio',
    description: 'Format, minify, and structurally check HTML',
    keywords: ['html', 'format', 'beautify', 'minify', 'validate', 'markup'],
    icon: Code2,
    component: lazy(() => import('@renderer/features/tools/markup/HtmlStudio'))
  },
  {
    id: 'markup.xml',
    group: 'markup',
    name: 'XML Studio',
    description: 'Format, minify, and validate well-formed XML',
    keywords: ['xml', 'format', 'beautify', 'minify', 'validate', 'well-formed'],
    icon: FileType2,
    component: lazy(() => import('@renderer/features/tools/markup/XmlStudio'))
  },
  {
    id: 'sql.studio',
    group: 'sql',
    name: 'SQL Studio',
    description: 'Format & validate SQL — MySQL, PostgreSQL, SQL Server, SQLite, …',
    keywords: [
      'sql',
      'mysql',
      'postgres',
      'postgresql',
      'tsql',
      'mssql',
      'sqlite',
      'format',
      'validate',
      'beautify',
      'query',
      'mariadb',
      'bigquery'
    ],
    icon: Database,
    component: lazy(() => import('@renderer/features/tools/sql/SqlStudio'))
  },
  {
    id: 'convert.file-ext',
    group: 'convert',
    name: 'Convert File Ext',
    description: 'Convert between formats (JSON ↔ YAML, more later)',
    keywords: [
      'convert',
      'json',
      'yaml',
      'yml',
      'transform',
      'extension',
      'file',
      'to'
    ],
    icon: ArrowLeftRight,
    component: lazy(() => import('@renderer/features/tools/convert/ConvertFileExt'))
  },
  {
    id: 'convert.image',
    group: 'convert',
    name: 'Image Convert',
    description: 'PNG / JPEG / WebP convert, resize, and quality',
    keywords: [
      'image',
      'png',
      'jpg',
      'jpeg',
      'webp',
      'resize',
      'scale',
      'compress',
      'convert',
      'picture'
    ],
    icon: ImageIcon,
    component: lazy(() => import('@renderer/features/tools/convert/ImageConvert'))
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
    name: 'JWT',
    description: 'Decode, verify (HS/RS/ES + secret/PEM), and sign HS tokens',
    keywords: [
      'jwt',
      'token',
      'decode',
      'verify',
      'sign',
      'secret',
      'hs256',
      'rs256',
      'bearer',
      'auth'
    ],
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
    description: 'Postman-style requests, body modes, curl/PowerShell export',
    keywords: [
      'http',
      'rest',
      'api',
      'fetch',
      'get',
      'post',
      'curl',
      'postman',
      'powershell',
      'axios'
    ],
    icon: Globe,
    component: lazy(() => import('@renderer/features/tools/network/HttpClient'))
  },
  {
    id: 'network.ports',
    group: 'network',
    name: 'Port Manager',
    description: 'List listening ports, color system vs app, kill stuck processes',
    keywords: [
      'port',
      'ports',
      'listen',
      'kill',
      'pid',
      'netstat',
      '3000',
      'stuck',
      'process',
      'tcp',
      'eaddrinuse'
    ],
    icon: Radio,
    component: lazy(() => import('@renderer/features/tools/network/PortManager'))
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
    id: 'text.regex',
    group: 'text',
    name: 'Regex Tester',
    description: 'Match, replace, split, explain — full JS RegExp toolkit',
    keywords: [
      'regex',
      'regexp',
      'regular expression',
      'match',
      'replace',
      'split',
      'pattern',
      'flags',
      'groups',
      'test'
    ],
    icon: Regex,
    component: lazy(() => import('@renderer/features/tools/text/RegexTool'))
  },
  {
    id: 'text.cron',
    group: 'text',
    name: 'Cron Calculator',
    description: 'Parse, explain, and list next cron runs (5/6-field)',
    keywords: [
      'cron',
      'crontab',
      'schedule',
      'job',
      'quartz',
      'expression',
      'next run',
      'minute',
      'scheduler'
    ],
    icon: CalendarClock,
    component: lazy(() => import('@renderer/features/tools/text/CronTool'))
  },
  {
    id: 'text.qr',
    group: 'text',
    name: 'QR Code',
    description: 'Encode text → QR image, or decode QR image → raw data',
    keywords: [
      'qr',
      'qrcode',
      'barcode',
      'scan',
      'encode',
      'decode',
      'image',
      'png',
      'wifi'
    ],
    icon: QrCode,
    component: lazy(() => import('@renderer/features/tools/text/QrTool'))
  },
  {
    id: 'privatebox.home',
    group: 'privatebox',
    name: 'Private Box',
    description: 'Encrypted vault explorer — files stored as .putl',
    keywords: [
      'private',
      'box',
      'vault',
      'encrypt',
      'putl',
      'secure',
      'notes',
      'finder'
    ],
    icon: Vault,
    component: lazy(() => import('@renderer/features/privatebox/PrivateBoxApp'))
  },
  {
    id: 'privatebox.keep',
    group: 'privatebox',
    name: 'Keep',
    description: 'Encrypted notes like Google Keep — Default Secret Box',
    keywords: [
      'keep',
      'notes',
      'sticky',
      'memo',
      'google keep',
      'secret',
      'encrypted',
      'pin'
    ],
    icon: StickyNote,
    component: lazy(() => import('@renderer/features/keep/KeepApp'))
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
