/** The three colour themes. Free for everyone; each has a light and a dark version (see app/globals.css). */
export const ACCENTS = [
  { id: 'teal', label: 'Teal', light: '#0f766e', dark: '#2dd4bf', soft: '#ccfbf1' },
  { id: 'ocean', label: 'Ocean', light: '#1d4ed8', dark: '#60a5fa', soft: '#dbeafe' },
  { id: 'royal', label: 'Violet', light: '#6d28d9', dark: '#a78bfa', soft: '#ede9fe' },
] as const;
export type AccentId = (typeof ACCENTS)[number]['id'];
export const ACCENT_IDS = ACCENTS.map((a) => a.id) as [AccentId, ...AccentId[]];
export const accentOf = (id: string | null | undefined) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
