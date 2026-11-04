/** Wheel segment color presets */
export const COLOR_PRESETS = [
  { name: 'Classic', colors: ['#34a853', '#fbbc04', '#ea4335', '#4285f4'] },
  { name: 'Sunset',  colors: ['#ff6b6b', '#feca57', '#ff9f43', '#ee5a24'] },
  { name: 'Ocean',   colors: ['#0abde3', '#48dbfb', '#006ba6', '#54a0ff'] },
  { name: 'Forest',  colors: ['#1dd1a1', '#10ac84', '#55efc4', '#00b894'] },
  { name: 'Candy',   colors: ['#fd79a8', '#e84393', '#a29bfe', '#6c5ce7'] },
  { name: 'Mono',    colors: ['#2d3436', '#636e72', '#b2bec3', '#dfe6e9'] },
]

export const DEFAULT_COLORS = COLOR_PRESETS[0].colors

export function getSegmentColor(index, palette = DEFAULT_COLORS) {
  const colors = palette && palette.length > 0 ? palette : DEFAULT_COLORS
  return colors[index % colors.length]
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null
}

/** Determine if text should be white or dark based on background */
export function getTextColor(bgHex) {
  const rgb = hexToRgb(bgHex)
  if (!rgb) return '#ffffff'
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.55 ? '#1a1a1a' : '#ffffff'
}
