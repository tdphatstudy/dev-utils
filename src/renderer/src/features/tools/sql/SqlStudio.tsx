import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import {
  formatSql,
  minifySql,
  validateSql,
  SQL_DIALECTS,
  type SqlDialectId
} from '@shared/sql'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

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
  useUiLocale()
  const [dialect, setDialect] = useState<SqlDialectId>('mysql')
  const [input, setInput] = useState(SAMPLES.mysql)
  const [indent, setIndent] = useState(2)
  const [uppercase, setUppercase] = useState(true)

  useToolDraft('sql.studio', input, setInput, {
    label: 'SQL Studio',
    historyOnUnmount: true
  })

  const validated = useMemo(() => validateSql(input, { dialect }), [input, dialect])
  const formatted = useMemo(
    () => formatSql(input, { dialect, indent, uppercaseKeywords: uppercase }),
    [input, dialect, indent, uppercase]
  )

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste SQL to get started' }
    : validated.ok
      ? {
          tone: 'success' as const,
          text: `${dialect === 'plsql' ? 'Formatted' : 'Syntax checked'} · ${input.length.toLocaleString()} chars${
            validated.note ? ` · ${validated.note}` : ''
          }`
        }
      : {
          tone: 'danger' as const,
          text: `Invalid${validated.line ? ` · line ${validated.line}` : ''} — ${validated.error}${
            validated.note ? ` (${validated.note})` : ''
          }`
        }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={!formatted.ok || !input.trim()}
          onClick={() => {
            const r = formatSql(input, { dialect, indent, uppercaseKeywords: uppercase })
            if (r.ok) setInput(r.text)
          }}
        >
          {uiText('Format')}</button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!formatted.ok || !input.trim()}
          onClick={() => {
            const r = minifySql(input, { dialect, uppercaseKeywords: uppercase })
            if (r.ok) setInput(r.text)
          }}
        >
          {uiText('Minify')}</button>

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Dialect
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
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          {uiText('Indent')}<select
            className="mac-input !w-auto !py-1"
            value={indent}
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
            onChange={(e) => setUppercase(e.target.checked)}
            className="accent-mac-accent"
          />
          UPPER keywords
        </label>

        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type="text"
            content={formatted.ok ? formatted.text : input}
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
        <TextInputActions value={input} onChange={setInput} output={formatted.ok ? formatted.text : ''} fileName="formatted.sql" accept=".sql,.txt" />
      </ToolToolbar>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor
          value={input}
          onChange={setInput}
          language="sql"
          sqlDialect={dialect}
          placeholder="Paste SQL…"
          label={`${SQL_DIALECTS.find((item) => item.id === dialect)?.label ?? 'SQL'} input`}
          issue={!input.trim() || validated.ok ? null : validated}
          onRun={() => { if (formatted.ok) setInput(formatted.text) }}
        />
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
