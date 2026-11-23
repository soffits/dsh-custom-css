import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../src/config.js'
import { composeStyle, OVERFLOW_FIX, PROBE_FLAG } from '../src/style.js'

test('defaults: the overflow fix on, no probe, no user css', () => {
  const config = Config({})
  assert.equal(config.fixOverflow, true)
  assert.equal(config.probe, false)
  assert.equal(config.css, '')
  const style = composeStyle(config)
  assert.ok(style.includes(OVERFLOW_FIX))
  assert.ok(!style.includes(PROBE_FLAG))
  assert.ok(!style.includes('your css'))
})

test('the fix clips html and body so the document cannot scroll', () => {
  assert.match(OVERFLOW_FIX, /html\s*{[^}]*overflow:\s*hidden/)
  // body clips its content and is the containing block of absolutely positioned elements, so they are clipped too
  assert.match(OVERFLOW_FIX, /body\s*{[^}]*position:\s*relative[^}]*overflow:\s*clip/s)
})

test('the fix keeps body in normal flow, never in a fixed layer', () => {
  // iOS places fixed layers from its own viewport, which goes stale after a rotation: the app is drawn away from where taps land
  assert.doesNotMatch(OVERFLOW_FIX, /position:\s*fixed/)
  assert.doesNotMatch(OVERFLOW_FIX, /inset:/)
})

test('the probe setting adds the flag client.js looks for', () => {
  const style = composeStyle({ fixOverflow: true, probe: true, css: 'a { top: 0 }' })
  assert.ok(style.includes('--dsh-custom-css-probe: 1'))
  assert.ok(style.indexOf(PROBE_FLAG) < style.indexOf('a { top: 0 }'))
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
