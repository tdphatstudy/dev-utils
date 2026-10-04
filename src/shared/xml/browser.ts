import { validateXml, type MarkupResult } from './index'
import { markupError } from '../markup/tokens'

/** Browser-only well-formedness check. The detached document is never inserted
 * into the page; we do not execute scripts or resolve schema/DTD resources. */
export function validateXmlDocument(input: string): MarkupResult {
  const structure = validateXml(input)
  if (!structure.ok) return structure
  const doc = new DOMParser().parseFromString(input, 'application/xml')
  // Chromium uses XHTML for its error node; Firefox uses a parsererror namespace.
  const error = Array.from(doc.getElementsByTagName('parsererror')).find((node) =>
    ['http://www.w3.org/1999/xhtml', 'http://www.mozilla.org/newlayout/xml/parsererror.xml'].includes(node.namespaceURI ?? '') &&
    /error on line|XML Parsing Error/i.test(node.textContent ?? '')
  )
  if (!error) return structure
  const message = error.textContent ?? 'Invalid XML document'
  const location = /line\s+(\d+)\s+(?:at\s+)?column\s+(\d+)/i.exec(message)
  const line = location ? Number(location[1]) : 1
  const column = location ? Number(location[2]) : 1
  const lines = input.split('\n')
  const offset = lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0) + Math.max(0, column - 1)
  const reason = message.match(/(?:error on line[^:]*:\s*)(.*?)(?=Below is a rendering|$)/is)?.[1]?.trim() ?? 'Invalid XML syntax, entity or namespace declaration.'
  return markupError(input, Math.min(input.length, offset), reason, 'Check attribute quotes, entity references (&amp;) and namespace declarations.')
}
