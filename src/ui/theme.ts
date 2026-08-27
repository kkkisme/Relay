export const colors = {
  app: '#0b1018',
  sidebar: '#0d1420',
  surface: '#111a27',
  surfaceRaised: '#162131',
  border: '#223044',
  borderStrong: '#2d4058',
  text: '#f4f7fb',
  textMuted: '#93a4b8',
  textFaint: '#64758a',
  accent: '#2dd4bf',
  accentBlue: '#38bdf8',
  accentWash: '#12343a',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
} as const

export const FONT = typeof window === 'undefined' ? 'Inter' : 'IBM Plex Sans'
export const MONO = typeof window === 'undefined' ? 'JetBrains Mono' : 'Lilex'
