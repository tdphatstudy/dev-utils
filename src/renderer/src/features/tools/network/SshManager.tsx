import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderOpen,
  FileText,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
  RotateCcw
} from 'lucide-react'
import type {
  SshConnectResult,
  SshHostEntry,
  SshHostInput,
  SshKeyInfo,
  SshListResult,
  SshLocation
} from '@shared/ssh/types'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'

type Tab = 'hosts' | 'keys'
type HostFormMode = 'create' | 'edit' | null
type KeyFormMode = 'create' | 'rename' | null

const emptyHostForm = (): SshHostInput => ({
  alias: '',
  hostName: '',
  user: '',
  port: 22,
  identityFile: ''
})

export default function SshManager(): JSX.Element {
  const sshDir = useAppStore((s) => s.sshDir)
  const sshConfigPath = useAppStore((s) => s.sshConfigPath)
  const setSshDir = useAppStore((s) => s.setSshDir)
  const setSshConfigPath = useAppStore((s) => s.setSshConfigPath)

  const location: SshLocation = useMemo(
    () => ({
      sshDir: sshDir || null,
      configPath: sshConfigPath || null
    }),
    [sshDir, sshConfigPath]
  )

  const [tab, setTab] = useState<Tab>('hosts')
  const [data, setData] = useState<SshListResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const [selectedHost, setSelectedHost] = useState<SshHostEntry | null>(null)
  const [selectedKey, setSelectedKey] = useState<SshKeyInfo | null>(null)
  const [pubContent, setPubContent] = useState<string | null>(null)

  const [hostFormMode, setHostFormMode] = useState<HostFormMode>(null)
  const [hostForm, setHostForm] = useState<SshHostInput>(emptyHostForm())

  const [keyFormMode, setKeyFormMode] = useState<KeyFormMode>(null)
  const [keyName, setKeyName] = useState('id_ed25519_devutils')
  const [keyAlg, setKeyAlg] = useState<'ed25519' | 'rsa'>('ed25519')
  const [keyBits, setKeyBits] = useState<2048 | 3072 | 4096>(4096)
  const [keyComment, setKeyComment] = useState('')
  const [keyOverwrite, setKeyOverwrite] = useState(false)

  const [testHost, setTestHost] = useState('github.com')
  const [testPort, setTestPort] = useState(22)
  const [testResult, setTestResult] = useState<SshConnectResult | null>(null)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.devutils.ssh.list(location)
      setData(r)
      setSelectedHost((prev) =>
        prev ? (r.hosts.find((x) => x.alias === prev.alias) ?? null) : null
      )
      setSelectedKey((prev) =>
        prev ? (r.keys.find((x) => x.path === prev.path) ?? null) : null
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list SSH data')
      setData(null)
    } finally {
      setBusy(false)
    }
  }, [location])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (selectedHost) {
      setTestHost(selectedHost.hostName || selectedHost.alias)
      setTestPort(selectedHost.port || 22)
    }
  }, [selectedHost])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await window.devutils.ssh.testConnect({
        host: testHost,
        port: testPort,
        timeoutMs: 5000
      })
      setTestResult(r)
    } catch (e) {
      setTestResult({
        ok: false,
        host: testHost,
        port: testPort,
        timeMs: 0,
        status: 'error',
        error: e instanceof Error ? e.message : 'Test failed'
      })
    } finally {
      setTesting(false)
    }
  }

  const showPub = async (key: SshKeyInfo): Promise<void> => {
    setSelectedKey(key)
    setSelectedHost(null)
    setPubContent(null)
    setKeyFormMode(null)
    const path = key.isPublic ? key.path : key.publicPath
    if (!path) return
    try {
      const text = await window.devutils.ssh.readPublic(path, location)
      setPubContent(text.trim())
    } catch (e) {
      setPubContent(e instanceof Error ? e.message : 'Could not read public key')
    }
  }

  const pickSshDir = async (): Promise<void> => {
    const p = await window.devutils.ssh.pickFolder()
    if (!p) return
    setSshDir(p)
    setStatusMsg(`SSH directory → ${p}`)
  }

  const pickConfig = async (): Promise<void> => {
    const p = await window.devutils.ssh.pickConfigFile()
    if (!p) return
    setSshConfigPath(p)
    setStatusMsg(`SSH config → ${p}`)
  }

  const resetLocation = (): void => {
    setSshDir(null)
    setSshConfigPath(null)
    setStatusMsg('Using platform default (~/.ssh)')
  }

  const openCreateHost = (): void => {
    setHostFormMode('create')
    setHostForm(emptyHostForm())
    setSelectedKey(null)
  }

  const openEditHost = (h: SshHostEntry): void => {
    setHostFormMode('edit')
    setHostForm({
      originalAlias: h.alias,
      alias: h.alias,
      hostName: h.hostName ?? '',
      user: h.user ?? '',
      port: h.port || 22,
      identityFile: h.identityFile ?? ''
    })
  }

  const saveHost = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const saved = await window.devutils.ssh.upsertHost(
        {
          ...hostForm,
          originalAlias: hostFormMode === 'edit' ? hostForm.originalAlias : undefined
        },
        location
      )
      setHostFormMode(null)
      setSelectedHost(saved)
      setStatusMsg(`Host “${saved.alias}” saved to ~/.ssh/config`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save host failed')
    } finally {
      setBusy(false)
    }
  }

  const removeHost = async (h: SshHostEntry): Promise<void> => {
    if (!window.confirm(`Delete host “${h.alias}” from ~/.ssh/config?`)) return
    setBusy(true)
    setError(null)
    try {
      await window.devutils.ssh.deleteHost(h.alias, location)
      if (selectedHost?.alias === h.alias) setSelectedHost(null)
      setHostFormMode(null)
      setStatusMsg(`Host “${h.alias}” removed`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete host failed')
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      if (keyFormMode === 'rename' && selectedKey) {
        const r = await window.devutils.ssh.renameKey(
          {
            path: selectedKey.path,
            newName: keyName
          },
          location
        )
        setKeyFormMode(null)
        setStatusMsg(`Renamed → ${r.privatePath}`)
        await load()
        return
      }
      const r = await window.devutils.ssh.createKey(
        {
          name: keyName,
          algorithm: keyAlg,
          modulusLength: keyBits,
          comment: keyComment || undefined,
          overwrite: keyOverwrite
        },
        location
      )
      setKeyFormMode(null)
      setStatusMsg(`Created ${r.privatePath}`)
      setPubContent(r.publicKeyOpenSsh)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Key operation failed')
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (k: SshKeyInfo): Promise<void> => {
    const label = k.name.replace(/\.pub$/i, '')
    if (
      !window.confirm(
        `Delete key “${label}” (private + .pub if present)?\nThis cannot be undone.`
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.devutils.ssh.deleteKey(k.path, location)
      if (selectedKey?.path === k.path) {
        setSelectedKey(null)
        setPubContent(null)
      }
      setStatusMsg(`Deleted “${label}”`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete key failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={tab}
          onChange={(t) => {
            setTab(t)
            setHostFormMode(null)
            setKeyFormMode(null)
          }}
          options={[
            { value: 'hosts', label: 'Hosts' },
            { value: 'keys', label: 'Keys' }
          ]}
        />
        {tab === 'hosts' ? (
          <button type="button" className="mac-btn-primary" onClick={openCreateHost}>
            <Plus className="h-3.5 w-3.5" />
            Add host
          </button>
        ) : (
          <button
            type="button"
            className="mac-btn-primary"
            onClick={() => {
              setKeyFormMode('create')
              setKeyName('id_ed25519_devutils')
              setKeyAlg('ed25519')
              setKeyComment('')
              setKeyOverwrite(false)
              setSelectedHost(null)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New key
          </button>
        )}
        <button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          type="button"
          className="mac-btn-ghost"
          onClick={() => void window.devutils.ssh.openFolder(location)}
          title="Open SSH directory"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open folder
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          onClick={() => void pickSshDir()}
          title="Use a custom directory for keys (not only ~/.ssh)"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Set SSH dir…
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          onClick={() => void pickConfig()}
          title="Point at a specific config file (ssh -F style)"
        >
          <FileText className="h-3.5 w-3.5" />
          Set config…
        </button>
        {(sshDir || sshConfigPath) && (
          <button
            type="button"
            className="mac-btn-ghost"
            onClick={resetLocation}
            title="Reset to $HOME/.ssh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Default
          </button>
        )}
      </ToolToolbar>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mac-separator bg-mac-control/30 px-4 py-1.5 font-mono text-[11px] text-mac-label-secondary">
        <span title="Keys directory">
          <span className="text-mac-label-tertiary">dir </span>
          {data?.sshDir ?? '…'}
          {data?.usingCustomLocation ? (
            <span className="ml-1 text-mac-accent">· custom</span>
          ) : (
            <span className="ml-1 text-mac-label-tertiary">· default</span>
          )}
        </span>
        <span className="min-w-0 truncate" title="ssh_config path">
          <span className="text-mac-label-tertiary">config </span>
          {data?.configPath ?? '…'}
        </span>
        {data && !data.exists && (
          <span className="text-mac-warning">path missing — will create on write</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        {/* List */}
        <div className="min-h-0 overflow-auto border-r border-mac-separator">
          {tab === 'hosts' && (
            <ul className="p-2">
              {(data?.hosts.length ?? 0) === 0 && !hostFormMode && (
                <li className="px-3 py-8 text-center text-[13px] text-mac-label-tertiary">
                  No Host entries — click Add host
                </li>
              )}
              {data?.hosts.map((h) => (
                <li key={h.alias + h.patterns.join(',')}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-3 rounded-mac px-3 py-2.5 text-left transition-colors',
                      selectedHost?.alias === h.alias
                        ? 'bg-mac-accent-soft text-mac-accent'
                        : 'hover:bg-mac-control'
                    )}
                    onClick={() => {
                      setSelectedHost(h)
                      setSelectedKey(null)
                      setHostFormMode(null)
                      setKeyFormMode(null)
                    }}
                  >
                    <Server className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{h.alias}</div>
                      <div className="truncate font-mono text-[11px] opacity-70">
                        {h.user ? `${h.user}@` : ''}
                        {h.hostName || h.alias}:{h.port}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'keys' && (
            <ul className="p-2">
              {(data?.keys.length ?? 0) === 0 && !keyFormMode && (
                <li className="px-3 py-8 text-center text-[13px] text-mac-label-tertiary">
                  No keys — click New key
                </li>
              )}
              {data?.keys.map((k) => (
                <li key={k.path}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-3 rounded-mac px-3 py-2.5 text-left transition-colors',
                      selectedKey?.path === k.path
                        ? 'bg-mac-accent-soft text-mac-accent'
                        : 'hover:bg-mac-control'
                    )}
                    onClick={() => void showPub(k)}
                  >
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold">{k.name}</span>
                        <span className="mac-chip !normal-case">
                          {k.isPublic ? 'public' : 'private'}
                        </span>
                        {k.external && (
                          <span className="mac-chip !normal-case text-mac-warning">external</span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] opacity-70">
                        {k.keyType || 'key'}
                        {k.fingerprintSha256 ? ` · ${k.fingerprintSha256}` : ''}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail / forms */}
        <div className="flex min-h-0 flex-col overflow-auto p-4">
          {/* Host form */}
          {tab === 'hosts' && hostFormMode && (
            <div className="mb-4 space-y-3 rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
              <h2 className="text-[14px] font-semibold">
                {hostFormMode === 'create' ? 'New host' : 'Edit host'}
              </h2>
              <label className="block text-[12px] text-mac-label-secondary">
                Alias (Host)
                <input
                  className="mac-input mt-1 font-mono"
                  value={hostForm.alias}
                  onChange={(e) => setHostForm((f) => ({ ...f, alias: e.target.value }))}
                  placeholder="myserver"
                  spellCheck={false}
                />
              </label>
              <label className="block text-[12px] text-mac-label-secondary">
                HostName
                <input
                  className="mac-input mt-1 font-mono"
                  value={hostForm.hostName ?? ''}
                  onChange={(e) => setHostForm((f) => ({ ...f, hostName: e.target.value }))}
                  placeholder="10.0.0.5 or example.com"
                  spellCheck={false}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[12px] text-mac-label-secondary">
                  User
                  <input
                    className="mac-input mt-1 font-mono"
                    value={hostForm.user ?? ''}
                    onChange={(e) => setHostForm((f) => ({ ...f, user: e.target.value }))}
                    placeholder="deploy"
                    spellCheck={false}
                  />
                </label>
                <label className="block text-[12px] text-mac-label-secondary">
                  Port
                  <input
                    type="number"
                    className="mac-input mt-1 font-mono"
                    value={hostForm.port ?? 22}
                    onChange={(e) =>
                      setHostForm((f) => ({ ...f, port: Number(e.target.value) || 22 }))
                    }
                  />
                </label>
              </div>
              <label className="block text-[12px] text-mac-label-secondary">
                IdentityFile
                <input
                  className="mac-input mt-1 font-mono text-[12px]"
                  value={hostForm.identityFile ?? ''}
                  onChange={(e) => setHostForm((f) => ({ ...f, identityFile: e.target.value }))}
                  placeholder="~/.ssh/id_ed25519"
                  spellCheck={false}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="mac-btn-primary"
                  disabled={busy || !hostForm.alias.trim()}
                  onClick={() => void saveHost()}
                >
                  Save to config
                </button>
                <button
                  type="button"
                  className="mac-btn-ghost"
                  onClick={() => setHostFormMode(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Key form */}
          {tab === 'keys' && keyFormMode && (
            <div className="mb-4 space-y-3 rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
              <h2 className="text-[14px] font-semibold">
                {keyFormMode === 'create' ? 'Generate SSH key' : 'Rename key'}
              </h2>
              <label className="block text-[12px] text-mac-label-secondary">
                File name
                <input
                  className="mac-input mt-1 font-mono"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="id_ed25519_work"
                  spellCheck={false}
                />
              </label>
              {keyFormMode === 'create' && (
                <>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
                      Algorithm
                      <select
                        className="mac-input !w-auto !py-1"
                        value={keyAlg}
                        onChange={(e) => setKeyAlg(e.target.value as 'ed25519' | 'rsa')}
                      >
                        <option value="ed25519">Ed25519</option>
                        <option value="rsa">RSA</option>
                      </select>
                    </label>
                    {keyAlg === 'rsa' && (
                      <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
                        Bits
                        <select
                          className="mac-input !w-auto !py-1"
                          value={keyBits}
                          onChange={(e) =>
                            setKeyBits(Number(e.target.value) as 2048 | 3072 | 4096)
                          }
                        >
                          <option value={2048}>2048</option>
                          <option value={3072}>3072</option>
                          <option value={4096}>4096</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="block text-[12px] text-mac-label-secondary">
                    Comment
                    <input
                      className="mac-input mt-1 font-mono"
                      value={keyComment}
                      onChange={(e) => setKeyComment(e.target.value)}
                      placeholder="you@machine"
                      spellCheck={false}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
                    <input
                      type="checkbox"
                      checked={keyOverwrite}
                      onChange={(e) => setKeyOverwrite(e.target.checked)}
                      className="accent-mac-accent"
                    />
                    Overwrite if exists
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="mac-btn-primary"
                  disabled={busy || !keyName.trim()}
                  onClick={() => void saveKey()}
                >
                  {keyFormMode === 'create' ? 'Generate & write' : 'Rename'}
                </button>
                <button
                  type="button"
                  className="mac-btn-ghost"
                  onClick={() => setKeyFormMode(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tab === 'hosts' && selectedHost && !hostFormMode && (
            <div className="space-y-3 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-tight">{selectedHost.alias}</h2>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="mac-btn-secondary !py-1"
                    onClick={() => openEditHost(selectedHost)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="mac-btn-ghost !py-1 text-mac-danger"
                    onClick={() => void removeHost(selectedHost)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[12px]">
                <dt className="text-mac-label-tertiary">HostName</dt>
                <dd className="font-mono">{selectedHost.hostName || '—'}</dd>
                <dt className="text-mac-label-tertiary">User</dt>
                <dd className="font-mono">{selectedHost.user || '—'}</dd>
                <dt className="text-mac-label-tertiary">Port</dt>
                <dd className="font-mono">{selectedHost.port}</dd>
                <dt className="text-mac-label-tertiary">IdentityFile</dt>
                <dd className="break-all font-mono text-[11px]">
                  {selectedHost.identityFile || '—'}
                </dd>
              </dl>
            </div>
          )}

          {tab === 'keys' && selectedKey && !keyFormMode && (
            <div className="space-y-3 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-tight">{selectedKey.name}</h2>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="mac-btn-secondary !py-1"
                    onClick={() => {
                      setKeyFormMode('rename')
                      setKeyName(selectedKey.name.replace(/\.pub$/i, ''))
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="mac-btn-ghost !py-1 text-mac-danger"
                    onClick={() => void removeKey(selectedKey)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[12px]">
                <dt className="text-mac-label-tertiary">Type</dt>
                <dd className="font-mono">{selectedKey.keyType || '—'}</dd>
                <dt className="text-mac-label-tertiary">Fingerprint</dt>
                <dd className="break-all font-mono text-[11px]">
                  {selectedKey.fingerprintSha256 || '—'}
                </dd>
                <dt className="text-mac-label-tertiary">Path</dt>
                <dd className="break-all font-mono text-[11px]">{selectedKey.path}</dd>
              </dl>
              {pubContent && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                      Public key
                    </span>
                    <CopyButton text={pubContent} label="Copy" />
                  </div>
                  <pre className="selectable max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-mac border border-mac-separator bg-mac-control p-2 font-mono text-[11px]">
                    {pubContent}
                  </pre>
                </div>
              )}
              {!selectedKey.isPublic && !selectedKey.publicPath && (
                <p className="text-[12px] text-mac-label-tertiary">
                  Private key material is not loaded into the UI.
                </p>
              )}
            </div>
          )}

          {!selectedHost && !selectedKey && !hostFormMode && !keyFormMode && (
            <p className="text-[13px] text-mac-label-tertiary">
              Select an item or use Add / New. Default path is <code className="font-mono">$HOME/.ssh</code>{' '}
              (respects env <code className="font-mono">HOME</code>). Use <strong>Set SSH dir</strong> or{' '}
              <strong>Set config</strong> if your keys/config live elsewhere. IdentityFile paths outside
              the dir still appear as external keys (read-only).
            </p>
          )}

          <div className="mt-auto space-y-2 border-t border-mac-separator pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Test connection (TCP)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="mac-input min-w-0 flex-1 font-mono text-[13px]"
                value={testHost}
                onChange={(e) => setTestHost(e.target.value)}
                placeholder="host"
                spellCheck={false}
              />
              <input
                type="number"
                className="mac-input !w-20 font-mono text-[13px]"
                value={testPort}
                onChange={(e) => setTestPort(Number(e.target.value) || 22)}
              />
              <button
                type="button"
                className="mac-btn-primary"
                disabled={testing || !testHost.trim()}
                onClick={() => void runTest()}
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wifi className="h-3.5 w-3.5" />
                )}
                {testing ? 'Testing…' : 'Test'}
              </button>
            </div>
            {testResult && (
              <p
                className={cn(
                  'text-[12px]',
                  testResult.ok ? 'text-mac-success' : 'text-mac-danger'
                )}
              >
                {testResult.ok
                  ? `Open · ${testResult.host}:${testResult.port} · ${testResult.timeMs}ms`
                  : `${testResult.status} · ${testResult.error ?? 'failed'} · ${testResult.timeMs}ms`}
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : statusMsg ? 'success' : 'neutral'}>
          {error ??
            statusMsg ??
            `${data?.usingCustomLocation ? 'Custom location' : 'Default $HOME/.ssh'} · config.bak on write · ${data?.hosts.length ?? 0} hosts · ${data?.keys.length ?? 0} keys`}
        </ToolStatus>
      </footer>
    </div>
  )
}
