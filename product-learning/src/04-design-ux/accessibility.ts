// =============================================================================
// Chapter 04 — Accessibility (WCAG 2.2 quick checks)
// =============================================================================
// Goal: not a full audit, but a computable subset of the WCAG 2.2 success
// criteria that catches the most common regressions. Every check returns a
// pass/fail per element.
// =============================================================================

export interface ContrastPair {
  readonly foreground: string; // #RRGGBB
  readonly background: string;
}

export interface ContrastResult {
  readonly ratio: number;
  /** WCAG 2.2 — AA: ≥ 4.5 for normal text, ≥ 3 for large. AAA: 7 / 4.5. */
  readonly aaNormal: boolean;
  readonly aaLarge: boolean;
  readonly aaaNormal: boolean;
  readonly aaaLarge: boolean;
}

/** Parse a #RRGGBB color. */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`invalid hex: ${hex}`);
  const v = m[1]!;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/** sRGB → linear channel value, per WCAG. */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function evaluateContrast(pair: ContrastPair): ContrastResult {
  const ratio = contrastRatio(pair.foreground, pair.background);
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

/** A check is a function that returns null on pass, or a description on fail. */
export type A11yCheck<T> = (t: T) => string | null;

export interface FormField {
  readonly id: string;
  readonly label: string;
  readonly type: 'text' | 'email' | 'password' | 'select' | 'checkbox' | 'radio';
  readonly required: boolean;
  readonly ariaLabel?: string;
  readonly hasError?: boolean;
}
export const formChecks: ReadonlyArray<{ name: string; check: A11yCheck<FormField> }> = [
  {
    name: 'label-or-aria',
    check: (f) => (f.label.trim() || f.ariaLabel?.trim() ? null : `${f.id} has no label or aria-label`),
  },
  {
    name: 'required-indicated',
    check: (f) => (f.required || f.ariaLabel?.includes('optional') ? null : `${f.id} missing required/optional indication`),
  },
  {
    name: 'error-announced',
    check: (f) => (f.hasError && !f.ariaLabel ? `${f.id} has error but no aria-label` : null),
  },
];

export function runFormChecks(fields: ReadonlyArray<FormField>): ReadonlyArray<{ fieldId: string; failures: string[] }> {
  return fields.map((f) => ({
    fieldId: f.id,
    failures: formChecks.map((c) => c.check(f)).filter((m): m is string => Boolean(m)),
  }));
}

/** Touch target size — Apple HIG (44pt) and Material (48dp) recommendations. */
export const MIN_TOUCH_TARGET_PX: Readonly<Record<'ios' | 'android' | 'wcag', number>> = {
  ios: 44,
  android: 48,
  wcag: 24, // WCAG 2.2 SC 2.5.8 minimum
};

export function isTouchTargetCompliant(sizePx: number, target: keyof typeof MIN_TOUCH_TARGET_PX): boolean {
  return sizePx >= MIN_TOUCH_TARGET_PX[target];
}
