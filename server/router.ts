/**
 * The whole API. Three routes: create a circle, join by code, read a circle.
 *
 * Written against the Web Request/Response types so the same handler runs under
 * the Vite dev middleware and as a Vercel function, with no adapter per route.
 *
 * Identity is the Nimiq Pay device identifier (§10), sent as `x-tanda-device`.
 * It is a handle, not authentication — it says which seat you occupy, and it
 * never authorises anything that moves money. Payment routes, when they land,
 * need the wallet signature instead.
 */
import { z } from 'zod'
import {
  HttpError,
  confirmReceived,
  createCircle,
  joinCircle,
  listCircles,
  readCircle,
  recordSent,
} from './service.js'
import { MAX_MEMBERS, MIN_MEMBERS, nimToLuna } from './domain.js'
import { getBalance } from './chain.js'

const deviceIdSchema = z.string().min(8).max(128)

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** NIM, as typed on the keypad in §8.3. Converted to Luna at the boundary. */
  shareNim: z.number().positive().finite(),
  frequency: z.enum(['weekly', 'monthly']),
  memberCount: z.number().int().min(MIN_MEMBERS).max(MAX_MEMBERS),
  displayName: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(72),
})

const joinSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(72),
})

const sentSchema = z.object({
  /** Returned by the wallet. The client only ever gets here with a real one. */
  txHash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Not a transaction hash.'),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    )
  }
  if (error instanceof z.ZodError) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Check the fields and try again.', issues: error.issues } },
      400,
    )
  }
  console.error('[api]', error)
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500)
}

function requireDevice(request: Request): string {
  const raw = request.headers.get('x-tanda-device')
  const parsed = deviceIdSchema.safeParse(raw)
  if (!parsed.success) {
    throw new HttpError(401, 'DEVICE_REQUIRED', 'Missing device identifier.')
  }
  return parsed.data
}

// Deliberately loose. A mistyped code is a user error with a name (§11), so it
// must reach the service and come back as CODE_MALFORMED, not a bare 404.
const CODE = '[^/]{1,24}'
const ID = '[0-9a-fA-F-]{36}'
const CIRCLE = new RegExp(`^/api/circles/(${CODE})$`)
const JOIN = new RegExp(`^/api/circles/(${CODE})/join$`)
const SENT = new RegExp(`^/api/circles/(${CODE})/shares/(${ID})/sent$`)
const CONFIRM = new RegExp(`^/api/circles/(${CODE})/shares/(${ID})/confirm$`)

export async function handle(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method.toUpperCase()

  try {
    if (method === 'GET' && pathname === '/api/health') {
      return json({ ok: true })
    }

    // An address's balance, so §11 can name the exact shortfall. Public chain
    // data; null when the indexer cannot be reached.
    if (method === 'GET' && pathname === '/api/balance') {
      const address = new URL(request.url).searchParams.get('address') ?? ''
      if (!/^NQ\d{2}[\s0-9A-Z]{32,40}$/i.test(address.trim())) {
        throw new HttpError(400, 'ADDRESS_MALFORMED', 'That is not a Nimiq address.')
      }
      return json({ balance: await getBalance(address) })
    }

    // The circles this device belongs to (§8.2 home).
    if (method === 'GET' && pathname === '/api/circles') {
      return json(await listCircles(requireDevice(request)))
    }

    // Create a circle.
    if (method === 'POST' && pathname === '/api/circles') {
      const deviceId = requireDevice(request)
      const input = createSchema.parse(await request.json())
      return json(
        await createCircle({
          name: input.name,
          shareAmount: nimToLuna(input.shareNim),
          frequency: input.frequency,
          memberCount: input.memberCount,
          displayName: input.displayName,
          address: input.address,
          deviceId,
        }),
        201,
      )
    }

    // Join by code.
    const joining = JOIN.exec(pathname)
    if (joining && method === 'POST') {
      const deviceId = requireDevice(request)
      const input = joinSchema.parse(await request.json())
      return json(await joinCircle({ code: joining[1], ...input, deviceId }))
    }

    // The payer records a hash the wallet handed back (§8.6).
    const sent = SENT.exec(pathname)
    if (sent && method === 'POST') {
      const deviceId = requireDevice(request)
      const { txHash } = sentSchema.parse(await request.json())
      return json(await recordSent({ code: sent[1], shareId: sent[2], txHash, deviceId }))
    }

    // The receiver signs off that it arrived (§8.7). Settles the round when it
    // is the last one outstanding.
    const confirm = CONFIRM.exec(pathname)
    if (confirm && method === 'POST') {
      const deviceId = requireDevice(request)
      return json(await confirmReceived({ code: confirm[1], shareId: confirm[2], deviceId }))
    }

    // Read a circle. Readable without a device so the join screen can show the
    // terms and the rotation order before anyone commits (§8.4).
    const reading = CIRCLE.exec(pathname)
    if (reading && method === 'GET') {
      const deviceId = request.headers.get('x-tanda-device')
      return json(await readCircle(reading[1], deviceId))
    }

    return json({ error: { code: 'NOT_FOUND', message: `No route for ${method} ${pathname}.` } }, 404)
  } catch (error) {
    return fail(error)
  }
}
