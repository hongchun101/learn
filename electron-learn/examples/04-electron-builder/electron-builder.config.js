// examples/04-electron-builder/electron-builder.config.js
/**
 * electron-builder 自定义配置示例
 */
module.exports = {
  appId: 'com.example.electron-deep-app',
  productName: 'DeepElectronApp',
  copyright: 'Copyright © 2026 Example Inc.',
  asar: true,
  asarUnpack: [
    '**/*.node',
    '**/native/**',
    '**/videos/*.mp4',
  ],
  directories: {
    output: 'release/${version}',
    buildResources: 'build',
  },
  files: [
    'dist/**',
    'package.json',
  ],
  extraResources: [
    {
      from: 'build/data',
      to: 'data',
      filter: ['**/*'],
    },
  ],
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    signtoolOptions: {
      publisherName: 'CN=Example Inc.',
    },
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: true,
    shortcutName: 'DeepElectronApp',
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    identity: 'Developer ID Application: Example Inc. (TEAMIDXX)',
    notarize: {
      teamId: 'TEAMIDXX',
      tool: 'notarytool',
    },
  },
  linux: {
    target: ['AppImage', 'deb', 'rpm'],
    category: 'Development',
    vendor: 'Example Inc.',
    synopsis: 'A deep look into Electron internals',
    description: 'Example desktop application built with Electron.',
  },
  publish: {
    provider: 'generic',
    url: 'https://updates.example.com/electron-deep-app',
    channel: 'latest',
    useMultipleRangeRequest: false,
  },
};
