<div align="center">

<img src="aegis-lockup-light.svg#gh-light-mode-only" alt="AEGIS" width="420">
<img src="aegis-lockup-dark.svg#gh-dark-mode-only" alt="AEGIS" width="420">

# Brand kit

</div>

The AEGIS mark is the **lock**: four corner brackets closed on a lime square.

- **The brackets** are the ones the product draws onto evidence when every claim resting on it is supported, in Harness Control and in the answer's evidence graph. They say *checked*.
- **The square** is the seal: the hash that closes the record.

The mark moves the way the product does. Where it animates (the landing header), the brackets close in from 1.5× and the seal ticks on after them, on the same curve the product uses to lock onto evidence.

## Files

| File | Use it for |
|---|---|
| [`aegis-mark.svg`](aegis-mark.svg) | Ink brackets, lime seal. Light grounds. |
| [`aegis-mark-white.svg`](aegis-mark-white.svg) | Paper brackets, lime seal. Dark grounds and photographs. |
| [`aegis-mark-mono.svg`](aegis-mark-mono.svg) | All ink, for print, stamps and anything that cannot carry colour. |
| [`aegis-lockup-light.svg`](aegis-lockup-light.svg) | Mark, name and product line, on light grounds. |
| [`aegis-lockup-dark.svg`](aegis-lockup-dark.svg) | The same, on dark grounds. |
| [`aegis-app-icon.svg`](aegis-app-icon.svg) | Square icon on a night tile, for launchers, social cards and slides. |

In the product the mark is drawn by [`frontend/components/aegis-logo.tsx`](../../../frontend/components/aegis-logo.tsx) (`AegisMark` and `AegisLogo`), and the browser tab icon is [`frontend/app/icon.svg`](../../../frontend/app/icon.svg). Change the drawing there and every screen follows.

## Colour: Hi-Vis Monochrome

| Swatch | Name | Hex | Role |
|---|---|---|---|
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-070707?style=flat-square) | Night | `#070707` | The ground |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-f7f7f4?style=flat-square) | Paper | `#f7f7f4` | Text at night; the light ground |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-d4f24a?style=flat-square) | Hi-vis lime | `#d4f24a` | The one accent: what you can act on, what is cited, the seal |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-5f6e00?style=flat-square) | Olive | `#5f6e00` | The seal on paper, where lime would not read |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-4cc38a?style=flat-square) | Pass | `#4cc38a` | Status only |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-ffb224?style=flat-square) | Held | `#ffb224` | Status only |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-ff5a4f?style=flat-square) | Critical | `#ff5a4f` | Status only |

Lime is the only accent. It marks what is actionable or proven, never decoration. Status colours report state and nothing else.

## Type

- **Archivo**, variable weight and width. Display lines are light (300) and semi-condensed (about 88%), with one word set heavy. The name is set bold, wide (about 112%) and tracked open by about 0.14 em.
- **Martian Mono** for labels, ids and hashes: 10–11 px, capitals, tracked +0.08–0.12 em.

Both are SIL Open Font License and ship in `frontend/app/fonts`, so nothing is fetched at build or run time.

## Using the mark

- **Clear space:** keep at least half the mark's width empty on every side.
- **Minimum size:** 16 px on screen, 6 mm in print. Below that, use the name alone.
- **Corners are square.** Do not round the brackets or the seal, add a stroke, glow or shadow, or rotate the mark.
- **Lime stays in the seal.** Do not colour the brackets lime, and do not put the mark on a lime ground; use the mono mark there.
