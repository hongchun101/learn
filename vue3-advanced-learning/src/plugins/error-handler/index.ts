import type { App } from 'vue';
import { errorEmitter } from './error-emitter';

export const errorHandlerPlugin = {
  install(app: App): void {
    app.provide('errorEmitter', errorEmitter);
    app.config.globalProperties.$errorEmitter = errorEmitter;
  },
};
