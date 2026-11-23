import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { apply, Config } from '../index.js'
import { PREFIX } from '../src/http.js'

test('the plugin registers one prefix route and removes it on unload', () => {
  const routes = []
  const disposers = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } },
    connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
  }
  apply(ctx, Config({}))
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, PREFIX)
  disposers[0]()
  assert.equal(routes.length, 0)
})

test('client.js links the stylesheet once and removes it on dispose', async () => {
  const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  let factory
  const head = []
  globalThis.window = { __ModuleLoader__: { load: ({ id, factory: created }) => { assert.equal(id, 'dsh-custom-css'); factory = created } } }
  globalThis.document = {
    baseURI: 'https://dsh.example/ui/',
    head: { appendChild: node => head.push(node) },
    getElementById: id => head.find(node => node.id === id) ?? null,
    createElement: () => ({ remove() { head.splice(head.indexOf(this), 1) } }),
  }
  new Function(source)()
  const plugin = factory()
  const effects = []
  plugin.apply({ effect: (fn) => { effects.push(fn()) } })
  assert.equal(head.length, 1)
  assert.equal(head[0].href, 'https://dsh.example/ui/custom-css/style.css')
  assert.equal(head[0].rel, 'stylesheet')
  effects[0]()
  assert.equal(head.length, 0)
})

const VIEWPORT = 'width=device-width, initial-scale=1'

/**
 * A page just big enough for client.js: head, body, events, timers and computed styles.
 * @param {Record<string, string>} flags - Custom properties the stylesheet sets on the root element.
 */
function fakePage(flags = {}) {
  const head = [{ name: 'viewport', content: VIEWPORT }]
  const body = []
  const listeners = new Map()
  const on = target => (type, fn) => listeners.set(`${target}:${type}`, fn)
  const off = target => type => listeners.delete(`${target}:${type}`)
  const element = (list) => ({ style: {}, textContent: '', remove() { const at = list().indexOf(this); if (at >= 0) list().splice(at, 1) } })
  const win = {
    innerWidth: 867, innerHeight: 669, devicePixelRatio: 3, scrollX: 0, scrollY: 0,
    screen: { width: 951, height: 669, orientation: { type: 'landscape-primary', angle: 90 } },
    navigator: { standalone: true },
    visualViewport: { width: 867, height: 669, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, addEventListener: on('vv'), removeEventListener: off('vv') },
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' }),
    getComputedStyle: el => (el === doc.documentElement ? { getPropertyValue: name => flags[name] ?? '' } : { paddingTop: '0px', paddingRight: '84px', paddingBottom: '34px', paddingLeft: '0px' }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setInterval: () => 2, clearInterval() {}, setTimeout: () => 3,
    addEventListener: on('window'), removeEventListener: off('window'),
  }
  const doc = {
    baseURI: 'https://dsh.example/ui/', defaultView: win, visibilityState: 'visible', documentElement: { clientWidth: 867, clientHeight: 669 },
    head: { appendChild: node => head.push(node) },
    body: { append: (...nodes) => body.push(...nodes), getBoundingClientRect: () => ({ x: 0, y: 0, width: 867, height: 669 }) },
    getElementById: id => [...head, ...body].find(node => node.id === id) ?? null,
    querySelector: selector => head.find(node => selector === `meta[name="${node.name}"]`) ?? null,
    createElement: tag => (tag === 'div' || tag === 'pre' ? element(() => body) : element(() => head)),
    addEventListener: on('document'), removeEventListener: off('document'),
  }
  const link = () => head.find(node => node.rel === 'stylesheet')
  const metas = () => Object.fromEntries(head.filter(node => node.name).map(node => [node.name, node.content]))
  return { doc, win, head, body, listeners, link, metas }
}

async function loadClient(page) {
  const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  let factory
  globalThis.window = { __ModuleLoader__: { load: ({ factory: created }) => { factory = created } } }
  globalThis.document = page.doc
  new Function(source)()
  const effects = []
  factory().apply({ effect: (fn) => { effects.push(fn()) } })
  return effects
}

test('without flags in the stylesheet the page is left alone', async () => {
  const page = fakePage()
  await loadClient(page)
  page.link().onload()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT })
})

test('with the edge flag the page asks for the whole screen, and unloading puts the head back', async () => {
  const page = fakePage({ '--dsh-custom-css-edge': ' 1' })
  const effects = await loadClient(page)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'nothing changes before the stylesheet says so')
  page.link().onload()
  assert.deepEqual(page.metas(), {
    viewport: `${VIEWPORT}, viewport-fit=cover`,
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  })
  assert.equal(page.body.length, 0, 'the edge flag does not start the probe')
  effects[0]()
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
})

test('tags the page already has are changed in place and restored', async () => {
  const page = fakePage({ '--dsh-custom-css-edge': '1' })
  page.head[0].content = 'width=device-width, viewport-fit=contain, initial-scale=1'
  page.head.push({ name: 'apple-mobile-web-app-status-bar-style', content: 'default' })
  const before = structuredClone(page.head)
  const effects = await loadClient(page)
  page.link().onload()
  assert.equal(page.metas().viewport, 'width=device-width, initial-scale=1, viewport-fit=cover')
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent')
  assert.equal(page.head.filter(node => node.name === 'apple-mobile-web-app-status-bar-style').length, 1)
  effects[0]()
  assert.deepEqual(page.head, before)
})

test('with the flag the probe shows the sizes, marks taps, and leaves nothing behind', async () => {
  const page = fakePage({ '--dsh-custom-css-probe': ' 1' })
  const effects = await loadClient(page)
  page.link().onload()
  const panel = page.body.find(node => node.id === 'dsh-custom-css-probe')
  assert.ok(panel)
  assert.match(panel.textContent, /window 867×669/)
  assert.match(panel.textContent, /safe-area t r b l 0 84 34 0/)
  assert.match(panel.textContent, /display standalone/)
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 500, target: null })
  assert.match(panel.textContent, /tap 100,500/)
  // 12px up and left of the tap, written as `inset` so the edge-to-edge popup rule (inline top and left) passes it by
  assert.ok(page.body.some(node => /inset:488px auto auto 88px/.test(node.style.cssText)))
  // body moved (the shell kept off a status bar): the mark still lands under the finger
  page.doc.body.getBoundingClientRect = () => ({ x: 0, y: 82, width: 867, height: 587 })
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 500, target: null })
  assert.ok(page.body.some(node => /inset:406px auto auto 88px/.test(node.style.cssText)))
  assert.ok(page.body.every(node => !/(top|left):/.test(node.style.cssText)))
  page.listeners.get('window:resize')({ type: 'resize' })
  assert.match(panel.textContent, /resize 867×669/)
  effects[0]()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
  assert.equal(page.listeners.size, 0)
})
