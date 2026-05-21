import Color from 'color';

export function wcagContrastRatio(hex1: string, hex2: string): number {
  const l1 = Color(hex1).luminosity();
  const l2 = Color(hex2).luminosity();
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
