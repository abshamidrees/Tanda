import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Mounts server/router.ts on /api during dev, so the mini app talks to the
 * same origin it was loaded from and needs no CORS header on the phone.
 * In production the same handler runs as a Vercel function (api/index.ts).
 */
function apiDev(): Plugin {
  let ready: Promise<unknown> | null = null

  return {
    name: 'tanda-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        try {
          // The dev server owns its own schema, same as the Vercel entry does.
          ready ??= server
            .ssrLoadModule('/server/db/client.ts')
            .then((m) => m.migrateToLatest())
          await ready

          const { handle } = await server.ssrLoadModule('/server/router.ts')

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)

          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })

          const response: Response = await handle(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.config.logger.error(`[api] ${String(error)}`)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: String(error) } }))
        }
      })
    },
  }
}

// host:true is required: the phone loads this over the LAN, never localhost.
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDev()],
  server: { host: true, port: 5173 },
})
