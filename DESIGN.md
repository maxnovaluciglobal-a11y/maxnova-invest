---
name: MOY IQ Invest
description: Honest figures on Papel, structure in Navy, Latón only where you act or where you are.
colors:
  navy: "#14213D"
  navy-deep: "#0D1730"
  laton: "#B8863B"
  laton-700: "#8A6329"
  papel: "#F1EEE6"
  papel-light: "#FAF8F2"
  papel-mid: "#F5F2EA"
  papel-deep: "#E4DFD1"
  ink-body: "#4A4739"
  ink-muted: "#63604F"
  pos: "#356E57"
  neg: "#A23E2E"
  warn: "#9C5419"
  info: "#3E5A78"
  rail-fg: "rgba(241,238,230,0.76)"
  rail-pos: "#8FD0B4"
  rail-neg: "#F0A493"
  dark-bg: "#12161F"
  dark-surface: "#181D29"
  dark-raised: "#1D2331"
  dark-ink-body: "#C7C2B2"
  dark-ink-muted: "#9C9784"
  laton-dark: "#CC9A52"
  pos-dark: "#74C2A3"
  neg-dark: "#C96856"
  warn-dark: "#E0975A"
typography:
  display:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "54px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Instrument Sans, Georgia, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
  figure:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
spacing:
  "1": "2px"
  "2": "4px"
  "3": "6px"
  "4": "8px"
  "5": "10px"
  "6": "12px"
  "7": "14px"
  "8": "16px"
  "10": "20px"
  "12": "24px"
  "16": "32px"
  "20": "40px"
  "24": "48px"
  content-px: "24px"
  content-px-compact: "16px"
  content-max: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.laton}"
    textColor: "{colors.navy}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-form:
    backgroundColor: "{colors.laton}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.papel-light}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  input:
    backgroundColor: "{colors.papel-light}"
    textColor: "{colors.navy}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  search-field:
    backgroundColor: "{colors.papel-light}"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    padding: "0 40px 0 38px"
    height: "40px"
  rail:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.rail-fg}"
    padding: "12px 12px 10px"
    width: "232px"
  rail-item:
    textColor: "{colors.rail-fg}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  rail-item-active:
    backgroundColor: "rgba(184,134,59,0.18)"
    textColor: "{colors.papel-light}"
    rounded: "{rounded.sm}"
  page-tab:
    textColor: "{colors.ink-muted}"
    padding: "0 14px"
    height: "44px"
  page-tab-active:
    textColor: "{colors.navy}"
  filter-chip:
    backgroundColor: "{colors.papel-light}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  mobile-tab-bar:
    backgroundColor: "{colors.papel-light}"
    textColor: "{colors.ink-muted}"
    height: "60px"
  hero-figure:
    textColor: "{colors.navy}"
    typography: "{typography.display}"
---

# Design System: MOY IQ Invest

## Overview

**Creative North Star: "The Honest Ledger"**

MOY IQ Invest is the investing sibling of MOY IQ Finanzas and lives inside the same brand world ("El Instrumento"): warm Papel ground, Navy ink and structure, a single brass accent. The logged-in app is a working ledger, not a dashboard. One figure per screen carries the weight (portfolio value on Hoy, risk at stop on Posiciones, units in the Calculadora); everything else sits subordinate in quiet rows of sans text with mono digits. Density is moderate and desktop-first for reviewing and loading positions, with a phone layout built for glancing and creating alerts.

Structure comes from lines, not boxes. A Navy rail holds the five destinations and a live mini-list; content sits on bare Papel with hairline dividers between sections and between table rows. Tables bleed to the content edge with no frame. A few self-contained panels (the monthly contribution form, empty states, tinted notes) are the only boxed surfaces. Honesty is a visual property: every price shows its time and delay, every state carries an icon and a word, and the palette keeps green and red exclusively for gain and loss.

The system rejects the category default of a dashboard of cards with a market tape and news feed, scores, and buy or sell signals. It never uses pill shapes or Google-hosted fonts.

**Key Characteristics:**
- Papel ground, Navy ink, Navy sidebar rail; light and dark themes from the same token names.
- Latón appears only on the primary action and the current-destination marker.
- IBM Plex Sans for words, IBM Plex Mono only for figures; Instrument Sans for page titles (shared MOY IQ wordmark face).
- One hero figure per screen, set in mono at 54px.
- Hairline tables flush to the section edge; stacked rows below 1024px.
- States always as icon plus word, never color alone.

## Colors

A warm paper-and-ink palette with one brass accent and a strictly semantic green, red and amber.

### Primary
- **Ledger Navy** (navy): the ink of the system. Page titles, strong figures, focus outline, active tab text, the desktop rail background in both themes, and the text on every Latón surface. In dark theme the "primary ink" role flips to Papel while the rail stays Navy.
- **Deep Navy** (navy-deep): overlay scrims (`rgba(13,23,48,.38)` behind the asset sheet) and pressed depth.

### Secondary
- **Latón** (laton; laton-dark in dark theme): the brass accent. Fill of the primary action button, the 3px underline of the active page tab, the 3px top bar of the active mobile tab, the active rail chip tint and its icon. Never a text color on Papel.
- **Latón Text** (laton-700): the AA-safe brass for small marks on Papel when brass must read as text.

### Tertiary
- **Slate Blue** (info): links (`linkbtn`), chart reference lines (moving averages, comparison series), neutral informational tint. Carries no gain or loss meaning.

### Neutral
- **Papel** (papel): app background.
- **Papel Light** (papel-light): raised surfaces (inputs, buttons, menus, the mobile tab bar, boxed panels).
- **Papel Mid / Papel Deep** (papel-mid, papel-deep): row hover and track fills (range bars, score bars).
- **Body Ink** (ink-body): running text and table cells.
- **Muted Ink** (ink-muted): labels, table headers, secondary lines, inactive tabs.
- **Hairlines**: Navy at 10% (`rgba(20,33,61,.10)`) between rows, 18% under headers and section tops, 24% for emphasized borders. Dark theme uses Papel at 10/18/26%.
- **Rail Ink** (rail-fg, rail-pos, rail-neg): text, gain and loss on the Navy rail, lifted for contrast on Navy.

### Semantic
- **Gain Green** (pos / pos-dark), **Loss Red** (neg / neg-dark), **Caution Amber** (warn / warn-dark): result and state only, always paired with an icon or a word.

### Named Rules
**The Latón Two-Jobs Rule.** Latón marks exactly two things: the primary action and where you are (active rail chip, active page-tab underline, active mobile-tab bar). Chart lines, links and decoration use Slate Blue or Navy instead.

**The Navy-on-Latón Rule.** Text and icons on a Latón fill are always Navy, never white; white fails AA on brass.

**The Red Means Loss Rule.** Green and red belong to results, risk and errors. Destructive and neutral actions are drawn in neutral ink and turn red only on hover or in the danger zone of Ajustes.

## Typography

**Display Font:** IBM Plex Mono (with monospace), for the hero figure
**Headline Font:** Instrument Sans (with Georgia, sans-serif), page titles only
**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono, digits only

**Character:** A plain, legible sans for words and a tabular mono for every digit, so numbers line up and read as data rather than prose. All faces are self-hosted from `/fonts.css`.

### Hierarchy
- **Display** (600, 54px, 1.05, -0.02em; 40px under 768px): the single hero figure of a screen. Its unit sits beside it in Plex Sans 20px muted.
- **Headline** (600, 28px, 1.15, -0.01em): destination title in the page head. On mobile the title moves into the top bar at 20px and is never truncated.
- **Title** (600, 16px): section headings (Tu riesgo hoy, Para revisar hoy, Tus posiciones). Sub-headings 14px/600.
- **Body** (400, 13px, 1.5; root 14px): running text and table cells at 12-13px. Long prose capped at 62-68ch.
- **Label** (600, 12px, sentence case, no tracking): table headers, rail list heading, form labels. Hero labels are 14px/500 muted.
- **Figure** (Plex Mono, tabular-nums): every price, amount, percentage and count, at the size of its surrounding text. Secondary figures 22px/600 (risk at stop), summary band 20px/600.

### Named Rules
**The Mono-for-Digits Rule.** Mono sets digits, not words. Inline figures inside sentences are wrapped digit by digit so the words around them stay in Plex Sans; freshness tags, toasts and badges set their words in Sans.

**The Narrow-Space Percent Rule.** Percentages carry a narrow no-break space before the sign (U+202F, "15,2 %"), and negatives use the true minus (U+2212), never a hyphen.

## Layout

Two shells around one content column (max 1200px, side padding 24px; 16px below 1024px).

- **Desktop (1024px and up):** a sticky Navy rail at 232px (64px collapsed, icons only) on the left: brand, five destinations, a hairline, the "Tu lista" mini-list (ticker, price, change on a 1fr/auto/62px grid, then a freshness line), and a footer with Finanzas and Contraer. To its right a sticky 60px top strip (global ticker search up to 440px wide, freshness chip, account button), then the page head (title plus one row of page tabs), then content.
- **Below 1024px:** the rail disappears; a fixed 60px bottom bar carries the same five destinations (plus safe-area inset). The top strip holds the destination title, a search icon that opens full-width search, and the account button, with freshness on a second line (strip height 82px). Page tabs bleed edge to edge and scroll horizontally with a fade mask while more remain.
- **Sections** are separated by a top hairline and 14px padding, not by cards. Two-up section grids (Hoy, Mercado) use 24px row and 32px column gaps and collapse to one column below 1024px.
- **Tables become stacked rows below 1024px:** each position is a two-line row (ticker, value and result; then weight, stop and risk) with its action at the right, separated by hairlines.
- **Rhythm:** a 2px-based spacing scale; the most used steps are 8, 12, 14, 16 and 24px.
- **Breakpoints:** 1024px (shell switch), 768px (asset sheet becomes a bottom sheet; hero to 40px), 640px, 480px.

## Elevation & Depth

Flat by default. Depth on the page comes from tone (Papel vs Papel Light) and hairlines, not shadows. Shadows appear only on layers that float above content: menus, the search results list, the account menu, the asset drawer and modals.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(0,0,0,.10), 0 4px 8px rgba(0,0,0,.05)`; dark `0 8px 24px rgba(0,0,0,.5)`): menus, search list, drawer, modal.
- **Rest** (`box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)`): legacy card base only; not used by the v3 surfaces.
- **Active rail ring** (`box-shadow: inset 0 0 0 1px rgba(184,134,59,.35)`): outlines the current-destination chip on the rail.

### Named Rules
**The Flat Ledger Rule.** Nothing in the content column casts a shadow. If a surface needs separation, give it a hairline or a tonal step.

## Shapes

Gently squared. Radii are 8px for controls (buttons, inputs, chips, rail items) and 12px for the few containers (boxed panels, menus, search field, account button, bottom-sheet top corners); 4px for keyboard hints and exchange tags. Nothing exceeds 12px and nothing is pill-shaped. Borders are 1px hairlines; tables carry no outer border at all. Active markers are 3px bars with 2px rounded ends (tab underline, mobile tab top bar).

## Components

### Buttons
Restrained and solid; brass only where the screen's main action lives.
- **Shape:** gently squared (8px).
- **Primary:** Latón fill, Navy text, 600 weight, 8px 16px (forms use a 44px height with 0 20-24px padding). Hover darkens via brightness(.93) and lifts 1px; active returns to rest; disabled at 50% opacity.
- **Secondary:** Papel Light fill, Muted Ink text, 1px hairline (18%), 6px 12px, 500 weight. Hover tints with Navy at 7%, border and text go Navy.
- **Neutral destructive:** looks like secondary; text turns Loss Red only on hover, or permanently in the Ajustes danger zone.
- **Link button:** Slate Blue, underlined, no box.
- **Touch:** every button is at least 44px tall on coarse pointers; press scales to .97.

### Chips
- **Filter chip / quick pick:** Papel Light, 1px hairline, 8px radius, 32px tall (44px on touch), 12px/500 muted text. Selected: Navy text, 600, Navy 7% tint, Navy border. Used for review tickers on Hoy, period pickers, ticker picks.
- **Alert bell:** same chip shape with a bell icon and a word.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Papel Light on Papel.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px at 18% Navy.
- **Internal Padding:** 16px 18px.
- **Use:** only for one self-contained action or message: the monthly contribution form on Hoy, empty states (dashed border), and tinted notes (amber 12% fill, no border) such as "Fuera de tus objetivos". Tables, forms of a page and readings never sit inside a card.

### Inputs / Fields
- **Style:** Papel Light, 1px hairline, 8px radius, 8px 10px, Navy text; 16px font on mobile to avoid zoom. Placeholders in Sans even when the field holds figures.
- **Focus:** border goes Navy plus a 3px Navy 7% halo; keyboard focus everywhere is a 2px Navy outline offset 2px (Latón on the rail).
- **Error:** border Loss Red and an inline line with a warning icon and the message in red.

### Navigation
- **Rail item:** 44px tall, 12px gap, 20px line icon, Plex Sans 14px/500 in Rail Ink. Hover: Papel 7% tint, brighter text. Current: Latón 18% chip, Latón icon, 600 weight, 1px inset Latón ring; no side stripe.
- **Page tabs:** 44px, 14px/500 muted; current tab Navy 600 with a 3px Latón underline sitting on the 18% hairline.
- **Mobile tab bar:** five equal tabs, 22px icon over a 12px label; current tab Navy 600 with a 3px Latón bar at the top edge.
- **Global search:** 40px field with a search icon and a "/" key hint; results in a floating list of 44px rows (ticker, name, type).

### Hero Figure (signature)
The one number a screen is about. Label in Plex Sans 14px muted, the value in Plex Mono 54px Navy (Loss Red when negative), an optional subline in 14px muted, then one row of subordinate key-value pairs above a top hairline (for example Hoy and Total with their change).

### Hairline Table (signature)
No frame, no fill, no shadow. Header row in Plex Sans 12px/600 muted with an 18% hairline beneath; body rows 12px with 10% hairlines; first and last columns flush to the section edge; columns that are mostly figures are right-aligned automatically, header included. Ticker in 600 Navy with name and type beneath in 12px muted. Row hover tints Navy 7%. Below 1024px the same data renders as stacked rows.

### State Tag
Every state is an icon plus a word in the state color: "Supera tu límite" (amber, warning icon), trend up or down (green or red, trend icon), "sin stop" and "sin dato" as muted words. Freshness tags pair a clock icon with "Retraso hasta 16 min · 03:30".

## Do's and Don'ts

### Do:
- **Do** keep Latón to the primary action and the current-destination marker; put Navy text on it.
- **Do** set every digit in IBM Plex Mono with tabular numerals, and every word in IBM Plex Sans.
- **Do** write percentages with U+202F before % and negatives with U+2212.
- **Do** give each screen one hero figure and subordinate the rest to a single row beneath it.
- **Do** separate sections with a top hairline and let tables bleed to the section edge, numeric columns right-aligned.
- **Do** pair every state with an icon and a word, and show the time and delay next to every price.
- **Do** keep controls at least 44px tall on touch and keep the five destinations identical in rail and bottom bar.
- **Do** define every color through the theme tokens so light and dark stay in step.

### Don't:
- **Don't** use Latón for chart lines, links, decoration or text on Papel.
- **Don't** put white text on Latón.
- **Don't** wrap tables, readings or a page's forms in cards, and don't nest cards.
- **Don't** use green or red for anything but gain, loss, risk and errors; neutral and destructive actions stay neutral at rest.
- **Don't** signal a state with color alone or with a bare "!".
- **Don't** use radii above 12px or pill shapes.
- **Don't** add shadows to surfaces in the content column.
- **Don't** set words in mono or load fonts from Google Fonts.
