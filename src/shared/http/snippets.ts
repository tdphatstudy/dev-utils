import type { HttpRequestPayload } from './types'
import { encodeBase64 } from '../base64'
import { validateHttpPayload } from './validation'

export type SnippetId =
  | 'curl'
  | 'powershell'
  | 'fetch'
  | 'axios'
  | 'python'
  | 'httpie'
  | 'go'
  | 'java'

export interface SnippetDef {
  id: SnippetId
  label: string
  language: string
}

export const SNIPPETS: SnippetDef[] = [
  { id: 'curl', label: 'cURL (Bash)', language: 'bash' },
  { id: 'powershell', label: 'PowerShell 7', language: 'powershell' },
  { id: 'fetch', label: 'JavaScript fetch', language: 'javascript' },
  { id: 'axios', label: 'Axios (Node.js)', language: 'javascript' },
  { id: 'python', label: 'Python requests', language: 'python' },
  { id: 'httpie', label: 'HTTPie', language: 'bash' },
  { id: 'go', label: 'Go net/http', language: 'go' },
  { id: 'java', label: 'Java HttpClient', language: 'java' }
]

export function generateSnippet(id: SnippetId, req: HttpRequestPayload): string {
  if (validateHttpPayload(req)) return ''
  const url = new URL(req.url)
  url.hash = ''
  req = { ...req, url: url.href }
  switch (id) {
    case 'curl':
      return toCurl(req)
    case 'powershell':
      return toPowerShell(req)
    case 'fetch':
      return toFetch(req)
    case 'axios':
      return toAxios(req)
    case 'python':
      return toPython(req)
    case 'httpie':
      return toHttpie(req)
    case 'go':
      return toGo(req)
    case 'java':
      return toJava(req)
    default:
      return ''
  }
}

function esc(s: string): string {
  return s.replace(/'/g, `'\\''`)
}

function psLiteral(s: string): string {
  if (/[\u2018\u2019\u201c\u201d\r\n]/.test(s)) return `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodeBase64(s)}'))`
  return `'${s.replace(/'/g, "''")}'`
}

function hasBody(req: HttpRequestPayload): boolean {
  return req.body !== undefined && req.method !== 'GET' && req.method !== 'HEAD'
}

function headerEntries(headers: Record<string, string>): [string, string][] {
  return Object.entries(headers)
}

function toCurl(req: HttpRequestPayload): string {
  const parts = [`curl -X ${req.method} '${esc(req.url)}' --max-time ${(req.timeoutMs ?? 30000) / 1000}`]
  for (const [k, v] of headerEntries(req.headers)) {
    parts.push(`  -H '${esc(`${k}: ${v}`)}'`)
  }
  if (hasBody(req)) {
    if (req.body!.includes('\0')) {
      parts.push('  --data-binary @-')
      return `# GNU base64; on macOS replace --decode with -D\nprintf '%s' '${encodeBase64(req.body!)}' | base64 --decode | ${parts.join(' \\\n')}`
    }
    parts.push(`  --data-raw '${esc(req.body!)}'`)
  }
  return parts.join(' \\\n')
}

function toPowerShell(req: HttpRequestPayload): string {
  const headers =
    Object.keys(req.headers).length > 0
      ? `@{\n${headerEntries(req.headers)
          .map(([k, v]) => `  ${psLiteral(k)} = ${psLiteral(v)}`)
          .join('\n')}\n}`
      : `@{}`
  const lines = [
    '# PowerShell 7',
    `$headers = ${headers}`,
    `$uri = ${psLiteral(req.url)}`
  ]
  if (hasBody(req)) {
    lines.push(`$body = [Convert]::FromBase64String('${encodeBase64(req.body!)}')`)
    lines.push(
      `Invoke-RestMethod -Method ${req.method} -Uri $uri -Headers $headers -Body $body -TimeoutSec ${Math.ceil((req.timeoutMs ?? 30000) / 1000)} -MaximumRedirection 0 -SkipHttpErrorCheck`
    )
  } else {
    lines.push(`Invoke-RestMethod -Method ${req.method} -Uri $uri -Headers $headers -TimeoutSec ${Math.ceil((req.timeoutMs ?? 30000) / 1000)} -MaximumRedirection 0 -SkipHttpErrorCheck`)
  }
  return lines.join('\n')
}

function toFetch(req: HttpRequestPayload): string {
  const headersJson = `JSON.parse(${JSON.stringify(JSON.stringify(req.headers))})`
  const opts: string[] = [`  method: '${req.method}'`, `  headers: ${headersJson}`, "  redirect: 'manual'", `  signal: AbortSignal.timeout(${req.timeoutMs ?? 30000})`]
  if (hasBody(req)) {
    opts.push(`  body: ${JSON.stringify(req.body)}`)
  }
  return `const res = await fetch(${JSON.stringify(req.url)}, {\n${opts.join(',\n')}\n})\nconst data = await res.text()\nconsole.log(res.status, data)`
}

function toAxios(req: HttpRequestPayload): string {
  const cfg: Record<string, unknown> = {
    method: req.method.toLowerCase(),
    url: req.url,
    headers: req.headers
  }
  cfg.timeout = req.timeoutMs ?? 30000
  cfg.maxRedirects = 0
  if (hasBody(req)) {
    cfg.data = req.body
  }
  return `import axios from 'axios'\n\nconst config = JSON.parse(${JSON.stringify(JSON.stringify(cfg))})\nconst res = await axios({ ...config, validateStatus: () => true })\nconsole.log(res.status, res.data)`
}

function toPython(req: HttpRequestPayload): string {
  const headers = JSON.stringify(req.headers, null, 2)
  const lines = [
    'import requests',
    ...(hasBody(req) ? ['import base64'] : []),
    '',
    `url = ${JSON.stringify(req.url)}`,
    `headers = ${headers}`
  ]
  if (hasBody(req)) {
    lines.push(`data = base64.b64decode('${encodeBase64(req.body!)}')`)
    lines.push(
      `res = requests.request(${JSON.stringify(req.method)}, url, headers=headers, data=data, allow_redirects=False, timeout=${(req.timeoutMs ?? 30000) / 1000})`
    )
  } else {
    lines.push(
      `res = requests.request(${JSON.stringify(req.method)}, url, headers=headers, allow_redirects=False, timeout=${(req.timeoutMs ?? 30000) / 1000})`
    )
  }
  lines.push('print(res.status_code)', 'print(res.text)')
  return lines.join('\n')
}

function toHttpie(req: HttpRequestPayload): string {
  const parts = [`http --timeout=${(req.timeoutMs ?? 30000) / 1000} ${req.method} '${esc(req.url)}'`]
  for (const [k, v] of headerEntries(req.headers)) {
    parts.push(`'${esc(`${k}:${v}`)}'`)
  }
  if (hasBody(req)) {
    if (req.body!.includes('\0')) return `# GNU base64; on macOS replace --decode with -D\nprintf '%s' '${encodeBase64(req.body!)}' | base64 --decode | ${parts.join(' ')}`
    return `printf '%s' '${esc(req.body!)}' | ${parts.join(' ')}`
  }
  return parts.join(' \\\n  ')
}

function toGo(req: HttpRequestPayload): string {
  const headerLines = headerEntries(req.headers)
    .map(([k, v]) => `\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
    .join('\n')
  const bodySetup =
    hasBody(req)
      ? `body, err := base64.StdEncoding.DecodeString("${encodeBase64(req.body!)}")\n\tif err != nil { panic(err) }\n\treq, err := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(req.url)}, bytes.NewReader(body))`
      : `req, err := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(req.url)}, nil)`

  return `package main

import (
\t"fmt"
\t"io"
\t"net/http"
${hasBody(req) ? '\t"bytes"\n\t"encoding/base64"\n' : ''}\t"time"
)

func main() {
\t${bodySetup}
\tif err != nil {
\t\tpanic(err)
\t}
${headerLines}
\tclient := &http.Client{Timeout: ${req.timeoutMs ?? 30000} * time.Millisecond, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
\tres, err := client.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer res.Body.Close()
\tb, _ := io.ReadAll(res.Body)
\tfmt.Println(res.StatusCode, string(b))
}`
}

function toJava(req: HttpRequestPayload): string {
  const headerLines = headerEntries(req.headers)
    .map(
      ([k, v]) =>
        `            .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`
    )
    .join('\n')
  const bodyPart =
    hasBody(req)
      ? `.method("${req.method}", HttpRequest.BodyPublishers.ofByteArray(Base64.getDecoder().decode("${encodeBase64(req.body!)}")))`
      : `.method("${req.method}", HttpRequest.BodyPublishers.noBody())`

  return `import java.net.URI;
import java.net.http.*;
import java.time.Duration;
${hasBody(req) ? 'import java.util.Base64;\n' : ''}

public class Main {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
        HttpRequest request = HttpRequest.newBuilder()
            .timeout(Duration.ofMillis(${req.timeoutMs ?? 30000}))
            .uri(URI.create(${JSON.stringify(req.url)}))
${headerLines}
            ${bodyPart}
            .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.statusCode());
        System.out.println(response.body());
    }
}`
}
