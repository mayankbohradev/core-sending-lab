import pg from 'pg'
import type { Pool as PgPool, PoolClient, QueryResultRow } from 'pg'

import type { AppConfig } from '../config.js'

const { Pool } = pg

export type Database = PgPool | PoolClient

export type Queryable = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<Row>>
}

export function createPool(config: AppConfig): PgPool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
  })
}

