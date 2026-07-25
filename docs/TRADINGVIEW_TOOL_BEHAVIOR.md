# TradingView-Style Drawing Tool Behavior Spec

Source of truth: `E:\desktop\backtesting_replay_tool\libs\charting_library\charting_library.d.ts`
(public type declarations, ~645KB). All line numbers below refer to that file.

This document describes the **intended behavior and options** of TradingView's drawing tools
so we can build an **original re-implementation**. It documents public declared interfaces and
default values only. No minified/bundled code was inspected. Click/anchor counts are the standard
public TradingView interaction model (not encoded in the `.d.ts`, which only exposes style overrides).

---

## 0. Global facts

### 0.1 `SupportedLineTools` union (verbatim, line 18186)

```ts
export type SupportedLineTools = "text" | "anchored_text" | "note" | "anchored_note" | "signpost" | "double_curve" | "arc" | "icon" | "emoji" | "sticker" | "arrow_up" | "arrow_down" | "arrow_left" | "arrow_right" | "price_label" | "price_note" | "arrow_marker" | "flag" | "vertical_line" | "horizontal_line" | "cross_line" | "horizontal_ray" | "trend_line" | "info_line" | "trend_angle" | "arrow" | "ray" | "extended" | "parallel_channel" | "disjoint_angle" | "flat_bottom" | "anchored_vwap" | "pitchfork" | "schiff_pitchfork_modified" | "schiff_pitchfork" | "balloon" | "comment" | "inside_pitchfork" | "pitchfan" | "gannbox" | "gannbox_square" | "gannbox_fixed" | "gannbox_fan" | "fib_retracement" | "fib_trend_ext" | "fib_speed_resist_fan" | "fib_timezone" | "fib_trend_time" | "fib_circles" | "fib_spiral" | "fib_speed_resist_arcs" | "fib_channel" | "xabcd_pattern" | "cypher_pattern" | "abcd_pattern" | "callout" | "triangle_pattern" | "3divers_pattern" | "head_and_shoulders" | "fib_wedge" | "elliott_impulse_wave" | "elliott_triangle_wave" | "elliott_triple_combo" | "elliott_correction" | "elliott_double_combo" | "cyclic_lines" | "time_cycles" | "sine_line" | "long_position" | "short_position" | "forecast" | "date_range" | "price_range" | "date_and_price_range" | "bars_pattern" | "ghost_feed" | "projection" | "rectangle" | "rotated_rectangle" | "circle" | "ellipse" | "triangle" | "polyline" | "path" | "curve" | "cursor" | "dot" | "arrow_cursor" | "eraser" | "measure" | "zoom" | "brush" | "highlighter" | "regression_trend" | "fixed_range_volume_profile";
```

### 0.2 Magnet / snapping (lines 8888-8899)

The chart exposes two watched values (read/write/subscribe), NOT a discrete public enum:

- `magnetEnabled(): IWatchedValue<boolean>` — magnet on/off.
- `magnetMode(): IWatchedValue<number>` — the mode. In TradingView this is:
  - `0` = **Weak magnet** (snaps to nearest OHLC only when the cursor is close to a bar value).
  - `1` = **Strong magnet** (always snaps to the nearest OHLC value of the bar under the cursor).

There is no separate `MagnetMode` enum type in the declarations — treat it as `0 | 1` plus the boolean enable flag. When magnet is enabled, price anchors snap to the nearest of the bar's open/high/low/close.

### 0.3 Creation API options (lines 3805-3870)

`createShape(point, opts)` (single anchor; line 3814/7978) accepts these `shape` values only:
`arrow_up | arrow_down | flag | vertical_line | horizontal_line | long_position | short_position | icon | emoji | sticker | anchored_text | anchored_note`.

`createMultipointShape(points[], opts)` (line 3805/8003) accepts any `SupportedLineTools`
**except** `cursor | dot | arrow_cursor | eraser | measure | zoom` (line 3809). This confirms
`measure`, `zoom`, `cursor`, `dot`, `eraser` are **transient interaction tools**, not persistable drawings.

`CreateShapeOptionsBase<TOverrides>` (line 3829) — interaction flags shared by all tools:

| Field | Meaning |
|---|---|
| `text?: string` | Text content for the drawing (line 3830) |
| `lock?: boolean` | Create locked (not editable/movable) (3832) |
| `disableSelection?: boolean` | Drawing cannot be selected/clicked (3835) |
| `disableSave?: boolean` | Excluded from saved layout (3839) |
| `disableUndo?: boolean` | Creation not pushed to undo stack (3843) |
| `overrides?: TOverrides` | Per-tool style overrides (the `linetool*.*` keys) (3848) |
| `zOrder?: "top" \| "bottom"` | Draw in front of / behind other drawings (3851) |
| `showInObjectsTree?: boolean` | Show/hide in the Objects Tree panel (3855) |
| `ownerStudyId?: EntityId` | Associate drawing with a study (3859) |
| `filled?: boolean` | Fill with color if the tool supports it (3863) |
| `icon?: number` | Icon codepoint (icon/emoji tools) (3867) |

There is no per-drawing `setEnabled`/`saving` in the create options beyond these; the chart also
exposes runtime toggles (`ensureVisible`, selection enable etc., ~line 9693-9702).

### 0.4 Style enums used inside overrides (doc comment, lines 17926-17959)

- **LINESTYLE**: `0`=Solid, `1`=Dotted, `2`=Dashed, `3`=Large dashed.
- **LINEEND** (`leftEnd`/`rightEnd`): `0`=Normal, `1`=Arrow, `2`=Circle.
- **MODE** (bars-pattern style): 0=Bars,1=Line,2=OpenClose,3=LineOpen,4=LineHigh,5=LineLow,6=LineHL2.
- **PITCHFORK_STYLE**: 0=Original,1=Schiff,2=Schiff2,3=Inside.
- **STATS_POSITION** (`statsPosition`): `0`=Left, `1`=Center, `2`=Right.
- **RISK_DISPLAY_MODE** (`riskDisplayMode`): `'percents'` or `'money'`.

There is **no single generic `LineToolOptions` base interface**. Each tool has its own flat
interface (`<Name>LineToolOverrides`) whose keys are dotted strings `"linetool<name>.<prop>"`.
The union of all of them is `DrawingOverrides` (line 17961). UI tool identifiers (for favorites)
are `DrawingToolIdentifier` (line 17962, e.g. `"LineToolTrendLine"`, `"LineToolRiskRewardLong"`).

---

## 1. Internal-name -> TradingView mapping (quick table)

| Our name | `SupportedLineTools` id | Overrides interface (line) | Clicks/anchors |
|---|---|---|---|
| trend | `trend_line` | `TrendlineLineToolOverrides` (17244) | 2 |
| horizontal | `horizontal_line` | `HorzlineLineToolOverrides` (6922) | 1 |
| vertical | `vertical_line` | `VertlineLineToolOverrides` (17397) | 1 |
| ray | `ray` | `RayLineToolOverrides` (14299) | 2 |
| extended | `extended` | `ExtendedLineToolOverrides` (4735) | 2 |
| arrow | `arrow` (line) / `arrow_marker` (marker) | `ArrowLineToolOverrides` (1003) / `ArrowmarkerLineToolOverrides` (1075) | 2 / 1 |
| rectangle | `rectangle` | `RectangleLineToolOverrides` (14354) | 2 |
| session/range | `date_and_price_range` (also `date_range`, `price_range`) | *(no overrides iface; see §8)* | 2 |
| circle | `circle` | `CircleLineToolOverrides` (3582) | 2 |
| ellipse | `ellipse` | `EllipseLineToolOverrides` (4568) | 2 |
| triangle | `triangle` | `TriangleLineToolOverrides` (17299) | 3 |
| path | `path` | `PathLineToolOverrides` (12685) | N (multi, double-click to finish) |
| text | `text` | `TextLineToolOverrides` (16440); anchored=`TextabsoluteLineToolOverrides` (16494) | 1 |
| label | `anchored_text`/`note`/`anchored_note`/`callout` | `NoteLineToolOverrides` (12347), `NoteabsoluteLineToolOverrides` (12370), `CalloutLineToolOverrides` (1639) | 1 (note/callout: 2) |
| fib | `fib_retracement` | `FibretracementLineToolOverrides` (5127) | 2 |
| channel | `parallel_channel` | `ParallelchannelLineToolOverrides` (12642) | 3 |
| long | `long_position` | `RiskrewardlongLineToolOverrides` (14478) | 1-3 (see §6) |
| short | `short_position` | `RiskrewardshortLineToolOverrides` (14523) | 1-3 (see §6) |
| measure | `measure` (transient) | *(none; see §11)* | 2 (drag) |

Bonus reference tools: `info_line` (`InfolineLineToolOverrides`, 11450) is a trend-line variant with
all stats ON by default; `trend_angle` (`TrendangleLineToolOverrides`, 16887); `horizontal_ray`
(`HorzrayLineToolOverrides`, 6949); `rotated_rectangle` (14568); `polyline` (13921); `cross_line`
(3980). `linetoolposition` (`PositionLineToolOverrides`, 13965) is the **interactive trading**
position line (buy/sell/quantity/reverse/close buttons) — distinct from the long/short drawing tools.

---

## 2. Line-family tools (trend / ray / extended / arrow / info_line)

These four share an almost identical key set. Common keys:
`linecolor` (#2962FF), `linestyle` (0=solid), `linewidth` (2), `bold`/`italic` (false),
`fontsize` (14), `textcolor` (#2962FF), `horzLabelsAlign` (center), `vertLabelsAlign` (bottom),
`leftEnd`/`rightEnd` (line-end style 0/1/2), `showLabel`, `showAngle`, `showPriceLabels`,
`showPriceRange`, `showPercentPriceRange`, `showPipsPriceRange`, `showBarsRange`,
`showDateTimeRange`, `showDistance`, `showMiddlePoint`, `alwaysShowStats`, `statsPosition` (2=right).

### Extend defaults (the key differences)

| Tool | `extendLeft` | `extendRight` | `rightEnd`(arrowhead) | stats default |
|---|---|---|---|---|
| `trend_line` (17250) | false | false | 0 | all stats OFF, `alwaysShowStats` false |
| `ray` (14305) | **false** | **true** | 0 | stats OFF |
| `extended` (4741) | **true** | **true** | 0 | stats OFF |
| `arrow` (1009) | false | false | **1 (arrowhead)** | stats OFF |
| `info_line` (11456) | false | false | 0 | **all stats ON**, `alwaysShowStats` true, `statsPosition` 1=center |

So: a **ray** extends only to the right; an **extended** line extends both directions; a plain
**trend** line extends neither. **arrow** = trend line with an arrowhead on the far end (`rightEnd:1`).
**info_line** is the "measure-like persistent" line: price range, % range, pips, bars, datetime,
angle, distance all shown by default.

`arrow_marker` (1075) is a different beast — a single-anchor text marker: `backgroundColor` #1E53E5,
`textColor` #1E53E5, `bold` true, `fontsize` 16, `showLabel` true. (One click.)

---

## 3. Horizontal / Vertical / Cross line

### `horizontal_line` — `HorzlineLineToolOverrides` (6922)
One click (price only). Keys: `linecolor` #2962FF, `linestyle` 0, `linewidth` 2, `fontsize` 12,
`bold`/`italic` false, `showLabel` false, **`showPrice` true**, `textcolor`,
`horzLabelsAlign` center, `vertLabelsAlign` top. (`horizontal_ray`, 6949, is identical but starts
at a bar and extends right; same keys.)

### `vertical_line` — `VertlineLineToolOverrides` (17397)
One click (time only). Keys: `linecolor`, `linestyle`, `linewidth` 2, `fontsize` 14,
**`extendLine` true**, **`showTime` true**, `showLabel` false, `textOrientation` `"vertical"`,
`horzLabelsAlign` right, `vertLabelsAlign` top.

---

## 4. Shape tools (rectangle / rotated_rectangle / circle / ellipse / triangle)

All expose **fill + background color + transparency**. `fillBackground` toggles fill;
`backgroundColor` is an rgba; `transparency` is 0-100 (higher = more transparent).

| Tool (line) | color | backgroundColor | fillBackground | transparency | linewidth | extras |
|---|---|---|---|---|---|---|
| `rectangle` (14354) | #9c27b0 | rgba(156,39,176,0.2) | true | 50 | 2 | `extendLeft/Right` false, optional `middleLine.*` (showLine false), `showLabel` false, text align keys |
| `circle` (3582) | #FF9800 | rgba(255,152,0,0.2) | true | *(none)* | 2 | `showLabel` false, `fontSize` 14, text/bold/italic |
| `ellipse` (4568) | #F23645 | rgba(242,54,69,0.2) | true | **50** | 2 | `showLabel`, `fontSize` 14 |
| `triangle` (17299) | #089981 | rgba(8,153,129,0.2) | true | **80** | 2 | (3 anchors) |
| `rotated_rectangle` (14568) | #4caf50 | rgba(76,175,80,0.2) | true | 50 | 2 | 3 anchors (base + width) |

Note: `circle` has **no** `transparency` key (transparency comes only from the rgba alpha), whereas
`ellipse`/`rectangle`/`triangle` expose an explicit `transparency` percentage. Circle and Ellipse are
both drawn with **2 anchors** (a bounding box); a "circle" is just an ellipse constrained to a circle.
Triangle takes **3 anchors**.

---

## 5. Fibonacci retracement — `FibretracementLineToolOverrides` (5127)

Two anchors (define the trend from point 1 -> point 2). Level lines are drawn horizontally between
them at ratio coefficients of the price range.

### Default levels (coeff -> visible)

Visible-by-default levels (the classic set):

| level key | coeff | color | visible |
|---|---|---|---|
| level1 | **0** | #787B86 | ✔ |
| level2 | **0.236** | #F23645 | ✔ |
| level3 | **0.382** | #FF9800 | ✔ |
| level4 | **0.5** | #4caf50 | ✔ |
| level5 | **0.618** | #089981 | ✔ |
| level6 | **0.786** | #00bcd4 | ✔ |
| level7 | **1** | #787B86 | ✔ |
| level8 | **1.618** | #2962FF | ✔ |
| level9 | **2.618** | #F23645 | ✔ |
| level10 | **3.618** | #9c27b0 | ✔ |
| level11 | **4.236** | #e91e63 | ✔ |

Hidden-by-default extra levels (available but `visible:false`): level12=1.272, level13=1.414,
level14=2.272, level15=2.414, level16=2, level17=3, level18=3.272, level19=3.414, level20=4,
level21=4.272, level22=4.414, level23=4.618, level24=4.764.

So the **default visible ratio array** is:
`[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]`.

### Behavior flags
- `showCoeffs` true (5293), `showPrices` true (5295) — labels show the ratio and the price.
- `coeffsAsPercents` false (5129) — show `0.618` not `61.8%`.
- `fillBackground` true (5137), `transparency` 80 (5296) — shaded bands between levels.
- `reverse` false (5291) — flip level order.
- `extendLines` false / `extendLinesLeft` false (5131/5133).
- `fibLevelsBasedOnLogScale` false (5135).
- `levelsStyle.linestyle` 0, `levelsStyle.linewidth` 2 (5287/5289).
- `trendline.visible` true, color #787B86, dashed (`linestyle` 2), width 2 (5299-5305) — the
  connecting 1->2 guide line.
- `labelFontSize` 12; `horzLabelsAlign` left, `vertLabelsAlign` bottom.

Each level is independently overridable via `level{N}.coeff`, `level{N}.color`, `level{N}.visible`.

---

## 6. Long / Short position (risk-reward) — `RiskrewardlongLineToolOverrides` (14478) / `RiskrewardshortLineToolOverrides` (14523)

These are the **long_position / short_position** drawing tools (a.k.a. Risk/Reward). Both interfaces
are identical in shape. They define an **entry** anchor and draggable **stop** and **target/profit**
levels; the tool computes risk, reward, R:R ratio, and P&L.

Key fields (long shown; short identical with `short` prefix):

| Key | Default | Meaning |
|---|---|---|
| `accountSize` | **1000** | Account size used for P&L / % risk math |
| `lotSize` | **1** | Contract/lot size (qty per lot) |
| `risk` | **25** | Risk amount, interpreted per `riskDisplayMode` |
| `riskDisplayMode` | **`percents`** | `'percents'` or `'money'` (RISK_DISPLAY_MODE enum) |
| `profitBackground` | rgba(8,153,129,0.2) | Green target zone fill |
| `profitBackgroundTransparency` | 80 | |
| `stopBackground` | rgba(242,54,69,0.2) | Red stop zone fill |
| `stopBackgroundTransparency` | 80 | |
| `fillBackground` | true | Fill the zones |
| `showPriceLabels` | true | Show entry/stop/target price labels |
| `compact` | false | Compact stats box |
| `alwaysShowStats` | false | |
| `fillLabelBackground` | true / `labelBackgroundColor` #585858 | |
| `drawBorder` | false / `borderColor` #667b8b | |
| `linecolor` | #787B86, `linewidth` 1 | |
| `fontsize` | 12, `textcolor` #ffffff | |

So a naive re-implementation must include: **entry / stop / target prices, lot size, account size,
a risk value with percent-or-money mode**, and derived **P&L + R:R**. The green (profit) and red
(stop) zones are separate fills with their own transparency. The stats box shows qty, risk, reward,
R:R and P&L. Note: `long_position`/`short_position` are creatable via `createShape` (single anchor)
— the stop/target default offsets are derived from `risk`/price, then user-draggable.

---

## 7. Parallel channel — `ParallelchannelLineToolOverrides` (12642)

**3 anchors**: points 1 and 2 define the first trend line; the **3rd point sets the channel width**
(the parallel offset for the second line). A midline is drawn halfway between.

Keys: `linecolor` #2962FF, `linestyle` 0, `linewidth` 2; `backgroundColor` rgba(41,98,255,0.2),
`fillBackground` true, `transparency` 20; `showMidline` **true**, `midlinecolor` #2962FF,
`midlinestyle` 2 (dashed), `midlinewidth` 1; `extendLeft` false, `extendRight` false;
label group (`labelVisible` false, `labelFontSize` 14, `labelTextColor`, align/bold/italic).

---

## 8. Session / range tools (`date_and_price_range`, `date_range`, `price_range`)

Our internal **session** maps to the range family. These appear in `SupportedLineTools` and in
`DrawingToolIdentifier` (`LineToolDateAndPriceRange`, `LineToolDateRange`, `LineToolPriceRange`,
line 17962) but have **no dedicated `*LineToolOverrides` interface** in the declarations. Behavior
(from public TradingView docs / the persistent equivalent of `measure`):

- `date_range` — measures a **time span**: reports bars count and calendar time between two vertical
  anchors.
- `price_range` — measures a **price span**: reports absolute price change, % change, and pips.
- `date_and_price_range` — a box combining both (the persistent version of the transient `measure`
  tool). Reports price change, %, pips, bars, and time.

If we need overridable styling, model it on `rectangle` (background + transparency + line) plus a
stats label block. Two anchors (drag a box).

---

## 9. Text / Anchored text — `TextLineToolOverrides` (16440) / `TextabsoluteLineToolOverrides` (16494)

`text` is anchored to a chart coordinate (time+price); `anchored_text` (`textabsolute`) is pinned to
a **screen position** (stays put when you scroll). Same key set:

`color` #2962FF, `fontsize` 14, `bold`/`italic` false, `wordWrap` false, `wordWrapWidth` 200,
`fillBackground` false, `backgroundColor` rgba(91,133,191,0.3) [absolute: rgba(155,190,213,0.3)],
`backgroundTransparency` 70, `drawBorder` false, `borderColor` #667b8b,
`fixedSize` **true (text) / false (textabsolute)**. `fixedSize:true` keeps a constant on-screen font
size regardless of zoom. Text content itself comes via the `text` create option (§0.3).

---

## 10. Label family: note / anchored_note / callout

### `note` — `NoteLineToolOverrides` (12347) / `anchored_note` = `noteabsolute` (12370)
A pin/marker + text bubble. 2 anchors (marker point + label point) for `note`; absolute variant is
screen-pinned. Keys: `backgroundColor` rgba(41,98,255,0.7), `backgroundTransparency` 0,
`borderColor` #2962FF, `markerColor` #2962FF, `textColor` #ffffff, `fontSize` 14, `bold`/`italic`
false, `fixedSize` true.

### `callout` — `CalloutLineToolOverrides` (1639)
A speech-bubble with a leader/tail. 2 anchors (target point -> bubble). Keys: `backgroundColor`
rgba(0,151,167,0.7), `bordercolor` #0097A7, `color` (text) #ffffff, `fontsize` 14, `linewidth` 2,
`transparency` 50, `bold`/`italic` false, `wordWrap` false, `wordWrapWidth` 200.

(`comment`, 3627, and `balloon`/`signpost`/`price_label` are related single-anchor annotation tools.)

---

## 11. Measure — `measure` (transient)

`measure` is explicitly **excluded** from `createMultipointShape` (line 3809) and from the shape
picker — it is a transient interaction (click-drag, shows a floating readout, disappears on release
/ next click). Not persistable and has no overrides interface. It reports the same metrics as the
range tools: **price change, % change, pips, number of bars, and elapsed time** (and volume in the
volume-aware variant). For a persistent equivalent use `date_and_price_range` (§8). `info_line`
(§2) is a persistent line that shows the same stats.

---

## 12. Path — `PathLineToolOverrides` (12685)

A multi-segment arrow polyline. Anchors: N points (each click adds a segment; double-click / Esc
finishes). Minimal style keys: `lineColor` #2962FF, `lineStyle` 0, `lineWidth` 2, `leftEnd` 0,
`rightEnd` **1 (arrowhead on the last point)**. (`polyline`, 13921, is the closed/open freehand
multipoint variant; `brush`/`highlighter` are freehand.)

---

## 13. Re-implementation checklist (behaviors that differ from a naive build)

1. **Extend defaults are per-tool**: trend=neither, ray=right-only, extended=both, arrow=neither but
   with an arrowhead (`rightEnd:1`). Don't treat them as one "line" with a single extend flag.
2. **info_line** is a trend line with ALL stats on by default (price/%/pips/bars/time/angle/distance).
3. **Fib default visible ratios** = `[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]`;
   24 total levels exist; `showCoeffs`+`showPrices` on; bands filled at 80% transparency; a dashed
   trendline connects the two anchors.
4. **Long/Short position** need entry+stop+target, `lotSize` (1), `accountSize` (1000), `risk` (25)
   with `riskDisplayMode` = `percents`|`money`; separate green profit-zone and red stop-zone fills.
5. **Parallel channel** = 3 points, the 3rd sets channel width; midline shown by default (dashed).
6. **Transparency model**: shapes use both an rgba `backgroundColor` AND a 0-100 `transparency`
   percentage — except **circle**, which has no `transparency` key (alpha only). Triangle default
   transparency is 80, rectangle/ellipse 50.
7. **horizontal_line** shows price by default (`showPrice:true`); **vertical_line** shows time and
   extends full-height (`extendLine:true`, `textOrientation:vertical`).
8. **Anchored vs chart-anchored text/notes**: `text`/`note` follow chart coords; `anchored_text`
   (`textabsolute`) / `anchored_note` (`noteabsolute`) are pinned to screen pixels. `fixedSize`
   keeps constant on-screen font size (default true for `text`, false for `textabsolute`).
9. **measure / zoom / cursor / dot / eraser are transient** — not persistable, not in
   `createMultipointShape`. Use `date_and_price_range` / `info_line` for a persistent measure.
10. **Magnet** is two things: an on/off boolean AND a numeric mode (0=weak snaps near OHLC,
    1=strong always snaps to nearest OHLC). No enum type; it's `IWatchedValue<number>`.
11. **Line style enum**: 0=solid, 1=dotted, 2=dashed, 3=large-dashed. **Line-end enum**
    (leftEnd/rightEnd): 0=normal, 1=arrow, 2=circle. **statsPosition**: 0=left,1=center,2=right.
12. **Creation interaction flags** (`lock`, `disableSelection`, `disableSave`, `disableUndo`,
    `showInObjectsTree`, `zOrder`, `filled`) are cross-cutting and belong on every drawing's model,
    not just a few tools.
