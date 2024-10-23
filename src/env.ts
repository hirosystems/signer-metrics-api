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
  NETWORK: Type.Enum(
    { mainnet: 'mainnet', testnet: 'testnet', devnet: 'devnet' },
    { default: 'mainnet' }
  ),
  /** Hosname of the API server */
  API_HOST: Type.String({ default: '0.0.0.0' }),
  /** Port in which to serve the API */
  API_PORT: Type.Number({ default: 3011, minimum: 0, maximum: 65535 }),
  /** Port in which to receive chainhook events */
  EVENT_PORT: Type.Number({ default: 3199, minimum: 0, maximum: 65535 }),
  /** Event server body limit (bytes) */
  EVENT_SERVER_BODY_LIMIT: Type.Integer({ default: 20971520 }),
  /** Hostname that will be reported to the chainhook node so it can call us back with events */
  EXTERNAL_HOSTNAME: Type.String({ default: '127.0.0.1' }),
  /** Port in which to serve prometheus metrics */
  PROMETHEUS_PORT: Type.Number({ default: 9154 }),
  /** Port in which to serve the profiler */
  PROFILER_PORT: Type.Number({ default: 9119 }),

  /** Hostname of the chainhook node we'll use to register predicates */
  CHAINHOOK_NODE_RPC_HOST: Type.String({ default: '127.0.0.1' }),
  /** Control port of the chainhook node */
  CHAINHOOK_NODE_RPC_PORT: Type.Number({ default: 20456, minimum: 0, maximum: 65535 }),
  /**
   * Authorization token that the chainhook node must send with every event to make sure it's
   * coming from the valid instance
   */
  CHAINHOOK_NODE_AUTH_TOKEN: Type.String(),
  /**
   * Register chainhook predicates automatically when the API is first launched. Set this to `false`
   * if you're configuring your predicates manually.
   */
  CHAINHOOK_AUTO_PREDICATE_REGISTRATION: Type.Boolean({ default: true }),
  /**
   * File path to a directory where the `predicate.json` file will be persisted by the API when
   * registering its chainhook predicate so it can validate and resume later. Only used if auto
   * predicate registration is enabled.
   */
  CHAINHOOK_PREDICATE_PATH: Type.String({ default: '.' }),

  PGHOST: Type.String(),
  PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  PGUSER: Type.String(),
  PGPASSWORD: Type.String(),
  PGDATABASE: Type.String(),
  /** Limit to how many concurrent connections can be created */
  PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  PG_IDLE_TIMEOUT: Type.Number({ default: 30 }),
  PG_MAX_LIFETIME: Type.Number({ default: 60 }),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  schema: schema,
  dotenv: true,
});
