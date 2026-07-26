# Zen Tab — Firefox / Zen Browser

<p align="center">
  面向 Firefox 与 Zen Browser 的本地优先毛玻璃新标签页扩展。
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README_zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.9-6f42c1" alt="版本 1.4.9">
  <img src="https://img.shields.io/badge/Firefox%20%2F%20Zen-142%2B-f97316" alt="Firefox 与 Zen Browser">
  <img src="https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-8b1e3f" alt="PolyForm 非商业许可证 1.0.0">
</p>

## 项目简介

Zen Tab 将浏览器新标签页替换为可自定义主页。网页、文件夹、图标、视觉设置、搜索历史和可选 GitHub 备份均由用户掌控。常规主页使用可在离线状态下工作；只有加载网站图标、执行网页搜索或同步 GitHub Gist 等功能才会发起相应网络请求。

## 功能总览

| 模块 | 能力 |
| --- | --- |
| 搜索 | 内置 Google、Bing、DuckDuckGo、百度、哔哩哔哩；自定义搜索引擎；本地历史与匹配建议；可调搜索框大小与引擎图标大小 |
| 网页图标 | 添加、编辑、删除、拖拽、排序和文件夹归类；可设置每行图标数量 |
| 图标来源 | 自动匹配 Favicon、网站 `/favicon.ico`、自定义 URL、本地图片、本地缓存和内置高清搜索引擎图标 |
| 文件夹 | 文件夹预览、拖拽管理、居中毛玻璃面板，以及从源图标展开、沿原路径收回的开关动画 |
| 外观 | 壁纸、壁纸模糊、Logo、浏览器标签图标、毛玻璃主题、图标透明度/模糊/大小，以及 Logo、搜索框、网址图标区域的独立纵向位置 |
| 备份 | 本地 JSON 导出导入，以及可选的私有 GitHub Gist 备份和恢复，支持大文件分片 |
| 效率 | `Alt+Shift+F` 快速收藏当前网页；中英文界面切换 |

## 详细功能

### 搜索

- 在内置搜索引擎间切换，或添加自定义搜索引擎。
- 在设置中调整搜索框宽高和搜索引擎图标大小。
- 从本机保存的搜索记录、网页名称、网址和文件夹中最多匹配 10 条建议。
- 可关闭建议，恢复纯输入搜索框。
- 搜索历史仅保存在本机，可随时从设置中清除。

### 网页、文件夹与图标

- 直接在主页新建、编辑或删除网页和文件夹。
- 通过拖拽调整排序、创建文件夹、移入或移出文件夹。
- 文件夹在居中面板中打开：从被点击文件夹位置展开，关闭时沿原路径收回。
- 每个网站可选择图标来源：
  - 自动匹配网站图标；
  - 网站自身的 `/favicon.ico`；
  - 自定义图标网址；
  - 本地图片文件。
- 本地图标最大可选 5 MB，保存前会转换为最长边不超过 256 px 的紧凑 WebP 图像，并会随导出和 GitHub 备份一同保存。
- 自动网站图标会本地缓存，减少重复加载和刷新闪现。

### 外观与布局

- 设置壁纸、壁纸模糊、Logo 和浏览器标签页图标。
- 选择浅色、深色或透明毛玻璃图标外框。
- 调整图标容器大小、透明度、背景模糊和每行数量。
- 分别上下移动 Logo、搜索框和网址图标区域。
- 不需要 Logo 时可直接隐藏。
- 支持简体中文和 English 界面切换。

### 备份与同步

- 导出全部可迁移配置为 JSON 文件。
- 在另一台设备、重装扩展或更换浏览器配置后导入恢复。
- 可连接具有 Gists 权限的 GitHub Token，创建私有备份 Gist。
- GitHub 备份会包含网页、文件夹、自定义图标、搜索引擎、搜索历史、样式、壁纸和 Logo。较大内容会拆分为多个 Gist 文件，恢复时自动重组。
- GitHub Token 只保存在本机扩展存储，不会进入备份 Gist 或导出的 JSON 文件。

### 快速收藏快捷键

- Windows/Linux 默认：`Alt+Shift+F`；macOS 默认：`Command+Shift+F`。
- 触发后输入名称，即可将当前标签页网址按当前默认图标风格添加到主页。
- Firefox 和 Zen Browser 可直接在 Zen Tab 设置中修改快捷键。

## 浏览器兼容性

| 浏览器 | 扩展格式 | 说明 |
| --- | --- | --- |
| Firefox | Manifest V3 | 需要 Firefox 142 或更高版本 |
| Zen Browser | 兼容 Firefox Manifest V3 | 已使用 Zen Browser 1.21.8b 验证 |

这是 Firefox/Zen 的独立源码快照，仅包含 Firefox 清单，并使用 Firefox 兼容的后台脚本注册方式；构建产物仅用于 Firefox 或 Zen Browser。

## 快速开始

### 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 检查与构建

```bash
npm run lint
npm run build
```

`npm run build` 会在 `dist/` 中生成 Firefox 与 Zen Browser 构建。也可显式执行等效的 `npm run build:firefox`。

## 加载未打包扩展

1. 执行 `npm run build`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击 **Load Temporary Add-on**（临时载入附加组件）。
4. 选择 `dist/manifest.json`。

临时扩展会在浏览器重启后移除；如需长期安装，需要走 Firefox 正常的打包与签名/分发流程。

## 常用操作

1. 打开新标签页，点击 **添加** 创建网页快捷方式。
2. 右键图标可修改名称、网址、图标来源和单独的图标样式。
3. 将一个网页拖到另一个网页上可创建文件夹；点击文件夹管理其中内容。
4. 点击 **样式** 调整壁纸、图标布局、搜索设置、语言和备份设置。
5. 确认私有备份流程符合需求后，再按需开启 GitHub Gist 同步。

## GitHub Gist 备份

Zen Tab 使用私有 Gist 保存备份配置。启用步骤如下：

1. 创建具有最小 Gists 读写权限的 GitHub 访问 Token，具体权限取决于你的账号和 Token 类型。
2. 在 Zen Tab 设置中打开 **GitHub 云同步**，输入并关联 Token。
3. 点击 **上传当前配置**，创建或更新私有 Gist。
4. 在另一台设备上关联同一 GitHub 账号并点击 **从 GitHub 恢复**。

请像对待密码一样保管 Token；一旦泄露，应立即在 GitHub 中撤销。

## 数据、隐私与网络行为

### 本地数据

Zen Tab 通过浏览器扩展存储保存配置，并在适当情况下使用 IndexedDB/localStorage 作为兼容性本地镜像。常见数据包括网页、文件夹、自定义图标、已选搜索引擎、本地搜索历史、壁纸、Logo 和界面偏好。

### 网络请求

Zen Tab 不包含分析统计或遥测。仅在功能需要时发起网络请求：

| 操作 | 可能访问的服务 |
| --- | --- |
| 提交搜索 | 用户当前选择的搜索引擎 |
| 解析自动/自定义网站图标 | 目标网站；必要时使用 Google Favicon 服务作为回退 |
| GitHub 备份或恢复 | 用户关联并主动触发同步后的 GitHub Gist 与原始文件地址 |

搜索建议完全从设备本机保存的数据生成，不会把建议查询发送给第三方。

### 扩展权限

| 权限 | 用途 |
| --- | --- |
| `storage`、`unlimitedStorage` | 保存主页配置、本地图标、缓存和备份状态 |
| `tabs`、`activeTab`、`scripting` | 读取当前标签页以实现快捷收藏 |
| `<all_urls>` 主机权限 | 获取网站图标，并打开用户自行配置的网址 |

安装任何构建前，请仔细审阅浏览器展示的权限提示。

## 备份、恢复与旧数据迁移

在测试临时扩展、更换浏览器配置或更换设备前，请通过 **设置 → 数据备份与恢复** 导出可迁移 JSON 备份。

Firefox 和 Zen Browser 会按扩展身份隔离存储。如果旧商店版本仍保留数据，请先从旧版本导出。本仓库提供 `scripts/export-legacy-data.js`，用于在旧版本控制台中执行的迁移导出流程；具体步骤请参考应用内说明和脚本注释。

## 项目结构

```text
src/
  components/            React 界面组件
  assets/                内置 Logo 与搜索引擎图标
  App.tsx                主页组合与状态协调
  storage.ts             浏览器/本地存储抽象
  backup.ts              导入导出与恢复校验
  githubSync.ts          私有 Gist 同步
  favicon-bootstrap.ts   网站图标缓存启动逻辑
public/
  background.js          扩展后台逻辑与图标缓存工作器
  boot.js / boot.css     启动阶段渲染辅助文件
manifests/
  firefox.json           Firefox/Zen Manifest V3 清单
scripts/
  prepare-manifest.mjs   将正确清单复制到构建输出
  export-legacy-data.js  旧数据导出辅助脚本
```

## 开发约定

- 除非平台 API 必须不同，否则应保持 Firefox 与 Zen Browser 的行为一致。
- 使用 `extensionApi.ts` 抽象层，不要直接假定只有 `browser.*` 或 `chrome.*` API。
- 默认优先本地处理用户内容；新增网络请求或权限时必须写入文档。
- 改动扩展 API、存储、快捷键或清单后，应测试 Firefox/Zen 构建。
- 不要提交构建产物、依赖目录、Token、含个人数据的导出文件或浏览器配置文件。

## 参与贡献

欢迎提交错误报告、无障碍改进、翻译、文档、测试和聚焦的功能改进。

1. Fork 仓库并创建描述清晰的分支。
2. 保持改动聚焦，提交信息清晰。
3. 执行 `npm run lint` 和对应构建命令。
4. 在 Pull Request 中说明测试浏览器和数据迁移影响。
5. 不要在 Issue 或 Pull Request 中提交 Token、私有 Gist、个人导出文件或浏览器配置数据。

## 责任使用与项目声明

Zen Tab 主要面向学习、研究、个人定制和社区协作。

- 不得利用本项目从事违法活动、侵犯隐私、未授权访问、传播恶意软件，或冒用他人身份与数据。
- 不得将非官方或修改后的构建冒充为官方 Zen Tab 发布版本。
- 不得在商业宣传中误导性使用项目名称、Logo、截图或维护者身份，也不得暗示获得官方背书。
- 维护者不提供托管服务、担保或对自行构建扩展的安全承诺。

以上是项目使用与来源识别方面的声明，不替代适用法律、浏览器商店规则或第三方服务条款。

## 许可证

本项目采用 [PolyForm Noncommercial License 1.0.0](./LICENSE)。

Zen Tab 属于“源码可用”项目，而非 OSI 定义的开源项目。仅可按完整许可证条款将其用于**非商业目的**，包括个人学习、研究和业余项目；许可证也明确规定了部分非营利、教育、公益和政府机构的许可使用情形。

本仓库许可证不授予商业权利。未经版权所有者另行书面许可，不得出售、收费、将软件捆绑进付费产品或服务、用其运营商业服务，或以其他方式进行商业使用。分发给他人时，也必须同时提供许可证条款和所需的版权声明。

完整法律条款见 [LICENSE](./LICENSE)；官方原文由 [PolyForm Project](https://polyformproject.org/licenses/noncommercial/1.0.0/) 发布。本段仅为便于理解的说明，不替代许可证正文。

## 免责声明

软件按“现状”提供，不附带任何明示或默示保证。使用前请自行审阅代码、权限、备份和第三方服务条款。本 README 仅提供项目信息，不构成法律意见。

## 技术栈

- React
- TypeScript
- Vite
- Manifest V3 浏览器扩展 API
- localForage
- dnd kit
