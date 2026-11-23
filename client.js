/*
 * Browser half of dsh-custom-css: links the stylesheet the Host plugin serves
 * into the page head. A <link> is plain CSS, so it keeps working while the
 * connection to DSH is down or coming back. When the `probe` setting is on,
 * the stylesheet carries a flag and this module draws the viewport probe.
 * Plain JavaScript in DSH's Client module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-css',
  factory() {
    const LINK_ID = 'dsh-custom-css'
    const PROBE_FLAG = '--dsh-custom-css-probe'
    const PROBE_ID = 'dsh-custom-css-probe'
    /** How long a tap mark stays on the page, in ms. */
    const MARK_MS = 4000
    /** Events after which the probe reads the sizes again. */
    const WINDOW_EVENTS = ['resize', 'orientationchange', 'pageshow', 'pagehide', 'scroll']
    const DOCUMENT_EVENTS = ['visibilitychange']
    const VIEWPORT_EVENTS = ['resize', 'scroll']

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
     * @returns {() => void} Removes everything it added.
     */
    function startProbe(doc) {
      const win = doc.defaultView
      const panel = doc.createElement('pre')
      panel.id = PROBE_ID
      panel.style.cssText = 'position:absolute;z-index:2147483647;left:50%;top:40%;transform:translateX(-50%);margin:0;padding:6px 8px;max-width:90vw;white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.78);border:1px solid #f0f;border-radius:6px;pointer-events:none'
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
        mark.style.cssText = `position:absolute;z-index:2147483647;left:${event.clientX + win.scrollX - 12}px;top:${event.clientY + win.scrollY - 12}px;width:22px;height:22px;border:2px solid #f0f;border-radius:50%;pointer-events:none`
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
          let stopProbe = () => {}
          const link = document.createElement('link')
          link.id = LINK_ID
          link.rel = 'stylesheet'
          link.href = new URL('custom-css/style.css', document.baseURI).href
          link.onload = () => {
            const flag = document.defaultView.getComputedStyle(document.documentElement).getPropertyValue(PROBE_FLAG).trim()
            if (flag === '1' && document.getElementById(PROBE_ID) === null) stopProbe = startProbe(document)
          }
          document.head.appendChild(link)
          return () => {
            stopProbe()
            link.remove()
          }
        }, 'custom-css: stylesheet link')
      },
    }
  },
})
