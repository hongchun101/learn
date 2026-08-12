# 20 · 签名与公证完整流程（专家级）

> 没有签名/公证，你的应用根本进不了用户机器。这一章不仅给出"步骤"，还给出"为什么"，让你能在任何一个新平台（macOS、Windows、Linux、Steam Workshop）走完整个签名链路。

---

## 20.0 阅读路径

- **20.1** 为什么签名
- **20.2** 密码学速成
- **20.3** macOS 签名 / 公证
- **20.4** Windows 签名
- **20.5** Linux 签名
- **20.6** Electron 自动更新签名
- **20.7** CI/CD 整合
- **20.8** 常见故障

---

## 20.1 为什么签名

签名 = 让 OS 信任这个二进制。OS 上的 Gatekeeper / SmartScreen / PackageKit 都是为了"验证发行者"做出来的一道屏障。

不签名会发生：

- macOS Gatekeeper 拦截，用户必须手动"系统设置 → 安全性 → 仍然打开"。
- Windows SmartScreen 提示"未知发布者"，下载 0%。
- Linux 安装包 repo 不能上。

---

## 20.2 密码学速成：PEM / PKCS#12 / Authenticode

| 类型 | 后缀 | 用途 |
|------|------|------|
| 公钥 / 私钥 | .pem, .cer, .crt | 公开部分 |
| 私钥包装 | .p12, .pfx | 包含私钥 |
| 公钥哈希 | SHA256 fingerprint | 用于 CI |
| 签名结果 | .sig, .sign | 验签用 |

### 20.2.1 看 PEM

```bash
openssl x509 -in cert.pem -text -noout
```

输出节选：

```
Subject: CN = Example Inc., O = Example Inc., C = US
Issuer: CN = DigiCert EV Code Signing CA, O = DigiCert, C = US
Validity
  Not Before: Jan 12 00:00:00 2024 GMT
  Not After : Jan 12 23:59:59 2027 GMT
Public Key: 2048 bit RSA
```

### 20.2.2 PKCS#12

```bash
openssl pkcs12 -export -out certificate.pfx -inkey private.key -in cert.pem
```

包含 cert + private key + chain。

### 20.2.3 Authenticode / Notary 加密

```text
EV Code Signing → SHA256 hash, 用 private key 加密
Notarization   → 传 .zip/.dmg + DigiCert Onechain/Apple notary service
```

---

## 20.3 macOS 签名 / 公证（深）

### 20.3.1 必备材料

- Apple Developer ID Application 证书
- Notarization account password（App-Specific Password）
- Team ID

### 20.3.2 流程

```text
1. 申请 Developer ID Application cert
   developer.apple.com → Certificates, Identifiers & Profiles → "+"
   → macOS → Developer ID Application

2. 在 Keychain 导入（DoubleClick → 登录 keychain）

3. 签名
   codesign --deep --options=runtime \
     --entitlements entitlements.plist \
     -s "Developer ID Application: Example Inc. (TEAMID)" \
     MyApp.app

4. 验签
   codesign --verify --deep --strict --verbose=2 MyApp.app

5. 打 zip
   ditto -c -k --keepParent MyApp.app MyApp.app.zip

6. 上传公证
   xcrun notarytool submit MyApp.app.zip \
     --keychain-profile "AC_PASSWORD" \
     --wait

7. Staple
   xcrun stapler staple MyApp.app
```

### 20.3.3 entitlements 文件

`entitlements.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 沙箱关闭 -->
  <!-- <key>com.apple.security.app-sandbox</key><true/> -->
  <!-- JIT -->
  <key>com.apple.security.cs.allow-jit</key><true/>
  <!-- 动态链接库不被强制签名校验 -->
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <!-- JIT + Writable Executable Memory -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <!-- USB -->
  <key>com.apple.security.device.usb</key><true/>
  <!-- Network -->
  <key>com.apple.security.network.client</key><true/>
  <!-- File access -->
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
</plist>
```

### 20.3.4 Helper 签名

每个 Electron Helper 子进程都需要独立签名：

```
MyApp Helper (Renderer).app
MyApp Helper (GPU).app
MyApp Helper (Plugin).app
```

`electron-builder` 自动做：

```json
"build": {
  "mac": {
    "helperBundleId": "com.example.myapp.helper"
  }
}
```

### 20.3.5 notarize 详细

`xcrun notarytool` 用 `--keychain-profile` 配合存了密码的 keychain：

```bash
# 1. 把 Apple ID 写入 keychain
xcrun notarytool store-credentials "AC_PASSWORD" \
  --apple-id "developer@example.com" \
  --team-id "TEAMIDXX" \
  --password "xxxx-xxxx-xxxx-xxxx"

# 2. 提交
xcrun notarytool submit MyApp.zip \
  --keychain-profile "AC_PASSWORD" \
  --wait

# 输出：
#  Successfully uploaded file
#  id: 2efe2717-52ef-43a5-96dc-0797e985ca76
#  status: Accepted
```

### 20.3.6 详验签

```bash
spctl --assess -v MyApp.app
spctl --assess --type execute --verbose MyApp.app
codesign -dvv MyApp.app
```

### 20.3.7 公证后等待

`--wait` 等到 notary service 返回才退出。大型应用（>1GB）可以分块。

### 20.3.8 electron-builder 自动 notarize

```json
"build": {
  "mac": {
    "notarize": { "teamId": "TEAMIDXX" },
    "hardenedRuntime": true
  }
}
```

> 自动 notarize 需要 teamId 在 `process.env`.

### 20.3.9 真实故障：公证失败

```text
Team ID "TEAMIDXX" is not associated with the team ID used to sign
the binary. Make sure you are using the right Apple ID.
```

解决：用 `security` 命令看当前 keychain 里的证书：

```bash
security find-identity -v -p codesigning
# 列出证书
```

### 20.3.10 真实故障：DMG 校验失败

```text
"Error: The signature does not match"
```

可能原因：

1. DMG 内部 `<pkgName>.app/Contents/Info.plist` 多了一层文件（不同步）。
2. DMG 是 readwrite → read-only 后部分未签名。

解决：用 `rebuild-fs` 重做。

---

## 20.4 Windows 签名

### 20.4.1 必备

- EV 代码签名证书（USB token 必有）。
- 或者 `signtool.exe` (从 Windows SDK 安装)。

### 20.4.2 一次签名流程

```bash
signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a /sha1 "<thumbprint>" MyApp.exe
```

参数说明：

| 参数 | 含义 |
|------|------|
| /fd | file digest = sha256 |
| /tr | 时间戳 URL |
| /td | 时间戳 digest |
| /a | 自动选证书 |
| /sha1 | 拇指纹 |

### 20.4.3 EV 证书常用做法

EV Code Signing 价格昂贵（5000 USD/年），但**首次启动立即信任**。**强烈推荐**。

```bash
signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a MyApp.exe
```

### 20.4.4 验签

```bash
signtool verify /pa MyApp.exe
```

`/pa` 验证内容；`/v` 详细。

### 20.4.5 Squirrel + Windows Defender SmartScreen

Squirrel 安装包 `.exe` 经过：

1. NSIS 编译。
2. signtool sign。
3. SmartScreen Internet Reputation → 首次启动报错。
4. 用户量足够后，SmartScreen 自动放行。

### 20.4.6 真实故障：signtool /a 找不到证书

`signtool sign /a /fd sha256` 报 "No certificates were found".

解决：用 `/sha1`：

```bash
certutil -store -user My
# 复制 thumbprint
signtool sign /sha1 "AB CD EF ..." /fd sha256 /tr http://timestamp.digicert.com MyApp.exe
```

### 20.4.7 electron-builder Windows 配置

```json
"build": {
  "win": {
    "signtoolOptions": {
      "certificateFile": "path/to/cert.pfx",
      "certificatePassword": "password",
      "publisherName": "Example Inc."
    }
  }
}
```

CI 上传 .pfx 到 GitHub Secrets。

### 20.4.8 Azure Trusted Signing (新)

2024 起 Azure 提供云签名：

```json
"signtoolOptions": {
  "azureSignTool": {
    "endpoint": "https://wus2.codesigning.azure.net",
    "codeSigningAccountName": "myaccount",
    "certificateProfileName": "MyProfile",
    "clientId": "...",
    "clientSecret": "..."
  }
}
```

---

## 20.5 Linux 签名

### 20.5.1 GPG

```bash
gpg --armor --detach-sign MyApp.AppImage
```

输出 `MyApp.AppImage.asc`。

### 20.5.2 仓库签名 (apt / yum)

deb 仓库签名：

```bash
debsigs --sign=origin --origin=example MyApp.deb
```

RPM：

```bash
rpm --addsign MyApp.rpm
rpm --checksig -v MyApp.rpm
```

### 20.5.3 AppImage 验证

AppImage 客户端上比较 SHA256：

```bash
sha256sum MyApp.AppImage
# 与官网公布对比
```

新版 AppImageHub 可加上 .sig 文件。

---

## 20.6 Electron 自动更新签名

### 20.6.1 关键：签名与公钥

`electron-updater` 要求 `latest.yml` 带 sha512 与 `pub_key`：

```yaml
version: 1.2.0
releaseDate: 2025-01-12T08:30:00Z
files:
  - url: MyApp-1.2.0.exe
    sha512: A1B2C3...
    size: 78234120
path: MyApp-1.2.0.exe
sha512: A1B2C3...
pub_key: |
  -----BEGIN PUBLIC KEY-----
  MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8LO...
  -----END PUBLIC KEY-----
```

### 20.6.2 主进程

```ts
import { autoUpdater } from 'electron-updater';
autoUpdater.verifyUpdateCodeSignature = true;     // 关键
```

`verifyUpdateCodeSignature` 内部：

1. 读 latest.yml 的 pub_key。
2. 用 pub_key 验证 .exe/.dmg 的签名。

### 20.6.3 自签流程

```ts
// build-sign.ts
import * as crypto from 'crypto';
import * as fs from 'fs';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

// publish
fs.writeFileSync('keys/private.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }));
fs.writeFileSync('keys/public.pem', publicKey.export({ format: 'pem', type: 'spki' }));
```

CI：

```yaml
- name: Sign update
  run: |
    node scripts/sign-update.cjs
```

`sign-update.cjs`：

```js
const { privateKey } = require('fs').readFileSync('keys/private.pem');
const { verifyHash } = require('crypto');

const hash = require('crypto')
  .createHash('sha512')
  .update(fs.readFileSync(process.argv[2]))
  .digest();

const signature = crypto.sign('sha512', hash, privateKey);

// 写回 latest.yml
fs.writeFileSync('release/latest.yml', newYaml);
```

### 20.6.4 更新签名校验流程

```cpp
// v3/wupdater/ExtractedUpdateVerifier.cc
bool VerifySha512AndSignature(
    const std::string& pub_key,
    const base::FilePath& path,
    const std::string& sha512_hex) {
  // 公钥 RSA verify
  std::unique_ptr<crypto::SignatureVerifier> verifier;
  verifier = crypto::SignatureVerifier::Create();
  verifier->VerifyUpdate();
  ...
}
```

---

## 20.7 CI/CD 整合

### 20.7.1 GitHub Actions macOS

```yaml
- name: Import code signing cert
  uses: apple-actions/import-codesigncert@v3
  with:
    p12-file-base64: ${{ secrets.MACOS_CERT_P12 }}
    p12-password: ${{ secrets.MACOS_CERT_PASSWORD }}

- name: Import notarytool profile
  run: xcrun notarytool store-credentials "AC_PASSWORD" \
        --apple-id "${{ secrets.APPLE_ID }}" \
        --team-id "${{ secrets.APPLE_TEAM_ID }}" \
        --password "${{ secrets.APPLE_PASSWORD }}"

- name: Build macOS
  run: npx electron-builder --mac --publish never
  env:
    CSC_KEY_PASSWORD: ${{ secrets.MACOS_CERT_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
```

### 20.7.2 GitHub Actions Windows

```yaml
- name: Install signtool
  run: |
    choco install windows-sdk-10.1

- name: Sign Windows install
  run: |
    $env:CSC_LINK = "${{ secrets.WIN_CERT_BASE64 }}"
    $env:CSC_KEY_PASSWORD = "${{ secrets.WIN_CERT_PASSWORD }}"
    npx electron-builder --win --publish never
```

### 20.7.3 CI 平台对照

| CI | 推荐 | macOS | Windows | Linux |
|----|------|-------|---------|-------|
| GitHub Actions | yes | ✅ | ✅ | ✅ |
| Circle CI | yes | 通过 Xcode 镜像 | 慢 | ✅ |
| Azure Pipelines | well-supp | ✅ | ✅ | ✅ |
| 自建 | ok | 需 mac mini / hackintosh | 简单 | 简单 |

---

## 20.8 常见故障

### 故障 1：notary 一直 In Progress

> 大文件公证 1+ 小时。

解决：拆 dmg / 或者分块。

### 故障 2：macOS Gatekeeper 升级弹窗"无法打开"

> 即使通过了 notarize。

解决：

```bash
xattr -cr /Applications/MyApp.app
```

### 故障 3：Windows SmartScreen 阻止 1 次

> 你前面有过 1 个错误签名，被记录到 reputation。

解决：用 EV 证书立即重置。

### 故障 4：Squirrel 升级失败 EBUSY

> Windows 上应用被锁。

解决：在升级前 `quitAndInstall(false, true)`。

### 故障 5：Linux AppImage 不可执行

```bash
chmod +x MyApp.AppImage
```

### 故障 6：deep link 注册失败

> macOS 上 `LSSetDefaultHandlerForURLScheme` 拒绝。

解决：在 Info.plist 设置 `CFBundleURLTypes`。

### 故障 7：签名后文件哈希变了

> 不是 signtool 的 bug，是有的工具在 sign 后加了时间戳防篡改。

### 故障 8：`developer-cert-valid` 警告

> Apple deprecated DSA cert。

解决：申请 ECDSA / RSA。

---

## 20.9 真实案例：完整签名链路

### 案例：单次 GitHub Action 启动签名 / 公证 / 升级

```yaml
name: Build and Notarize
on: { push: { branches: [release] } }

jobs:
  build-mac:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - run: npm ci

      # 1) 装证书
      - uses: apple-actions/import-codesigncert@v3
        with:
          p12-file-base64: ${{ secrets.MAC_CERT }}
          p12-password: ${{ secrets.MAC_CERT_PASSWORD }}

      # 2) notary
      - name: notarytool profile
        run: xcrun notarytool store-credentials "AC_PASSWORD" \
              --apple-id "${{ secrets.APPLE_ID }}" \
              --team-id "${{ secrets.APPLE_TEAM_ID }}" \
              --password "${{ secrets.APPLE_PASSWORD }}"

      # 3) build
      - run: npx electron-builder --mac --x64 --arm64 --publish never
        env:
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}

      # 4) 把产物发布到 S3
      - uses: aws-actions/configure-aws-credentials@v4
        with: { aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}, aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}, aws-region: us-east-1 }

      - run: |
          aws s3 sync release/ s3://updates.example.com/myapp/latest/ --exclude "*" --include "*.yml" --include "*.zip" --include "*.dmg" --include "*.blockmap"
```

### 案例：Windows EV 证书

```yaml
jobs:
  build-win:
    runs-on: windows-2022
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx electron-builder --win --publish never

        env:
          CSC_LINK: ${{ secrets.WIN_CERT_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
```

### 案例：Linux DEB 仓库

```bash
# build debs
npx electron-builder --linux deb --x64

# ppa 上传
dput ppa:example/myapp release/myapp_1.0.0_amd64.deb
```

---

## 20.10 推荐工具

| 工具 | 用 |
|------|---|
| `codesign` | macOS |
| `xcrun notarytool` | macOS 公证 |
| `signtool` | Windows |
| `osslsigncode` | 跨平台 |
| `minisign` | 通用代码签名 |
| `gpg` | Linux |
| `ossutil / aws-cli / azure-cli` | 云签名 |

---

## 20.11 总结

签名/公证是产品上架的最后一道门槛。一旦做错一次，reputation 就会掉到谷底恢复要半年。这套流程不只是"做对一次"，是"每次都对"。

下一章 [21 · 大型生产级 monorepo 实战](./../21-monorepo/README.md)。
