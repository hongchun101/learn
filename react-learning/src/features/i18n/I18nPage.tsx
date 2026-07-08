/**
 * I18nPage — switch language, watch the UI translate.
 *
 * Uses `useTranslation` from `react-i18next` with the default namespace.
 * Pluralisation uses i18next's `_one` / `_other` keys.
 */
import { useTranslation } from 'react-i18next';
import { Card, DemoArea, Row } from '@core/components/Card';

export function I18nPage() {
  const { t, i18n } = useTranslation();
  return (
    <Card title="i18n — react-i18next">
      <DemoArea>
        <p>
          current language: <code>{i18n.language}</code>
        </p>
        <Row>
          <button onClick={() => void i18n.changeLanguage('en')}>English</button>
          <button onClick={() => void i18n.changeLanguage('zh')}>中文</button>
        </Row>
        <h3>{t('app.title')}</h3>
        <p style={{ color: 'var(--color-fg-muted)' }}>{t('app.subtitle')}</p>
        <p>{t('greeting', { name: 'Ada' })}</p>
        <p>{t('cart.empty')}</p>
        <p>{t('cart.items', { count: 1 })}</p>
        <p>{t('cart.items', { count: 5 })}</p>
      </DemoArea>
    </Card>
  );
}
