import { PgStore } from '../../../pg/pg-store';

declare module 'fastify' {
  export interface FastifyInstance {
    db: PgStore;
  }
}
