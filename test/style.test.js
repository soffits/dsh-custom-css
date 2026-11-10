import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../src/config.js'
import { composeStyle, OVERFLOW_FIX } from '../src/style.js'

test('defaults: the overflow fix on, no user css', () => {
  const config = Config({})
  assert.equal(config.fixOverflow, true)
  assert.equal(config.css, '')
  const style = composeStyle(config)
  assert.ok(style.includes(OVERFLOW_FIX))
  assert.ok(!style.includes('your css'))
})

test('the fix clips html and body so the document cannot scroll', () => {
  assert.match(OVERFLOW_FIX, /html\s*{[^}]*overflow:\s*hidden/)
  assert.match(OVERFLOW_FIX, /body\s*{[^}]*position:\s*fixed[^}]*overflow:\s*clip/s)
})

test('user css comes after the fix, so it can override it', () => {
  const style = composeStyle({ fixOverflow: true, css: 'body { color: red }' })
  assert.ok(style.indexOf('overflow: hidden') < style.indexOf('color: red'))
})

test('the fix can be turned off and only the user css remains', () => {
  const style = composeStyle({ fixOverflow: false, css: ' a { top: 0 } ' })
  assert.ok(!style.includes('overflow'))
  assert.match(style, /a \{ top: 0 \}/)
})

test('nothing configured gives an empty stylesheet', () => {
  assert.equal(composeStyle({ fixOverflow: false, css: '  ' }), '')
})
