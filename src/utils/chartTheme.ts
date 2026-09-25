import type { CSSProperties } from 'react';

/** Chart colours come from the design tokens (see DESIGN.md), so charts follow the app palette. */
export const chartTheme = {
  primary: 'var(--color-primary)',
  grid: 'var(--border-light)',
  axis: 'var(--text-tertiary)',
  /** Categorical series: the primary colour first, then the status colours. */
  series: [
    'var(--color-primary)',
    'var(--color-info)',
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-danger)',
    'var(--text-tertiary)',
  ],
  tooltip: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-medium)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
