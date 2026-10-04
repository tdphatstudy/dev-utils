import { describe, expect, it } from 'vitest'
import { compactSql } from './compact'

describe('SQL layout compaction', () => {
  it.each([
    ["SELECT   'a  b' \n FROM t", "SELECT 'a  b' FROM t"],
    ['SELECT  "a  b"  FROM t', 'SELECT "a  b" FROM t'],
    ['SELECT  $$a\n  b$$ \n FROM t', 'SELECT $$a\n  b$$ FROM t'],
    ["SELECT  'it''s  fine'\n FROM t", "SELECT 'it''s  fine' FROM t"],
    ['SELECT [a  b] \n FROM t', 'SELECT [a  b] FROM t'],
    ['SELECT 1 -- comment\n FROM t', 'SELECT 1 -- comment\nFROM t'],
    ['SELECT /* nested /* inner */  outer */ 1', 'SELECT /* nested /* inner */  outer */ 1']
  ])('preserves SQL semantics in %s', (input, output) => expect(compactSql(input)).toBe(output))
})
