import { describe, expect, it } from 'vitest'
import { formatSql, minifySql, validateSql } from './index'

const SIMPLE = `select id,name from users where active=1 order by id`

describe('sql shared', () => {
  it('formats generic SQL', () => {
    const r = formatSql(SIMPLE, { dialect: 'generic', indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text.toUpperCase()).toContain('SELECT')
      expect(r.text).toMatch(/\n/)
    }
  })

  it('formats MySQL', () => {
    const r = formatSql(`select * from t limit 10`, { dialect: 'mysql' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text.toUpperCase()).toContain('LIMIT')
  })

  it('formats PostgreSQL', () => {
    const r = formatSql(`select id from users where email ilike '%@x.com'`, {
      dialect: 'postgresql'
    })
    expect(r.ok).toBe(true)
  })

  it('formats T-SQL', () => {
    const r = formatSql(`select top 10 * from dbo.Users`, { dialect: 'sqlserver' })
    expect(r.ok).toBe(true)
  })

  it('minifies to single-ish line', () => {
    const pretty = formatSql(SIMPLE, { dialect: 'mysql', indent: 2 })
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    const mini = minifySql(pretty.text, { dialect: 'mysql' })
    expect(mini.ok).toBe(true)
    if (mini.ok) {
      expect(mini.text.includes('\n')).toBe(false)
      expect(mini.text.length).toBeLessThan(pretty.text.length)
    }
  })

  it('validates good SQL', () => {
    const r = validateSql(`SELECT id FROM users WHERE id = 1`, { dialect: 'mysql' })
    expect(r.ok).toBe(true)
  })

  it('rejects empty', () => {
    const r = validateSql('   ', { dialect: 'mysql' })
    expect(r.ok).toBe(false)
  })

  it('rejects broken SQL', () => {
    const r = validateSql(`SELECT FROM WHERE`, { dialect: 'mysql' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })

  it('uppercase keywords optional', () => {
    const upper = formatSql(`select 1`, { dialect: 'generic', uppercaseKeywords: true })
    const preserve = formatSql(`select 1`, { dialect: 'generic', uppercaseKeywords: false })
    expect(upper.ok && upper.text.includes('SELECT')).toBe(true)
    expect(preserve.ok).toBe(true)
  })
})
