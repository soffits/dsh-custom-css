/*
 * Browser half of dsh-custom-css: links the stylesheet the Host plugin serves
 * into the page head. A <link> is plain CSS, so it keeps working while the
 * connection to DSH is down or coming back. The plugin's settings reach this
 * module as custom properties in that stylesheet, and it acts on them: the
 * tags that ask a phone for the whole screen (`edgeToEdge`), readings of what
 * the browser reports sent to the Host (`report`) or drawn over the page
 * (`probe`), and the recovery experiment (`recover`). When the page comes back
 * to the front it asks the Host whether its stylesheet is still the current
 * one, so a changed setting needs no reload.
 * Plain JavaScript in DSH's Client module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-css',
  factory: function self() {
    const LINK_ID = 'dsh-custom-css'
    const PROBE_ID = 'dsh-custom-css-probe'
    const SETTING = '--dsh-custom-css-'
    const RELOADED_KEY = 'dsh-custom-css-reloaded'
    const SIDES = ['Top', 'Right', 'Bottom', 'Left']
    const DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'browser']
    /** How long a tap mark stays on the page, in ms. */
    const MARK_MS = 4000
    /** A burst of events (a rotation fires several) is over after this much quiet, in ms. */
    const QUIET_MS = 400
    /** iOS can finish laying a page out well after its last event: one more look this long after the quiet, in ms. */
    const LATE_MS = 2500
    /** How long a recovery try gets before its result is read, in ms. */
    const TRY_MS = 700
    /** Taps are reported for this long after a burst, in ms, and at most this many of them. */
    const TAP_MS = 30000
    const TAP_COUNT = 20
    /** Events after which the sizes may have changed, by what they are fired on. */
    const EVENTS = {
      window: ['resize', 'orientationchange', 'pageshow', 'pagehide', 'scroll'],
      document: ['visibilitychange'],
      viewport: ['resize', 'scroll'],
    }

    /** FNV-1a over UTF-16 code units, as 8 hex digits; the Host names this module's text the same way. */
    function fnv1a(text) {
      let hash = 0x811c9dc5
      for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
      return (hash >>> 0).toString(16).padStart(8, '0')
    }
    /** Which build of this module the page is running. */
    const BUILD = fnv1a(self.toString())

    /**
     * What a page declares to get the whole screen as an iOS home-screen app: the viewport reaching under
     * the unsafe areas, and the status bar drawn over the page instead of above it. iOS reads the last two
     * when the icon is added to the home screen, so they have to be in the document by then.
     */
    const EDGE_META = [
      ['viewport', content => [...content.split(',').map(part => part.trim()).filter(part => part !== '' && !part.startsWith('viewport-fit')), 'viewport-fit=cover'].join(', ')],
      ['apple-mobile-web-app-capable', () => 'yes'],
      ['apple-mobile-web-app-status-bar-style', () => 'black-translucent'],
    ]

    /**
     * The tries of the `recover` setting, for an iOS home-screen app that kept the other orientation's inset
     * after a rotation: the window has its new size, but the page is still laid out short by the old inset
     * and scrolled to a negative offset, which leaves an empty band. The first four may make iOS lay the
     * page out again; `cover` gives up on that and puts DSH's box over what is visible instead, for as
     * long as the state lasts. None is known to work, which is what the reports are for.
     * A try may return a function that undoes it.
     */
    const RECOVERIES = {
      /** Change the viewport tag and put it back, so the browser works its viewport out again. */
      meta(doc) {
        const meta = doc.querySelector('meta[name="viewport"]')
        if (meta === null) return
        const content = meta.content
        meta.content = content.includes('viewport-fit=cover') ? content.replace('viewport-fit=cover', 'viewport-fit=auto') : `${content}, viewport-fit=cover`
        doc.defaultView.setTimeout(() => { meta.content = content }, 50)
      },
      /** Change the root's height and force a layout with it. */
      style(doc) {
        const root = doc.documentElement
        const height = root.style.height
        root.style.height = 'calc(100% + 1px)'
        void root.offsetHeight
        root.style.height = height
      },
      /** Scroll the window and back. */
      scroll(doc) {
        doc.defaultView.scrollTo(0, 1)
        doc.defaultView.scrollTo(0, 0)
      },
      /** Load the page again; DSH comes back where it was. */
      reload(doc) {
        doc.defaultView.location.reload()
      },
      /** Give body the visual viewport's box in the document. Kept in place by the watch, which calls it again after every event. */
      cover(doc) {
        const { body, defaultView: { visualViewport: vv } } = doc
        const placed = { 'margin-top': `${vv.pageTop}px`, 'margin-left': `${vv.pageLeft}px`, width: `${vv.width}px`, height: `${vv.height}px` }
        const before = Object.keys(placed).map(name => [name, body.style.getPropertyValue(name)])
        for (const [name, value] of Object.entries(placed)) body.style.setProperty(name, value)
        return () => { for (const [name, value] of before) body.style.setProperty(name, value) }
      },
    }

    const round = (value) => Math.round(value * 10) / 10
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height].map(round)
    }
    const box = ([x, y, width, height]) => `${x},${y} ${width}×${height}`

    /** Calls `handler` for every event in EVENTS. @returns {() => void} Stops it. */
    function listen(doc, handler) {
      const targets = { window: doc.defaultView, document: doc, viewport: doc.defaultView.visualViewport }
      const each = (method) => {
        for (const [where, types] of Object.entries(EVENTS)) for (const type of types) targets[where]?.[method](type, handler, { passive: true })
      }
      each('addEventListener')
      return () => each('removeEventListener')
    }

    /** The plugin's settings as the loaded stylesheet carries them. */
    function readSettings(doc) {
      const root = doc.defaultView.getComputedStyle(doc.documentElement)
      const value = (name) => root.getPropertyValue(SETTING + name).trim().replace(/^"|"$/g, '')
      return {
        edge: value('edge') === '1',
        probe: value('probe') === '1',
        report: value('report') === '1',
        recover: value('recover').split(/\s+/).filter(name => Object.hasOwn(RECOVERIES, name)),
        build: value('build'),
        revision: value('revision'),
      }
    }

    /**
     * Sets the edge-to-edge tags, changing a tag the page already has and adding one it lacks.
     * @returns {() => void} Puts the head back as it was.
     */
    function claimScreen(doc) {
      const undo = EDGE_META.map(([name, next]) => {
        const existing = doc.querySelector(`meta[name="${name}"]`)
        if (existing === null) {
          const meta = doc.createElement('meta')
          meta.name = name
          meta.content = next('')
          doc.head.appendChild(meta)
          return () => meta.remove()
        }
        const before = existing.content
        existing.content = next(before)
        return () => { existing.content = before }
      })
      return () => { for (const restore of undo) restore() }
    }

    /**
     * Reads what the browser reports about the page. The safe-area insets are measured on a padded element.
     * `stale` is the state the recovery experiment looks for: the page is scrolled to a negative offset, or
     * a home-screen app is laid out smaller than its window. (`screen` is no help: a folding phone can
     * report its other display.) `popups` are DSH's script-placed popups that are open, with where their
     * inline style puts them and where they are.
     * @returns {{ read: () => object, stop: () => void }}
     */
    function createReader(doc) {
      const win = doc.defaultView
      const meter = doc.createElement('div')
      meter.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
      doc.body.append(meter)
      return {
        read() {
          const vv = win.visualViewport
          const root = doc.getElementById('root')
          const padding = win.getComputedStyle(meter)
          const display = DISPLAY_MODES.find(mode => win.matchMedia(`(display-mode: ${mode})`).matches) ?? null
          const standalone = win.navigator.standalone ?? null
          const html = doc.documentElement
          const shifted = win.scrollX < 0 || win.scrollY < 0 || (vv ? vv.pageLeft < 0 || vv.pageTop < 0 : false)
          const short = html.clientWidth < win.innerWidth - 1 || html.clientHeight < win.innerHeight - 1
          return {
            window: [win.innerWidth, win.innerHeight],
            html: [html.clientWidth, html.clientHeight],
            dpr: win.devicePixelRatio,
            visual: vv ? { size: [vv.width, vv.height].map(round), offset: [vv.offsetLeft, vv.offsetTop].map(round), page: [vv.pageLeft, vv.pageTop].map(round), scale: round(vv.scale) } : null,
            screen: { size: [win.screen.width, win.screen.height], orientation: win.screen.orientation?.type ?? null, angle: win.screen.orientation?.angle ?? null },
            insets: SIDES.map(side => round(parseFloat(padding[`padding${side}`]) || 0)),
            body: rect(doc.body),
            root: root ? rect(root) : null,
            scroll: [win.scrollX, win.scrollY],
            standalone,
            display,
            visibility: doc.visibilityState,
            meta: Object.fromEntries(EDGE_META.map(([name]) => [name, doc.querySelector(`meta[name="${name}"]`)?.content ?? null])),
            popups: [...doc.querySelectorAll('body > [style*="top:"][style*="left:"]')].slice(0, 3).map(el => ({ inline: [el.style.left, el.style.top], rect: rect(el) })),
            stale: shifted || ((standalone === true || display === 'standalone') && short),
          }
        },
        stop: () => meter.remove(),
      }
    }

    /** Counts animation frames while it runs. `rate()` is frames per second since it started or was last asked. */
    function frameMeter(win) {
      let frames = 0
      let since = 0
      let frame = null
      const tick = () => { frames += 1; frame = win.requestAnimationFrame(tick) }
      return {
        start() {
          if (frame !== null) return
          frames = 0
          since = win.performance.now()
          frame = win.requestAnimationFrame(tick)
        },
        rate() {
          const elapsed = win.performance.now() - since
          const rate = frame === null || elapsed <= 0 ? null : Math.round(frames * 1000 / elapsed)
          frames = 0
          since = win.performance.now()
          return rate
        },
        stop() {
          if (frame !== null) win.cancelAnimationFrame(frame)
          frame = null
        },
      }
    }

    /** What a tap hit, named the way a person would find it on screen. Without `text`, by its label only: reports carry no page content. */
    function describe(target, { text = true } = {}) {
      const el = target?.nodeType === 1 ? target : null
      const named = el?.closest('[aria-label]')
      const label = named?.getAttribute('aria-label') ?? (text ? el?.textContent?.trim().slice(0, 24) : undefined) ?? ''
      return `${el?.tagName.toLowerCase() ?? '?'}${label ? ` "${label}"` : ''}${el ? ` @${box(rect(named ?? el))}` : ''}`
    }

    /**
     * The probe panel: the readings and a mark where each tap lands, drawn in the document (not in a fixed
     * layer), so a mark away from the finger shows that drawing and hit-testing disagree.
     * Marks are placed from body's own box, wherever the page puts it, and with `inset`: the edge-to-edge
     * rule moves children of body that carry an inline `top` and `left`, which is how it recognises DSH's popups.
     * @returns {() => void} Removes everything it added.
     */
    function startPanel(doc, reader) {
      const win = doc.defaultView
      const panel = doc.createElement('pre')
      panel.id = PROBE_ID
      panel.style.cssText = 'position:absolute;z-index:2147483647;inset:40% auto auto 50%;transform:translateX(-50%);margin:0;padding:6px 8px;max-width:90vw;white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.78);border:1px solid #f0f;border-radius:6px;pointer-events:none'
      doc.body.append(panel)
      const marks = new Set()
      const log = []
      const frames = frameMeter(win)
      let lastTap = ''
      let fps = 0
      frames.start()

      const render = () => {
        const r = reader.read()
        const size = ([width, height]) => `${width}×${height}`
        panel.textContent = [
          `window ${size(r.window)}  html ${size(r.html)}  dpr ${r.dpr}`,
          r.visual ? `visual ${size(r.visual.size)} offset ${r.visual.offset} page ${r.visual.page} scale ${r.visual.scale}` : 'visual (none)',
          `screen ${size(r.screen.size)} ${r.screen.orientation ?? ''} ${r.screen.angle ?? ''}`,
          `scroll ${r.scroll}  safe-area t r b l ${r.insets.join(' ')}`,
          `body ${box(r.body)}  root ${r.root ? box(r.root) : '-'}`,
          `standalone ${r.standalone ?? '-'} display ${r.display ?? '-'}  ${r.visibility}  frames/s ${fps}${r.stale ? '  STALE' : ''}`,
          `tap ${lastTap}`,
          ...log,
        ].join('\n')
      }
      const note = (event) => {
        log.unshift(`${new Date().toISOString().slice(11, 23)} ${event.type} ${win.innerWidth}×${win.innerHeight}`)
        log.length = Math.min(log.length, 4)
        render()
      }
      const onTap = (event) => {
        const mark = doc.createElement('div')
        const origin = doc.body.getBoundingClientRect()
        mark.style.cssText = `position:absolute;z-index:2147483647;inset:${event.clientY - origin.y - 12}px auto auto ${event.clientX - origin.x - 12}px;width:22px;height:22px;border:2px solid #f0f;border-radius:50%;pointer-events:none`
        doc.body.append(mark)
        marks.add(mark)
        win.setTimeout(() => { mark.remove(); marks.delete(mark) }, MARK_MS)
        lastTap = `${round(event.clientX)},${round(event.clientY)} → ${describe(event.target)}`
        render()
      }
      const second = win.setInterval(() => { fps = frames.rate() ?? 0; render() }, 1000)
      const unlisten = listen(doc, note)
      doc.addEventListener('pointerdown', onTap, { capture: true, passive: true })
      render()

      return () => {
        frames.stop()
        win.clearInterval(second)
        unlisten()
        doc.removeEventListener('pointerdown', onTap, { capture: true })
        for (const mark of marks) mark.remove()
        panel.remove()
      }
    }

    /**
     * Follows the page's size events. A burst (a rotation fires several) gives a reading at its first
     * event, one when it has gone quiet (`settled`) and one later if anything still moved (`late`).
     * With `report` on each reading is sent to the Host, and so is every tap for a while after a burst or
     * while the page is stale (where the finger was, and what it hit). With `recover` set, a settled
     * reading that is stale starts the tries, each sent before and after.
     * @param {object} options
     * @param {string} options.url - Where reports go.
     * @param {object} options.settings
     * @param {{ read: () => object }} options.reader
     * @param {(revision: string) => void} options.onRevision - Told the Host's current revision with every answer.
     * @returns {() => void} Stops it.
     */
    function startWatch(doc, { url, settings, reader, onRevision }) {
      const win = doc.defaultView
      const page = Math.random().toString(36).slice(2, 10)
      const frames = frameMeter(win)
      const timers = new Set()
      const after = (ms, fn) => {
        const timer = win.setTimeout(() => { timers.delete(timer); fn() }, ms)
        timers.add(timer)
        return timer
      }
      const cancel = (timer) => { win.clearTimeout(timer); timers.delete(timer) }
      /** Window sizes at which a full round of tries cleared nothing; not tried again. */
      const gaveUp = new Set()
      let seq = 0
      let burst = null
      let settledAs = ''
      let trying = false
      let undoTry = null
      let tapsUntil = 0
      let tapsLeft = 0
      let reloaded = win.sessionStorage.getItem(RELOADED_KEY) === '1'

      const look = (event, extra = {}) => {
        const reading = reader.read()
        if (!reading.stale && reloaded) {
          reloaded = false
          win.sessionStorage.removeItem(RELOADED_KEY)
        }
        if (settings.report) {
          seq += 1
          const line = { seq, page, t: new Date().toISOString(), ms: Math.round(win.performance.now()), event, ...extra, ...reading, fps: frames.rate(), settings: { edge: settings.edge, probe: settings.probe, recover: settings.recover }, revision: settings.revision, build: settings.build, client: BUILD, ua: win.navigator.userAgent }
          win.fetch(url, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(line) })
            .then(response => (response.ok ? response.json() : null))
            .then((answer) => { if (answer) onRevision(answer.revision) })
            .catch(() => {})
        }
        return reading
      }

      const recover = async (size) => {
        trying = true
        for (const name of settings.recover) {
          if (name === 'reload' && reloaded) continue
          look(`before:${name}`)
          if (name === 'reload') win.sessionStorage.setItem(RELOADED_KEY, '1')
          const undo = RECOVERIES[name](doc)
          await new Promise((resolve) => { after(TRY_MS, resolve) })
          const cleared = !look(`after:${name}`).stale
          if (undo) undoTry = { name, undo }
          if (cleared || undo) {
            trying = false
            return
          }
        }
        gaveUp.add(size)
        trying = false
      }
      /** A try that stays in place follows the page while it is stale and goes when it no longer is. */
      const follow = (stale) => {
        if (undoTry === null || trying) return
        undoTry.undo()
        if (stale) {
          undoTry.undo = RECOVERIES[undoTry.name](doc)
        } else {
          look(`dropped:${undoTry.name}`)
          undoTry = null
        }
      }
      const onTap = (event) => {
        const stale = reader.read().stale
        if (!settings.report || tapsLeft <= 0 || (!stale && win.performance.now() > tapsUntil)) return
        tapsLeft -= 1
        const at = doc.elementFromPoint(event.clientX, event.clientY)
        const hit = event.target?.nodeType === 1 ? event.target.getBoundingClientRect() : null
        look('tap', { tap: {
          client: [event.clientX, event.clientY].map(round),
          page: [event.pageX, event.pageY].map(round),
          target: describe(event.target, { text: false }),
          inside: hit !== null && event.clientX >= hit.left && event.clientX <= hit.right && event.clientY >= hit.top && event.clientY <= hit.bottom,
          drawnThere: describe(at, { text: false }),
        } })
      }

      const settle = () => {
        const events = burst.events
        burst.quiet = null
        follow(reader.read().stale)
        const reading = look('settled', { events })
        settledAs = JSON.stringify(reading)
        tapsUntil = win.performance.now() + TAP_MS
        tapsLeft = TAP_COUNT
        const size = reading.window.join('x')
        if (reading.stale && settings.recover.length > 0 && !trying && undoTry === null && !gaveUp.has(size)) recover(size)
        burst.late = after(LATE_MS, () => {
          burst = null
          const now = reader.read()
          if (JSON.stringify(now) !== settledAs) look('late')
          frames.stop()
        })
      }
      const onEvent = (event) => {
        if (burst === null) {
          burst = { events: [], quiet: null, late: null }
          frames.start()
          look(event.type)
          follow(true)
        } else {
          if (burst.quiet !== null) cancel(burst.quiet)
          if (burst.late !== null) cancel(burst.late)
          burst.late = null
        }
        burst.events.push(event.type)
        burst.quiet = after(QUIET_MS, settle)
      }

      const unlisten = listen(doc, onEvent)
      doc.addEventListener('pointerdown', onTap, { capture: true, passive: true })
      onEvent({ type: reloaded ? 'after:reload' : 'load' })
      return () => {
        unlisten()
        doc.removeEventListener('pointerdown', onTap, { capture: true })
        frames.stop()
        for (const timer of timers) win.clearTimeout(timer)
        undoTry?.undo()
      }
    }

    /** Starts what the settings ask for. @returns {() => void} Stops all of it. */
    function startFeatures(doc, settings, onRevision) {
      const stops = []
      if (settings.edge) stops.push(claimScreen(doc))
      const watching = settings.report || settings.recover.length > 0
      if (settings.probe || watching) {
        const reader = createReader(doc)
        stops.push(reader.stop)
        if (settings.probe && doc.getElementById(PROBE_ID) === null) stops.push(startPanel(doc, reader))
        if (watching) stops.push(startWatch(doc, { url: new URL('custom-css/report', doc.baseURI).href, settings, reader, onRevision }))
      }
      return () => { for (const stop of stops.reverse()) stop() }
    }

    /**
     * Links the stylesheet and runs what its settings ask for. When the page comes to the front it asks the
     * Host for the current revision; a newer stylesheet is loaded beside the old one and takes its place
     * once it has arrived, so the page is never without one.
     * @returns {() => void} Removes everything it added.
     */
    function start(doc) {
      if (doc.getElementById(LINK_ID)) return () => {}
      const win = doc.defaultView
      const href = new URL('custom-css/style.css', doc.baseURI).href
      let current = null
      let arriving = null
      let revision = ''
      let stopFeatures = () => {}

      const onRevision = (latest) => {
        if (latest && latest !== revision && arriving === null) link(`${href}?r=${encodeURIComponent(latest)}`)
      }
      function link(address) {
        const next = doc.createElement('link')
        next.rel = 'stylesheet'
        next.href = address
        if (current === null) next.id = LINK_ID
        next.onload = () => {
          if (current !== next) current?.remove()
          next.id = LINK_ID
          current = next
          arriving = null
          stopFeatures()
          const settings = readSettings(doc)
          revision = settings.revision
          stopFeatures = startFeatures(doc, settings, onRevision)
        }
        next.onerror = () => {
          if (current !== next) next.remove()
          arriving = null
        }
        if (current === null) current = next
        else arriving = next
        doc.head.appendChild(next)
      }
      const ask = () => {
        if (doc.visibilityState !== 'visible' || revision === '') return
        win.fetch(href, { method: 'HEAD', cache: 'no-store' })
          .then(response => onRevision(response.headers.get('etag')?.replace(/"/g, '')))
          .catch(() => {})
      }

      link(href)
      doc.addEventListener('visibilitychange', ask)
      win.addEventListener('pageshow', ask)
      return () => {
        doc.removeEventListener('visibilitychange', ask)
        win.removeEventListener('pageshow', ask)
        stopFeatures()
        arriving?.remove()
        current?.remove()
      }
    }

    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => (typeof document === 'undefined' ? () => {} : start(document)), 'custom-css: page')
      },
    }
  },
})
