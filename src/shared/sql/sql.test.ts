import { describe, expect, it } from 'vitest'
import { formatSql, minifySql, validateSql } from './index'
import { assertSqlInput, MAX_SQL_BYTES, MAX_SQL_DEPTH, MAX_SQL_STATEMENTS, MAX_SQL_TOKENS } from './limits'

const SIMPLE = `select id,name from users where active=1 order by id`

describe('sql shared', () => {
  it('rejects the 780 KB regression input before invoking heavy SQL engines', () => {
    const input = 'SELECT id FROM users WHERE active = 1;\n'.repeat(20_000)
    expect(input.length).toBe(780_000)
    for (const operation of [validateSql, formatSql, minifySql]) {
      const result = operation(input, { dialect: 'mysql' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('1,000 statements')
    }
  })
  it('bounds UTF-8 bytes, structural depth, statement and token complexity', () => {
    expect(() => assertSqlInput('x'.repeat(MAX_SQL_BYTES + 1))).toThrow('1 MiB')
    expect(() => assertSqlInput('ắ'.repeat(Math.ceil(MAX_SQL_BYTES / 3)))).toThrow('1 MiB')
    expect(() => assertSqlInput('SELECT ' + '('.repeat(MAX_SQL_DEPTH + 1) + '1')).toThrow('nesting')
    expect(() => assertSqlInput('SELECT 1;'.repeat(MAX_SQL_STATEMENTS + 1))).toThrow('statements')
    expect(() => assertSqlInput('SELECT 1;'.repeat(MAX_SQL_STATEMENTS) + 'SELECT 1')).toThrow('statements')
    expect(() => assertSqlInput('SELECT 1;'.repeat(MAX_SQL_STATEMENTS - 1) + 'SELECT 1')).not.toThrow()
    expect(() => assertSqlInput(';'.repeat(MAX_SQL_STATEMENTS + 1) + 'SELECT 1')).not.toThrow()
    expect(() => assertSqlInput('a '.repeat(MAX_SQL_TOKENS + 1))).toThrow('tokens')
    expect(formatSql('SELECT 1', { indent: 1_000_000 })).toEqual(expect.objectContaining({ ok: false, error: 'SQL indentation must be between 0 and 8 spaces.' }))
  })
  it('does not treat comments, quoted identifiers or literals as SQL structure', () => {
    const content = ';('.repeat(2000)
    for (const literal of ["'" + content + "'", '"' + content + '"', '`' + content + '`']) expect(() => assertSqlInput('SELECT ' + literal)).not.toThrow()
    expect(() => assertSqlInput('SELECT [' + content + ']', 'sqlserver')).not.toThrow()
    for (const literal of ['$$' + content + '$$', '$body$' + content + '$body$']) expect(() => assertSqlInput('SELECT ' + literal, 'postgresql')).not.toThrow()
    expect(() => assertSqlInput('SELECT ARRAY[' + '1,'.repeat(MAX_SQL_TOKENS) + '1]', 'postgresql')).toThrow('tokens')
    expect(() => assertSqlInput('SELECT 1 /* ' + content + ' */ -- ' + content + '\n')).not.toThrow()
    expect(validateSql('SELECT id FROM users;\n'.repeat(100), { dialect: 'mysql' }).ok).toBe(true)
  })
  it('keeps whitespace inside literals and retains line-comment termination when minifying', () => {
    const result = minifySql("SELECT 'hello  world', 'a\nb' -- keep comment\nFROM users", { dialect: 'postgresql' })
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toContain("'hello  world'")
    expect(result.text).toContain("'a\nb'")
    expect(result.text).toMatch(/-- keep comment\n/)
  })
  it('uses structured parser locations', () => {
    const result = validateSql('SELECT id\nFROM\nWHERE', { dialect: 'mysql' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBe(3)
      expect(result.column).toBe(6)
      expect(result.offset).toBe(20)
    }
  })
  it('does not reject Oracle SQL using the MySQL validator', () => {
    const result = validateSql('SELECT SYSDATE FROM dual', { dialect: 'plsql' })
    expect(result.ok).toBe(true)
    expect(result.note).toContain('not fully validated')
  })
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
