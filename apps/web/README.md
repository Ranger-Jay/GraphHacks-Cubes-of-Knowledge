# Web app

React/Vite shell for the release analysis. Run it from the repository root (`npm run dev:web`); setup, the dev-only API session and its limits are in the root README.

## Cited source jump

Each cited source in the evidence and proposed-action lists is a link to the matching record under "Source records". Activating it scrolls to the record and moves keyboard focus to it, so keyboard and screen reader users land on it. The router is not involved: the hash stays an in-page anchor and the release view is kept.

Programmatic focus draws no focus ring after a pointer click, so the record is also marked `data-cited="true"`. The stylesheet draws a 3px outline, a tinted background and the text label "Cited source", so the mark is not colour alone. The mark uses no animation or transition and so needs no reduced-motion variant.

The mark stays until the next jump (it moves to the new record), Escape pressed on the record, or focus leaving the record. There is no timer.

Unit test: `node --import ./tests/web/register.mjs --test tests/web/highlight.test.tsx`. It uses a small fake DOM, so it proves the attribute lifecycle and the stylesheet rule, not how a browser paints it. A real-browser check is recorded separately in the pull request.
