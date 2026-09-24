<div align="center">

<img src="aegis-lockup-light.svg#gh-light-mode-only" alt="AEGIS" width="420">
<img src="aegis-lockup-dark.svg#gh-dark-mode-only" alt="AEGIS" width="420">

# Brand kit

</div>

The AEGIS mark is a shield with an upward chevron cut through it and a seal dot where the chevron's crossbar would be.

- **The shield** is the name: *aegis*, the shield that protects.
- **The chevron** is the letter A, and the direction every run takes: evidence at the base, a checked answer at the apex.
- **The seal dot** is the hash that closes the record. Nothing leaves without it.

The chevron and the dot are **cut out** of the shield, not painted on it, so whatever sits behind the mark shows through. That is why one file works on paper, on night and on any coloured tile.

## Files

| File | Use it for |
|---|---|
| [`aegis-mark.svg`](aegis-mark.svg) | The mark in the brand gradient. The default everywhere. |
| [`aegis-mark-mono.svg`](aegis-mark-mono.svg) | One-colour ink, for print, faxes, stamps and anything that cannot carry colour. |
| [`aegis-mark-white.svg`](aegis-mark-white.svg) | One-colour white, for photographs and dark brand colours. |
| [`aegis-lockup-light.svg`](aegis-lockup-light.svg) | Mark, name and product line, on light backgrounds. |
| [`aegis-lockup-dark.svg`](aegis-lockup-dark.svg) | The same, on dark backgrounds. |
| [`aegis-app-icon.svg`](aegis-app-icon.svg) | Square app icon on a night tile, for launchers, social cards and slides. |

In the product the mark is drawn by [`frontend/components/aegis-logo.tsx`](../../../frontend/components/aegis-logo.tsx) (`AegisMark` and `AegisLogo`), and the browser tab icon is [`frontend/app/icon.svg`](../../../frontend/app/icon.svg). Change the drawing there and every screen follows.

## Colour

| Swatch | Name | Hex | Role |
|---|---|---|---|
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-ff6a1a?style=flat-square) | Signal orange | `#ff6a1a` | Gradient start; the single accent inside the product |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-ff2d6f?style=flat-square) | Ember pink | `#ff2d6f` | Gradient middle |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-7c4dff?style=flat-square) | Proof violet | `#7c4dff` | Gradient end |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-0b0b0c?style=flat-square) | Night | `#0b0b0c` | Dark ground, ink |
| ![](https://img.shields.io/badge/-%20%20%20%20%20%20-f7f7f5?style=flat-square) | Paper | `#f7f7f5` | Light ground |

The gradient runs from the top-left of the shield to its point: orange, pink, violet. Keep that direction; a reversed gradient reads as a different mark.

Inside the application the palette stays restrained: ink, paper and the four status colours (sovereign green, active blue, approval amber, critical red). The gradient belongs to the mark and to public material such as the README, slides and the landing page. It does not decorate data.

## Type

The name is set in **Geist**, weight 600–700, in capitals, tracked open by about 0.04 em. The product line under it is Geist Medium in capitals, tracked wider. Monospace figures in the product use **Geist Mono**.

## Using the mark

- **Clear space:** keep at least half the mark's width empty on every side.
- **Minimum size:** 16 px on screen, 6 mm in print. Below that, use the name alone.
- **Do** place the gradient mark on paper, on night, or on a photograph with a calm area behind it.
- **Do not** recolour the gradient, add a stroke or shadow, rotate or stretch the mark, fill the cut-outs, or put the gradient mark on a busy orange, pink or violet ground (use the white mark there).
