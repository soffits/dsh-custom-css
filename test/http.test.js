import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, STYLE_PATH } from '../src/http.js'

const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }

function respond(handler, { url = STYLE_PATH, method = 'GET' } = {}) {
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(body) { this.body = body; return this },
  }
  handler({ url, method, headers: {} }, res)
  return res
}

test('the owner gets the stylesheet, uncached', () => {
  const res = respond(createHandler({ connection: owner, style: () => 'a{b:c}' }))
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/css; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.body.toString(), 'a{b:c}')
})

test('HEAD sends headers only', () => {
  const res = respond(createHandler({ connection: owner, style: () => 'a{b:c}' }), { method: 'HEAD' })
  assert.equal(res.status, 200)
  assert.equal(res.body, undefined)
})

test('refused and non-owner requests get no css', () => {
  const refused = respond(createHandler({ connection: { admit: () => ({ rejection: 401 }) }, style: () => 'x' }))
  assert.equal(refused.status, 401)
  const api = respond(createHandler({ connection: { admit: () => ({ peer: { principal: { kind: 'api' } } }) }, style: () => 'x' }))
  assert.equal(api.status, 403)
})

test('other paths and methods are refused', () => {
  const handler = createHandler({ connection: owner, style: () => 'x' })
  assert.equal(respond(handler, { url: '/custom-css/other' }).status, 404)
  assert.equal(respond(handler, { method: 'POST' }).status, 405)
})
