import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../src/config.js'
import { composeStyle, EDGE_TO_EDGE, OVERFLOW_FIX, PROBE_FLAG } from '../src/style.js'

test('defaults: the overflow fix on, no edge to edge, no probe, no user css', () => {
  const config = Config({})
  assert.equal(config.fixOverflow, true)
  assert.equal(config.edgeToEdge, false)
  assert.equal(config.probe, false)
  assert.equal(config.css, '')
  const style = composeStyle(config)
  assert.ok(style.includes(OVERFLOW_FIX))
  assert.ok(!style.includes('edge'))
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

const SIDES = ['top', 'right', 'bottom', 'left']
/** The declarations of the first rule for `selector`, as a property → value map. */
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`(?:^|})\\s*${escaped}\\s*{([^}]*)}`).exec(css.replace(/\/\*.*?\*\//gs, ''))?.[1]
  assert.ok(block !== undefined, `no rule for ${selector}`)
  return Object.fromEntries(block.split(';').map(line => line.trim()).filter(Boolean).map((line) => {
    const colon = line.indexOf(':')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  }))
}

test('the edge setting adds the flag client.js looks for, before the user css', () => {
  const style = composeStyle({ fixOverflow: true, edgeToEdge: true, css: ':root { --edge-shell-right: 0px }' })
  assert.equal(rule(style, ':root')['--dsh-custom-css-edge'], '1')
  assert.ok(style.indexOf(OVERFLOW_FIX) < style.indexOf(EDGE_TO_EDGE))
  assert.ok(style.indexOf(EDGE_TO_EDGE) < style.indexOf('--edge-shell-right: 0px'), 'user css can lower a shell inset')
})

test('edge to edge takes every inset from env(), with the shell keeping to them by default', () => {
  const root = rule(EDGE_TO_EDGE, ':root')
  for (const side of SIDES) {
    assert.equal(root[`--edge-inset-${side}`], `env(safe-area-inset-${side}, 0px)`)
    assert.equal(root[`--edge-shell-${side}`], `var(--edge-inset-${side})`)
  }
  assert.equal(rule(EDGE_TO_EDGE, '#root').padding, SIDES.map(side => `var(--edge-shell-${side})`).join(' '))
  assert.equal(rule(EDGE_TO_EDGE, '#root')['box-sizing'], 'border-box')
  assert.doesNotMatch(EDGE_TO_EDGE.replace(/, 0px\)/g, ')'), /\d+px/, 'no inset is written down as a number')
})

test('edge to edge keeps fixed boxes in the safe area and lets body fill the screen', () => {
  const html = rule(EDGE_TO_EDGE, 'html')
  // the border makes html's padding box the safe area; the transform makes that box hold position: fixed descendants
  assert.equal(html['border-width'], SIDES.map(side => `var(--edge-inset-${side})`).join(' '))
  assert.equal(html['box-sizing'], 'border-box')
  assert.match(html.border, /transparent/)
  assert.equal(html.transform, 'translate(0)')
  const body = rule(EDGE_TO_EDGE, 'body')
  assert.equal(body.margin, SIDES.map(side => `calc(-1 * var(--edge-inset-${side}))`).join(' '))
  assert.equal(body.height, 'calc(100% + var(--edge-inset-top) + var(--edge-inset-bottom))')
})

test('edge to edge moves popups placed in window coordinates back by the top and left insets', () => {
  const popup = rule(EDGE_TO_EDGE, 'body > [style*="top:"][style*="left:"]')
  assert.equal(popup.translate, 'calc(-1 * var(--edge-inset-left)) calc(-1 * var(--edge-inset-top))')
})

test('edge to edge leaves the overflow fix alone: body stays in normal flow', () => {
  assert.doesNotMatch(EDGE_TO_EDGE, /position:/)
  assert.doesNotMatch(EDGE_TO_EDGE, /overflow/)
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
