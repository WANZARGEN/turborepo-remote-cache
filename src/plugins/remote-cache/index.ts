import { FastifyInstance } from 'fastify'
import { badRequest, unauthorized } from '@hapi/boom'
import { getArtifact, putArtifact, artifactsEvents, headArtifact, getStatus } from './routes'
import { createLocation } from './storage'
import { STORAGE_PROVIDERS } from '../../env'

async function turboRemoteCache(
  instance: FastifyInstance,
  options: {
    allowedTokens: string[]
    apiVersion?: `v${number}`
    provider?: STORAGE_PROVIDERS
  },
) {
  const bodyLimit = <number>instance.config.BODY_LIMIT
  const { allowedTokens, apiVersion = 'v8', provider = STORAGE_PROVIDERS.LOCAL } = options
  if (!(Array.isArray(allowedTokens) && allowedTokens.length)) {
    throw new Error(
      `'allowedTokens' options must be a string[], ${typeof allowedTokens} provided instead`,
    )
  }

  instance.addContentTypeParser<Buffer>(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit },
    async function parser(request, payload) {
      return payload
    },
  )

  const location = await createLocation(provider, {
    accessKey: instance.config.S3_ACCESS_KEY,
    secretKey: instance.config.S3_SECRET_KEY,
    path: instance.config.STORAGE_PATH,
    region: instance.config.S3_REGION,
    endpoint: instance.config.S3_ENDPOINT,
    clientEmail: instance.config.GCS_CLIENT_EMAIL,
    privateKey: instance.config.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: instance.config.GCS_PROJECT_ID,
    useTmp: !!instance.config.STORAGE_PATH_USE_TMP_FOLDER,
    connectionString: instance.config.ABS_CONNECTION_STRING,
    repo: instance.config.GIT_REPOSITORY,
    branch: instance.config.GIT_BRANCH,
    remote: instance.config.GIT_REMOTE,
    userName: instance.config.GIT_USER_NAME,
    userEmail: instance.config.GIT_USER_EMAIL,
    userPassword: instance.config.GIT_USER_PASSWORD,
    host: instance.config.GIT_HOST,
    useLocalCache: !!instance.config.GIT_USE_LOCAL_CACHE,
    cloneDepth: instance.config.GIT_CLONE_DEPTH,
  })
  instance.decorate('location', location)

  await instance.register(
    async function (i) {
      const tokens = new Set<string>(allowedTokens)

      i.addHook('onRequest', async function (request) {
        let authHeader = request.headers['authorization']
        authHeader = Array.isArray(authHeader) ? authHeader.join() : authHeader

        if (!authHeader) {
          throw badRequest(`Missing Authorization header`)
        }
        const [, token] = authHeader.split('Bearer ')
        if (!tokens.has(token)) {
          throw unauthorized(`Invalid authorization token`)
        }
      })

      i.route(getArtifact)
      i.route(headArtifact)
      i.route(putArtifact)
      i.route(artifactsEvents)
    },
    { prefix: `/${apiVersion}` },
  )

  await instance.register(
    async i => {
      i.route(getStatus)
    },
    { prefix: `/${apiVersion}` },
  )
}

export default turboRemoteCache
