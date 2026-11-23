/**
 * The plugin's routes, answered only for the signed-in owner (the same check
 * DSH applies to its own API; behind a sign-in plugin every signed-in person
 * reaches DSH as the owner):
 *
 * - GET/HEAD /custom-css/style.css: the stylesheet, never cached, so a changed
 *   config shows after one load. `etag` carries its revision, which lets an
 *   open page ask whether its copy is still current without fetching it.
 * - POST /custom-css/report: one page's reading, appended to the report log
 *   when the `report` setting is on. The answer is the current revision.
 */
import { REPORT_MAX_BYTES } from './report.js'

export const PREFIX = '/custom-css'
export const STYLE_PATH = `${PREFIX}/style.css`
export const REPORT_PATH = `${PREFIX}/report`

const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})
const TEXT = { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }

/** The request body as text, or null once it is larger than `max` bytes. */
async function readBody(req, max) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > max) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @param {object} options
 * @param {{ admit: (request: { headers: object }) => ({ peer: { principal: { kind: string } } } | { rejection: 401 | 403 }) }} options.connection
 * @param {() => string} options.style - Current stylesheet text.
 * @param {() => string} [options.revision] - What names the current stylesheet.
 * @param {(reading: object) => void} [options.report] - Takes a page's reading; absent while reporting is off.
 */
export function createHandler({ connection, style, revision = () => '', report }) {
  const routes = {
    [STYLE_PATH]: {
      methods: ['GET', 'HEAD'],
      answer(req, res) {
        const body = Buffer.from(style(), 'utf8')
        res.writeHead(200, { ...HEADERS, 'content-type': 'text/css; charset=utf-8', 'content-length': body.length, etag: `"${revision()}"` })
        res.end(req.method === 'HEAD' ? undefined : body)
      },
    },
    [REPORT_PATH]: {
      methods: ['POST'],
      async answer(req, res) {
        const text = await readBody(req, REPORT_MAX_BYTES)
        if (text === null) return void res.writeHead(413, TEXT).end('Too large.\n')
        let reading
        try { reading = JSON.parse(text) } catch { reading = null }
        if (reading === null || typeof reading !== 'object' || Array.isArray(reading)) return void res.writeHead(400, TEXT).end('Not a report.\n')
        report?.(reading)
        res.writeHead(200, { ...HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ revision: revision(), kept: report !== undefined }))
      },
    },
  }
  return (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission) {
      res.writeHead(admission.rejection, TEXT).end(admission.rejection === 401 ? 'Sign in to DSH first.\n' : 'Forbidden.\n')
      return
    }
    if (admission.peer?.principal?.kind !== 'owner') {
      res.writeHead(403, TEXT).end('Forbidden.\n')
      return
    }
    const route = routes[new URL(req.url ?? '/', 'http://custom-css.invalid').pathname]
    if (route === undefined) {
      res.writeHead(404, TEXT).end('Not found.\n')
      return
    }
    if (!route.methods.includes(req.method)) {
      res.writeHead(405, { ...HEADERS, allow: route.methods.join(', ') }).end()
      return
    }
    return route.answer(req, res)
  }
}
