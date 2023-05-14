import { Git } from '../../../git'
import fsBlob from 'fs-blob-store'
import fsExtra from 'fs-extra'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { StorageProvider } from './index'

export type GitRepositoryOptions = {
  repo: string
  branch: string
  remote: string
  path?: string
  userPassword: string
  userName: string
  userEmail: string
  host: string
}

export async function createGitRepository(options: GitRepositoryOptions): Promise<StorageProvider> {
  const tempDir = tmpdir()
  const repoUrl = options.repo
  const cacheDir = path.join(tempDir, 'git-repository', options.path ?? '')
  const credentialPath = path.join(tempDir, 'git-repository', '.git-credentials')
  const git: Git = new Git(cacheDir)
  let skipClone = false

  const ensureCacheDir = async () => {
    if (fsExtra.pathExistsSync(cacheDir)) {
      console.debug('Cache directory %s already exists', cacheDir)
      if (fsExtra.pathExistsSync(path.join(cacheDir, '.git'))) {
        console.debug('.git directory already exists')
        await git.exec('config', '--get', 'remote.' + options.remote + '.url')
        const url = git.output?.trim() ?? ''
        if (url !== repoUrl) {
          console.debug('Url mismatch.  Got "%s" but expected "%s"', url, repoUrl)
          console.debug('Empty cache directory %s', cacheDir)
          fsExtra.emptyDirSync(cacheDir)
        } else {
          skipClone = true
        }
      } else {
        console.debug('Empty cache directory %s', cacheDir)
        fsExtra.emptyDirSync(cacheDir)
      }
    } else {
      console.debug('Make cache directory %s', cacheDir)
      fsExtra.mkdirpSync(cacheDir)
    }
  }
  const clone = async () => {
    if (skipClone) {
      console.debug('Skipping clone')
      return
    }
    console.debug('Cloning %s into %s', repoUrl, cacheDir)
    await git.exec(
      'clone',
      repoUrl,
      cacheDir,
      '--branch',
      options.branch,
      '--single-branch',
      '--origin',
      options.remote,
    )
  }
  const configGit = async () => {
    console.debug('Configuring git user %s <%s>', options.userName, options.userEmail)
    await git.exec('config', 'user.email', options.userEmail)
    await git.exec('config', 'user.name', options.userName)
    await git.exec('config', 'user.password', options.userPassword)
    await git.exec('config', 'commit.gpgsign', 'false')
    await git.exec('config', 'credential.helper', `store --file=${credentialPath}`)
    if (!fs.existsSync(credentialPath)) {
      fs.writeFileSync(
        credentialPath,
        `https://${options.userName}:${options.userPassword}@${options.host}`,
      )
    }
  }

  const pull = async () => {
    console.debug('Pulling fast-forward only from %s/%s', options.remote, options.branch)
    await git.exec('merge', '--ff-only', `${options.remote}/${options.branch}`)
  }

  const checkout = async () => {
    console.debug('Checking out %s/%s ', options.remote, options.branch)
    await git.exec('ls-remote', '--exit-code', '.', `${options.remote}/${options.branch}`)
    await git.exec('checkout', options.branch)
    await git.exec('reset', '--hard', `${options.remote}/${options.branch}`)
  }

  const init = async () => {
    await ensureCacheDir()
    await clone()
    await checkout()
    await configGit()
    console.debug('Git storage is ready')
  }

  const commitAndPush = async (artifactPath: string) => {
    console.debug('Adding %s', artifactPath)
    await git.add(artifactPath)

    console.debug('Committing')
    await git.commit(`chore: update cache ${artifactPath}`)

    console.debug('Pushing to %s/%s', options.remote, options.branch)
    await git.push(options.remote, options.branch)
  }

  const location: StorageProvider = {
    exists: (artifactPath, cb) => {
      pull().then(() => {
        const exists = fs.existsSync(path.join(cacheDir, artifactPath))
        console.debug('exists: ', exists, path.join(cacheDir, artifactPath))
        cb(null, exists)
      })
    },
    createReadStream: artifactPath => {
      return fsBlob(cacheDir).createReadStream(artifactPath)
    },
    createWriteStream: artifactPath => {
      return fsBlob(cacheDir).createWriteStream(artifactPath)
    },
    afterCreateWriteStream: async artifactPath => {
      try {
        await pull()
        await commitAndPush(artifactPath)
      } catch (e) {
        console.error(e)
        throw e
      }
    },
  }

  await init()

  return location
}
