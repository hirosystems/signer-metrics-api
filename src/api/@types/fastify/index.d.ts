import { PgStore } from '../../../pg/pg-store.js';

declare module 'fastify' {
  export interface FastifyInstance {
    db: PgStore;
  }
}
