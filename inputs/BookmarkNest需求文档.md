# BookmarkNest 产品需求文档

## 1. 项目概述

BookmarkNest 是项目内部代号，插件对外名称建议使用更利于 Chrome Web Store 搜索的关键词型名称：X Bookmark Manager。它是一款面向 X/Twitter 重度用户的 Chrome 插件，帮助用户把分散、难搜索、难整理的 X 书签变成一个本地优先的知识库。产品核心卖点是：搜索 X 书签、按文件夹/标签整理、批量管理、导出到常见格式。

插件优先上架 Chrome Web Store，技术方案参考同级项目 `table-capture`：Manifest V3、React、Vite、TypeScript、Tailwind、Zustand、本地存储、独立 Upgrade 页面、Creem 月付/年付订阅和 License Key 激活。

## 2. 目标用户

- 创作者：保存选题、案例、观点、素材，但经常找不到旧书签。
- 开发者和独立开发者：收藏技术 thread、工具、产品案例、代码片段。
- 营销和增长从业者：收藏竞品营销、广告创意、增长案例。
- 投资和研究用户：收藏行业观点、项目动态、人物观点。

目标用户的共同特征：X 书签数量多，当前 X 原生书签页无法搜索、无法分类、无法导出，导致书签价值被浪费。

## 3. 产品定位

### 一句话定位

Search, organize, and export your X bookmarks.

### Chrome Web Store 标题建议

X Bookmark Manager - Search, Tags & Export

### 命名策略

- 内部项目名：BookmarkNest
- 对外插件名：X Bookmark Manager
- 商店完整标题：X Bookmark Manager - Search, Tags & Export
- 官网或落地页标题：X Bookmark Manager by BookmarkNest

这样处理的原因是：`X Bookmark Manager` 更容易覆盖用户在 Chrome Web Store 里的直接搜索词，`Search`、`Tags`、`Export` 能补充核心功能关键词；BookmarkNest 仍可作为品牌名保留在官网、logo 或页脚里。

### 核心价值

- 让用户快速找回几个月前收藏的 X 内容。
- 让用户用文件夹和标签把书签整理成可复用素材库。
- 让用户把书签导出到 Markdown、CSV，避免长期被锁在 X 里。
- 尽量本地处理数据，降低隐私顾虑。

## 4. 首版目标

首版不是做完整知识管理工具，而是验证：用户是否愿意为“X 书签搜索和整理”付费。

### MVP 成功标准

- 用户能在 5 分钟内完成首次导入。
- 用户能搜索本地导入的 X 书签。
- 用户能给书签添加标签和文件夹。
- 用户能导出 Markdown 或 CSV。
- 免费用户能自然理解 Pro 的高级工作流价值，如 notes、saved views、Pro exports、sync 和云备份。
- Creem 购买和 License Key 激活链路可跑通。

## 5. 功能范围

### 5.1 浏览器插件基础

- Manifest V3 Chrome 插件。
- 工具栏 popup 提供快速入口。
- 独立管理页作为主界面，类似一个轻量 dashboard。
- content script 只在 X/Twitter 相关页面执行核心抓取逻辑。
- background service worker 负责消息转发、打开管理页、打开升级页。
- 使用 `chrome.storage.local` 存储设置和 License 状态。
- 使用 IndexedDB 存储书签、标签、文件夹、导入记录和全文索引辅助数据。

### 5.2 书签导入

首版支持从 X 书签页导入用户自己的书签。

入口：
- popup 里的 `Import from X`。
- 管理页空状态里的 `Import bookmarks`。
- X 书签页注入的轻量按钮，文案如 `Import to BookmarkNest`。

导入流程：
1. 用户打开 X 书签页。
2. 插件检测当前页面是否是 X 书签页。
3. 用户点击导入。
4. 插件读取当前已经加载的书签卡片。
5. 插件提示用户可以继续滚动加载更多。
6. 导入过程中显示进度：已发现数量、已保存数量、重复数量、失败数量。
7. 导入结束后进入管理页。

支持页面：
- `https://x.com/i/bookmarks`
- `https://twitter.com/i/bookmarks`
- 以上 URL 带查询参数或 hash 时仍应识别为书签页。

导入状态：
- `idle`：未开始导入。
- `unsupported-page`：当前页面不是 X/Twitter 书签页。
- `ready`：已检测到书签页，可以开始导入。
- `scanning`：正在扫描当前已加载的卡片。
- `waiting-for-scroll`：当前可见内容已扫描，提示用户继续滚动加载更多。
- `saving`：正在写入 IndexedDB。
- `completed`：导入完成。
- `failed`：导入失败，需要显示可理解错误。
- `cancelled`：用户取消导入。

导入交互规则：
- 用户点击导入后，插件扫描当前 DOM 中已经加载的书签卡片。
- 用户继续滚动时，插件可以继续发现新卡片，但不得自动无限滚动页面。
- 导入过程中必须提供取消入口，取消后保留已经成功保存的数据。
- 如果 X 页面结构变化导致无法解析卡片，应提示用户当前版本无法读取该页面，而不是静默失败。
- 如果单条书签解析失败，应计入失败数量，并继续处理其他卡片。
- 导入完成页需要展示本次新增、更新、重复、失败数量。

导入字段：
- `tweetId`
- `tweetUrl`
- `authorName`
- `authorHandle`
- `authorAvatarUrl`
- `contentText`
- `mediaUrls`
- `createdAtText`
- `bookmarkImportedAt`
- `sourcePageUrl`
- `replyCount`
- `repostCount`
- `likeCount`
- `viewCount`
- `rawHtmlSnapshot` 可选，仅用于本地调试，默认不保存

去重规则：
- 优先使用 `tweetId` 去重。
- 无法解析 `tweetId` 时使用 `tweetUrl`。
- 两者都缺失时使用 `authorHandle + contentText` 的 hash 作为临时键。
- 重复导入已存在书签时，更新可变字段，如作者名、头像、互动数、正文和媒体链接，但保留用户维护的标签、文件夹、归档状态。
- 重复导入已软删除书签时，MVP 默认不自动恢复；需要在导入结果中计为重复或跳过，后续可增加恢复入口。

限制：
- 首版不做绕过登录、绕过 X 限制的抓取。
- 首次导入仍要求用户自己打开 X 书签页并触发导入。
- 当前实现可在用户授权的登录会话中通过 X Bookmarks GraphQL 分页导入，并提供可选 auto-sync；该能力需要在商店说明和隐私政策中明确解释。
- 如果 X 页面或私有接口结构变化，导入可能降级为可见内容导入或提示用户刷新后重试。

### 5.3 书签管理页

管理页是产品主界面，需比 popup 更完整。

布局建议：
- 左侧：文件夹列表、标签列表、筛选入口。
- 顶部：搜索框、导入按钮、导出按钮、Pro 状态入口。
- 中间：书签列表。
- 右侧或弹窗：书签详情、标签编辑、文件夹移动。

书签列表卡片显示：
- 作者头像、作者名、handle。
- 正文摘要，最多 3 到 5 行。
- 标签 chips。
- 所属文件夹。
- 收藏导入时间。
- 原推链接按钮。
- 快速操作：添加标签、移动文件夹、复制链接、归档、删除。

列表能力：
- 全文搜索。
- 按标签筛选。
- 按文件夹筛选。
- 按作者筛选。
- 按导入时间排序。
- 按原推发布时间排序，如果能解析。
- 批量选择。
- 批量添加标签。
- 批量移动文件夹。
- 批量删除本地记录。

删除和归档规则：
- 归档只影响默认列表展示，不删除本地数据。
- 默认列表隐藏已归档书签，用户可通过归档筛选查看。
- 删除使用软删除，设置 `deleted: true`，默认列表、搜索、导出都不包含已删除书签。
- 清空本地数据是硬删除，会删除 IndexedDB 中的书签、标签、文件夹、导入记录和搜索索引。
- 删除文件夹时不删除书签，只将相关书签移动到未分类。
- 删除标签时从所有书签上移除该标签。

空状态：
- 首次进入：提示连接 X 书签页导入。
- 搜索无结果：提示调整关键词或清除筛选。
- 文件夹为空：提示移动书签到该文件夹。

### 5.4 搜索

MVP 搜索目标是快、稳定、可解释，不需要首版引入云端搜索。

搜索范围：
- 推文正文。
- 作者名。
- 作者 handle。
- 标签名。
- 文件夹名。

搜索体验：
- 输入即时搜索，建议 debounce 150ms 到 250ms。
- 命中关键词高亮。
- 支持多词搜索。
- 支持清除搜索。
- 支持在当前筛选范围内搜索。

搜索匹配规则：
- MVP 使用大小写不敏感匹配。
- 多词搜索使用 AND 逻辑，即所有关键词都需要命中同一条书签的可搜索字段。
- `@handle` 输入应能命中作者 handle，带不带 `@` 都可匹配。
- 搜索结果默认按导入时间倒序；如果使用 MiniSearch 等索引库，可在相关度排序和导入时间排序之间提供切换。
- 搜索默认不包含已删除书签；归档书签只在用户进入归档筛选时参与搜索。
- 免费用户可搜索完整本地库；Pro 价值不依赖数量限制。

可选增强：
- 使用 MiniSearch 或 Fuse.js 建本地索引。
- 支持 `from:handle`、`tag:name`、`folder:name` 这种高级搜索语法，放到第二阶段。

### 5.5 文件夹

文件夹用于少量、稳定的大类整理。

MVP 能力：
- 新建文件夹。
- 重命名文件夹。
- 删除文件夹。
- 将书签移动到一个文件夹。
- 未分类视图。

约束：
- MVP 只支持单层文件夹。
- 每条书签只属于一个文件夹。
- 删除文件夹时不删除书签，只把书签移动到未分类。

### 5.6 标签

标签用于灵活、多维度整理。

MVP 能力：
- 给书签添加多个标签。
- 创建新标签。
- 从书签移除标签。
- 标签列表显示使用次数。
- 点击标签筛选书签。
- 支持批量添加标签。

标签交互：
- 输入标签时支持自动补全。
- 标签颜色可自动分配。
- MVP 不需要复杂自定义颜色面板，避免增加设置负担。

### 5.7 导出

导出是 Pro 价值的重要组成部分。

免费版：
- 导出 JSON 备份或当前视图数据。

Pro 版：
- 导出 Markdown。
- 导出 CSV。
- 按当前筛选结果导出。
- 导出字段可包含：作者、handle、正文、原链接、标签、文件夹、导入时间。

Markdown 格式建议：

```markdown
## Folder Name

### @handle - Author Name

Tweet content...

- URL: https://x.com/...
- Tags: ai, startup
- Imported: 2026-06-22
```

CSV 字段建议：

```text
tweet_id,author_name,author_handle,content,url,tags,folder,imported_at
```

导出规则：
- 导出默认不包含已删除书签。
- 导出默认不包含已归档书签，除非当前筛选范围包含归档。
- 免费版 JSON 导出是用户备份格式，应包含可导出范围内的书签、标签、文件夹和关联关系。
- Pro 版选择“当前筛选结果导出”时，导出内容必须与当前列表筛选范围一致。
- 当前筛选结果为空时，导出按钮应 disabled 或提示无可导出内容。
- CSV 必须正确转义逗号、双引号和换行。
- Markdown 中空标签显示为 `Tags: None`，空文件夹归入 `Uncategorized`。
- 文件名建议包含产品名、导出格式和日期，如 `bookmarknest-export-2026-06-22.csv`。

第二阶段可考虑：
- Notion 导出。
- Readwise 导出。
- Obsidian vault 友好格式。
- 每个文件夹单独导出一个 Markdown 文件。

### 5.8 Pro 和付费墙

支付使用 Creem，参考同级项目 `table-capture` 的实现方式。

商业模式：
- 免费版不限制基础本地库数量，用低摩擦体验获取 X 书签重度用户。
- Pro 版订阅：`$2.99/月` 或 `$24.99/年`。
- 页面展示税前基础标价；实际税费由 Creem checkout 根据用户地区展示和收取。
- 当前 Pro 包含 encrypted Cloud Sync；后续若加入 AI 自动标签或语义搜索，可评估更高档位。

免费版包含：
- 可以导入、查看、搜索和基础整理完整本地书签库。
- 基础全文搜索。
- 基础标签。
- 基础文件夹。
- JSON 备份和基础导出。

Pro 版包含：
- Markdown 导出。
- CSV 导出。
- research notes。
- saved views。
- 批量操作。
- background sync。
- mirror removals。
- encrypted Cloud Sync 和重装/换设备恢复。
- 后续当前 Pro 功能更新。

付费墙触发点：
- 用户点击 Markdown/CSV 导出。
- 用户保存 research notes。
- 用户创建或更新 saved views。
- 用户点击批量操作。
- 用户开启 background sync、mirror removals 或 Cloud Sync。

免费/Pro 数据规则：
- 免费和 Pro 都保留完整本地库，不因订阅状态删除书签。
- Pro-only notes、saved views、sync 设置在降级后保留数据，但编辑或继续使用需要有效 Pro。
- Pro 失效或用户解绑后，产品回到免费规则，但不得删除本地已有书签。
- 所有付费墙提示都必须说明本地数据仍保留，升级后可继续使用 Pro-only workflow。

Creem 接入要求：
- 创建月付和年付订阅产品。
- 开启 License Key。
- 使用 Creem checkout URL。
- 插件内不保存 Creem API Key。
- 通过 Cloudflare Worker 代理 License 激活和解绑。
- License 状态本地保存到 `chrome.storage.local`。
- License Key 支持最多 3 台设备激活，具体以 Creem/Worker 实现为准。

建议接口：

```text
POST /license/activate
POST /license/deactivate
POST /license/validate
```

建议本地状态字段：

```ts
interface LicenseData {
  pro: boolean;
  licenseKey: string;
  instanceId: string;
  email: string;
  activatedAt: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  validationStatus: 'valid' | 'invalid' | 'offline' | 'unknown';
}
```

License 校验规则：
- 激活成功后本地保存 `pro: true`、`licenseKey`、`instanceId`、`email`、`activatedAt` 和 `lastValidatedAt`。
- 插件启动或打开管理页时，如果距离上次校验超过 7 天，应后台调用 `/license/validate`。
- 网络不可用时，已激活用户可继续使用 Pro，状态标记为 `offline`，界面提示稍后会重新校验。
- License 被撤销、设备数超限或服务端返回无效时，状态改为 `invalid`，回到免费规则。
- 激活失败需要区分：无效 key、设备数已满、网络错误、服务端错误。
- 解绑设备成功后清除本地 License 状态，但不删除本地书签数据。

### 5.9 Upgrade 页面

独立页面路径建议：

```text
src/upgrade/index.html
src/upgrade/main.tsx
```

页面内容：
- BookmarkNest Pro 标题。
- Free vs Pro 对比。
- 月付和年付订阅说明。
- Creem 购买按钮。
- License Key 输入和激活。
- 已激活状态。
- 解绑设备按钮。
- 支持邮箱。

文案基调：
- 强调本地优先。
- 强调低价订阅和随时取消。
- 强调 X 书签不上传，除非未来用户主动开启云同步。

## 6. 页面和信息架构

### 6.1 Popup

popup 只做快速入口，不承载复杂管理。

内容：
- 当前状态：未导入 / 已导入 N 条 / Pro 已激活。
- 主按钮：Open BookmarkNest。
- 次按钮：Import from X。
- 当前页面是 X 书签页时显示 `Import current loaded bookmarks`。
- Pro 入口：Upgrade / Manage License。

### 6.2 管理页

路径建议：

```text
src/app/index.html
src/app/main.tsx
```

核心模块：
- `BookmarkList`
- `BookmarkCard`
- `SearchBar`
- `Sidebar`
- `FolderTree`
- `TagList`
- `ImportProgress`
- `ExportDialog`
- `BulkActionBar`
- `BookmarkDetailPanel`

### 6.3 Options 页面

内容：
- 主题：light / dark / system。
- 默认导出格式。
- 语言：MVP 先英文，可保留中文开发辅助。
- 数据管理：清空本地数据、导入备份 JSON、导出备份 JSON。
- License 激活入口。
- 隐私说明和支持邮箱。

### 6.4 X 页面注入

在 X 书签页注入轻量按钮或 floating action，不要覆盖 X 原有 UI。

状态：
- 可导入。
- 导入中。
- 导入完成。
- 当前页面不是书签页时不显示。

注入方式：
- MVP 使用 manifest 声明的 content script 注入到 `https://x.com/*` 和 `https://twitter.com/*`。
- content script 内部只在书签页路径显示导入按钮。
- popup 中的 `Import from X` 可通过消息通知已注入的 content script 开始导入。
- 不使用远程脚本，不从服务器动态加载可执行代码。

## 7. 数据设计

### 7.1 Bookmark

```ts
interface Bookmark {
  id: string;
  tweetId?: string;
  tweetUrl?: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  contentText: string;
  mediaUrls: string[];
  createdAtText?: string;
  createdAt?: number;
  importedAt: number;
  updatedAt: number;
  folderId?: string;
  tagIds: string[];
  archived: boolean;
  deleted: boolean;
  deletedAt?: number;
  dedupeKey: string;
  source: 'x-bookmarks-page' | 'manual-import';
}
```

### 7.2 Folder

```ts
interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}
```

### 7.3 Tag

```ts
interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}
```

### 7.4 ImportSession

```ts
interface ImportSession {
  id: string;
  startedAt: number;
  finishedAt?: number;
  sourceUrl: string;
  foundCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}
```

## 8. 权限设计

首版建议尽量收敛权限，方便审核和用户信任。

建议权限：
- `storage`
- `downloads`
- `clipboardWrite`

建议 host permissions：

```text
https://x.com/*
https://twitter.com/*
```

权限说明：
- content script 使用 manifest 静态声明，因此不默认需要 `activeTab` 和 `scripting`。
- `storage` 用于设置、License 状态和导入状态。
- `downloads` 用于导出文件。
- `clipboardWrite` 仅用于复制原推链接，若实现不包含复制链接，可移除该权限。
- `webRequest` 用于捕获 X Bookmarks GraphQL 请求形态。
- `declarativeNetRequest` 和 `declarativeNetRequestWithHostAccess` 用于补齐扩展发起 X GraphQL 请求需要的请求头。
- `cookies` 用于读取 X CSRF cookie，以便在用户现有登录会话中读取自己的书签。
- `alarms` 用于用户开启后的可选 auto-sync。
- 权限申请文案需要明确插件只处理 X/Twitter 书签页和用户开启的同步行为。

避免首版使用 `<all_urls>`，除非后续确实要做通用网页导入。

## 9. 隐私和合规

### 本地优先

- 书签正文、作者、标签、文件夹默认只保存在本地 IndexedDB。
- 不把书签内容上传到服务器。
- License 激活只把 License Key 和设备实例信息发送到 Creem Worker。

### 用户可控

- 用户可以清空本地数据。
- 用户可以导出本地备份。
- 用户可以删除单条书签本地记录。

### X 平台风险

- MVP 依赖 X 页面结构读取用户当前已加载的书签，X 改版可能导致导入失效。
- 不做绕过登录、不做批量后台抓取、不做自动化访问放大。
- 后续可评估 X API/OAuth 方案，降低页面结构依赖。

### Chrome Web Store 合规

- 插件不得加载远程可执行代码。
- 插件不得把书签正文、作者、媒体 URL、标签或文件夹上传到服务器。
- License Worker 只接收 License Key、设备实例 ID、邮箱和插件版本等激活所需信息。
- Privacy Policy 需要说明本地存储内容、License 激活数据流、用户删除和导出数据的方法。
- Chrome Web Store 数据使用声明需要与实际权限和网络请求保持一致。
- 上架截图和描述不得承诺“一键导入所有历史书签”，只能承诺导入当前已加载的 X 书签。

## 10. 技术栈建议

参考 `table-capture`：

- Manifest V3
- `@crxjs/vite-plugin`
- React
- TypeScript
- Tailwind CSS
- Zustand
- IndexedDB，推荐 Dexie 或 idb
- Lucide React icons
- Vitest
- Playwright，用于管理页 UI 回归

建议目录：

```text
src/
├── background/
├── content/
│   ├── x/
│   └── import/
├── popup/
├── app/
├── options/
├── upgrade/
├── lib/
│   ├── db/
│   ├── export/
│   ├── search/
│   ├── store/
│   ├── license/
│   └── messaging/
├── shared/
│   └── types.ts
└── styles/
    └── globals.css
```

## 11. UI 体验要求

整体风格应是安静、高效、工具型，而不是营销页。

要求：
- 管理页信息密度适中，适合长时间整理。
- 搜索框始终是主入口。
- 标签和文件夹操作不能打断阅读流。
- 批量操作只在选择书签后出现。
- 空状态要引导用户下一步，而不是写大段说明。
- 卡片圆角控制在 8px 左右，避免过度装饰。
- 图标优先使用 lucide。
- 支持深色模式。
- 所有按钮要有 hover、disabled、loading 状态。
- 长推文、长标签、长作者名不能撑破布局。

## 12. 里程碑

### Milestone 1: 项目脚手架

- 搭建 Manifest V3 + Vite + React + Tailwind。
- 配置 popup、管理页、options、upgrade。
- 配置基础消息通信。
- 配置 IndexedDB。

### Milestone 2: X 书签导入

- 检测 X 书签页。
- 解析当前加载的书签卡片。
- 保存到 IndexedDB。
- 展示导入进度。
- 支持重复导入去重。
- 支持取消导入和解析失败提示。

### Milestone 3: 本地管理

- 书签列表。
- 搜索。
- 标签。
- 文件夹。
- 批量选择和批量移动。

### Milestone 4: 导出和 Pro

- JSON/Markdown/CSV 导出。
- Pro-only notes、saved views、Markdown/CSV、bulk actions 和 sync gates。
- Upgrade 页面。
- Creem checkout。
- License Key 激活、校验和解绑。

### Milestone 5: 上架准备

- Privacy policy。
- Chrome Web Store 描述。
- 图标和截图。
- 权限说明。
- 基础测试和手动验收。

## 13. MVP 验收清单

- 安装插件后 popup 能正常打开。
- 管理页能正常打开。
- 用户在 X 书签页能触发导入。
- 非 X 书签页不会显示页面内导入按钮。
- 导入 50 条、200 条、500 条书签时不明显卡顿。
- 导入过程中可以取消，已保存数据保留。
- X 页面结构解析失败时有明确错误提示。
- 重复导入不会产生重复记录。
- 搜索能命中正文、作者、标签。
- 多词搜索使用 AND 逻辑且大小写不敏感。
- 新建、重命名、删除文件夹正常。
- 添加、移除标签正常。
- 免费用户能浏览、搜索、整理和 JSON 导出完整本地库。
- 免费用户点击 notes、saved views、Markdown/CSV、bulk actions 或 sync 能看到升级提示。
- Pro 激活后解锁 notes、saved views、Pro exports、bulk actions、background sync、mirror removals 和 Cloud Sync。
- Markdown 和 CSV 导出内容正确。
- CSV 能正确处理逗号、引号和换行。
- 已删除书签不出现在默认列表、搜索和导出中。
- 删除本地数据后 IndexedDB 被清空。
- Creem License 激活失败时有明确错误提示。
- License 离线校验失败时不立即取消已激活用户的 Pro 权限。
- 深色模式可读。
- Chrome 扩展构建产物可加载。
- Chrome Web Store 权限说明和 Privacy Policy 与实际行为一致。

## 14. 暂不做

- 云同步。
- AI 自动打标签。
- Notion 双向同步。
- 后台自动定时抓取。
- 跨浏览器同步。
- 团队协作。
- 移动端。
- 通用网页收藏器。

## 15. 后续增强方向

- AI 自动总结书签内容。
- AI 自动推荐标签。
- 离线快照，防原推删除后无法回看。
- Notion/Obsidian/Readwise 导出。
- X API/OAuth 导入。
- 书签健康检查：原推是否删除、作者是否改名。
- 多语言 UI。
- Edge Add-ons 同步上架。
