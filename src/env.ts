import Ajv from 'ajv'
import envSchema from 'env-schema'
import { Type, Static } from '@sinclair/typebox'

enum NODE_ENVS {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
  TEST = 'test',
}

export enum STORAGE_PROVIDERS {
  LOCAL = 'local',
  S3 = 'S3',
  s3 = 's3',
  GOOGLE_CLOUD_STORAGE = 'google-cloud-storage',
  AZURE_BLOB_STORAGE = 'azure-blob-storage',
  GIT_REPOSITORY = 'git-repository',
}

const schema = Type.Object(
  {
    NODE_ENV: Type.Optional(Type.Enum(NODE_ENVS, { default: NODE_ENVS.PRODUCTION })),
    TURBO_TOKEN: Type.String({ separator: ',' }),
    PORT: Type.Number({ default: 3000 }),
    LOG_LEVEL: Type.Optional(Type.String({ default: 'info' })),
    STORAGE_PROVIDER: Type.Optional(
      Type.Enum(STORAGE_PROVIDERS, { default: STORAGE_PROVIDERS.LOCAL }),
    ),
    BODY_LIMIT: Type.Optional(Type.Number({ default: 104857600 })),
    STORAGE_PATH: Type.Optional(Type.String()),
    STORAGE_PATH_USE_TMP_FOLDER: Type.Optional(Type.Boolean({ default: true })),
    // AWS_ env vars are used as aws-sdk defaults
    AWS_ACCESS_KEY_ID: Type.Optional(Type.String()),
    AWS_SECRET_ACCESS_KEY: Type.Optional(Type.String()),
    AWS_REGION: Type.Optional(Type.String()),
    // S3_ env vars are used by Vercel. ref: https://vercel.com/support/articles/how-can-i-use-aws-sdk-environment-variables-on-vercel
    S3_ACCESS_KEY: Type.Optional(Type.String()),
    S3_SECRET_KEY: Type.Optional(Type.String()),
    S3_REGION: Type.Optional(Type.String()),
    // S3_ENDPOINT is shared between are deployments type
    S3_ENDPOINT: Type.Optional(Type.String()),

    // Google Cloud Storage credentials
    GCS_PROJECT_ID: Type.Optional(Type.String()),
    GCS_CLIENT_EMAIL: Type.Optional(Type.String()),
    GCS_PRIVATE_KEY: Type.Optional(Type.String()),

    // Azure Blob Storage credentials
    ABS_CONNECTION_STRING: Type.Optional(Type.String()),

    // Git Repository vars and credentials
    GIT_REPOSITORY: Type.Optional(Type.String()),
    GIT_BRANCH: Type.Optional(Type.String({ default: 'main' })),
    GIT_REMOTE: Type.Optional(Type.String({ default: 'origin' })),
    GIT_USER_NAME: Type.Optional(Type.String()),
    GIT_USER_EMAIL: Type.Optional(Type.String()),
    GIT_USER_PASSWORD: Type.Optional(Type.String()),
    GIT_HOST: Type.Optional(Type.String({ default: 'github.com' })),
    GIT_USE_LOCAL_CACHE: Type.Optional(Type.Boolean({ default: true })),
    GIT_CLONE_DEPTH: Type.Optional(Type.Number({ default: 0 })),
  },
  {
    additionalProperties: false,
  },
)
export const env = envSchema<Static<typeof schema>>({
  ajv: new Ajv({
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    keywords: ['kind', 'RegExp', 'modifier', envSchema.keywords.separator],
  }),
  dotenv: process.env.NODE_ENV === NODE_ENVS.DEVELOPMENT ? true : false,
  schema,
})
