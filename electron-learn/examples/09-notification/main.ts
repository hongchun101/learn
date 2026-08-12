// examples/09-notification/main.ts
import { app, Notification, BrowserWindow, screen } from 'electron';

app.setAppUserModelId('com.example.deep-app');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, show: false });
  win.once('ready-to-show', () => win.show());

  // basic
  const n1 = new Notification({
    title: 'Hi there',
    body: 'Lunch at 13:00?',
    silent: false,
    timeoutType: 'default',
  });
  n1.on('click', () => win.focus());
  n1.show();

  // macOS reply / actions
  if (process.platform === 'darwin') {
    const n2 = new Notification({
      title: 'New message',
      body: 'Alice replied',
      replyPlaceholder: 'Reply…',
      actions: [{ text: 'Reply', type: 'button' }, { text: 'Mute', type: 'button' }],
    });
    n2.on('action', (_e, idx) => { /* open / mute */ });
    n2.on('reply', (_e, reply) => { /* send reply */ });
    n2.show();
  }
});
