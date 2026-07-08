/**
 * AppShell — the application sidebar + outlet.
 *
 * The nav uses `NavLink` from react-router so the active link gets the
 * `linkActive` class automatically.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '@core/hooks';
import styles from './shell.module.css';
import { cn } from '@core/utils/cn';

interface NavItem {
  to: string;
  labelKey: string;
  shortLabel: string;
  end?: boolean;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Core',
    items: [
      { to: '/', labelKey: 'nav.hooks', shortLabel: 'hooks', end: true },
      { to: '/performance', labelKey: 'nav.performance', shortLabel: 'perf' },
      { to: '/error-boundary', labelKey: 'nav.error', shortLabel: 'err' },
    ],
  },
  {
    title: 'Patterns',
    items: [
      { to: '/polymorphic', labelKey: 'nav.polymorphic', shortLabel: 'poly' },
      { to: '/compound', labelKey: 'nav.compound', shortLabel: 'cmpd' },
      { to: '/virtualized', labelKey: 'nav.virtualized', shortLabel: 'virt' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: '/router', labelKey: 'nav.routing', shortLabel: 'route' },
      { to: '/forms', labelKey: 'nav.forms', shortLabel: 'form' },
      { to: '/state', labelKey: 'nav.state', shortLabel: 'zust' },
      { to: '/server-state', labelKey: 'nav.state', shortLabel: 'tanq' },
      { to: '/redux', labelKey: 'nav.state', shortLabel: 'rdx' },
    ],
  },
  {
    title: 'Ecosystem',
    items: [
      { to: '/styling', labelKey: 'nav.styling', shortLabel: 'css' },
      { to: '/i18n', labelKey: 'nav.i18n', shortLabel: 'i18n' },
      { to: '/animation', labelKey: 'nav.animation', shortLabel: 'anim' },
      { to: '/a11y', labelKey: 'nav.a11y', shortLabel: 'a11y' },
    ],
  },
];

export function AppShell() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>('rl.shell.collapsed', false);
  return (
    <div className={styles.shell} data-collapsed={String(collapsed)}>
      <aside className={styles.aside}>
        <div className={styles.brand}>{collapsed ? 'RL' : t('app.title')}</div>
        <button
          className={styles.collapse}
          onClick={() => setCollapsed((v) => !v)}
          aria-label="collapse sidebar"
        >
          {collapsed ? '›' : '‹'}
        </button>
        {!collapsed ? (
          <nav className={styles.nav}>
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <div className={styles.section}>{section.title}</div>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(styles.link, isActive && styles.linkActive)}
                  >
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        ) : (
          <nav className={styles.nav}>
            {SECTIONS.flatMap((s) => s.items).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(styles.link, isActive && styles.linkActive)}
                title={t(item.labelKey)}
              >
                {item.shortLabel}
              </NavLink>
            ))}
          </nav>
        )}
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
