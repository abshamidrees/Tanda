/// <reference types="node" />
/**
 * Vercel entry. vercel.json rewrites every /api/* path here, so the router in
 * server/router.ts stays the single source of routing for dev and production.
 *
 * Vercel treats a default-exported *function* as a Node (req, res) handler, so
 * the Web Request/Response signature must be this `fetch` object form — a plain
 * `export default function (request: Request)` would receive an IncomingMessage
 * and fail on every request.
 */
import { handle } from '../server/router.js'
import { migrateToLatest } from '../server/db/client.js'

let ready: Promise<unknown> | null = null

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)

    // Health answers without the database, and says whether one is configured,
    // so a fresh deploy can be checked before Postgres is attached.
    if (pathname === '/api/health') {
      return json({ ok: true, database: process.env.DATABASE_URL ? 'configured' : 'missing' }, 200)
    }

    try {
      // A failed attempt must not stick: retry migrations on the next request.
      ready ??= migrateToLatest().catch((error: unknown) => {
        ready = null
        throw error
      })
      await ready
    } catch (error) {
      console.error('[api] database unavailable', error)
      return json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Could not reach the database.' } }, 503)
    }

    return handle(request)
  },
}
