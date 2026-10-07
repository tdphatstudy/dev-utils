import ts from 'typescript'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

// One-time, source-based migration. Touch only known static interface messages;
// never inspect a live DOM, user input, editor values, routes or protocol strings.
const root = resolve('src/renderer/src')
let catalog = ts.createSourceFile('catalog.ts', await readFile('src/shared/i18n/catalog.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const keys = new Set()
function catalogKeys(node) {
  if (ts.isVariableDeclaration(node) && ts.isArrayLiteralExpression(node.initializer)) for (const row of node.initializer.elements) if (ts.isArrayLiteralExpression(row) && ts.isStringLiteral(row.elements[0])) keys.add(row.elements[0].text)
  ts.forEachChild(node, catalogKeys)
}
catalogKeys(catalog)
catalog = ts.createSourceFile('workspace-messages.ts', await readFile('src/shared/i18n/workspace-messages.ts', 'utf8'), ts.ScriptTarget.Latest, true)
catalogKeys(catalog)
catalog = ts.createSourceFile('settings-messages.ts', await readFile('src/shared/i18n/settings-messages.ts', 'utf8'), ts.ScriptTarget.Latest, true)
catalogKeys(catalog)
catalog = ts.createSourceFile('tool-messages.ts', await readFile('src/shared/i18n/tool-messages.ts', 'utf8'), ts.ScriptTarget.Latest, true)
catalogKeys(catalog)
const attributes = new Set(['label', 'title', 'aria-label', 'placeholder', 'heading', 'purpose', 'limits', 'caption', 'action'])
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
async function files(directory) { return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [join(directory, entry.name)] : []))).flat() }
let count = 0, changedFiles = 0
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), edits = []
  const replace = (node, text) => edits.push({ start: node.getStart(ast), end: node.end, text })
  function walk(node) {
    if (ts.isJsxText(node)) {
      const message = node.getText(ast).replace(/\s+/g, ' ').trim()
      if (keys.has(message)) replace(node, `{uiText(${quote(message)})}`)
    } else if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer) && keys.has(node.initializer.text)) {
      replace(node.initializer, `{uiText(${quote(node.initializer.text)})}`)
    } else if (ts.isStringLiteral(node) && keys.has(node.text)) {
      let parent = node.parent, expression = null, skip = false
      while (parent && !ts.isSourceFile(parent)) {
        if (ts.isBinaryExpression(parent) || ts.isFunctionLike(parent) || ts.isJsxAttribute(parent)) { skip = true; break }
        if (ts.isCallExpression(parent) && ['t', 'uiText', 'translate'].includes(parent.expression.getText(ast))) { skip = true; break }
        if (ts.isPropertyAssignment(parent) && !['label', 'title', 'description'].includes(parent.name.getText(ast))) { skip = true; break }
        if (ts.isJsxExpression(parent)) { expression = parent; break }
        parent = parent.parent
      }
      if (!skip && expression) replace(node, `uiText(${quote(node.text)})`)
    }
    ts.forEachChild(node, walk)
  }
  walk(ast)
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
  if (!source.includes('t as uiText')) edits.push({ start: 0, end: 0, text: "import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'\n" })
  let result = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  await writeFile(file, result)
  count += edits.length; changedFiles++
}
console.log(`Localized static interface messages in ${changedFiles} files (${count} source edits).`)
