import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { SQL_DIALECTS, type SqlDialectId } from '@shared/sql/dialects'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { useSqlAnalysis } from './useSqlAnalysis'

const SAMPLES: Record<SqlDialectId, string> = {
  generic: `select u.id, u.name, count(o.id) as order_count
from users u
left join orders o on o.user_id = u.id
where u.active = 1
group by u.id, u.name
having count(o.id) > 0
order by order_count desc`,
  mysql: `SELECT u.id, u.email, COUNT(*) AS cnt
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY u.id, u.email
ORDER BY cnt DESC
LIMIT 20;`,
  mariadb: `SELECT id, name FROM products WHERE price > 0 ORDER BY name LIMIT 50;`,
  postgresql: `SELECT u.id, u.email
FROM users u
WHERE u.email ILIKE '%@example.com'
  AND u.created_at >= NOW() - INTERVAL '7 days'
ORDER BY u.created_at DESC
LIMIT 25;`,
  sqlserver: `SELECT TOP 20 u.Id, u.Email, COUNT(*) AS OrderCount
FROM dbo.Users u
INNER JOIN dbo.Orders o ON o.UserId = u.Id
WHERE u.IsActive = 1
GROUP BY u.Id, u.Email
ORDER BY OrderCount DESC;`,
  sqlite: `SELECT name, COUNT(*) AS n
FROM sqlite_master
WHERE type = 'table'
GROUP BY name
ORDER BY n DESC;`,
  plsql: `SELECT employee_id, last_name, salary
FROM employees
WHERE department_id = 90
ORDER BY salary DESC;`,
  bigquery: `SELECT user_id, COUNT(*) AS events
FROM \`project.dataset.events\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY user_id
ORDER BY events DESC
LIMIT 100;`,
  snowflake: `SELECT user_id, COUNT(*) AS events
FROM events
WHERE event_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
GROUP BY user_id
ORDER BY events DESC
LIMIT 100;`
}

export default function SqlStudio(): JSX.Element {
  const { locale } = useUiLocale()
  const [dialect, setDialect] = useState<SqlDialectId>('mysql')
  const [input, setInput] = useState(SAMPLES.mysql)
  const [indent, setIndent] = useState(2)
  const [uppercase, setUppercase] = useState(true)

  useToolDraft('sql.studio', input, setInput, {
    label: 'SQL Studio',
    historyOnUnmount: true
  })

  const analysis = useSqlAnalysis(input, dialect, setInput)
  const validated = analysis.validation
  const format = (): void => { if (validated?.ok && !analysis.actionPending) analysis.run('format', { dialect, indent, uppercaseKeywords: uppercase }) }

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: uiText('Paste SQL to get started') }
    : analysis.pending || analysis.actionPending
      ? { tone: 'neutral' as const, text: uiText(analysis.actionPending ? 'Processing SQL…' : 'Checking SQL…') }
    : validated?.ok
      ? {
          tone: 'success' as const,
          text: `${uiText('{value1} · {value2} chars', { value1: uiText(dialect === 'plsql' ? 'Formatting supported' : 'Syntax checked'), value2: input.length.toLocaleString(locale) })}${
            validated.note ? ` · ${uiText(validated.note)}` : ''
          }`
        }
      : {
          tone: 'danger' as const,
          text: `${uiText(validated?.error ?? 'Invalid SQL')}${validated?.line ? ` · ${uiText('Line {line}:', { line: validated.line.toLocaleString(locale) })}` : ''}${
            validated?.note ? ` (${uiText(validated.note)})` : ''
          }`
        }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={!validated?.ok || analysis.actionPending}
          onClick={format}
        >
          {uiText('Format')}</button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!validated?.ok || analysis.actionPending}
          onClick={() => analysis.run('minify', { dialect, uppercaseKeywords: uppercase })}
        >
          {uiText('Minify')}</button>
        {(analysis.pending || analysis.actionPending) && <button type="button" className="mac-btn-secondary" onClick={analysis.cancel}>{uiText('Cancel')}</button>}
        {!analysis.pending && !analysis.actionPending && input.trim() && !validated?.ok && <button type="button" className="mac-btn-secondary" onClick={analysis.retry}>{uiText('Retry')}</button>}

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          {uiText('Dialect')}
          <select
            className="mac-input !w-auto max-w-[11rem] !py-1"
            value={dialect}
            onChange={(e) => {
              const id = e.target.value as SqlDialectId
              setDialect(id)
            }}
          >
            {SQL_DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>
                {uiText(d.label)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          {uiText('Indent')}<select
            className="mac-input !w-auto !py-1"
            value={indent}
            disabled={analysis.actionPending}
            onChange={(e) => setIndent(Number(e.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          <input
            type="checkbox"
            checked={uppercase}
            disabled={analysis.actionPending}
            onChange={(e) => setUppercase(e.target.checked)}
            className="accent-mac-accent"
          />
          {uiText('Uppercase keywords')}
        </label>

        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type="text"
            content={input}
            defaultName={`sql-${new Date().toISOString().slice(0, 10)}.sql`}
            disabled={!input.trim()}
          />
          <CopyButton text={input} />
          <button
            type="button"
            className="mac-btn-ghost"
            onClick={() => setInput(SAMPLES[dialect] ?? SAMPLES.generic)}
          >
            {uiText('Sample')}</button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={input} fileName="query.sql" accept=".sql,.txt" />
      </ToolToolbar>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor
          value={input}
          onChange={setInput}
          language="sql"
          sqlDialect={dialect}
          placeholder={uiText('Paste SQL…')}
          label={uiText('{dialect} input', { dialect: uiText(SQL_DIALECTS.find((item) => item.id === dialect)?.label ?? 'SQL') })}
          issue={!input.trim() || validated?.ok ? null : validated}
          onRun={format}
        />
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        {analysis.error && <p role="alert" className="text-[12px] text-mac-danger">{uiText(analysis.error)}</p>}
      </footer>
    </div>
  )
}
