import type { LazyExoticComponent, ComponentType } from 'react'
import { createToolLoader } from './tool-loader'
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
  Terminal,
  Pipette,
  Palette,
  ScanText,
  type LucideIcon
} from 'lucide-react'

export type ToolGroupId =
  | 'json'
  | 'yaml'
  | 'markup'
  | 'sql'
  | 'convert'
  | 'design'
  | 'base64'
  | 'security'
  | 'network'
  | 'file'
  | 'text'
  | 'time'
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
  preload: () => Promise<void>
  isLoaded: () => boolean
}

export const toolGroups: ToolGroup[] = [
  { id: 'json', name: 'JSON', icon: Braces, order: 0 },
  { id: 'yaml', name: 'YAML', icon: FileCode2, order: 1 },
  { id: 'markup', name: 'HTML / XML', icon: Code2, order: 2 },
  { id: 'sql', name: 'SQL', icon: Database, order: 3 },
  { id: 'convert', name: 'Convert', icon: ArrowLeftRight, order: 4 },
  { id: 'design', name: 'Design', icon: Palette, order: 4.5 },
  { id: 'base64', name: 'Base64', icon: Binary, order: 5 },
  { id: 'security', name: 'Security', icon: Shield, order: 6 },
  { id: 'network', name: 'Network', icon: Network, order: 7 },
  { id: 'file', name: 'File', icon: File, order: 8 },
  { id: 'text', name: 'Text / Dev', icon: Regex, order: 9 },
  { id: 'time', name: 'Time / Date', icon: CalendarClock, order: 9.5 },
  { id: 'privatebox', name: 'Private Box', icon: Vault, order: 10 },
  { id: 'app', name: 'App', icon: Info, order: 11 }
]

export const tools: ToolDefinition[] = [
  {
    id: 'network.local-domains',
    group: 'network',
    name: 'Local Domains',
    description: 'Local domains, port forwarding and HTTPS',
    keywords: ['dns', 'hosts', 'domain', 'localhost', 'reverse proxy', 'https', 'ssl', 'certificate', 'mkcert'],
    icon: Globe,
    ...createToolLoader(() => import('@renderer/features/tools/network/LocalDomainsTool'))
  },
  {
    id: 'text.lorem', group: 'text', name: 'Lorem Text',
    description: 'Generate placeholder words, sentences and paragraphs for layouts',
    keywords: ['lorem', 'ipsum', 'placeholder', 'dummy', 'text', 'paragraph', 'sentence'],
    icon: WrapText,
    ...createToolLoader(() => import('@renderer/features/tools/text/LoremTool'))
  },
  {
    id: 'time.timestamp', group: 'time', name: 'Timestamp Converter',
    description: 'Convert Unix seconds or milliseconds and ISO dates with timezone output',
    keywords: ['timestamp', 'unix', 'epoch', 'seconds', 'milliseconds', 'iso', 'timezone', 'utc', 'date'],
    icon: CalendarClock,
    ...createToolLoader(() => import('@renderer/features/tools/time/TimestampTool'))
  },
  {
    id: 'time.date', group: 'time', name: 'Date Calculator',
    description: 'Add calendar dates or durations and calculate date/time differences',
    keywords: ['date', 'time', 'duration', 'difference', 'days', 'months', 'years', 'calculate'],
    icon: CalendarClock,
    ...createToolLoader(() => import('@renderer/features/tools/time/DateTool'))
  },
  {
    id: 'network.mock-api', group: 'network', name: 'Mock API',
    description: 'Serve local endpoints with conditional responses and portable YAML configs',
    keywords: ['mock', 'api', 'server', 'endpoint', 'frontend', 'backend', 'response', 'header', 'filter', 'yaml', 'cors'],
    icon: Server,
    ...createToolLoader(() => import('@renderer/features/tools/network/MockApiTool'))
  },
  {
    id: 'design.color', group: 'design', name: 'Color Picker',
    description: 'Pick desktop colors with a Copy / Repick popup: HEX, RGB, HSL and HSV',
    keywords: ['color', 'colour', 'picker', 'eyedropper', 'hex', 'rgb', 'hsl', 'hsv', 'palette', 'screen', 'desktop', 'repick'],
    icon: Pipette,
    ...createToolLoader(() => import('@renderer/features/tools/design/ColorPicker'))
  },
  {
    id: 'json.studio',
    group: 'json',
    name: 'JSON Studio',
    description: 'Format, validate, and explore JSON as a tree',
    keywords: ['json', 'format', 'beautify', 'minify', 'validate', 'tree', 'pretty'],
    icon: Braces,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonStudio'))
  },
  {
    id: 'json.diff',
    group: 'json',
    name: 'JSON Diff',
    description: 'Line highlight and structural JSON compare',
    keywords: ['json', 'diff', 'compare', 'delta', 'lines', 'tree'],
    icon: GitCompare,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonDiff'))
  },
  {
    id: 'json.path',
    group: 'json',
    name: 'JSONPath',
    description: 'Query JSON with a JSONPath subset',
    keywords: ['json', 'jsonpath', 'query', 'path', 'filter'],
    icon: Search,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonPathTool'))
  },
  {
    id: 'yaml.studio',
    group: 'yaml',
    name: 'YAML Studio',
    description: 'Format, validate YAML and convert to JSON',
    keywords: ['yaml', 'yml', 'format', 'validate', 'convert', 'tree'],
    icon: FileCode2,
    ...createToolLoader(() => import('@renderer/features/tools/yaml/YamlStudio'))
  },
  {
    id: 'yaml.diff',
    group: 'yaml',
    name: 'YAML Diff',
    description: 'Line highlight and structural YAML compare',
    keywords: ['yaml', 'diff', 'compare', 'lines', 'tree'],
    icon: GitCompare,
    ...createToolLoader(() => import('@renderer/features/tools/yaml/YamlDiff'))
  },
  {
    id: 'markup.html',
    group: 'markup',
    name: 'HTML Studio',
    description: 'Format, minify, and structurally check HTML',
    keywords: ['html', 'format', 'beautify', 'minify', 'validate', 'markup'],
    icon: Code2,
    ...createToolLoader(() => import('@renderer/features/tools/markup/HtmlStudio'))
  },
  {
    id: 'markup.xml',
    group: 'markup',
    name: 'XML Studio',
    description: 'Format, minify, and validate well-formed XML',
    keywords: ['xml', 'format', 'beautify', 'minify', 'validate', 'well-formed'],
    icon: FileType2,
    ...createToolLoader(() => import('@renderer/features/tools/markup/XmlStudio'))
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
    ...createToolLoader(() => import('@renderer/features/tools/sql/SqlStudio'))
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
    ...createToolLoader(() => import('@renderer/features/tools/convert/ConvertFileExt'))
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
    ...createToolLoader(() => import('@renderer/features/tools/convert/ImageConvert'))
  },
  {
    id: 'base64.codec',
    group: 'base64',
    name: 'Base64 Encode / Decode',
    description: 'Encode and decode Base64 text (std & URL-safe)',
    keywords: ['base64', 'encode', 'decode', 'url-safe'],
    icon: Binary,
    ...createToolLoader(() => import('@renderer/features/tools/base64/Base64Codec'))
  },
  {
    id: 'base64.image',
    group: 'base64',
    name: 'Base64 Image',
    description: 'Image ↔ Base64 with live preview',
    keywords: ['base64', 'image', 'png', 'jpeg', 'dataurl'],
    icon: ImageIcon,
    ...createToolLoader(() => import('@renderer/features/tools/base64/Base64Image'))
  },
  {
    id: 'security.random',
    group: 'security',
    name: 'Secure Random',
    description: 'CSPRNG random bytes, passwords, and UUIDs',
    keywords: ['random', 'password', 'uuid', 'csprng', 'secure', 'token'],
    icon: Shield,
    ...createToolLoader(() => import('@renderer/features/tools/security/SecureRandom'))
  },
  {
    id: 'security.keygen',
    group: 'security',
    name: 'Key Generator',
    description: 'RSA, ECDSA, Ed25519, X25519 key pairs — PEM & OpenSSH',
    keywords: [
      'key',
      'keypair',
      'rsa',
      'ecdsa',
      'ed25519',
      'x25519',
      'pem',
      'ssh',
      'public',
      'private',
      'generate',
      'openssl'
    ],
    icon: KeyRound,
    ...createToolLoader(() => import('@renderer/features/tools/security/KeygenTool'))
  },
  {
    id: 'security.hash',
    group: 'security',
    name: 'Hash',
    description: 'MD5, SHA-1, SHA-256, SHA-512 for text',
    keywords: ['hash', 'md5', 'sha', 'sha256', 'checksum'],
    icon: Fingerprint,
    ...createToolLoader(() => import('@renderer/features/tools/security/HashTool'))
  },
  {
    id: 'security.hmac',
    group: 'security',
    name: 'HMAC',
    description: 'HMAC-SHA with Web Crypto',
    keywords: ['hmac', 'mac', 'sha256', 'sign'],
    icon: KeyRound,
    ...createToolLoader(() => import('@renderer/features/tools/security/HmacTool'))
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
    ...createToolLoader(() => import('@renderer/features/tools/security/JwtTool'))
  },
  {
    id: 'security.aes',
    group: 'security',
    name: 'AES-GCM',
    description: 'Encrypt / decrypt with PBKDF2 + AES-256-GCM',
    keywords: ['aes', 'gcm', 'encrypt', 'decrypt', 'password'],
    icon: Lock,
    ...createToolLoader(() => import('@renderer/features/tools/security/AesTool'))
  },
  {
    id: 'network.url',
    group: 'network',
    name: 'URL Tools',
    description: 'Parse, encode, and decode URLs',
    keywords: ['url', 'encode', 'decode', 'query', 'parse'],
    icon: Network,
    ...createToolLoader(() => import('@renderer/features/tools/network/UrlTools'))
  },
  {
    id: 'network.ip',
    group: 'network',
    name: 'IP / CIDR',
    description: 'IPv4/IPv6 info and CIDR basics',
    keywords: ['ip', 'ipv4', 'ipv6', 'cidr', 'private'],
    icon: Globe,
    ...createToolLoader(() => import('@renderer/features/tools/network/IpTools'))
  },
  {
    id: 'network.dns',
    group: 'network',
    name: 'DNS Lookup',
    description: 'DNS records, address TTL and reverse IP lookup',
    keywords: ['dns', 'resolve', 'a', 'aaaa', 'mx', 'txt', 'srv', 'soa', 'ptr', 'ttl', 'reverse', 'lookup'],
    icon: Server,
    ...createToolLoader(() => import('@renderer/features/tools/network/DnsLookup'))
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
    ...createToolLoader(() => import('@renderer/features/tools/network/HttpClient'))
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
    ...createToolLoader(() => import('@renderer/features/tools/network/PortManager'))
  },
  {
    id: 'network.ssh',
    group: 'network',
    name: 'SSH Keys & Hosts',
    description: 'List ~/.ssh keys and config hosts, test TCP reachability',
    keywords: [
      'ssh',
      'openssh',
      'known_hosts',
      'id_rsa',
      'id_ed25519',
      'config',
      'host',
      'ping',
      'fingerprint',
      'key'
    ],
    icon: Terminal,
    ...createToolLoader(() => import('@renderer/features/tools/network/SshManager'))
  },
  {
    id: 'file.hash',
    group: 'file',
    name: 'File Hash',
    description: 'Compute file checksums locally via OS',
    keywords: ['file', 'hash', 'sha256', 'checksum', 'md5'],
    icon: File,
    ...createToolLoader(() => import('@renderer/features/tools/file/FileHash'))
  },
  {
    id: 'file.lineendings',
    group: 'file',
    name: 'Line Endings',
    description: 'Detect and convert LF / CRLF / CR',
    keywords: ['crlf', 'lf', 'newline', 'line ending', 'dos', 'unix'],
    icon: WrapText,
    ...createToolLoader(() => import('@renderer/features/tools/file/LineEndings'))
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
    ...createToolLoader(() => import('@renderer/features/tools/text/RegexTool'))
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
    ...createToolLoader(() => import('@renderer/features/tools/text/CronTool'))
  },
  {
    id: 'text.ocr',
    group: 'text',
    name: 'OCR · Image / PDF',
    description: 'Extract English and Vietnamese text from images, PDFs or a screen region — offline',
    keywords: ['ocr', 'scan', 'text', 'image', 'pdf', 'screenshot', 'capture', 'vietnamese', 'extract'],
    icon: ScanText,
    ...createToolLoader(() => import('@renderer/features/tools/text/OcrTool'))
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
    ...createToolLoader(() => import('@renderer/features/tools/text/QrTool'))
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
    ...createToolLoader(() => import('@renderer/features/privatebox/PrivateBoxApp'))
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
    ...createToolLoader(() => import('@renderer/features/keep/KeepApp'))
  },
  {
    id: 'app.settings',
    group: 'app',
    name: 'Settings',
    description: 'Theme, session history, shortcuts',
    keywords: ['settings', 'preferences', 'theme', 'history', 'loading', 'performance', 'on demand', 'preload'],
    icon: Settings,
    ...createToolLoader(() =>
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
    ...createToolLoader(() =>
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
