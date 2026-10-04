import { expect, it } from 'vitest'
import { Resolver } from 'node:dns/promises'
import { createSocket } from 'node:dgram'
import { once } from 'node:events'
import { lookupDns } from './dns-lookup'

/** Local DNS fixture: RFC 1035 header/question/answer, no external DNS access. */
it('uses a real resolver over UDP for TTL, multipart TXT, reverse and NXDOMAIN', async () => {
  const server = createSocket('udp4')
  const queries: { name: string; type: number }[] = []
  server.on('message', (query, remote) => {
    const labels: string[] = []
    let end = 12
    while (query[end]) {
      const length = query[end++]!
      labels.push(query.subarray(end, end + length).toString('ascii'))
      end += length
    }
    end++
    const type = query.readUInt16BE(end)
    end += 4
    const name = labels.join('.')
    queries.push({ name, type })
    if (name === 'timeout.test') return // Deliberately unanswered UDP query.
    const missing = name === 'missing.test'
    const header = Buffer.alloc(12)
    header.writeUInt16BE(query.readUInt16BE(0), 0)
    header.writeUInt16BE(missing ? 0x8183 : 0x8180, 2)
    header.writeUInt16BE(1, 4)
    header.writeUInt16BE(missing ? 0 : 1, 6)
    const data = type === 1 ? Buffer.from([192, 0, 2, 42])
      : type === 16 ? Buffer.from([3, 111, 110, 101, 3, 116, 119, 111])
        : Buffer.from([7, ...Buffer.from('reverse'), 4, ...Buffer.from('test'), 0])
    const answer = Buffer.alloc(12)
    answer.writeUInt16BE(0xc00c, 0)
    answer.writeUInt16BE(type, 2)
    answer.writeUInt16BE(1, 4)
    answer.writeUInt32BE(300, 6)
    answer.writeUInt16BE(data.length, 10)
    server.send(Buffer.concat([header, query.subarray(12, end), ...(missing ? [] : [answer, data])]), remote.port, remote.address)
  })
  server.bind(0, '127.0.0.1')
  await once(server, 'listening')
  const resolver = new Resolver({ timeout: 1000, tries: 1 })
  resolver.setServers([`127.0.0.1:${server.address().port}`])
  try {
    expect((await lookupDns({ hostname: 'example.test', recordType: 'A' }, resolver)).records).toEqual([{ address: '192.0.2.42', ttl: 300 }])
    expect((await lookupDns({ hostname: 'example.test', recordType: 'TXT' }, resolver)).records).toEqual(['onetwo'])
    expect((await lookupDns({ hostname: '192.0.2.42', recordType: 'PTR' }, resolver)).records).toEqual(['reverse.test'])
    expect(await lookupDns({ hostname: 'missing.test', recordType: 'A' }, resolver)).toMatchObject({ empty: true, code: 'ENOTFOUND' })
    expect(queries).toContainEqual({ name: '42.2.0.192.in-addr.arpa', type: 12 })
    await expect(lookupDns({ hostname: 'timeout.test', recordType: 'NS' }, resolver, 50)).rejects.toThrow('timed out')
    expect((await lookupDns({ hostname: 'example.test', recordType: 'A' }, resolver)).records).toEqual([{ address: '192.0.2.42', ttl: 300 }])
  } finally {
    resolver.cancel()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
