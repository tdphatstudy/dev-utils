import type { HttpRequestPayload } from './types'

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
  { id: 'curl', label: 'cURL', language: 'bash' },
  { id: 'powershell', label: 'PowerShell', language: 'powershell' },
  { id: 'fetch', label: 'JavaScript fetch', language: 'javascript' },
  { id: 'axios', label: 'Axios', language: 'javascript' },
  { id: 'python', label: 'Python requests', language: 'python' },
  { id: 'httpie', label: 'HTTPie', language: 'bash' },
  { id: 'go', label: 'Go net/http', language: 'go' },
  { id: 'java', label: 'Java HttpClient', language: 'java' }
]

export function generateSnippet(id: SnippetId, req: HttpRequestPayload): string {
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
  return s.replace(/\\/g, '\\\\').replace(/'/g, `'\\''`)
}

function escDq(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function headerEntries(headers: Record<string, string>): [string, string][] {
  return Object.entries(headers)
}

function toCurl(req: HttpRequestPayload): string {
  const parts = [`curl -X ${req.method} '${esc(req.url)}'`]
  for (const [k, v] of headerEntries(req.headers)) {
    parts.push(`  -H '${esc(`${k}: ${v}`)}'`)
  }
  if (req.body) {
    parts.push(`  -d '${esc(req.body)}'`)
  }
  return parts.join(' \\\n')
}

function toPowerShell(req: HttpRequestPayload): string {
  const headers =
    Object.keys(req.headers).length > 0
      ? `@{\n${headerEntries(req.headers)
          .map(([k, v]) => `  "${escDq(k)}" = "${escDq(v)}"`)
          .join('\n')}\n}`
      : `@{}`
  const lines = [
    `$headers = ${headers}`,
    `$uri = "${escDq(req.url)}"`
  ]
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    lines.push(`$body = @'\n${req.body}\n'@`)
    lines.push(
      `Invoke-RestMethod -Method ${req.method} -Uri $uri -Headers $headers -Body $body`
    )
  } else {
    lines.push(`Invoke-RestMethod -Method ${req.method} -Uri $uri -Headers $headers`)
  }
  return lines.join('\n')
}

function toFetch(req: HttpRequestPayload): string {
  const headersJson = JSON.stringify(req.headers, null, 2)
  const opts: string[] = [`  method: '${req.method}'`, `  headers: ${headersJson}`]
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
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
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    cfg.data = req.body
  }
  return `import axios from 'axios'\n\nconst res = await axios(${JSON.stringify(cfg, null, 2)})\nconsole.log(res.status, res.data)`
}

function toPython(req: HttpRequestPayload): string {
  const headers = JSON.stringify(req.headers, null, 2)
  const lines = [
    'import requests',
    '',
    `url = ${JSON.stringify(req.url)}`,
    `headers = ${headers}`
  ]
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    lines.push(`data = ${JSON.stringify(req.body)}`)
    lines.push(
      `res = requests.request(${JSON.stringify(req.method)}, url, headers=headers, data=data)`
    )
  } else {
    lines.push(
      `res = requests.request(${JSON.stringify(req.method)}, url, headers=headers)`
    )
  }
  lines.push('print(res.status_code)', 'print(res.text)')
  return lines.join('\n')
}

function toHttpie(req: HttpRequestPayload): string {
  const parts = [`http ${req.method} ${req.url}`]
  for (const [k, v] of headerEntries(req.headers)) {
    parts.push(`${k}:"${v.replace(/"/g, '\\"')}"`)
  }
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    const ct = Object.entries(req.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
    if (ct?.includes('json')) {
      return `${parts.join(' ')}\n<<< '${esc(req.body)}'`
    }
    return `${parts.join(' ')}\n<<< '${esc(req.body)}'`
  }
  return parts.join(' \\\n  ')
}

function toGo(req: HttpRequestPayload): string {
  const headerLines = headerEntries(req.headers)
    .map(([k, v]) => `\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
    .join('\n')
  const bodySetup =
    req.body && req.method !== 'GET' && req.method !== 'HEAD'
      ? `body := strings.NewReader(${JSON.stringify(req.body)})\n\treq, err := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(req.url)}, body)`
      : `req, err := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(req.url)}, nil)`

  return `package main

import (
\t"fmt"
\t"io"
\t"net/http"
\t"strings"
)

func main() {
\t${bodySetup}
\tif err != nil {
\t\tpanic(err)
\t}
${headerLines}
\tres, err := http.DefaultClient.Do(req)
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
    req.body && req.method !== 'GET' && req.method !== 'HEAD'
      ? `.method("${req.method}", HttpRequest.BodyPublishers.ofString(${JSON.stringify(req.body)}))`
      : `.method("${req.method}", HttpRequest.BodyPublishers.noBody())`

  return `import java.net.URI;
import java.net.http.*;

public class Main {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
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
