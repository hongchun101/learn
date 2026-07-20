// =============================================================================
// Chapter 09 — Internationalization (i18n) & Localization (l10n)
// =============================================================================
// Goal: i18n is a product surface, not a translation project. This file
// implements locale-aware formatting, text-expansion ratios, and a launch
// readiness check.
//
// References:
//   * W3C, "Internationalization Best Practices".
//   * "Minimum Industry Locale Index" (LISA / Unicode).
// =============================================================================

export interface Locale {
  /** BCP-47 tag, e.g. 'en-US', 'zh-CN', 'ja-JP'. */
  readonly tag: string;
  /** Currency code. */
  readonly currency: string;
  /** Date format. */
  readonly dateFormat: 'DMY' | 'MDY' | 'YMD';
  /** Decimal separator. */
  readonly decimal: '.' | ',';
  /** Thousand separator. */
  readonly thousand: ',' | '.' | ' ' | "'";
}

export const COMMON_LOCALES: ReadonlyArray<Locale> = [
  { tag: 'en-US', currency: 'USD', dateFormat: 'MDY', decimal: '.', thousand: ',' },
  { tag: 'de-DE', currency: 'EUR', dateFormat: 'DMY', decimal: ',', thousand: '.' },
  { tag: 'fr-FR', currency: 'EUR', dateFormat: 'DMY', decimal: ',', thousand: ' ' },
  { tag: 'ja-JP', currency: 'JPY', dateFormat: 'YMD', decimal: '.', thousand: ',' },
  { tag: 'zh-CN', currency: 'CNY', dateFormat: 'YMD', decimal: '.', thousand: ',' },
];

export function formatCurrency(value: number, locale: Locale): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const intPart = Math.floor(abs);
  const frac = Math.round((abs - intPart) * 100);
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, locale.thousand);
  const fracStr = frac.toString().padStart(2, '0');
  return `${sign}${locale.currency} ${intStr}${locale.decimal}${fracStr}`;
}

export function formatDate(year: number, month: number, day: number, locale: Locale): string {
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  if (locale.dateFormat === 'DMY') return `${dd}/${mm}/${year}`;
  if (locale.dateFormat === 'YMD') return `${year}/${mm}/${dd}`;
  return `${mm}/${dd}/${year}`;
}

/** Average text expansion factor — German typically 1.3× English, Japanese 0.6×. */
const EXPANSION: Readonly<Record<string, number>> = {
  'en-US': 1.0,
  'de-DE': 1.35,
  'fr-FR': 1.2,
  'es-ES': 1.25,
  'ja-JP': 0.6,
  'zh-CN': 0.7,
  'ko-KR': 0.8,
  'ar-SA': 1.4,
};

export function expansionFactor(sourceLocale: string, targetLocale: string): number {
  const s = EXPANSION[sourceLocale] ?? 1;
  const t = EXPANSION[targetLocale] ?? 1;
  return t / s;
}

export function expandedWidth(sourceWidthPx: number, sourceLocale: string, targetLocale: string): number {
  return sourceWidthPx * expansionFactor(sourceLocale, targetLocale);
}

/** Launch readiness for a new locale — minimum coverage. */
export interface LocaleReadiness {
  readonly locale: string;
  readonly stringCoverage: number;
  readonly legalReview: boolean;
  readonly support: boolean;
  readonly currency: boolean;
  readonly paymentMethod: boolean;
}

export function isLocaleLaunchReady(r: LocaleReadiness, minCoverage = 0.98): boolean {
  return r.stringCoverage >= minCoverage && r.legalReview && r.support && r.currency && r.paymentMethod;
}

/** Locale priority — score by addressable market × quality. */
export function localePriority(market: number, readiness: number, strategic = 1): number {
  return market * readiness * strategic;
}
