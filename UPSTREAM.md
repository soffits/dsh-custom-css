# DSH Web UI: the whole page can be scrolled (after a reconnect)

Suggested bug report for deepseek-ai/deepseek-harness (issues are disabled there, so this is not filed). Seen on DSH 0.2.2-rc.1, Web UI.

## Problem

After the connection to the server drops and comes back, the whole page can be scrolled: the app header and sidebar move out of view and an empty area shows, as if the document had grown past the window.

## Cause

The shipped stylesheet (`@deepseek-ai/dsh-web-frontend`, `dist/assets/index-*.css`) has

```css
html,body,#root{height:100%;margin:0}
```

and nothing sets `overflow` on `html` or `body`. The page is only as tall as the window while everything inside it fits. As soon as any element, in or out of flow, ends below the window edge, the document becomes scrollable, and anything that scrolls the page (`scrollIntoView`, focus, the on-screen keyboard on a phone, wheel or touch over a non-scrolling area) moves the entire app. The app is a fixed-size shell with its own scroll areas, so the document should never scroll.

Which element sticks out after a reconnect was not pinned down: I could not reproduce it in headless Chromium (desktop 1280x800 and 390x844 touch viewports) with the reconnect indicator, with emulated offline/online, or with a real server restart, with a session open; the document stayed exactly window-sized throughout. So the trigger is probably specific to a browser (mobile Safari with its dynamic toolbar and keyboard is the likeliest) or to a plugin's content. The missing clip is the common point and is enough to make any such overflow scrollable.

Reproducing the symptom directly: add `<div style="position:absolute;top:calc(100vh + 120px);height:60px;width:100%">` to `body` and call `scrollIntoView()` on it. `document.scrollingElement.scrollTop` becomes 180 and the header disappears. With the fix below it stays 0.

## Suggested fix

Take the document out of the scrolling business:

```css
html { overflow: hidden; overscroll-behavior: none; }
body { position: relative; overflow: clip; overscroll-behavior: none; }
```

`overflow: hidden` on `html` alone is not enough, because script can still scroll a hidden viewport. `overflow: clip` on `body` cannot be scrolled at all, and `position: relative` makes `body` the box absolutely positioned elements are clipped by, so nothing reaches past the window. Checked in WebKit and Chromium with the repro above, with a fixed element below the window and with focus moving to a field far below: `scrollTop` stays 0 in every case. Layout is unchanged otherwise.

An earlier version of this fix made `body` `position: fixed; inset: 0`. That stops the scrolling too, but it puts the whole app into one fixed layer, and on iOS fixed layers are placed by the browser from its own idea of the viewport. In an iPhone home-screen app that idea can go stale after a rotation or a return from the background, so the app was drawn away from where taps landed, or shrunk with a blank band. Keep `body` in normal flow.
