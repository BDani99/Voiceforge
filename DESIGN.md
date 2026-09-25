# VoiceForge design system

The UI is dark, flat and quiet. One accent colour, a neutral graphite scale and four status colours;
no gradients, glows or blur. Everything comes from the tokens in [src/styles/theme.css](src/styles/theme.css).
Components never define a colour of their own; charts read the same tokens through
[src/utils/chartTheme.ts](src/utils/chartTheme.ts).

## App icon

Five white sound bars on a rounded square in the primary colour.

- File: [public/favicon.svg](public/favicon.svg) (browser tab)
- Component: [BrandMark](src/components/BrandMark/BrandMark.tsx), the same drawing, used in the header,
  dashboard, login screens, admin layout, loading screen and error screen.

## Colours

| Role | Token | Value | Used for |
| --- | --- | --- | --- |
| Primary | `--color-primary` | `#7657ee` | the one accent: primary buttons, active tab, focus, progress |
| | `--color-primary-hover` | `#6644de` | hover / pressed |
| | `--color-primary-text` | `#a897f5` | primary colour as text or icon on dark surfaces |
| | `--color-primary-soft` | 14 % tint | selected / active backgrounds |
| | `--color-primary-border` | 40 % tint | borders of selected / active elements |
| Secondary | `--color-secondary` | `#232830` | secondary buttons, chips, neutral actions |
| | `--color-secondary-hover` | `#2c323b` | hover |
| Success | `--color-success` (+ `-text`, `-soft`, `-border`) | `#3fb37f` | generated, saved |
| Warning | `--color-warning` (+ variants) | `#d99a2b` | caution, announcements |
| Danger | `--color-danger` (+ variants) | `#e5484d` | errors, delete, suspend |
| Info | `--color-info` (+ `-text`, `-soft`) | `#3b82d6` | neutral information |
| Surfaces | `--bg-app` | `#0d0f13` | page background |
| | `--bg-card` | `#14171c` | cards, panels |
| | `--bg-card-hover` | `#1a1e24` | hovered / selected card |
| | `--bg-elevated` | `#191d23` | menus, popovers |
| | `--bg-input` | `#0f1115` | inputs (recessed) |
| Borders | `--border-light` / `--border-medium` / `--border-hover` | `#1f2329` / `#2b3038` / `#3a414c` | dividers, inputs, hover |
| Text | `--text-primary` / `-secondary` / `-tertiary` / `-muted` | `#eceff3` / `#b6bcc7` / `#8a92a0` / `#6b7381` | text hierarchy |
| Other | `--overlay` | 72 % black | backdrop behind modals |
| | `--color-highlight` | amber 38 % | word being spoken (karaoke) |

Emotion highlights in the text editor use a hue per emotion (`--emo-hue`); that is data colouring, not chrome.

Rules: status colours only mean their status; text on a coloured soft background uses the `-text`
variant; the primary colour is never used for large filled areas other than buttons and the app icon.

## Shape and depth

- Radii: `--radius-sm` 6, `-md` 8, `-lg` 10, `-xl` 14 px. Pills (`-full`) only for chips and counters.
- Depth comes from surface colour and a 1 px border. Shadows (`--shadow-*`) only lift what floats:
  menus, modals.
- Focus: a 3 px ring in `--accent-glow` on inputs, `outline` on buttons.

## Motion

This is an app, not a landing page, so motion is rare and short.

| Where | What | Duration |
| --- | --- | --- |
| Buttons, rows, inputs | colour change, `scale(0.97)` on press | 120 ms |
| Menus (export) | fade + scale from the button (`menu-in`) | 140 ms |
| Modals, dialogs | overlay fade + rise 8 px (`overlay-in`, `dialog-in`) | 160 / 200 ms |
| Login error | one horizontal shake | 280 ms |
| Loading | spinner (`.spinning`, `.loading-spinner`) | continuous |
| Generating paragraph | opacity pulse of its segment in the bottom bar | continuous |

Rules: ease-out (`--ease-out`); only `transform` and `opacity` move; never `transition: all`; nothing
enters on hover; nothing animates from keyboard-driven actions; every animation is switched off under
`prefers-reduced-motion` (global rule in [src/styles/index.css](src/styles/index.css)).
