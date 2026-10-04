export interface ParsedUrl {
  href: string
  protocol: string
  username: string
  password: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  origin: string
  query: Record<string, string[]>
}

export function parseUrl(input: string): { ok: true; value: ParsedUrl } | { ok: false; error: string } {
  try {
    const u = new URL(input)
    const query: Record<string, string[]> = Object.create(null)
    u.searchParams.forEach((value, key) => {
      if (!query[key]) query[key] = []
      query[key]!.push(value)
    })
    return {
      ok: true,
      value: {
        href: u.href,
        protocol: u.protocol,
        username: u.username,
        password: u.password,
        host: u.host,
        hostname: u.hostname,
        port: u.port,
        pathname: u.pathname,
        search: u.search,
        hash: u.hash,
        origin: u.origin,
        query
      }
    }
  } catch {
    return { ok: false, error: 'Enter an absolute URL including its scheme, e.g. https://example.com/path' }
  }
}

export function encodeUriComponentSafe(input: string): string {
  return encodeURIComponent(input)
}

export type UriEncoding = 'component' | 'url' | 'form'

export function encodeUri(input: string, encoding: UriEncoding): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const text = encoding === 'url' ? encodeURI(input) : encodeURIComponent(input)
    return { ok: true, text: encoding === 'form' ? text.replace(/%20/g, '+').replace(/[!'()~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) : text }
  } catch {
    return { ok: false, error: 'Cannot encode an unpaired Unicode surrogate. Remove or replace the invalid character.' }
  }
}

export function decodeUri(input: string, encoding: UriEncoding): { ok: true; text: string } | { ok: false; error: string } {
  try {
    return { ok: true, text: encoding === 'url' ? decodeURI(input) : decodeURIComponent(encoding === 'form' ? input.replace(/\+/g, ' ') : input) }
  } catch {
    return { ok: false, error: 'Invalid percent encoding. Use % followed by two hexadecimal digits and valid UTF-8 bytes.' }
  }
}

export function decodeUriComponentSafe(
  input: string
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    return { ok: true, text: decodeURIComponent(input.replace(/\+/g, ' ')) }
  } catch {
    return { ok: false, error: 'Invalid URI component' }
  }
}
