/**
 * GET /custom-css/style.css, answered only for the signed-in owner (the same
 * check DSH applies to its own API). The style is never cached, so a changed
 * config shows after one reload.
 */
export const PREFIX = '/custom-css'
export const STYLE_PATH = `${PREFIX}/style.css`

const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

/**
 * @param {object} options
 * @param {{ admit: (request: { headers: object }) => ({ peer: { principal: { kind: string } } } | { rejection: 401 | 403 }) }} options.connection
 * @param {() => string} options.style - Current stylesheet text.
 */
export function createHandler({ connection, style }) {
  return (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission) {
      res.writeHead(admission.rejection, { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end(admission.rejection === 401 ? 'Sign in to DSH first.\n' : 'Forbidden.\n')
      return
    }
    if (admission.peer?.principal?.kind !== 'owner') {
      res.writeHead(403, { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden.\n')
      return
    }
    const url = new URL(req.url ?? '/', 'http://custom-css.invalid')
    if (url.pathname !== STYLE_PATH) {
      res.writeHead(404, { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('Not found.\n')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...HEADERS, allow: 'GET, HEAD' }).end()
      return
    }
    const body = Buffer.from(style(), 'utf8')
    res.writeHead(200, { ...HEADERS, 'content-type': 'text/css; charset=utf-8', 'content-length': body.length })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}
