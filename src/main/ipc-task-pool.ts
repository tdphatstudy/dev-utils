export class IpcTaskPool {
  private active = 0

  constructor(private readonly limit: number, private readonly message: string) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid IPC task limit.')
  }

  async run<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.active >= this.limit) throw new Error(this.message)
    this.active++
    try { return await work() }
    finally { this.active-- }
  }
}
