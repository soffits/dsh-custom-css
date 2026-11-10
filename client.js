/*
 * Browser half of dsh-custom-css: links the stylesheet the Host plugin serves
 * into the page head. A <link> is plain CSS, so it keeps working while the
 * connection to DSH is down or coming back. Plain JavaScript in DSH's Client
 * module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-css',
  factory() {
    const LINK_ID = 'dsh-custom-css'
    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined' || document.getElementById(LINK_ID)) return () => {}
          const link = document.createElement('link')
          link.id = LINK_ID
          link.rel = 'stylesheet'
          link.href = new URL('custom-css/style.css', document.baseURI).href
          document.head.appendChild(link)
          return () => link.remove()
        }, 'custom-css: stylesheet link')
      },
    }
  },
})
