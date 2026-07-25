import { execFile } from 'child_process'
import { promisify } from 'util'
import { PORT_SCAN_MAX_BUFFER_BYTES, PORT_SCAN_TIMEOUT_MS } from '../../../shared/core/constants'

const execFileAsync = promisify(execFile)

export async function runCmd(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, {
    windowsHide: true,
    maxBuffer: PORT_SCAN_MAX_BUFFER_BYTES,
    encoding: 'utf8',
    timeout: PORT_SCAN_TIMEOUT_MS
  })
  return stdout
}
