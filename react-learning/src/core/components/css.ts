/**
 * Tagged-template CSS-in-JS helper.
 *
 * `css` returns a class name that is unique to the tagged-template instance.
 * Each call evaluates the template at module-load time and inserts a
 * `<style>` tag on the first call. The values are interpolated with the
 * same `String()` rules as styled-components.
 *
 * Why a hand-rolled version:
 *  - The full `styled-components` / `vanilla-extract` toolchain brings a
 *    build step, a runtime, and significant weight. For a learning repo
 *    we want to show the *pattern* — scoping, theming via vars, dynamic
 *    interpolation — without paying that cost.
 *  - Production code should use one of the real libraries.
 */
import { useEffect, useState } from 'react';

const inserted = new Set<string>();
const PREFIX = 'rl-';

let counter = 0;
function nextClass(): string {
  counter += 1;
  return `${PREFIX}${counter.toString(36)}`;
}

function insertRule(className: string, body: string): void {
  if (inserted.has(className)) return;
  inserted.add(className);
  if (typeof document === 'undefined') return;
  const id = `css-${className}`;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `.${className}{${line}}`)
    .join('\n');
  document.head.appendChild(style);
}

export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  const className = nextClass();
  const body = strings.reduce<string>(
    (acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''),
    '',
  );
  insertRule(className, body);
  return className;
}

/**
 * `useCss` — same as `css`, but only inserts the rule on the client after
 * mount. Use it for styles that depend on browser-only state (e.g. the
 * reduced-motion media query).
 */
export function useCss(strings: TemplateStringsArray, ...values: unknown[]): string {
  const className = nextClass();
  const body = strings.reduce<string>(
    (acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''),
    '',
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    insertRule(className, body);
    setReady(true);
  }, [className, body]);
  return ready ? className : '';
}
