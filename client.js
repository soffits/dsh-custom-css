/*
 * Browser half of dsh-custom-css: links the stylesheet the Host plugin serves
 * into the page head. A <link> is plain CSS, so it keeps working while the
 * connection to DSH is down or coming back. The `edgeToEdge` and `probe`
 * settings reach this module as flags in the stylesheet: with the first it adds
 * the tags that ask a phone for the whole screen, with the second it draws the
 * viewport probe.
 * Plain JavaScript in DSH's Client module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-css',
  factory() {
    const LINK_ID = 'dsh-custom-css'
    const EDGE_FLAG = '--dsh-custom-css-edge'
    const PROBE_FLAG = '--dsh-custom-css-probe'
    const PROBE_ID = 'dsh-custom-css-probe'
    /** How long a tap mark stays on the page, in ms. */
    const MARK_MS = 4000
    /** Events after which the probe reads the sizes again. */
    const WINDOW_EVENTS = ['resize', 'orientationchange', 'pageshow', 'pagehide', 'scroll']
    const DOCUMENT_EVENTS = ['visibilitychange']
    const VIEWPORT_EVENTS = ['resize', 'scroll']

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

    const round = (value) => Math.round(value * 10) / 10
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return `${round(r.x)},${round(r.y)} ${round(r.width)}×${round(r.height)}`
    }

    /** The safe-area insets as the page sees them, read from a padded element. */
    function insets(doc, meter) {
      const style = doc.defaultView.getComputedStyle(meter)
      return ['Top', 'Right', 'Bottom', 'Left'].map(side => round(parseFloat(style[`padding${side}`]) || 0)).join(' ')
    }

    /** What a tap hit, named the way a person would find it on screen. */
    function describe(target) {
      const el = target?.nodeType === 1 ? target : null
      const named = el?.closest('[aria-label]')
      const label = named?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 24) ?? ''
      return `${el?.tagName.toLowerCase() ?? '?'}${label ? ` "${label}"` : ''}${el ? ` @${box(named ?? el)}` : ''}`
    }

    /**
     * The probe: the sizes the browser reports and a mark where each tap lands, drawn in the document
     * (not in a fixed layer), so a mark away from the finger shows that drawing and hit-testing disagree.
     * Marks are placed from body's own box, wherever the page puts it, and with `inset`: the edge-to-edge
     * rule moves children of body that carry an inline `top` and `left`, which is how it recognises DSH's popups.
     * @returns {() => void} Removes everything it added.
     */
    function startProbe(doc) {
      const win = doc.defaultView
      const panel = doc.createElement('pre')
      panel.id = PROBE_ID
      panel.style.cssText = 'position:absolute;z-index:2147483647;inset:40% auto auto 50%;transform:translateX(-50%);margin:0;padding:6px 8px;max-width:90vw;white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.78);border:1px solid #f0f;border-radius:6px;pointer-events:none'
      const meter = doc.createElement('div')
      meter.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
      doc.body.append(panel, meter)
      const marks = new Set()
      const log = []
      let lastTap = ''
      let frames = 0
      let fps = 0
      let frame = win.requestAnimationFrame(function tick() { frames += 1; frame = win.requestAnimationFrame(tick) })

      const render = () => {
        const vv = win.visualViewport
        const media = (query) => win.matchMedia(query).matches
        panel.textContent = [
          `window ${win.innerWidth}×${win.innerHeight}  html ${doc.documentElement.clientWidth}×${doc.documentElement.clientHeight}  dpr ${win.devicePixelRatio}`,
          vv ? `visual ${round(vv.width)}×${round(vv.height)} offset ${round(vv.offsetLeft)},${round(vv.offsetTop)} page ${round(vv.pageLeft)},${round(vv.pageTop)} scale ${round(vv.scale)}` : 'visual (none)',
          `screen ${win.screen.width}×${win.screen.height} ${win.screen.orientation?.type ?? ''} ${win.screen.orientation?.angle ?? ''}`,
          `scroll ${win.scrollX},${win.scrollY}  safe-area t r b l ${insets(doc, meter)}`,
          `body ${box(doc.body)}  root ${doc.getElementById('root') ? box(doc.getElementById('root')) : '-'}`,
          `standalone ${win.navigator.standalone ?? '-'} display ${['standalone', 'fullscreen', 'minimal-ui', 'browser'].find(mode => media(`(display-mode: ${mode})`)) ?? '-'}  ${doc.visibilityState}  frames/s ${fps}`,
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
      const second = win.setInterval(() => { fps = frames; frames = 0; render() }, 1000)
      for (const type of WINDOW_EVENTS) win.addEventListener(type, note, { passive: true })
      for (const type of DOCUMENT_EVENTS) doc.addEventListener(type, note)
      for (const type of VIEWPORT_EVENTS) win.visualViewport?.addEventListener(type, note, { passive: true })
      doc.addEventListener('pointerdown', onTap, { capture: true, passive: true })
      render()

      return () => {
        win.cancelAnimationFrame(frame)
        win.clearInterval(second)
        for (const type of WINDOW_EVENTS) win.removeEventListener(type, note)
        for (const type of DOCUMENT_EVENTS) doc.removeEventListener(type, note)
        for (const type of VIEWPORT_EVENTS) win.visualViewport?.removeEventListener(type, note)
        doc.removeEventListener('pointerdown', onTap, { capture: true })
        for (const mark of marks) mark.remove()
        panel.remove()
        meter.remove()
      }
    }

    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined' || document.getElementById(LINK_ID)) return () => {}
          let releaseScreen = () => {}
          let stopProbe = () => {}
          const link = document.createElement('link')
          link.id = LINK_ID
          link.rel = 'stylesheet'
          link.href = new URL('custom-css/style.css', document.baseURI).href
          link.onload = () => {
            const root = document.defaultView.getComputedStyle(document.documentElement)
            const on = (flag) => root.getPropertyValue(flag).trim() === '1'
            if (on(EDGE_FLAG)) releaseScreen = claimScreen(document)
            if (on(PROBE_FLAG) && document.getElementById(PROBE_ID) === null) stopProbe = startProbe(document)
          }
          document.head.appendChild(link)
          return () => {
            stopProbe()
            releaseScreen()
            link.remove()
          }
        }, 'custom-css: stylesheet link')
      },
    }
  },
})
