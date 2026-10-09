import ts from 'typescript'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { readCatalogRows, templateMessage } from './i18n-coverage.mjs'

// One-time, source-based migration. Touch only known static interface messages;
// never inspect a live DOM, user input, editor values, routes or protocol strings.
const root = resolve('src/renderer/src')
const keys = new Set((await readCatalogRows()).map(row => row.values[0]))
const include = process.argv.find(value => value.startsWith('--include='))?.slice(10)?.split(',')
const exclude = process.argv.find(value => value.startsWith('--exclude='))?.slice(10)?.split(',') ?? []
const attributes = new Set(['label', 'title', 'aria-label', 'placeholder', 'heading', 'purpose', 'limits', 'caption', 'action', 'description', 'emptyTitle', 'emptyDescription', 'slowDetail', 'body', 'summary', 'leftLabel', 'rightLabel', 'confirmLabel', 'submitLabel', 'headers', 'labels'])
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
async function files(directory) { return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [join(directory, entry.name)] : []))).flat() }
let count = 0, changedFiles = 0
for (const file of await files(root)) {
  const path = file.replaceAll('\\', '/')
  if (include && !include.some(part => path.includes(part)) || exclude.some(part => path.includes(part))) continue
  const source = await readFile(file, 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), edits = []
  const replace = (node, text) => edits.push({ start: node.getStart(ast), end: node.end, text })
  function walk(node) {
    if (ts.isJsxElement(node) && ['code', 'kbd', 'pre'].includes(node.openingElement.tagName.getText(ast))) return
    if (ts.isJsxText(node)) {
      const message = node.getText(ast).replace(/\s+/g, ' ').trim()
      if (keys.has(message)) {
        const raw = node.getText(ast)
        const leading = /^ +\S/.test(raw) ? ' ' : ''
        const trailing = /\S +$/.test(raw) ? ' ' : ''
        replace(node, `${leading}{uiText(${quote(message)})}${trailing}`)
      }
    } else if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer) && keys.has(node.initializer.text)) {
      replace(node.initializer, `{uiText(${quote(node.initializer.text)})}`)
      return
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && keys.has(ts.isTemplateExpression(node) ? templateMessage(node).message : node.text)) {
      let parent = node.parent, expression = null, skip = false
      while (parent && !ts.isSourceFile(parent)) {
        if (ts.isConditionalExpression(parent) && parent.condition.pos <= node.pos && parent.condition.end >= node.end) { skip = true; break }
        if (ts.isBinaryExpression(parent) && ![ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(parent.operatorToken.kind) || ts.isFunctionLike(parent)) { skip = true; break }
        if (ts.isJsxAttribute(parent) && !attributes.has(parent.name.getText(ast))) { skip = true; break }
        if (ts.isCallExpression(parent) && ['t', 'uiText', 'translate'].includes(parent.expression.getText(ast))) { skip = true; break }
        if (ts.isCallExpression(parent)) { skip = true; break }
        if (ts.isPropertyAssignment(parent) && !['label', 'title', 'description'].includes(parent.name.getText(ast))) { skip = true; break }
        if (ts.isJsxExpression(parent)) {
          if (ts.isJsxAttribute(parent.parent) && !attributes.has(parent.parent.name.getText(ast))) { skip = true; break }
          expression = parent; break
        }
        parent = parent.parent
      }
      if (!skip && expression) {
        if (ts.isTemplateExpression(node)) {
          const template = templateMessage(node)
          replace(node, `uiText(${quote(template.message)}, { ${template.values.map(value => `${value.name}: ${value.expression}`).join(', ')} })`)
          return
        } else replace(node, `uiText(${quote(node.text)})`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(ast)
  const ranges = edits.filter(edit => edit.start !== edit.end).sort((a, b) => a.start - b.start)
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index].start < ranges[index - 1].end) throw new Error(`Overlapping localization edits: ${file}`)
  }
  if (!edits.length) continue
  function subscribe(node) {
    const name = ts.isFunctionDeclaration(node) ? node.name?.text : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : null
    const fn = ts.isFunctionDeclaration(node) ? node : ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? node.initializer : null
    if (name && /^[A-Z]/.test(name) && fn && ts.isBlock(fn.body) && !/\b(useI18n|useUiLocale|useLanguageSync)\(/.test(fn.body.getText(ast))) {
      let jsx = false
      const scan = inner => { if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) jsx = true; else if (!ts.isFunctionLike(inner)) ts.forEachChild(inner, scan) }
      ts.forEachChild(fn.body, scan)
      if (jsx) edits.push({ start: fn.body.getStart(ast) + 1, end: fn.body.getStart(ast) + 1, text: '\n  useUiLocale()' })
    }
    ts.forEachChild(node, subscribe)
  }
  subscribe(ast)
  const needSubscribe = edits.some(edit => edit.text.includes('useUiLocale()'))
  if (!source.includes('t as uiText')) edits.push({ start: 0, end: 0, text: needSubscribe && !source.includes('useI18n as useUiLocale') ? "import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'\n" : "import { t as uiText } from '@renderer/i18n'\n" })
  else if (needSubscribe && !source.includes('useI18n as useUiLocale')) edits.push({ start: 0, end: 0, text: "import { useI18n as useUiLocale } from '@renderer/i18n'\n" })
  let result = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  await writeFile(file, result)
  count += edits.length; changedFiles++
}
console.log(`Localized static interface messages in ${changedFiles} files (${count} source edits).`)
