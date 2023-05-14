import { join } from 'path'
import { Readable, pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
import { STORAGE_PROVIDERS } from '../../../env'
import { createS3, type S3Options as S3Opts } from './s3'
import { createLocal, type LocalOptions as LocalOpts } from './local'
import {
  createGoogleCloudStorage,
  type GoogleCloudStorageOptions as GCSOpts,
} from './google-cloud-storage'
import {
  createAzureBlobStorage,
  type AzureBlobStorageOptions as AzureBlobStorageOpts,
} from './azure-blob-storage'

const pipeline = promisify(pipelineCallback)
const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const
const TURBO_CACHE_USE_TMP_FOLDER = true as const

type LocalOptions = Partial<LocalOpts>
type S3Options = Omit<S3Opts, 'bucket'> & LocalOptions
type GoogleCloudStorageOptions = Omit<GCSOpts, 'bucket'> & LocalOptions
type AzureBlobStorageOptions = Omit<AzureBlobStorageOpts, 'bucket'> & LocalOptions

type ProviderOptions<Provider extends STORAGE_PROVIDERS> = Provider extends STORAGE_PROVIDERS.LOCAL
  ? LocalOptions
  : Provider extends STORAGE_PROVIDERS.S3
  ? S3Options
  : Provider extends STORAGE_PROVIDERS.AZURE_BLOB_STORAGE
  ? AzureBlobStorageOptions
  : Provider extends STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE
  ? GoogleCloudStorageOptions
  : never

// https://github.com/maxogden/abstract-blob-store#api
export interface StorageProvider {
  exists: (artifactPath: string, cb: (err: Error | null, exists?: boolean) => void) => void
  createReadStream: (artifactPath: string) => NodeJS.ReadStream
  createWriteStream: (artifactPath: string) => NodeJS.WritableStream
  afterCreateWriteStream?: (artifactPath: string) => Promise<void>
}

async function createStorageLocation<Provider extends STORAGE_PROVIDERS>(
  provider: Provider,
  providerOptions: ProviderOptions<Provider>,
): Promise<StorageProvider> {
  const { path = TURBO_CACHE_FOLDER_NAME, useTmp = TURBO_CACHE_USE_TMP_FOLDER } = providerOptions

  switch (provider) {
    case STORAGE_PROVIDERS.LOCAL: {
      return createLocal({ path, useTmp })
    }
    case STORAGE_PROVIDERS.S3:
    case STORAGE_PROVIDERS.s3: {
      const { accessKey, secretKey, region, endpoint } = providerOptions as S3Options
      return createS3({ accessKey, secretKey, bucket: path, region, endpoint })
    }
    case STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE: {
      const { clientEmail, privateKey, projectId } = providerOptions as GoogleCloudStorageOptions
      return createGoogleCloudStorage({ bucket: path, clientEmail, privateKey, projectId })
    }
    case STORAGE_PROVIDERS.AZURE_BLOB_STORAGE: {
      const { connectionString } = providerOptions as AzureBlobStorageOptions
      return createAzureBlobStorage({ containerName: path, connectionString })
    }
    default:
      throw new Error(
        `Unsupported storage provider '${provider}'. Please select one of the following: ${Object.values(
          STORAGE_PROVIDERS,
        ).join(', ')}!`,
      )
  }
}

export async function createLocation<Provider extends STORAGE_PROVIDERS>(
  provider: Provider,
  providerOptions: ProviderOptions<Provider>,
) {
  const location = await createStorageLocation(provider, providerOptions)

  async function getCachedArtifact(artifactId: string, teamId: string) {
    return new Promise((resolve, reject) => {
      const artifactPath = join(teamId, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact ${artifactPath} doesn't exist.`))
        }
        resolve(location.createReadStream(artifactPath))
      })
    })
  }

  async function existsCachedArtifact(artifactId: string, teamId: string) {
    return new Promise<void>((resolve, reject) => {
      const artifactPath = join(teamId, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact ${artifactPath} doesn't exist.`))
        }
        resolve()
      })
    })
  }

  async function createCachedArtifact(artifactId: string, teamId: string, artifact: Readable) {
    const artifactPath = join(teamId, artifactId)
    const writeStream = pipeline(artifact, location.createWriteStream(artifactPath))
    await writeStream
    if (location.afterCreateWriteStream) await location.afterCreateWriteStream(artifactPath)
    return writeStream
  }

  return {
    getCachedArtifact,
    createCachedArtifact,
    existsCachedArtifact,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    location: {
      existsCachedArtifact: Awaited<ReturnType<typeof createLocation>>['existsCachedArtifact']
      getCachedArtifact: Awaited<ReturnType<typeof createLocation>>['getCachedArtifact']
      createCachedArtifact: Awaited<ReturnType<typeof createLocation>>['createCachedArtifact']
    }
  }
}
