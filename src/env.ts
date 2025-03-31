import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  /**
   * Run mode for this service. Allows you to control how the service runs, typically
   * in an auto-scaled environment. Available values are:
   * * `default`: Runs background jobs and the REST API server (this is the default)
   * * `writeonly`: Runs only background jobs
   * * `readonly`: Runs only the REST API server
   */
  RUN_MODE: Type.Enum(
    { default: 'default', readonly: 'readonly', writeonly: 'writeonly' },
    { default: 'default' }
  ),
  /** Specifies which Stacks network this API is indexing */
  NETWORK: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }, { default: 'mainnet' }),
  /** Hosname of the API server */
  API_HOST: Type.String({ default: '0.0.0.0' }),
  /** Port in which to serve the API */
  API_PORT: Type.Number({ default: 3011, minimum: 0, maximum: 65535 }),

  /** Port in which to serve prometheus metrics */
  PROMETHEUS_PORT: Type.Number({ default: 9153 }),
  /** Port in which to serve the profiler */
  PROFILER_PORT: Type.Number({ default: 9119 }),

  SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS: Type.String({
    pattern: '^\\d+(,\\d+)*$',
    default: '5,10,25,100,1000',
  }),

  STACKS_NODE_RPC_HOST: Type.String(),
  STACKS_NODE_RPC_PORT: Type.Number({ minimum: 0, maximum: 65535 }),

  REDIS_URL: Type.String(),
  REDIS_STREAM_KEY_PREFIX: Type.String({ default: '' }),

  PGHOST: Type.String(),
  PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  PGUSER: Type.String(),
  PGPASSWORD: Type.String(),
  PGDATABASE: Type.String(),
  PGSCHEMA: Type.Optional(Type.String()),
  /** Limit to how many concurrent connections can be created */
  PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  PG_IDLE_TIMEOUT: Type.Number({ default: 0 }),
  PG_MAX_LIFETIME: Type.Number({ default: 0 }),
});
type Env = Static<typeof schema>;

function getEnv() {
  const env = {};
  function reload() {
    Object.keys(env).forEach(key => delete (env as Record<string, any>)[key]);
    return Object.assign(env, {
      reload,
      ...envSchema<Env>({
        schema: schema,
        dotenv: true,
      }),
    });
  }
  return reload();
}

export const ENV = getEnv();
