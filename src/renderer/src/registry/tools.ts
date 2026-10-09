import { messageKey } from '@shared/i18n/message-key'
import { translate } from '@shared/i18n/catalog'
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
  ClipboardList,
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
  | 'hacking'
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
  { id: 'hacking', name: 'Hacking / Security Testing', icon: Shield, order: 6.5 },
  { id: 'network', name: 'Network', icon: Network, order: 7 },
  { id: 'file', name: 'File', icon: File, order: 8 },
  { id: 'text', name: 'Text / Dev', icon: Regex, order: 9 },
  { id: 'time', name: 'Time / Date', icon: CalendarClock, order: 9.5 },
  { id: 'privatebox', name: 'Private Box', icon: Vault, order: 10 },
  { id: 'app', name: 'App', icon: Info, order: 11 }
]

export const tools: ToolDefinition[] = [
  { id: 'hacking.stress', group: 'hacking', name: 'API Stress Test', description: messageKey('Test HTTP load with request, rate and concurrency limits; inspect status and latency'), keywords: ['stress', 'load', 'rps', 'performance', 'api', 'hacking'], icon: Radio, ...createToolLoader(() => import('@renderer/features/tools/hacking/StressTool')) },
  { id: 'hacking.hash', group: 'hacking', name: 'Hash Lab', description: messageKey('Generate hash values or find matching strings in a local candidate set'), keywords: ['hash', 'md5', 'sha256', 'dictionary', 'preimage', 'hacking'], icon: Fingerprint, ...createToolLoader(() => import('@renderer/features/tools/hacking/HashLab')) },
  { id: 'hacking.headers', group: 'hacking', name: 'HTTP Security Headers', description: messageKey('Inspect HTTP security headers for transport, content and framing policies'), keywords: ['headers', 'csp', 'hsts', 'http', 'security', 'hacking'], icon: Shield, ...createToolLoader(() => import('@renderer/features/tools/hacking/HeaderAudit')) },
  { id: 'hacking.cors', group: 'hacking', name: 'CORS Policy Probe', description: messageKey('Inspect preflight and GET origin policies without browser enforcement'), keywords: ['cors', 'origin', 'preflight', 'options', 'hacking'], icon: Globe, ...createToolLoader(() => import('@renderer/features/tools/hacking/CorsProbe')) },
  { id: 'hacking.jwt', group: 'hacking', name: 'JWT Security Review', description: messageKey('Check JWT algorithm and claim policies without verifying the signature'), keywords: ['jwt', 'token', 'claims', 'algorithm', 'hacking'], icon: KeyRound, ...createToolLoader(() => import('@renderer/features/tools/hacking/JwtReview')) },
  {
    id: 'json.schema', group: 'json', name: 'JSON Schema Validator',
    description: messageKey('Validate payloads and event contracts against draft 7 or 2020-12 schemas'),
    keywords: ['schema', 'validation', 'contract', 'payload', 'event', 'kafka', 'json schema', 'enterprise'],
    icon: Shield,
    ...createToolLoader(() => import('@renderer/features/tools/enterprise/SchemaValidator'))
  },
  {
    id: 'json.reconcile', group: 'json', name: 'Data Reconciliation',
    description: messageKey('Compare records by ID to find differences, duplicates and missing entries'),
    keywords: ['reconcile', 'reconciliation', 'migration', 'data', 'database', 'etl', 'compare', 'audit', 'enterprise'],
    icon: Database,
    ...createToolLoader(() => import('@renderer/features/tools/enterprise/DataReconciliation'))
  },
  {
    id: 'network.openapi', group: 'network', name: 'API Contract Review',
    description: messageKey('Review OpenAPI operations and compare release changes before publishing'),
    keywords: ['openapi', 'swagger', 'api', 'contract', 'breaking', 'release', 'compatibility', 'enterprise'],
    icon: GitCompare,
    ...createToolLoader(() => import('@renderer/features/tools/enterprise/ContractReview'))
  },
  {
    id: 'text.logs', group: 'text', name: 'Structured Log Explorer',
    description: messageKey('Filter JSONL logs by trace and service; inspect errors and latency percentiles'),
    keywords: ['logs', 'jsonl', 'ndjson', 'pino', 'incident', 'trace', 'latency', 'p95', 'observability', 'enterprise'],
    icon: Search,
    ...createToolLoader(() => import('@renderer/features/tools/enterprise/LogExplorer'))
  },
  {
    id: 'security.env', group: 'security', name: 'Environment Compare',
    description: messageKey('Compare .env configuration without exposing values in the report'),
    keywords: ['env', 'dotenv', 'environment', 'config', 'staging', 'production', 'release', 'deployment', 'compare'],
    icon: Shield,
    ...createToolLoader(() => import('@renderer/features/tools/security/EnvironmentCompare'))
  },
  {
    id: 'network.local-domains',
    group: 'network',
    name: 'Local Domains',
    description: messageKey('Configure local domain names, port forwarding and HTTPS'),
    keywords: ['dns', 'hosts', 'domain', 'localhost', 'reverse proxy', 'https', 'ssl', 'certificate', 'mkcert'],
    icon: Globe,
    ...createToolLoader(() => import('@renderer/features/tools/network/LocalDomainsTool'))
  },
  {
    id: 'text.lorem', group: 'text', name: 'Lorem Text',
    description: messageKey('Generate placeholder words, sentences and paragraphs for layouts'),
    keywords: ['lorem', 'ipsum', 'placeholder', 'dummy', 'text', 'paragraph', 'sentence'],
    icon: WrapText,
    ...createToolLoader(() => import('@renderer/features/tools/text/LoremTool'))
  },
  {
    id: 'time.timestamp', group: 'time', name: 'Timestamp Converter',
    description: messageKey('Convert Unix timestamps and ISO 8601 dates across time zones'),
    keywords: ['timestamp', 'unix', 'epoch', 'seconds', 'milliseconds', 'iso', 'timezone', 'utc', 'date'],
    icon: CalendarClock,
    ...createToolLoader(() => import('@renderer/features/tools/time/TimestampTool'))
  },
  {
    id: 'time.date', group: 'time', name: 'Date Calculator',
    description: messageKey('Add durations to dates and calculate date and time differences'),
    keywords: ['date', 'time', 'duration', 'difference', 'days', 'months', 'years', 'calculate'],
    icon: CalendarClock,
    ...createToolLoader(() => import('@renderer/features/tools/time/DateTool'))
  },
  {
    id: 'network.mock-api', group: 'network', name: 'Mock API',
    description: messageKey('Run a local API server with conditional responses configured in YAML'),
    keywords: ['mock', 'api', 'server', 'endpoint', 'frontend', 'backend', 'response', 'header', 'filter', 'yaml', 'cors'],
    icon: Server,
    ...createToolLoader(() => import('@renderer/features/tools/network/MockApiTool'))
  },
  {
    id: 'design.color', group: 'design', name: 'Color Picker',
    description: messageKey('Select screen colors and copy HEX, RGB, HSL or HSV values'),
    keywords: ['color', 'colour', 'picker', 'eyedropper', 'hex', 'rgb', 'hsl', 'hsv', 'palette', 'screen', 'desktop', 'repick'],
    icon: Pipette,
    ...createToolLoader(() => import('@renderer/features/tools/design/ColorPicker'))
  },
  {
    id: 'json.studio',
    group: 'json',
    name: 'JSON Studio',
    description: messageKey('Format, validate, and explore JSON as a tree'),
    keywords: ['json', 'format', 'beautify', 'minify', 'validate', 'tree', 'pretty'],
    icon: Braces,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonStudio'))
  },
  {
    id: 'json.diff',
    group: 'json',
    name: 'JSON Diff',
    description: messageKey('Compare JSON by line or structure and highlight differences'),
    keywords: ['json', 'diff', 'compare', 'delta', 'lines', 'tree'],
    icon: GitCompare,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonDiff'))
  },
  {
    id: 'json.path',
    group: 'json',
    name: 'JSONPath',
    description: messageKey('Query JSON with a JSONPath subset'),
    keywords: ['json', 'jsonpath', 'query', 'path', 'filter'],
    icon: Search,
    ...createToolLoader(() => import('@renderer/features/tools/json/JsonPathTool'))
  },
  {
    id: 'yaml.studio',
    group: 'yaml',
    name: 'YAML Studio',
    description: messageKey('Format, validate YAML and convert to JSON'),
    keywords: ['yaml', 'yml', 'format', 'validate', 'convert', 'tree'],
    icon: FileCode2,
    ...createToolLoader(() => import('@renderer/features/tools/yaml/YamlStudio'))
  },
  {
    id: 'yaml.diff',
    group: 'yaml',
    name: 'YAML Diff',
    description: messageKey('Compare YAML by line or structure and highlight differences'),
    keywords: ['yaml', 'diff', 'compare', 'lines', 'tree'],
    icon: GitCompare,
    ...createToolLoader(() => import('@renderer/features/tools/yaml/YamlDiff'))
  },
  {
    id: 'markup.html',
    group: 'markup',
    name: 'HTML Studio',
    description: messageKey('Format, minify, and structurally check HTML'),
    keywords: ['html', 'format', 'beautify', 'minify', 'validate', 'markup'],
    icon: Code2,
    ...createToolLoader(() => import('@renderer/features/tools/markup/HtmlStudio'))
  },
  {
    id: 'markup.xml',
    group: 'markup',
    name: 'XML Studio',
    description: messageKey('Format, minify, and validate well-formed XML'),
    keywords: ['xml', 'format', 'beautify', 'minify', 'validate', 'well-formed'],
    icon: FileType2,
    ...createToolLoader(() => import('@renderer/features/tools/markup/XmlStudio'))
  },
  {
    id: 'sql.studio',
    group: 'sql',
    name: 'SQL Studio',
    description: messageKey('Format SQL and check syntax for MySQL, PostgreSQL, SQL Server and SQLite'),
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
    description: messageKey('Convert between JSON and YAML'),
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
    description: messageKey('Convert PNG, JPEG and WebP images; adjust size and quality'),
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
    description: messageKey('Encode and decode text with standard or URL-safe Base64'),
    keywords: ['base64', 'encode', 'decode', 'url-safe'],
    icon: Binary,
    ...createToolLoader(() => import('@renderer/features/tools/base64/Base64Codec'))
  },
  {
    id: 'base64.image',
    group: 'base64',
    name: 'Base64 Image',
    description: messageKey('Convert images to and from Base64 with a preview'),
    keywords: ['base64', 'image', 'png', 'jpeg', 'dataurl'],
    icon: ImageIcon,
    ...createToolLoader(() => import('@renderer/features/tools/base64/Base64Image'))
  },
  {
    id: 'security.random',
    group: 'security',
    name: 'Secure Random',
    description: messageKey('Generate random bytes, passwords and UUIDs using cryptographic randomness'),
    keywords: ['random', 'password', 'uuid', 'csprng', 'secure', 'token'],
    icon: Shield,
    ...createToolLoader(() => import('@renderer/features/tools/security/SecureRandom'))
  },
  {
    id: 'security.keygen',
    group: 'security',
    name: 'Key Generator',
    description: messageKey('Generate RSA, ECDSA, Ed25519 and X25519 key pairs in PEM or OpenSSH formats'),
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
    description: messageKey('Calculate MD5, SHA-1, SHA-256 and SHA-512 hashes for text'),
    keywords: ['hash', 'md5', 'sha', 'sha256', 'checksum'],
    icon: Fingerprint,
    ...createToolLoader(() => import('@renderer/features/tools/security/HashTool'))
  },
  {
    id: 'security.hmac',
    group: 'security',
    name: 'HMAC',
    description: messageKey('Calculate SHA-based HMAC values'),
    keywords: ['hmac', 'mac', 'sha256', 'sign'],
    icon: KeyRound,
    ...createToolLoader(() => import('@renderer/features/tools/security/HmacTool'))
  },
  {
    id: 'security.jwt',
    group: 'security',
    name: 'JWT',
    description: messageKey('Decode JWTs, verify HS/RS/ES signatures and sign HS tokens'),
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
    description: messageKey('Encrypt and decrypt text with PBKDF2 and AES-256-GCM'),
    keywords: ['aes', 'gcm', 'encrypt', 'decrypt', 'password'],
    icon: Lock,
    ...createToolLoader(() => import('@renderer/features/tools/security/AesTool'))
  },
  {
    id: 'network.url',
    group: 'network',
    name: 'URL Tools',
    description: messageKey('Parse, encode, and decode URLs'),
    keywords: ['url', 'encode', 'decode', 'query', 'parse'],
    icon: Network,
    ...createToolLoader(() => import('@renderer/features/tools/network/UrlTools'))
  },
  {
    id: 'network.ip',
    group: 'network',
    name: 'IP / CIDR',
    description: messageKey('Inspect IPv4 and IPv6 addresses and calculate CIDR ranges'),
    keywords: ['ip', 'ipv4', 'ipv6', 'cidr', 'private'],
    icon: Globe,
    ...createToolLoader(() => import('@renderer/features/tools/network/IpTools'))
  },
  {
    id: 'network.dns',
    group: 'network',
    name: 'DNS Lookup',
    description: messageKey('DNS records, address TTL and reverse IP lookup'),
    keywords: ['dns', 'resolve', 'a', 'aaaa', 'mx', 'txt', 'srv', 'soa', 'ptr', 'ttl', 'reverse', 'lookup'],
    icon: Server,
    ...createToolLoader(() => import('@renderer/features/tools/network/DnsLookup'))
  },
  {
    id: 'network.http',
    group: 'network',
    name: 'HTTP Client',
    description: messageKey('Send HTTP requests and export commands for curl or PowerShell'),
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
    description: messageKey('Inspect listening ports and stop selected processes'),
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
    description: messageKey('Manage SSH keys and host configuration; test TCP connectivity'),
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
    description: messageKey('Calculate file checksums on your device'),
    keywords: ['file', 'hash', 'sha256', 'checksum', 'md5'],
    icon: File,
    ...createToolLoader(() => import('@renderer/features/tools/file/FileHash'))
  },
  {
    id: 'file.lineendings',
    group: 'file',
    name: 'Line Endings',
    description: messageKey('Detect and convert LF / CRLF / CR'),
    keywords: ['crlf', 'lf', 'newline', 'line ending', 'dos', 'unix'],
    icon: WrapText,
    ...createToolLoader(() => import('@renderer/features/tools/file/LineEndings'))
  },
  {
    id: 'text.regex',
    group: 'text',
    name: 'Regex Tester',
    description: messageKey('Test JavaScript regular expressions; match, replace and split text'),
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
    description: messageKey('Inspect cron expressions and calculate upcoming runs with 5 or 6 fields'),
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
    description: messageKey('Extract English and Vietnamese text from images, PDFs or screen regions offline'),
    keywords: ['ocr', 'scan', 'text', 'image', 'pdf', 'screenshot', 'capture', 'vietnamese', 'extract'],
    icon: ScanText,
    ...createToolLoader(() => import('@renderer/features/tools/text/OcrTool'))
  },
  {
    id: 'text.clipboard',
    group: 'text',
    name: 'Clipboard Manager',
    description: messageKey('Manage clipboard history, pin entries and transform text in a quick window'),
    keywords: ['clipboard', 'history', 'copy', 'paste', 'snippet', 'pin', 'quick', 'widget'],
    icon: ClipboardList,
    ...createToolLoader(() => import('@renderer/features/tools/text/ClipboardManagerTool'))
  },
  {
    id: 'text.qr',
    group: 'text',
    name: 'QR Code',
    description: messageKey('Generate QR codes from text or read content from QR images'),
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
    description: messageKey('Browse and manage files in an encrypted vault'),
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
    description: messageKey('Organize encrypted notes in the default Secret Box'),
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
    description: messageKey('Theme, session history, shortcuts'),
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
    description: messageKey('Local processing notes and shortcuts'),
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

export function searchTools(query: string, locale: import('@shared/i18n/locales').LocaleId = 'en'): ToolDefinition[] {
  const normalize = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
  const q = normalize(query.trim())
  if (!q) return tools
  return tools.filter(tool => [tool.name, tool.description, translate(locale, tool.name), translate(locale, tool.description), translate(locale, toolGroups.find(group => group.id === tool.group)?.name ?? tool.group), tool.group, ...tool.keywords].some(text => normalize(text).includes(q)))
}
