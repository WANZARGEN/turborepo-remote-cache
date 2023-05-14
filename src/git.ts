import cp from 'child_process'

class ProcessError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    Error.captureStackTrace(this)
    this.code = code
  }
}

/**
 * Util function for handling spawned processes as promises.
 * @param {string} exe Executable.
 * @param {Array<string>} args Arguments.
 * @param {string} cwd Working directory.
 * @return {Promise} A promise.
 */
function spawn(exe: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(exe, args, { cwd: cwd || process.cwd() })
    const buffer: string[] = []
    child.stderr.on('data', chunk => {
      buffer.push(chunk.toString())
    })
    child.stdout.on('data', chunk => {
      buffer.push(chunk.toString())
    })
    child.on('close', code => {
      const output = buffer.join('')
      if (code) {
        const msg = output || `Process failed: ${code}. (command: ${exe} ${args.join(' ')})`
        reject(new ProcessError(code, msg))
      } else {
        resolve(output)
      }
    })
  })
}

/**
 * Create an object for executing git commands.
 * @param {string} cwd Repository directory.
 * @param {string} cmd Git executable (full path if not already on path).
 * @function Object() { [native code] }
 */
export class Git {
  cwd: string
  cmd: string
  output = ''

  constructor(cwd: string, cmd?: string) {
    this.cwd = cwd
    this.cmd = cmd || 'git'
  }

  async exec(...args: string[]): Promise<Git> {
    const output = await spawn(this.cmd, [...args], this.cwd)
    this.output = output
    return this
  }

  async add(_files: string | string[]) {
    const files = Array.isArray(_files) ? _files : [_files]
    return await this.exec('add', ...files)
  }

  async commit(message: string) {
    try {
      await this.exec('diff-index', '--quiet', 'HEAD')
    } catch (e) {
      await this.exec('commit', '-m', message)
    }
  }

  async push(remote: string, branch: string) {
    return await this.exec('push', '--tags', remote, branch)
  }
}
