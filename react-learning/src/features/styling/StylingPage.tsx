/**
 * StylingPage — three styling strategies in one place.
 *
 *  1. **CSS Modules** — the project's primary mechanism for component
 *     styles. Scoped class names, no runtime cost.
 *  2. **Tailwind utility classes** — useful for one-offs, rapid iteration.
 *  3. **CSS-in-JS** — a tiny tagged-template helper (`@core/components/css`)
 *     that shows the pattern without the build cost of styled-components
 *     or vanilla-extract.
 */
import { css } from '@core/components/css';
import { Card } from '@core/components/Card';
import styles from './StylingPage.module.css';

const inline = css`
  background: linear-gradient(90deg, #38bdf8 0%, #4ade80 100%);
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
`;

export function StylingPage() {
  return (
    <div>
      <Card title="Styling — three approaches">
        <p>
          Each card below uses a different strategy. The point isn't to
          compare them; it's to see how each one slots into a React
          component.
        </p>
      </Card>

      <Card title="CSS Modules">
        <p>
          Class names are scoped at build time. The <code>.button</code>{' '}
          here has no chance of colliding with another component's button.
        </p>
        <button type="button" className={styles.button}>
          css-modules button
        </button>
      </Card>

      <Card title="Tailwind utility classes">
        <p>
          No new files. Class strings get compiled by PostCSS.
        </p>
        <button
          type="button"
          className="rounded-md border border-accent bg-accent px-3 py-1 font-semibold text-bg hover:opacity-90"
        >
          tailwind button
        </button>
      </Card>

      <Card title="CSS-in-JS (lightweight)">
        <p>
          The <code>css</code> helper interpolates a tagged template into
          a class, then injects a <code>&lt;style&gt;</code> tag the first
          time it's referenced.
        </p>
        <button type="button" className={inline}>
          css-in-js button
        </button>
      </Card>
    </div>
  );
}
