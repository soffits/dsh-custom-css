# Decisions

## Overflow fix

- `body` is clipped in normal flow (`position: relative; overflow: clip`), never `position: fixed`: a fixed body moves the whole app into a layer iOS positions on its own, which drifts from where taps land after a rotation or resume; the relative clip stops document scrolling just as well (checked in WebKit and Chromium).

## Viewport probe

- The probe is turned on by a plugin setting that adds a CSS custom property to the served stylesheet; client.js reads it once the stylesheet loads, so no extra route or request is needed and the setting has one source.
- Tap marks and the panel are drawn absolutely in the document, not in a fixed layer, so a mark away from the finger shows a real offset between drawing and hit-testing rather than one introduced by the probe itself.
