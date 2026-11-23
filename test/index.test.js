import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, Config } from '../index.js'
import { PREFIX, REPORT_PATH, STYLE_PATH } from '../src/http.js'
import { clientBuild, REPORT_FILE } from '../src/report.js'
import { RECOVERIES } from '../src/style.js'

const CLIENT = fileURLToPath(new URL('../client.js', import.meta.url))
const VIEWPORT = 'width=device-width, initial-scale=1'
const SETTING = '--dsh-custom-css-'

/** Mounts the Host plugin on a stand-in context. @returns the registered routes and their disposers. */
function mount(config, options) {
  const routes = []
  const disposers = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } },
    connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
  }
  apply(ctx, Config(config), options)
  return { routes, disposers }
}

/** Sends one request through a mounted handler. */
async function request(handler, { url, method = 'GET', body }) {
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(text) { this.body = text; return this },
  }
  const req = { url, method, headers: {}, async* [Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body) } }
  await handler(req, res)
  return res
}

test('the plugin registers one prefix route and removes it on unload', () => {
  const { routes, disposers } = mount({})
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, PREFIX)
  disposers[0]()
  assert.equal(routes.length, 0)
})

test('the stylesheet names the browser half that should be running and its own revision', async () => {
  const build = clientBuild(readFileSync(CLIENT, 'utf8'))
  const one = await request(mount({ report: true }).routes[0].handler, { url: STYLE_PATH })
  assert.ok(one.body.toString().includes(`${SETTING}build: "${build}"`))
  const revision = /--dsh-custom-css-revision: "([0-9a-f]+)"/.exec(one.body.toString())[1]
  assert.equal(one.headers.etag, `"${revision}"`)
  const other = await request(mount({ report: true, probe: true }).routes[0].handler, { url: STYLE_PATH })
  assert.notEqual(other.headers.etag, one.headers.etag, 'another setting is another revision')
})

test('with report on, a page\'s reading is kept as one stamped line; without it nothing is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'custom-css-'))
  try {
    const options = { dir, now: () => new Date('2026-01-02T03:04:05Z') }
    const build = clientBuild(readFileSync(CLIENT, 'utf8'))
    const { handler } = mount({ report: true }, options).routes[0]
    const revision = (await request(handler, { url: STYLE_PATH })).headers.etag.slice(1, -1)
    const answer = await request(handler, { url: REPORT_PATH, method: 'POST', body: JSON.stringify({ seq: 1, window: [867, 669], client: build, revision }) })
    assert.deepEqual(JSON.parse(answer.body), { revision, kept: true })
    await request(handler, { url: REPORT_PATH, method: 'POST', body: JSON.stringify({ seq: 2, client: 'an older build', revision }) })
    const lines = readFileSync(join(dir, REPORT_FILE), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(lines[0], { at: '2026-01-02T03:04:05.000Z', current: true, seq: 1, window: [867, 669], client: build, revision })
    assert.equal(lines[1].current, false, 'a page running an older browser half is marked')

    const quiet = mkdtempSync(join(tmpdir(), 'custom-css-'))
    const off = await request(mount({}, { dir: quiet }).routes[0].handler, { url: REPORT_PATH, method: 'POST', body: '{"seq":1}' })
    assert.equal(JSON.parse(off.body).kept, false)
    assert.throws(() => readFileSync(join(quiet, REPORT_FILE)))
    rmSync(quiet, { recursive: true })
  } finally {
    rmSync(dir, { recursive: true })
  }
})

/**
 * A page just big enough for client.js: head, body, events, timers the test fires itself, and computed styles.
 * @param {Record<string, string>} settings - What the stylesheet sets, by name without the prefix.
 */
function fakePage(settings = {}) {
  const head = [{ name: 'viewport', content: VIEWPORT }]
  const body = []
  const listeners = new Map()
  const timers = new Map()
  const sent = []
  const storage = new Map()
  let timerId = 0
  const on = target => (type, fn) => listeners.set(`${target}:${type}`, fn)
  const off = target => type => listeners.delete(`${target}:${type}`)
  const element = (list) => ({ style: {}, textContent: '', remove() { const at = list().indexOf(this); if (at >= 0) list().splice(at, 1) } })
  const state = { settings, revision: 'r1', etag: 'r1', reloads: 0, layout: [867, 669], scrollY: 0 }
  const bodyStyle = new Map()
  const win = {
    innerWidth: 867, innerHeight: 669, devicePixelRatio: 3, scrollX: 0,
    get scrollY() { return state.scrollY },
    screen: { width: 466, height: 678, orientation: { type: 'landscape-primary', angle: 90 } },
    navigator: { standalone: true, userAgent: 'TestPhone/1.0' },
    visualViewport: { width: 867, height: 669, offsetLeft: 0, offsetTop: 0, pageLeft: 0, get pageTop() { return state.scrollY }, scale: 1, addEventListener: on('vv'), removeEventListener: off('vv') },
    performance: { now: () => 1234 },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { reload() { state.reloads += 1 } },
    scrollTo() {},
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' }),
    getComputedStyle: el => (el === doc.documentElement
      ? { getPropertyValue: name => ({ revision: `"${state.revision}"`, build: '"b1"', recover: 'none', ...state.settings })[name.slice(SETTING.length)] ?? '' }
      : { paddingTop: '0px', paddingRight: '84px', paddingBottom: '34px', paddingLeft: '0px' }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setInterval: () => 2, clearInterval() {},
    setTimeout(fn) { timerId += 1; timers.set(timerId, fn); return timerId },
    clearTimeout(id) { timers.delete(id) },
    fetch: async (url, { method, body: text }) => {
      if (method === 'HEAD') return { ok: true, headers: { get: () => `"${state.etag}"` } }
      sent.push(JSON.parse(text))
      return { ok: true, json: async () => ({ revision: state.etag, kept: true }) }
    },
    addEventListener: on('window'), removeEventListener: off('window'),
  }
  const doc = {
    baseURI: 'https://dsh.example/ui/', defaultView: win, visibilityState: 'visible',
    documentElement: { get clientWidth() { return state.layout[0] }, get clientHeight() { return state.layout[1] }, style: {}, offsetHeight: 0 },
    head: { appendChild: node => head.push(node) },
    body: {
      append: (...nodes) => body.push(...nodes),
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 867, height: 669 }),
      style: { getPropertyValue: name => bodyStyle.get(name) ?? '', setProperty: (name, value) => (value === '' ? bodyStyle.delete(name) : bodyStyle.set(name, value)) },
    },
    getElementById: id => [...head, ...body].find(node => node.id === id) ?? null,
    querySelector: selector => head.find(node => selector === `meta[name="${node.name}"]`) ?? null,
    querySelectorAll: () => [],
    elementFromPoint: () => null,
    createElement: tag => (tag === 'div' || tag === 'pre' ? element(() => body) : element(() => head)),
    addEventListener: on('document'), removeEventListener: off('document'),
  }
  const links = () => head.filter(node => node.rel === 'stylesheet')
  return {
    doc, win, head, body, listeners, sent, state, storage, bodyStyle, links,
    link: () => links().at(-1),
    metas: () => Object.fromEntries(head.filter(node => node.name).map(node => [node.name, node.content])),
    /** Fires the timers that are waiting now, then lets what they started run. */
    async tick() {
      const due = [...timers.entries()]
      timers.clear()
      for (const [, fn] of due) fn()
      for (let i = 0; i < 10; i += 1) await null
    },
  }
}

async function loadClient(page) {
  const source = await readFile(CLIENT, 'utf8')
  let factory
  globalThis.window = { __ModuleLoader__: { load: ({ id, factory: created }) => { assert.equal(id, 'dsh-custom-css'); factory = created } } }
  globalThis.document = page.doc
  new Function(source)()
  const effects = []
  factory().apply({ effect: (fn) => { effects.push(fn()) } })
  return effects
}

test('client.js links the stylesheet once and removes it on dispose', async () => {
  const page = fakePage()
  const effects = await loadClient(page)
  assert.equal(page.links().length, 1)
  assert.equal(page.link().href, 'https://dsh.example/ui/custom-css/style.css')
  await loadClient(page)
  assert.equal(page.links().length, 1, 'a second copy of the module adds no second link')
  effects[0]()
  assert.equal(page.links().length, 0)
})

test('with nothing turned on the page is left alone', async () => {
  const page = fakePage()
  await loadClient(page)
  page.link().onload()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT })
  assert.equal(page.sent.length, 0)
})

test('with edge on the page asks for the whole screen, and unloading puts the head back', async () => {
  const page = fakePage({ edge: ' 1' })
  const effects = await loadClient(page)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'nothing changes before the stylesheet says so')
  page.link().onload()
  assert.deepEqual(page.metas(), {
    viewport: `${VIEWPORT}, viewport-fit=cover`,
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  })
  assert.equal(page.body.length, 0, 'edge alone starts neither the panel nor the reports')
  effects[0]()
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
})

test('tags the page already has are changed in place and restored', async () => {
  const page = fakePage({ edge: '1' })
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

test('a setting changed on the Host reaches an open page when it comes to the front', async () => {
  const page = fakePage()
  await loadClient(page)
  const first = page.link()
  first.onload()
  page.listeners.get('document:visibilitychange')()
  await page.tick()
  assert.equal(page.links().length, 1, 'same revision: nothing is fetched again')

  Object.assign(page.state, { etag: 'r2' })
  page.listeners.get('window:pageshow')()
  await page.tick()
  assert.equal(page.links().length, 2, 'the new stylesheet loads beside the old one')
  assert.equal(page.link().href, 'https://dsh.example/ui/custom-css/style.css?r=r2')
  assert.deepEqual(page.metas(), { viewport: VIEWPORT })
  Object.assign(page.state, { revision: 'r2', settings: { edge: '1' } })
  page.link().onload()
  assert.deepEqual(page.links().map(node => node.id), ['dsh-custom-css'], 'and then takes its place')
  assert.ok(!page.head.includes(first))
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent', 'the new settings are acted on')

  Object.assign(page.state, { etag: 'r3', revision: 'r3', settings: {} })
  page.listeners.get('document:visibilitychange')()
  await page.tick()
  page.link().onload()
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'a setting turned off is undone the same way')
})

test('a stylesheet that did not arrive is asked for again when the page comes to the front', async () => {
  const page = fakePage({ edge: '1' })
  await loadClient(page)
  page.link().onerror()
  assert.equal(page.links().length, 0)
  page.listeners.get('window:pageshow')()
  assert.equal(page.links().length, 1)
  page.link().onload()
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent')
})

test('with probe on the panel shows the readings, marks taps, and leaves nothing behind', async () => {
  const page = fakePage({ probe: ' 1' })
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
  assert.equal(page.sent.length, 0, 'the panel alone reports nothing')
  effects[0]()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
  assert.equal(page.listeners.size, 0)
})

test('with report on a page sends its readings: on load, at the start of a burst and when it settles', async () => {
  const page = fakePage({ report: '1', edge: '1' })
  const effects = await loadClient(page)
  page.link().onload()
  assert.equal(page.body.find(node => node.id === 'dsh-custom-css-probe'), undefined, 'nothing is drawn')
  const [load] = page.sent
  assert.equal(load.event, 'load')
  assert.equal(load.seq, 1)
  assert.deepEqual(load.window, [867, 669])
  assert.deepEqual(load.html, [867, 669])
  assert.deepEqual(load.screen, { size: [466, 678], orientation: 'landscape-primary', angle: 90 })
  assert.deepEqual(load.insets, [0, 84, 34, 0])
  assert.deepEqual(load.visual, { size: [867, 669], offset: [0, 0], page: [0, 0], scale: 1 })
  assert.equal(load.standalone, true)
  assert.equal(load.display, 'standalone')
  assert.equal(load.meta.viewport, `${VIEWPORT}, viewport-fit=cover`)
  assert.equal(load.meta['apple-mobile-web-app-status-bar-style'], 'black-translucent')
  assert.deepEqual(load.settings, { edge: true, probe: false, recover: [] })
  assert.equal(load.revision, 'r1')
  assert.equal(load.build, 'b1')
  assert.equal(load.client, clientBuild(await readFile(CLIENT, 'utf8')), 'the page names its build the way the Host does')
  assert.equal(load.ua, 'TestPhone/1.0')
  assert.equal(load.stale, false)
  assert.match(load.t, /^\d{4}-\d\d-\d\dT/)

  await page.tick()
  assert.deepEqual(page.sent.map(line => line.event), ['load', 'settled'])
  await page.tick()
  assert.equal(page.sent.length, 2, 'nothing moved after the page settled: no late line')

  page.listeners.get('window:orientationchange')({ type: 'orientationchange' })
  page.listeners.get('window:resize')({ type: 'resize' })
  assert.deepEqual(page.sent.map(line => line.event), ['load', 'settled', 'orientationchange'], 'one line at the first event of a burst')
  await page.tick()
  assert.deepEqual(page.sent.at(-1).events, ['orientationchange', 'resize'])
  // a second rotation before the late look of the first is a burst of its own
  page.listeners.get('window:resize')({ type: 'resize' })
  await page.tick()
  assert.deepEqual(page.sent.slice(-2).map(line => [line.event, line.events]), [['resize', undefined], ['settled', ['resize']]])
  assert.deepEqual(page.sent.map(line => line.seq), [1, 2, 3, 4, 5, 6])
  assert.ok(page.sent.every(line => line.page === load.page))

  effects[0]()
  assert.equal(page.body.length, 0)
  assert.equal(page.listeners.size, 0)
})

test('after a burst, taps are reported with where they landed and what is drawn there', async () => {
  const page = fakePage({ report: '1' })
  await loadClient(page)
  page.link().onload()
  await page.tick()
  const target = { nodeType: 1, tagName: 'BUTTON', textContent: 'private words', closest: () => null, getBoundingClientRect: () => ({ x: 80, y: 480, left: 80, top: 480, right: 120, bottom: 520, width: 40, height: 40 }) }
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 418, pageX: 100, pageY: 336, target })
  const { event, tap } = page.sent.at(-1)
  assert.equal(event, 'tap')
  assert.deepEqual(tap, { client: [100, 418], page: [100, 336], target: 'button @80,480 40×40', inside: false, drawnThere: '?' })
})

/** The state iOS can leave behind: the window is right, the layout is short by the old inset and scrolled to minus it. */
const stale = { layout: [867, 587], scrollY: -82 }

test('recover tries each thing in order on a stale page, reporting before and after, and stops at what clears it', async () => {
  const page = fakePage({ report: '1', recover: 'meta style scroll' })
  Object.assign(page.state, stale)
  page.win.scrollTo = () => { Object.assign(page.state, { layout: [867, 669], scrollY: 0 }) }
  await loadClient(page)
  page.link().onload()
  assert.equal(page.sent[0].stale, true)
  assert.deepEqual(page.sent[0].html, [867, 587])
  assert.deepEqual(page.sent[0].scroll, [0, -82])
  await page.tick()
  await page.tick()
  await page.tick()
  await page.tick()
  const tries = page.sent.filter(line => /^(before|after):/.test(line.event)).map(line => [line.event, line.stale])
  assert.deepEqual(tries, [['before:meta', true], ['after:meta', true], ['before:style', true], ['after:style', true], ['before:scroll', true], ['after:scroll', false]])
  assert.equal(page.metas().viewport, VIEWPORT, 'the viewport tag is back as it was')
})

test('recover gives up on a size nothing cleared, and reloads once only', async () => {
  const page = fakePage({ report: '1', recover: 'reload' })
  Object.assign(page.state, stale)
  await loadClient(page)
  page.link().onload()
  for (let i = 0; i < 4; i += 1) await page.tick()
  assert.equal(page.state.reloads, 1)
  page.listeners.get('window:resize')({ type: 'resize' })
  for (let i = 0; i < 4; i += 1) await page.tick()
  assert.equal(page.state.reloads, 1, 'the same stale size is not tried again')

  const again = fakePage({ report: '1', recover: 'reload' })
  Object.assign(again.state, stale)
  again.storage.set('dsh-custom-css-reloaded', '1')
  await loadClient(again)
  again.link().onload()
  for (let i = 0; i < 4; i += 1) await again.tick()
  assert.equal(again.sent[0].event, 'after:reload')
  assert.equal(again.state.reloads, 0, 'still stale after the reload: no second one')
})

test('cover puts body over the visible area while the page is stale and lets go when it is not', async () => {
  const page = fakePage({ report: '1', recover: 'cover' })
  Object.assign(page.state, stale)
  const effects = await loadClient(page)
  page.link().onload()
  await page.tick()
  assert.deepEqual(Object.fromEntries(page.bodyStyle), { 'margin-top': '-82px', 'margin-left': '0px', width: '867px', height: '669px' })
  await page.tick()
  assert.deepEqual(page.sent.filter(line => /cover/.test(line.event)).map(line => line.event), ['before:cover', 'after:cover'])

  page.state.scrollY = -60
  page.listeners.get('vv:scroll')({ type: 'scroll' })
  assert.equal(page.bodyStyle.get('margin-top'), '-60px', 'it follows the viewport')

  Object.assign(page.state, { layout: [867, 669], scrollY: 0 })
  page.listeners.get('window:resize')({ type: 'resize' })
  await page.tick()
  assert.equal(page.bodyStyle.size, 0)
  assert.ok(page.sent.some(line => line.event === 'dropped:cover'))
  effects[0]()
})

test('every recovery the settings offer is one the browser half knows', async () => {
  const page = fakePage({ report: '1', recover: RECOVERIES.join(' ') })
  await loadClient(page)
  page.link().onload()
  assert.deepEqual(page.sent[0].settings.recover, RECOVERIES)
})
