export const BRAND_COLORS = {
  NVIDIA: '#76B900',
  AMD: '#ED1C24',
  INTEL: '#0068B5',
  DEFAULT: '#6B7280',
} as const;

export const SOCKET_COMPATIBILITY: Record<string, string[]> = {
  'AM4': ['AM4'],
  'AM5': ['AM5'],
  'LGA1700': ['LGA1700'],
  'LGA1851': ['LGA1851'],
  'LGA1200': ['LGA1200'],
} as const;

export const RAM_TYPES = {
  DDR4: 'DDR4',
  DDR5: 'DDR5',
} as const;

export const POWER_MARGIN = 1.2; // 20% margin for PSU
