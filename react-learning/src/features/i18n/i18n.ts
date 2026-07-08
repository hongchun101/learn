/**
 * i18next setup with react-i18next.
 *
 * Two languages, one default namespace. New namespaces can be added by
 * passing a namespace to `useTranslation` (e.g. `useTranslation('cart')`).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
