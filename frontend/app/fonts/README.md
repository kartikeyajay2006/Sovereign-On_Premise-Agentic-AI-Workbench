# Fonts

`instrument-serif-regular.woff2` and `instrument-serif-italic.woff2` are
Instrument Serif by Instrument, licensed under the SIL Open Font License 1.1
(https://github.com/Instrument/instrument-serif). They are bundled here and
loaded through `next/font/local` in `app/layout.tsx`, so neither the build
nor the running page fetches a font from the network.

Geist Sans and Geist Mono come from the `geist` package (OFL), loaded the same
way.

`archivo-variable.woff2` (Archivo, weight and width axes) and
`martian-mono-variable.woff2` (Martian Mono) are the Hi-Vis Monochrome faces,
from the Fontsource variable builds, each under the SIL Open Font License 1.1
(`archivo-OFL.txt`, `martian-mono-OFL.txt`). Loaded through `next/font/local`
as `--font-archivo` and `--font-martian`.
