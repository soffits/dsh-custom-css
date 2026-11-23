# Decisions

## Overflow fix

- `body` is clipped in normal flow (`position: relative; overflow: clip`), never `position: fixed`: a fixed body moves the whole app into a layer iOS positions on its own, which drifts from where taps land after a rotation or resume; the relative clip stops document scrolling just as well (checked in WebKit and Chromium).

## Edge to edge

- The setting is a flag in the served stylesheet that client.js reads, like the probe: one source for the setting, and the tags and the rules that depend on each other always arrive together.
- client.js sets `viewport-fit=cover`, `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style: black-translucent`, and puts the head back on unload. The second tag is there because the recipe measured to work on current iOS has all three (WebKit bug 317153), and a wrong guess costs the user another re-install of the icon.
- One box holds everything: `body` is inset by `--edge-shell-*` margins and, through an identity transform, is the containing block of fixed boxes too. Padding the shell (`#root`) alone would miss everything portalled to `body`, and DSH's settings sheet is `position: absolute` on `body` at narrow widths, so the box has to be `body` itself.
- `html` as the containing block of fixed boxes with `body` free to be larger (overlays safe while the shell uses a strip) was tried and dropped: in Chromium a fixed box that reaches past the window then makes the document scrollable again, which is the bug the overflow fix exists for (WebKit does not). With `body` as the box, its `overflow: clip` covers fixed boxes as well. `contain: paint` on `html` does not stop the scrolling in WebKit once `body` no longer clips.
- The insets enter only as `env()` inside custom properties, never as numbers copied by script, so a rotation needs nothing from us. `--edge-shell-*` is separate from `--edge-inset-*` so that user CSS can let DSH into a strip and still read the real inset to move a control aside; the properties also let a desktop test stand in for a phone.
- No script-side recovery for stale insets after a rotation: CSS `env()` follows the rotation on current iOS (WebKit bug 191363 reads fixed since 16.4), and a script-side copy would be the one thing that can go stale.
- DSH's popups are recognised by how they are placed (children of `body` with inline `top` and `left`), because that is the property the rule corrects and they share no attribute (`role` is menu, dialog or absent). The probe places its own marks with `inset`, measured from `body`, so the rule passes them by. The rule moves popups with margins, not `translate`: DSH's popup classes set no margins of their own, and a translate of zero still changes how WebKit rasterises a popup at a fractional position, so the setting would not be pixel-identical where the insets are zero.
- Safe-area helper libraries were looked at and not used: they are utility classes for an app's own markup, and DSH's markup is not ours, so the work has to happen at the root boxes.

## Viewport probe

- The probe is turned on by a plugin setting that adds a CSS custom property to the served stylesheet; client.js reads it once the stylesheet loads, so no extra route or request is needed and the setting has one source.
- Tap marks and the panel are drawn absolutely in the document, not in a fixed layer, so a mark away from the finger shows a real offset between drawing and hit-testing rather than one introduced by the probe itself.
