/** Use the same reachable pane tabs a person uses on compact workspaces. */
export async function workspaceField(page, label, options) {
  const field = page.getByLabel(label, options).and(page.locator('input, select, textarea, [contenteditable]'))
  if (!await field.isVisible()) {
    const inputTab = page.getByRole('tab', { name: 'Input', exact: true })
    if (await inputTab.isVisible()) await inputTab.click()
    const sourceTab = page.getByRole('tab', { name: label, exact: true })
    if (await sourceTab.isVisible()) await sourceTab.click()
  }
  return field
}

export async function workspaceValue(page, label) {
  const field = await workspaceField(page, label, { exact: true })
  return field.evaluate(element => element.isContentEditable ? [...element.querySelectorAll('.cm-line')].map(line => {
    const content = line.cloneNode(true)
    content.querySelectorAll('.cm-placeholder').forEach(placeholder => placeholder.remove())
    return content.textContent
  }).join('\n') : element.value)
}
