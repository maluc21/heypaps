# HeroUI Theme Customization Plan

## Overview
Add HeroUI theme CSS variables to `src/app/globals.css` for light and dark mode support. These variables enable HeroUI component theming via CSS custom properties.

## Affected Files
- `src/app/globals.css` - Global stylesheet with existing Tailwind/CSS theme

## Changes Required

### 1. Add HeroUI Light Mode Variables
Insert after the `:root` section (after line 133, before `.dark {`):

```css
/* HeroUI Theme Colors (Light Mode) */
:root,
.light,
.default,
[data-theme="light"],
[data-theme="default"] {
  --accent: oklch(62.04% 0.1950 253.83);
  --accent-foreground: oklch(99.11% 0 0);
  --background: oklch(97.02% 0.0015 253.83);
  --border: oklch(90.00% 0.0015 253.83);
  --danger: oklch(65.32% 0.2335 25.74);
  --danger-foreground: oklch(99.11% 0 0);
  --default: oklch(94.00% 0.0015 253.83);
  --default-foreground: oklch(21.03% 0.0059 253.83);
  --field-background: oklch(100.00% 0.0008 253.83);
  --field-border: transparent;
  --field-foreground: oklch(21.03% 0.0015 253.83);
  --field-placeholder: oklch(55.17% 0.0030 253.83);
  --focus: oklch(62.04% 0.1950 253.83);
  --foreground: oklch(21.03% 0.0015 253.83);
  --muted: oklch(55.17% 0.0030 253.83);
  --overlay: oklch(100.00% 0.0004 253.83);
  --overlay-foreground: oklch(21.03% 0.0015 253.83);
  --scrollbar: oklch(87.10% 0.0015 253.83);
  --segment: oklch(100.00% 0.0015 253.83);
  --segment-foreground: oklch(21.03% 0.0015 253.83);
  --separator: oklch(92.00% 0.0015 253.83);
  --success: oklch(73.29% 0.1941 150.81);
  --success-foreground: oklch(21.03% 0.0059 150.81);
  --surface: oklch(100.00% 0.0008 253.83);
  --surface-foreground: oklch(21.03% 0.0015 253.83);
  --surface-secondary: oklch(95.24% 0.0012 253.83);
  --surface-secondary-foreground: oklch(21.03% 0.0015 253.83);
  --surface-tertiary: oklch(93.73% 0.0012 253.83);
  --surface-tertiary-foreground: oklch(21.03% 0.0015 253.83);
  --warning: oklch(78.19% 0.1590 72.33);
  --warning-foreground: oklch(21.03% 0.0059 72.33);
}

/* Border Radius */
--radius: 0.25rem;
--field-radius: 0.75rem;

/* Font Family */
/* Make sure to load Geist font in your app */
--font-sans: var(--font-geist);
}
```

### 2. Add HeroUI Dark Mode Variables
Insert after the `.dark` section (after line 188, before `@layer base`):

```css
/* HeroUI Theme Colors (Dark Mode) */
.dark,
[data-theme="dark"] {
  color-scheme: dark;
  --accent: oklch(62.04% 0.1950 253.83);
  --accent-foreground: oklch(99.11% 0 0);
  --background: oklch(12.00% 0.0015 253.83);
  --border: oklch(28.00% 0.0015 253.83);
  --danger: oklch(59.40% 0.1973 24.63);
  --danger-foreground: oklch(99.11% 0 0);
  --default: oklch(27.40% 0.0015 253.83);
  --default-foreground: oklch(99.11% 0 0);
  --field-background: oklch(21.03% 0.0030 253.83);
  --field-border: transparent;
  --field-foreground: oklch(99.11% 0.0015 253.83);
  --field-placeholder: oklch(70.50% 0.0030 253.83);
  --focus: oklch(62.04% 0.1950 253.83);
  --foreground: oklch(99.11% 0.0015 253.83);
  --muted: oklch(70.50% 0.0030 253.83);
  --overlay: oklch(21.03% 0.0030 253.83);
  --overlay-foreground: oklch(99.11% 0.0015 253.83);
  --scrollbar: oklch(70.50% 0.0015 253.83);
  --segment: oklch(39.64% 0.0015 253.83);
  --segment-foreground: oklch(99.11% 0.0015 253.83);
  --separator: oklch(25.00% 0.0015 253.83);
  --success: oklch(73.29% 0.1941 150.81);
  --success-foreground: oklch(21.03% 0.0059 150.81);
  --surface: oklch(21.03% 0.0030 253.83);
  --surface-foreground: oklch(99.11% 0.0015 253.83);
  --surface-secondary: oklch(25.70% 0.0023 253.83);
  --surface-secondary-foreground: oklch(99.11% 0.0015 253.83);
  --surface-tertiary: oklch(27.21% 0.0023 253.83);
  --surface-tertiary-foreground: oklch(99.11% 0.0015 253.83);
  --warning: oklch(82.03% 0.1392 76.34);
  --warning-foreground: oklch(21.03% 0.0059 76.34);
}
```

## Implementation Notes

### Variable Overlap Strategy
- The existing `:root` and `.dark` sections contain design-system variables (cards, popovers, charts, sidebar, etc.)
- The HeroUI variables extend/override with UI-focused colors (fields, segments, surfaces, warnings, etc.)
- Where variable names overlap (e.g., `--accent`, `--background`, `--foreground`), the HeroUI definitions take precedence due to placement order
- Non-overlapping HeroUI variables add new theming capabilities: `--field-*`, `--segment`, `--surface-*`, `--overlay-*`

### Dependencies
- Ensure `@heroui/styles` is imported in the app (or the CSS is loaded via global.css)
- Load Geist font: `@import url('https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400;500;600;700;800&display=swap');`
- The `--font-sans: var(--font-geist)` assumes Next.js `next/font` loads Geist as `--font-geist`

### Validation
- Run `npm run dev` to verify no CSS errors
- Check light mode: verify background, cards, inputs, buttons use HeroUI colors
- Check dark mode: verify same elements use dark-mode HeroUI colors
- Test component rendering with `data-theme="light"` and `data-theme="dark"` attributes

## Rollback
Backup existing `globals.css` before changes. Restore from `.kilo\plans\1794974754416-heroui-theme-customization-plan.md` backup if needed.