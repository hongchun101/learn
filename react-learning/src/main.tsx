/**
 * App entry. The order of imports matters:
 *  - i18n first, so the rest of the tree can read translations.
 *  - styles (which includes Tailwind) before any component renders.
 */
import './features/i18n/i18n';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('root element not found');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
