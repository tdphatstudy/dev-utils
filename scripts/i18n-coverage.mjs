import ts from 'typescript'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const copyAttributes = new Set(['label', 'title', 'aria-label', 'placeholder', 'heading', 'purpose', 'limits', 'caption', 'action', 'description', 'emptyTitle', 'emptyDescription', 'slowDetail', 'body', 'summary', 'leftLabel', 'rightLabel', 'confirmLabel', 'submitLabel', 'headers', 'labels'])
const copyProperties = new Set(['label', 'title', 'description', 'purpose', 'emptyTitle', 'emptyDescription', 'slowDetail'])
const technicalTokens = new Set(['DevFusion', 'JSON', 'YAML', 'SQL', 'HTML', 'XML', 'HTML / XML', 'Base64', 'HEX', 'RGB', 'HSL', 'HSV', 'UTF-8', 'ASCII', 'Unicode', 'CRLF', 'LF', 'CR', 'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'HTTP', 'HTTPS', 'SSH', 'TCP', 'UDP', 'DNS', 'TLS', 'JWT', 'HMAC', 'AES', 'PNG', 'JPEG', 'WebP', 'GIF', 'BMP', 'ICO', 'SVG', 'PDF', 'OCR', 'UTC', 'ISO 8601', 'ISO', 'Unix', 'CORS', 'UUID', 'ULID', 'JSON Schema', 'OpenAPI', 'API', 'KiB', 'MiB', 'MB', 'ms', 'px', 'B', 'RPS', 'P50', 'P95', 'P99', 'true', 'false', 'null', 'Enter', 'Esc', 'Tab', 'Alt', 'Ctrl', 'Shift', 'Meta', 'F12', 'F11', 'F5', '⌘', '⌥'])
export const isTechnicalCopy = value => {
  if (!/[a-zA-Z\p{L}]/u.test(value) || technicalTokens.has(value) || ['A:', 'B:', 'SQL Studio', 'Liquid Glass', 'Base64 Codec', 'Draft 7', 'Draft 2020-12'].includes(value)) return true
  if (/^(?:https?:\/\/|localhost(?::\d+)?$|[a-z]+:\/\/)/.test(value) || /^(?:Mod|Ctrl|Alt|Shift|Meta)(?:\+[A-Za-z\d]+)+$/.test(value)) return true
  if (/^\/(?:[^\s/]+\/)*[^\s/]*$/.test(value) || /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-][\d:]+)$/.test(value)) return true
  if (/^(?:\{[a-zA-Z][a-zA-Z\d]*\}|[\s·:/%.,\dv×→-])+$/.test(value) || /^-----BEGIN [A-Z ]+-----[\s…]+-----END [A-Z ]+-----$/.test(value)) return true
  if (/^[\[{]/.test(value)) { try { JSON.parse(value); return true } catch {} }
  return /^(?:[A-Z][A-Z\d_-]*|[a-z][a-z\d_.-]*)$/.test(value) && !/[aeiou]/i.test(value)
}
const normalized = value => value.replace(/\s+/g, ' ').trim()
const tagName = element => element?.openingElement?.tagName?.getText() ?? element?.tagName?.getText()

export function templateMessage(node) {
  let message = node.head.text
  const values = []
  for (const [index, span] of node.templateSpans.entries()) {
    const expression = span.expression
    const base = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : `value${index + 1}`
    const name = values.some(value => value.name === base) ? `${base}${index + 1}` : base
    values.push({ name, expression: expression.getText() })
    message += `{${name}}` + span.literal.text
  }
  return { message, values }
}

export function collectSourceMessages(source, filename = 'component.tsx') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  const add = (node, text, kind, localized) => {
    const message = normalized(text)
    if (!message || isTechnicalCopy(message)) return
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
    found.push({ message, kind, localized, line, start: node.getStart(ast), end: node.end })
  }
  const inTranslation = node => ts.isCallExpression(node) && ['t', 'uiText', 'translate', 'messageKey'].includes(node.expression.getText(ast))
  function expressionText(node, localized = false) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text, 'expression', localized)
    else if (ts.isTemplateExpression(node)) add(node, templateMessage(node).message, 'template', localized)
    else if (ts.isConditionalExpression(node)) { expressionText(node.whenTrue, localized); expressionText(node.whenFalse, localized) }
    else if (ts.isParenthesizedExpression(node)) expressionText(node.expression, localized)
    else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(element => expressionText(element, localized))
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) expressionText(node.right, localized)
  }
  function visit(node) {
    if (inTranslation(node)) {
      const argument = node.arguments[node.expression.getText(ast) === 'translate' ? 1 : 0]
      if (argument) expressionText(argument, true)
    } else if (ts.isJsxText(node) && !['code', 'kbd', 'pre'].includes(tagName(node.parent))) add(node, node.text, 'text', false)
    else if (ts.isJsxAttribute(node) && copyAttributes.has(node.name.getText(ast)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) add(node.initializer, node.initializer.text, 'attribute', false)
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) expressionText(node.initializer.expression, false)
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression && !['code', 'kbd', 'pre'].includes(tagName(node.parent))) expressionText(node.expression)
    else if (ts.isPropertyAssignment(node) && copyProperties.has(node.name.getText(ast)) && ts.isStringLiteral(node.initializer)) add(node.initializer, node.initializer.text, 'property', false)
    else if (ts.isCallExpression(node) && /^(?:setError|setNotice|setStatus|setMessage|setWarning|alert|confirm)$/.test(node.expression.getText(ast)) && node.arguments[0]) expressionText(node.arguments[0], true)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return found.filter((item, index) => found.findIndex(other => other.start === item.start && other.message === item.message) === index)
}

export async function readCatalogRows(root = repository) {
  const rows = []
  const pending = ['catalog.ts'], visited = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (visited.has(file)) continue
    visited.add(file)
    const ast = ts.createSourceFile(file, await readFile(join(root, 'src/shared/i18n', file), 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = node => {
      if (ts.isArrayLiteralExpression(node) && node.elements.length === 13 && node.elements.every(ts.isStringLiteral)) rows.push({ file, values: node.elements.map(value => value.text) })
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^\.\/[-a-z]+$/.test(node.moduleSpecifier.text)) pending.push(node.moduleSpecifier.text.slice(2) + '.ts')
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return rows
}

async function sourceFiles(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : /\.(?:tsx|ts)$/.test(entry.name) && !/\.(?:test|worker)\./.test(entry.name) ? [join(directory, entry.name)] : []))).flat()
}

export async function auditSourceCoverage(root = repository) {
  const rows = await readCatalogRows(root), keys = new Set(rows.map(row => row.values[0])), occurrences = []
  for (const file of await sourceFiles(join(root, 'src/renderer/src'))) {
    for (const item of collectSourceMessages(await readFile(file, 'utf8'), file)) occurrences.push({ ...item, file: relative(root, file).replaceAll('\\', '/'), catalogued: keys.has(item.message) })
  }
  return { rows, occurrences, missing: occurrences.filter(item => !item.catalogued), untranslated: occurrences.filter(item => item.catalogued && !item.localized) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditSourceCoverage()
  if (process.argv.includes('--inventory')) {
    const grouped = {}
    for (const item of result.missing) {
      const group = item.file.match(/features\/tools\/([^/]+)/)?.[1] ?? (item.file.includes('privatebox') || item.file.includes('/keep/') ? 'vault' : item.file.includes('/quick/') || item.file.includes('/ocr-helper/') ? 'quick' : 'shell')
      grouped[group] ??= []
      if (!grouped[group].some(entry => entry.message === item.message)) grouped[group].push({ message: item.message, file: item.file, line: item.line, kind: item.kind })
    }
    await writeFile(join(repository, 'docs/.review-i18n-inventory.json'), JSON.stringify(grouped, null, 2) + '\n')
    console.log(JSON.stringify(Object.fromEntries(Object.entries(grouped).map(([group, entries]) => [group, entries.length]))))
  } else {
    for (const item of result.missing) console.error(`${item.file}:${item.line} Missing interface translation: ${item.message}`)
    for (const item of result.untranslated) console.error(`${item.file}:${item.line} Interface message is not localized: ${item.message}`)
    if (result.missing.length || result.untranslated.length) process.exitCode = 1
    else console.log(`PASS interface source coverage (${result.occurrences.length} messages, ${result.rows.length} catalog rows).`)
  }
}
