/**
 * One schema, two drivers.
 *
 * Production uses DATABASE_URL over postgres-js (Neon, per §3). Local dev uses
 * PGlite — real Postgres compiled to WASM, running in-process — so the server
 * and the seed run with no account, no Docker and no network. Identical SQL,
 * so nothing about the schema is dev-only.
 */
import { fileURLToPath } from 'node:url'
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

export type Db = PostgresJsDatabase<typeof schema>

/** Server tests point this at `memory://`, so they never touch the dev database. */
const LOCAL_DATA_DIR = process.env.TANDA_PGLITE_DIR ?? './.pglite'
/**
 * Resolved from this file, not the working directory: a deployed function's
 * cwd is not guaranteed to be the project root, but its migrations always ship
 * beside this module (vercel.json includeFiles).
 */
const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url))

type Connection = { db: Db; kind: 'postgres' | 'pglite'; migrate: () => Promise<void> }

let instance: Promise<Connection> | null = null

async function connect(): Promise<Connection> {
  const url = process.env.DATABASE_URL

  if (url) {
    const { default: postgres } = await import('postgres')
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    const db = drizzlePg(postgres(url, { max: 1 }), { schema })
    return {
      db,
      kind: 'postgres',
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }),
    }
  }

  // A deployment has a read-only filesystem and no persistence between
  // invocations, so PGlite cannot stand in there. Say so plainly.
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Attach a Postgres database to this Vercel project.')
  }

  // No DATABASE_URL, local dev: fall back to the embedded database.
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const client = new PGlite(LOCAL_DATA_DIR)
  await client.waitReady
  const db = drizzlePglite(client, { schema })
  return {
    db: db as unknown as Db,
    kind: 'pglite',
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }),
  }
}

function connection(): Promise<Connection> {
  instance ??= connect()
  return instance
}

export async function db(): Promise<Db> {
  return (await connection()).db
}

/** Apply pending migrations. Idempotent — safe on every boot. */
export async function migrateToLatest(): Promise<'postgres' | 'pglite'> {
  const conn = await connection()
  await conn.migrate()
  return conn.kind
}

export { schema }
