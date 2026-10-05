import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  SshLocation,
  SshKeyRecovery
} from '@shared/ssh/types'
import { sshKeyNameError } from '@shared/ssh/key-name'
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
  const desktop = !!window.devutils?.ssh
  const loadVersion = useRef(0)
  const publicVersion = useRef(0)
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
  const [recovery, setRecovery] = useState<SshKeyRecovery | null>(null)
  const [recoveryName, setRecoveryName] = useState('')
  const keyMutating = useRef(false)
  const keyIssue = sshKeyNameError(keyName)
  const recoveryIssue = sshKeyNameError(recoveryName)

  const [testHost, setTestHost] = useState('github.com')
  const [testPort, setTestPort] = useState(22)
  const [testResult, setTestResult] = useState<SshConnectResult | null>(null)
  const [testing, setTesting] = useState(false)
  const hostFormIssue = !/^[A-Za-z0-9._-]{1,255}$/.test(hostForm.alias.trim())
    ? 'Alias: use letters, digits, dot, underscore or hyphen (1–255 characters).'
    : !Number.isInteger(hostForm.port) || (hostForm.port ?? 0) < 1 || (hostForm.port ?? 0) > 65535
      ? 'Port: enter an integer from 1 to 65535.' : null

  const load = useCallback(async (): Promise<void> => {
    if (!desktop) { setError('SSH Keys & Hosts requires the desktop app.'); return }
    const version = ++loadVersion.current
    setBusy(true)
    setError(null)
    try {
      const r = await window.devutils.ssh.list(location)
      if (version !== loadVersion.current) return
      setData(r)
      setSelectedHost((prev) =>
        prev ? (r.hosts.find((x) => x.alias === prev.alias) ?? null) : null
      )
      setSelectedKey((prev) =>
        prev ? (r.keys.find((x) => x.path === prev.path) ?? null) : null
      )
    } catch (e) {
      if (version !== loadVersion.current) return
      setError(e instanceof Error ? e.message : 'Failed to list SSH data')
      setData(null)
      setSelectedHost(null); setSelectedKey(null); setPubContent(null)
      setHostFormMode(null); setKeyFormMode(null)
      publicVersion.current++
    } finally {
      if (version === loadVersion.current) setBusy(false)
    }
  }, [location, desktop])

  useEffect(() => {
    setData(null); setSelectedHost(null); setSelectedKey(null); setPubContent(null)
    setHostFormMode(null); setKeyFormMode(null); setTestResult(null)
    setRecovery(null)
    void load()
    return () => { loadVersion.current++; publicVersion.current++ }
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
    const version = ++publicVersion.current
    setSelectedKey(key)
    setSelectedHost(null)
    setPubContent(null)
    setKeyFormMode(null)
    const path = key.isPublic ? key.path : key.publicPath
    if (!path) return
    try {
      const text = await window.devutils.ssh.readPublic(path, location)
      if (version !== publicVersion.current) return
      setPubContent(text.trim())
    } catch (e) {
      if (version === publicVersion.current) setError(e instanceof Error ? e.message : 'Could not read public key')
    }
  }

  const pickSshDir = async (): Promise<void> => {
    try {
      const p = await window.devutils.ssh.pickFolder()
      if (!p) return
      setSshDir(p)
      setStatusMsg(`SSH directory → ${p}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not select SSH directory') }
  }

  const pickConfig = async (): Promise<void> => {
    try {
      const p = await window.devutils.ssh.pickConfigFile()
      if (!p) return
      setSshConfigPath(p)
      setStatusMsg(`SSH config → ${p}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not select SSH config') }
  }

  const openFolder = async (target: SshLocation): Promise<void> => {
    try { await window.devutils.ssh.openFolder(target) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open SSH directory') }
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
      setStatusMsg(`Host “${saved.alias}” saved to ${saved.sourceConfig ?? data?.configPath ?? 'SSH config'}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save host failed')
    } finally {
      setBusy(false)
    }
  }

  const removeHost = async (h: SshHostEntry): Promise<void> => {
    if (!window.confirm(`Delete host “${h.alias}” from ${data?.configPath ?? 'SSH config'}? A .bak copy is kept.`)) return
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
    if (keyMutating.current || keyIssue) return
    keyMutating.current = true
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
        setStatusMsg(`Renamed → ${selectedKey.isPublic ? r.publicPath : r.privatePath}. Update any IdentityFile references; config was preserved.`)
        setPubContent(null)
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
      setSelectedKey({ name: keyName.trim().replace(/\.pub$/i, ''), path: r.privatePath, isPublic: false,
        publicPath: r.publicPath, fingerprintSha256: r.fingerprintSha256, external: false })
      await load()
      setPubContent(r.publicKeyOpenSsh)
      if (r.recovery) { setRecovery(r.recovery); setRecoveryName(`${r.recovery.name}_recovered`) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Key operation failed')
    } finally {
      keyMutating.current = false
      setBusy(false)
    }
  }

  const removeKey = async (k: SshKeyInfo): Promise<void> => {
    if (keyMutating.current || k.external || k.readOnlyReason) return
    const label = k.name.replace(/\.pub$/i, '')
    if (
      !window.confirm(
        `Remove key “${label}” (private + .pub if present)?\nA private recovery copy will be kept in your SSH directory. IdentityFile references are not changed.`
      )
    ) {
      return
    }
    keyMutating.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await window.devutils.ssh.deleteKey(k.path, location)
      setRecovery(result.recovery); setRecoveryName(result.error ? `${result.recovery.name}_recovered` : result.recovery.name)
      if (selectedKey?.path === k.path) {
        setSelectedKey(null)
        setPubContent(null)
      }
      setStatusMsg(`Removed “${label}” · recovery copy preserved. Update any IdentityFile references.`)
      await load()
      if (result.error) { setError(result.error); setStatusMsg(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete key failed')
    } finally {
      keyMutating.current = false
      setBusy(false)
    }
  }

  const restoreKey = async (): Promise<void> => {
    if (!recovery || keyMutating.current || sshKeyNameError(recoveryName)) return
    keyMutating.current = true; setBusy(true); setError(null)
    try {
      const result = await window.devutils.ssh.renameKey({ path: recovery.keyPath, newName: recoveryName }, location)
      const restoredPath = recovery.keyPath.endsWith('.pub') ? result.publicPath : result.privatePath
      setRecovery(null)
      await load()
      setStatusMsg(`Recovered → ${restoredPath}. Config references were preserved; update them if needed.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Recovery failed. The backup remains available.') }
    finally { keyMutating.current = false; setBusy(false) }
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
          <button type="button" className="mac-btn-primary" disabled={!desktop || busy} onClick={openCreateHost}>
            <Plus className="h-3.5 w-3.5" />
            Add host
          </button>
        ) : (
          <button
            type="button"
            className="mac-btn-primary"
            disabled={!desktop || busy}
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
        <button type="button" className="mac-btn-secondary" disabled={!desktop || busy} onClick={() => void load()}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          type="button"
          className="mac-btn-ghost"
          onClick={() => void openFolder(location)}
          title="Open SSH directory"
          disabled={!desktop || busy}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open folder
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          onClick={() => void pickSshDir()}
          title="Use a custom directory for keys (not only ~/.ssh)"
          disabled={!desktop || busy}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Set SSH dir…
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          onClick={() => void pickConfig()}
          title="Point at a specific config file (ssh -F style)"
          disabled={!desktop || busy}
        >
          <FileText className="h-3.5 w-3.5" />
          Set config…
        </button>
        {(sshDir || sshConfigPath) && (
          <button
            type="button"
            className="mac-btn-ghost"
            onClick={resetLocation}
            disabled={busy}
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

      {recovery && <div className="shrink-0 space-y-2 border-b border-mac-separator bg-mac-control/30 px-4 py-2 text-[12px]">
        <p>Recovery copy kept locally: <span className="break-all font-mono">{recovery.directory}</span></p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={recovery.directory} label="Copy backup path" />
          <button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => void openFolder({ sshDir: recovery.directory })}>Open backup folder</button>
          <label className="flex items-center gap-2">Restore as<input className="mac-input !w-40 font-mono" value={recoveryName} disabled={busy} aria-invalid={!!recoveryIssue} aria-describedby={recoveryIssue ? 'ssh-recovery-issue' : undefined} onChange={(e) => setRecoveryName(e.target.value)} /></label>
          <button type="button" className="mac-btn-primary" disabled={busy || !!recoveryIssue} onClick={() => void restoreKey()}>Restore key</button>
        </div>
        {recoveryIssue && <p id="ssh-recovery-issue" className="text-mac-error">{recoveryIssue}</p>}
        <p className="text-[11px] text-mac-label-secondary">Restore never overwrites an existing name. Backup files survive closing the tool; use the folder path for manual recovery later.</p>
      </div>}

      <p className="border-b border-mac-separator px-4 py-2 text-[11px] text-mac-label-secondary">Values shown belong to the selected block. Includes, Match rules and inherited defaults are not resolved. Edits preserve other directives and block order; new hosts precede conditional defaults.</p>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto auto-rows-[minmax(260px,1fr)] md:grid-cols-2">
        {/* List */}
        <div className="min-h-0 overflow-auto border-r border-mac-separator">
          {tab === 'hosts' && (
            <ul className="p-2">
              {(data?.hosts.length ?? 0) === 0 && !hostFormMode && (
                <li className="px-3 py-8 text-center text-[13px] text-mac-label-tertiary">
                  {busy ? 'Reading SSH config…' : error ? 'SSH inventory unavailable. Resolve the error, then refresh.' : 'No Host entries — click Add host'}
                </li>
              )}
              {data?.hosts.map((h, index) => (
                <li key={h.alias + h.patterns.join(',') + index}>
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
                  {busy ? 'Reading SSH keys…' : error ? 'SSH inventory unavailable. Resolve the error, then refresh.' : 'No keys — click New key'}
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
                      setHostForm((f) => ({ ...f, port: Number(e.target.value) }))
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
                  disabled={busy || !desktop || !!hostFormIssue}
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
              {hostFormIssue && <p role="status" className="text-[12px] text-mac-label-secondary">{hostFormIssue}</p>}
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
                    Replace existing pair (keeps a recovery copy)
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="mac-btn-primary"
                  disabled={busy || !desktop || !!keyIssue}
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
              {keyIssue && <p role="status" className="text-[12px] text-mac-label-secondary">{keyIssue}</p>}
              <p className="text-[11px] text-mac-label-secondary">Private keys use OpenSSH format and have no passphrase. Keep the key and recovery copies private. Renaming does not update config or external scripts.</p>
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
                    disabled={busy || !!selectedHost.readOnlyReason}
                    title={selectedHost.readOnlyReason}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="mac-btn-ghost !py-1 text-mac-danger"
                    onClick={() => void removeHost(selectedHost)}
                    disabled={busy || !!selectedHost.readOnlyReason}
                    title={selectedHost.readOnlyReason}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
              {selectedHost.readOnlyReason && <p role="status" className="text-[12px] text-mac-warning">{selectedHost.readOnlyReason}</p>}
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
                    disabled={busy || !!selectedKey.external || !!selectedKey.readOnlyReason}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="mac-btn-ghost !py-1 text-mac-danger"
                    onClick={() => void removeKey(selectedKey)}
                    disabled={busy || !!selectedKey.external || !!selectedKey.readOnlyReason}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
              {selectedKey.readOnlyReason && <p role="status" className="text-[12px] text-mac-warning">{selectedKey.readOnlyReason}</p>}
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
                aria-label="TCP hostname or IP"
                onChange={(e) => setTestHost(e.target.value)}
                placeholder="host"
                spellCheck={false}
              />
              <input
                type="number"
                className="mac-input !w-20 font-mono text-[13px]"
                value={testPort}
                aria-label="TCP port"
                min={1}
                max={65535}
                onChange={(e) => setTestPort(Number(e.target.value))}
              />
              <button
                type="button"
                className="mac-btn-primary"
                disabled={!desktop || testing || !testHost.trim() || !Number.isInteger(testPort) || testPort < 1 || testPort > 65535}
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
            <p className="text-[11px] text-mac-label-tertiary">Tests TCP reachability only; does not authenticate SSH or verify host keys.</p>
            {testResult && testResult.host === testHost.trim() && testResult.port === testPort && (
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

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : statusMsg ? 'success' : 'neutral'}>
          {error ??
            statusMsg ??
            `${data?.usingCustomLocation ? 'Custom location' : 'Default $HOME/.ssh'} · config.bak on write · ${data?.hosts.length ?? 0} hosts · ${data?.keys.length ?? 0} keys`}
        </ToolStatus>
      </footer>
    </div>
  )
}
