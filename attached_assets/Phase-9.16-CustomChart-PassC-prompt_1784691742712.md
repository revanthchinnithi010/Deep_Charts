# Phase 9.16 — Core Render: CustomChart — Crosshair/Tooltip/Gestures — Pass C

**File to edit:** `artifacts/trading-journal-tablet/components/charts/CustomChart.tsx`
**Do not touch:** `artifacts/trading-journal/src/components/charts/CustomChart.tsx` (web source — read-only reference only)

Pass A (candles/viewport/pan/zoom) and Pass B (touch crosshair + tooltip + gesture
wiring) are done. This pass closes five known gaps between the RN/Skia port and
the web (lightweight-charts) source. Do all five in this file only, then update
`.agents/memory/MEMORY.md` per the note at the bottom.

Read `CustomChart.tsx` fully before starting — especially:
- `SkiaChartApiImpl` / `SkiaSeriesApiImpl` classes (~L560–780)
- `updateCrosshairAt` / `dismissCrosshair` / `handleLongPress` / `handlePanStart/Update/End` (Pass B, ~L1500–1650)
- The `crosshairInfo` memo and the crosshair render block inside `<Canvas>` (Pass B)
- `@/lib/crosshairState.ts` (module pub-sub, already wired, currently no subscriber)

---

## 1. Magnet mode

`settings.crosshair` is `"normal" | "magnet"` (see `chartSettingsTypes.ts`) but
`updateCrosshairAt` never reads it — the crosshair always snaps to the bar
under the finger at whatever Y the finger is at.

**Do:**
- In `updateCrosshairAt`, after resolving `bar` from `xToBarIdx`, check
  `settings?.crosshair === "magnet"`.
- In magnet mode, override `cy` (the crosshair's plot-local Y) to the pixel
  position of the series value at that bar — for candles/bars use `bar.close`,
  for line/area series use the value from `series._getData()` at that bar's
  time (fall back to `bar.close` if not found). Use `priceToY(value, displayMin,
  displayMax, plotHNow)` to convert. `displayMin`/`displayMax` aren't in scope
  inside `updateCrosshairAt` today — either pass them in as args from the
  caller (which already has them via the render-time `displayRange`) or thread
  through a ref that's kept in sync each render (there's already a precedent:
  `series._coordRef` is synced every render for exactly this kind of
  cross-scope coordinate lookup — reuse that ref rather than adding a new one).
- The horizontal crosshair line and the price-axis label must both reflect the
  magnet-snapped Y, not the raw finger Y. The vertical line stays at the bar's
  X (unchanged).
- Normal mode behavior (snap to nearest bar, free Y) must be unchanged.

## 2. Future (blank) space handling

Web has a dedicated canvas + state machine for when the crosshair is dragged
past the last bar into the empty area reserved by `MIN_FUTURE_BARS`. This port
currently just clamps `idx` to `bars.length - 1`, so dragging into blank space
pins the crosshair to the last real bar with no visual distinction.

**Do:**
- In `updateCrosshairAt`, detect when the computed bar index (before clamping)
  is `>= bars.length` — i.e., the touch is in future/blank space.
- In that case, do **not** show OHLCV tooltip data (there's no bar). Instead:
  - Draw only the horizontal price line + price-axis label (free Y, no magnet
    — there's no series to snap to).
  - Draw the vertical line at the true unclamped X (don't pin it to the last
    bar's X) so it tracks the finger through the blank area, exactly like the
    web version's `futureCrossCanvasRef` behavior described in the file's
    header comment on the web source.
  - `crosshairInfo` (or an equivalent second memo/branch) should carry a
    `bar: null` / `isFuture: true` state the render code can check, rather
    than reusing the last real bar as a stand-in.
- Update the OHLCV tooltip render block to skip rendering (or show a minimal
  "—" placeholder) when `isFuture` is true, instead of showing the last bar's
  data as if it were under the finger.

## 3. Kinetic-scroll interaction with a locked crosshair

Currently `handlePanStart`/`handlePanUpdate` return immediately when
`crosshairActiveRef.current` is true, and `handlePanEnd` does the same — pan
and crosshair-drag are fully mutually exclusive. Web allows panning the chart
underneath a locked crosshair (crosshair position stays pinned to its
bar/price, not to a fixed pixel, while the chart moves).

**Do:**
- Distinguish two sub-states while `crosshairActiveRef.current` is true:
  1. **Dragging the crosshair itself** — first touch after long-press, or a
     drag that started at/near the current crosshair pixel position.
  2. **Panning with the crosshair locked** — a second, independent pan gesture
     (e.g. a two-finger pan, or a new single-finger drag that starts away from
     the crosshair) that should move the chart viewport while keeping the
     crosshair pinned to its bar's time/price (so its pixel X/Y updates as the
     viewport scrolls, but the underlying bar/price it refers to doesn't
     change).
  - A reasonable, implementable rule: keep the existing long-press-drag path
    exactly as-is for case 1. For case 2, don't try to fully replicate web's
    dual-pointer heuristics — instead, store the crosshair's bar `time` and
    price (not just pixel x/y) in `crosshairPxRef`'s state alongside the
    pixels. On every render (already happening via `tick`/`invalidate`),
    recompute the crosshair's pixel X from `barIdxToX(idx, logFrom, barW)` for
    that stored bar time (looked up fresh each render) and recompute Y from
    `priceToY(storedPrice, displayMin, displayMax, plotH)`. This makes the
    crosshair pixel position naturally track pan/zoom without any gesture
    changes, since the render-time recompute already happens on every
    `invalidate()` — pan calls `invalidate()` already.
  - Concretely: change `crosshairPxRef` to also store `{ time: number, price:
    number }` (set once when the crosshair is placed/moved), and have
    `crosshairInfo`'s memo derive `x`/`y` from that plus the *current*
    `logFrom`/`barW`/`displayMin`/`displayMax`, instead of reading raw stored
    pixels. This one change should make panning-with-locked-crosshair "just
    work" without touching `handlePanStart/Update/End`'s early-return logic,
    since chart pan already isn't blocked once you separate "pixel position"
    (derived every render) from "logical position" (stored once).
  - Re-enable normal pan-gesture behavior (don't early-return in
    `handlePanUpdate`) when the drag clearly isn't touching/near the crosshair
    — e.g. only intercept the drag as a crosshair-move if
    `crosshairActiveRef.current` **and** the gesture's start point is within
    ~24px of the current crosshair pixel position; otherwise let it fall
    through to normal chart pan.
- Kinetic vertical coast (the existing `handlePanEnd` friction/`requestAnimationFrame`
  coast logic) should keep working unaffected for normal pans; no changes
  needed there beyond not being blocked by an active crosshair per the point
  above.

## 4. Line/marker series crosshair dot

Web's `makeSeries()` sets `crosshairMarkerVisible: true` /
`crosshairMarkerRadius` for line and line-with-markers series so LWC draws a
small filled circle on the series at the crosshair's X. This port has no
equivalent — nothing is drawn on line/area series at the crosshair point.

**Do:**
- In the Skia `<Canvas>` crosshair render block (Pass B, drawn last so it's on
  top), when `chartType` is `"line"`, `"line_with_markers"`, or `"area"` and
  `crosshairInfo` (or its future-space equivalent) is non-null and not in
  future space:
  - Look up the series value at the crosshair's bar (via `series._getData()`,
    same lookup pattern already used in the line-path rendering block).
  - Draw a small filled `<Circle>` (import `Circle` from
    `@shopify/react-native-skia` alongside the existing Skia imports) at
    `(crosshairInfo.x, priceToY(value, displayMin, displayMax, plotH))`,
    radius ~4, color = the series color (`upCol` for line/area — matches
    `makeSeries()`'s color choice), with a thin darker/contrasting stroke ring
    if you want it to match TradingView-style markers (optional polish, not
    required).
  - Skip entirely for candlestick/bar/heikin_ashi chart types (no marker in
    web for those either).

## 5. Wire up a real consumer of `crosshairState.ts`

`emitCrosshair`/`resetCrosshair` have been firing since Pass B but nothing
subscribes, so there's no way to visually confirm the pub-sub actually works
end-to-end, and no reusable OHLCV readout exists outside the chart itself.

**Do:**
- Create `artifacts/trading-journal-tablet/components/charts/CrosshairReadout.tsx`,
  a small standalone component that:
  - Subscribes via `subscribeCrosshair()` from `@/lib/crosshairState` in a
    `useEffect`, using `useSyncExternalStore` (or a manual
    `useState`+subscribe pattern — check what React/RN version this project
    is on before picking) to read `getCrosshair()`.
  - Renders nothing (`return null`) when the snapshot's `time` is `null`.
  - Otherwise renders a compact O/H/L/C/Vol row, styled consistently with
    the existing `crosshairTooltip*` styles in `CustomChart.tsx` (reuse the
    same look — either export those styles or duplicate the handful of style
    keys needed; don't fork the color/format logic, reuse `fmtPrice` /
    `fmtVolume` — `fmtVolume` currently lives inline in `CustomChart.tsx`;
    move it to `@/lib/fmtPrice.ts` or a new small `@/lib/fmtVolume.ts` so both
    files can import it without duplication).
  - This component intentionally does **not** replace the existing
    `crosshairTooltip` block already rendered inside `CustomChart.tsx` — it's
    a separate, reusable consumer that other screens (e.g. a details panel
    outside the chart) could mount independently, exactly matching the
    zero-React-perf architecture already documented in
    `.agents/memory/zero-react-perf.md` ("crosshair: module pub-sub ...
    OHLCV bar + price cells use DOM refs + RAF" on web).
  - Mount it once somewhere visible for testing (e.g. temporarily in the
    charts screen/tab, wherever `CustomChart` is currently rendered) so it's
    easy to confirm live — leave a one-line comment noting it's there for
    verification and can be removed/relocated once a real host UI exists.

---

## Constraints (apply to all 5 items)

- TypeScript + React Native only, matching the existing file's style (refs +
  `invalidate()`/`tick` for redraw-on-change, no `useState` for anything
  hot-path, no `localStorage`/DOM APIs).
- Don't change the public shape of `IChartApi`/`ISeriesApi` beyond what's
  already there — no new required props on `CustomChart`.
- Preserve everything from Pass A/B — long-press → activate, drag → move,
  lift → stays locked, tap → dismiss, dismiss-on-symbol/interval-change.
- No mock/demo data; use real `bars`/`series` data already flowing through
  the component.
- After finishing, run a syntax check (`tsc --noEmit` scoped to this file is
  fine given the workspace's partial `node_modules`) and confirm no new
  TS1xxx/TS2304 errors before calling it done.

## When done

Append one line to `.agents/memory/MEMORY.md` (same format as the existing
entries, one line, no extra prose) summarizing the magnet/future-space/
locked-pan/marker-dot/CrosshairReadout additions and where they live, so a
future pass has the same context this prompt gave you.
