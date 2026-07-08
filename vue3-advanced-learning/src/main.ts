import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { registerDirectives } from './directives';
import { errorHandlerPlugin } from './plugins/error-handler';
import { i18nPlugin } from './plugins/i18n';
import './styles/global.scss';

const app = createApp(App);

// Global error handler
app.config.errorHandler = (err, instance, info) => {
  // eslint-disable-next-line no-console
  console.error('[Global Error]', err, '\nComponent:', instance, '\nInfo:', info);
};

app.config.warnHandler = (msg, instance, trace) => {
  // eslint-disable-next-line no-console
  console.warn('[Global Warn]', msg, '\nTrace:', trace);
};

// Performance: enabled in dev only
app.config.performance = import.meta.env.DEV;

app.use(createPinia());
app.use(router);
app.use(i18nPlugin, {
  locale: 'zh-CN',
  messages: {
    'zh-CN': { welcome: '欢迎来到 Vue 3 高级学习项目' },
    'en-US': { welcome: 'Welcome to Vue 3 Advanced Learning' },
  },
});
app.use(errorHandlerPlugin);

registerDirectives(app);

app.mount('#app');
