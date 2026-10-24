# Luma 留光 · 图集阅读器

以“文章 / 图集”为单位的图片聚合客户端。书架展示图集；进入后按原站顺序阅读照片、说明和 EXIF。内置按 DOM 结构解析的 WordPress、Sahifa 和相册插件，支持搜索、分类、流式续载及相关推荐。数据源地址可选，默认指向 localhost。

## Docker Compose（推荐）

```sh
git clone https://github.com/t0saki/luma-gallery.git
cd luma-gallery
cp .env.example .env
# 编辑 compose.yaml 或 .env 配置访问密码和数据源
docker compose pull
docker compose up -d
```

打开 http://localhost:4173 。本地构建可用 `docker compose up -d --build`。

在 `compose.yaml` 中设置 `environment.LUMA_ACCESS_PASSWORD`，例如改成 `"你的长密码"`；也可在 `.env` 设置同名变量。留空关闭密码。密码只在服务端使用，不写入前端或镜像；启用后页面、解析、图片代理和下载接口均需登录。会话使用 HttpOnly / SameSite Cookie，有效期 12 小时，重启或更换密码后失效。登录错误会限流。不要把填写了真实密码的 Compose 或 .env 推送到公开仓库。

默认只将端口发布到 `127.0.0.1`。需要局域网访问时将 `LUMA_BIND_ADDRESS` 设置为 `0.0.0.0`。HTTPS 反向代理需要配置 `PUBLIC_ORIGIN=https://你的域名`，用于 Origin 检查和 Secure Cookie；代理须原样转发 Host。公网部署应使用 HTTPS，并在代理层配置限流。

`luma-data` 数据卷保存自定义源和内置插件的地址设置。ZIP 与任务仍是临时数据，重启不保留。

容器里的 localhost 指容器自身。Compose 默认使用 `host.docker.internal:4180/4182` 连接宿主机示例站，并通过 `extra_hosts` 兼容 Linux。**宿主机服务需监听可被容器访问的地址**；仅监听 127.0.0.1 的服务在部分 Docker 环境中不能访问。也可将数据源放在同一 Compose 网络，使用服务名并在 `LUMA_ALLOWED_ORIGINS` 中列出其完整 origin。默认地址只是约定，不会自动启动示例站。

## 页面路径与返回定位

- 目录：`/sources/shiguang`
- 收藏：`/sources/shiguang/saved`
- 文章：`/sources/shiguang/albums/:id?url=编码后的原文地址`
- 设置与下载：`/sources/shiguang/settings`、`/sources/shiguang/downloads`
- 搜索、类型、已读筛选和排序保存在 `q/category/filter/sort` 查询参数中。

卡片与数据源使用真实链接，支持中键、右键及 Ctrl/Cmd 点击打开新标签页。刷新、浏览器前进后退会恢复页面、已展开的内容和滚动位置（当前标签页 sessionStorage）；文章链接携带原文地址，服务重启后也可重新解析。后端只接受与源同 origin、且哈希匹配的文章地址，不开放任意 URL 代理。旧文章哈希链接仍会迁移到新路径。

## 可配置的数据源 URL

插件 `source.url` 可省略。优先级：环境变量 → 设置界面保存的地址 → 插件 url → localhost 默认值。

| 插件 ID | 环境变量 | 默认地址 |
| --- | --- | --- |
| shiguang | LUMA_SOURCE_SHIGUANG_URL | http://localhost:4180/ |
| shijing | LUMA_SOURCE_SHIJING_URL | http://localhost:4182/ |
| tosaki | LUMA_SOURCE_TOSAKI_URL | http://localhost:4180/gallery/ |

“解析器与插件”中可以保存内置源 URL，留空保存恢复默认；环境变量覆盖时界面标记为只读。新 URL 在打开源时解析，错误会完整显示。使用内网地址时，将所需完整 origin 以逗号分隔写入 `LUMA_ALLOWED_ORIGINS`，例如 `http://gallery:8080`；只放行这些来源，重定向仍逐跳校验。

Node 直接启动支持 `PORT`（默认 4173）、`HOST`（默认 127.0.0.1）、`DATA_DIR`（默认 .local），以及上述环境变量。

## GitHub Actions / GHCR

推送 main 时先执行语法检查和离线/HTTP 集成测试，通过后发布 `linux/amd64` 和 `linux/arm64` 镜像：

```text
ghcr.io/t0saki/luma-gallery:latest
ghcr.io/t0saki/luma-gallery:sha-<完整提交 SHA>
```

PR 只测试和构建，不推送镜像；也支持 workflow_dispatch 手动执行。工作流用仓库内置 `GITHUB_TOKEN` 的 `packages:write` 权限，无需额外保存 PAT。镜像包含与 lockfile 一致的 Playwright Chromium 和 Linux 依赖。首次发布包后可在 GitHub Packages 设置确认公开可见性。

## Node.js 启动

需要 Node.js 20.19+（推荐 22 或更新版本）。

```sh
git clone https://github.com/t0saki/luma-gallery.git
cd luma-gallery
npm ci
npm start
```

访问 http://127.0.0.1:4173 。此版本需要本地 Node 后端处理解析和打包，不再是纯静态网站。默认仅监听本机。

动态页面额外执行一次：

```sh
npm run setup:browser
```

Docker 镜像已包含 Chromium；本地 Node 运行动态模式时需安装浏览器。远程页面本身可能需要专门规则；验证码、登录或反爬限制不会被绕过。

## 已完成的体验

- 图集目录、日期排序、收藏与未读 / 已读筛选。
- 搜索图集标题、正文摘要和已解析照片的描述与器材。
- **文章阅读**：按原站照片顺序展示说明、相机、曝光信息、尺寸。
- **快速选图**：联系表网格、单独勾选、全选（包含尚未展开的照片）。
- 单张原图下载、所选图片 ZIP、整册 ZIP；打包使用全部照片，不受当前展开数量限制。
- 下载任务显示成功数、失败明细、进度和总图片体积，可取消。
- ZIP 依次命名 `001-说明.avif`，保留源格式；附 `manifest.json`。部分失败另附 `下载失败.txt`，界面不会将部分失败伪装成全部成功。
- 图片使用源站缩略图预览；全屏与下载读取源站发布的原图，不会将缩略图当原图。
- 全屏左右方向键 / 滑动切换、Esc 退出、深色模式、移动导航。

注意：“原图”指网页提供的完整图片地址，不意味着能取得未公开的 RAW。相册插件只处理图片，视频不计入图片总数。

## 添加其他网站

点击左栏 **解析器与插件**，输入名称、URL，选择获取方式和规则，点击“验证并添加”。解析成功后才保存到 `.local/sources.json`。

三种获取方式：

1. **静态 HTML**：获取并解析 HTML，适合服务端渲染和静态网站。
2. **动态页面**：使用独立 Chromium 页面，等待选择器，再执行有上限的滚动 / 加载更多操作，最后解析渲染后的 DOM。
3. **JSON 图集接口**：直接读取标准 `albums → photos` 数据。

规则使用 CSS 选择器，不是网页内执行的脚本。需按目标站点的真实结构调整，不承诺一个规则自动适配所有网站。

### 同一页有多个图集

```json
{
  "articleSelector": "section.album",
  "titleSelector": "h2",
  "descriptionSelector": ".intro",
  "imageSelector": "a.photo",
  "originalAttribute": "href",
  "maxPages": 1
}
```

可直接参考已实测的 `plugins/tosaki.rules.json`，将其中 `rules` 对象填入界面。专用插件与这套通用规则均可读出 10 册 / 635 张图片。

每个 `section.album` 生成一个图集。`imageSelector` 也可选中 `img`。默认兼容 `data-original`、`data-src`、`data-lazy-src`、`src`、`srcset` 与相对 URL；照片按原图地址去重。

### 文章目录 → 每篇正文 → 分页

```json
{
  "listing": {
    "selector": ".post-card",
    "linkSelector": "a.post-link",
    "titleSelector": "h2"
  },
  "articleSelector": "article",
  "titleSelector": "h1",
  "descriptionSelector": ".entry-content > p",
  "imageSelector": ".entry-content img",
  "nextPageSelector": "a.next-page",
  "maxPages": 5
}
```

目录只读取文章摘要；打开图集时再解析正文。正文分页按顺序合并图片，去重并防止循环，最多 10 页，同站分页。目录页本身目前不自动翻页，复杂目录/API 请使用自定义插件。

### 动态页面增量加载

在对应静态规则上补充：

```json
{
  "articleSelector": "article",
  "imageSelector": ".gallery img",
  "waitForSelector": ".gallery img",
  "scrollSteps": 8,
  "loadMoreSelector": "button.load-more",
  "maxPages": 1
}
```

`scrollSteps` 最大 20，每步滚动到底部并可点击一次加载更多。不要照搬示例中的选择器。动态网页如使用画布、封闭 Shadow DOM、必须登录或私有 API，需要额外插件逻辑。

### 标准 JSON

参见 [example.json](./example.json)：

```json
{
  "albums": [{
    "id": "my-story",
    "title": "海边的一个下午",
    "url": "https://example.com/posts/story/",
    "date": "2026-10-24",
    "description": "图集的正文介绍。",
    "photos": [{
      "id": "photo-1",
      "title": "海风吹过",
      "image": "https://example.com/thumb.avif",
      "original": "https://example.com/full.avif",
      "width": 3000,
      "height": 2000,
      "camera": "Camera · Lens",
      "settings": "50mm · f/2.8 · 1/250s · ISO 100"
    }]
  }]
}
```

## 写一个专用插件

- 参考 `plugins/tosaki.mjs`。
- 新建模块，导出 `source` 配置和 `parse({ $, html, url })` 函数。
- 将模块加入 `plugins/registry.mjs` 的 `plugins` 数组，重启服务。
- `parse` 返回图集数组，格式见下方；可以是异步函数。可以直接引入 `getRemote` 或 `loadDocument` 组合多页面 / 公开 API 获取流程。
- 专用插件是本地受信任代码；网页和 UI 不能上传执行任意 JavaScript。

```js
export const source = {
  id: 'my-site', name: '我的摄影站',
  url: 'https://example.com/gallery/',
  adapter: 'my-site', mode: 'static'
};
export function parse({ $, url }) {
  return [{
    id: 'story-1', title: '一个故事', url,
    date: '2026-10-24', description: '', category: '摄影',
    cover: 'https://example.com/preview.jpg',
    photos: [{ id: 'p1', title: '说明',
      image: 'https://example.com/preview.jpg',
      original: 'https://example.com/full.jpg' }],
    photoCount: 1, complete: true
  }];
}
```

`complete: false` 的目录项目在打开时由通用正文解析器补全，可在 `source.rules` 提供选择器。内置插件可实现复杂 API 或站点专属重写，通用规则负责常见场景。

## 运行与限制

- 图集元数据缓存 10 分钟，右上角刷新可重新抓取。尚不支持离线阅读。
- 收藏、已读和布局偏好保存在当前浏览器；自定义数据源配置保存在本地 `.local/`。
- 打包任务与状态不跨服务重启保留；ZIP 暂存于系统临时目录，完成后保留 1 小时。
- 同时最多 3 个打包任务，每个任务 2 路图片请求，每张最多 40 MB，每次最多 1000 张 / 1 GB。大图集可勾选后分批打包。
- 每张失败会重试一次。部分失败仍可保存已有图片及失败明细。
- 本地接口拒绝跨站修改请求；默认允许 HTTP(S) 公网数据源和指定本地示例来源、检查重定向、限制响应大小，不提供任意文件读取或可执行脚本上传。
- 某些桌面 VPN 会返回 `198.18/15` 假 DNS；检测到此情况时通过 Cloudflare DNS-over-HTTPS 确认真正的公网 IPv4，并将静态请求连接固定到该地址。
- 远程图片访问和下载仍取决于源站可用性；本服务不解决授权、登录、验证码或原站存储缺失问题。
- 若部署到公网，需另外加入用户认证、请求限流、持久任务队列和磁盘配额。当前服务定位为个人客户端，提供可选访问密码。

## 验证

```sh
npm run check
npm test
```

测试覆盖：图集分组和顺序、原图与 EXIF、视频排除、懒加载与去重、选择器映射、私网请求拦截、文件名安全与配置 ID 稳定性。

使用真实 tosaki 相册额外验证了静态 / Chromium 两种加载方式，以及单图下载、所选打包、整册打包与 ZIP 完整性（见本次交付说明）。

## 本地示例站的流式适配

左侧已内置「拾光相册 · 4180」和「拾景相册 · 4182」。先启动对应的本地示例站，再打开本客户端。无需添加 JSON 规则，也不执行示例站的自动翻页脚本。

- 4180：WordPress 区块列表、桌面/移动端重复标题去重；正文 `.entry-content`；`.page-link-box` 后的 `#basicE` 单独作为推荐。
- 4182：Sahifa 文章列表、懒加载属性；正文 `.entry`；以**最后一组** `.page-link` 为正文边界，兼容正文前后重复分页；`.yarpp-related` 单独作为推荐，排除当前文章。
- 列表和正文都在接近底部时读取下一页并追加，保留手动重试按钮；图片按原始顺序去重，不把推荐封面算进正文。
- 搜索使用页面表单的 GET 地址和字段；分类从分类链接发现，可组合关键词。关键词/分类切换会重新发起上游查询，旧请求不会覆盖新结果。空结果是正常状态。
- 勾选打包只处理已选择的图片；「全选已加载」不会暗中包含未来页面。整册打包会先收集剩余正文分页，再建立 ZIP 任务。

`plugins/wordpress.mjs` 与 `plugins/sahifa.mjs` 分别声明选择器 profile，共用 `lib/site-engine.mjs` 的游标、缓存、续读与全文收集逻辑。新增同类合法摄影网站时，在独立插件中导出 `source`（含 `streaming:true`）、`profile` 和 `parse`，然后加入 `plugins/registry.mjs`。`profile` 字段为 `cards/title/cover/body/heading/pagination/listPagination/recommendations/photo/typeSelector/articleTypeSelector`，明确区分列表、正文和推荐区域。`mode:'dynamic'` 可以复用现有 Chromium DOM 加载器；分页模型保持相同。

目录接口：`GET /api/sources/:id/albums?q=关键词&category=分类URL&cursor=返回的nextPage`。游标只能使用服务端实际发现的链接，不能填写任意 URL。文章接口首次返回第一页，之后 `GET /api/sources/:id/album/:albumId?next=1` 追加下一页；返回的 `photos` 是累计结果，`nextPage` 是布尔值，`pages` 表示已读取页数，`recommendations` 为独立文章摘要。重复目录游标不会重抓；正文请求会合并并发加载，失败不会前移页码。

当前缓存仅存在于服务内存，闲置 30 分钟失效；正文和列表各最多读取 100 页，循环链接会停止并报告。达到正文上限时整册打包会报错，避免把不完整图集标成整册。本地网络默认允许 localhost/127.0.0.1 的 4180、4182 端口；其他内网来源需通过 `LUMA_ALLOWED_ORIGINS` 显式放行。

`test/fixtures/local-sites.json` 保存两个本地普通摄影示例的清理后 HTML，用于不依赖示例服务的离线回归测试。

## 错误诊断

请求失败会直接显示错误消息、HTTP 状态、请求地址、解析阶段、上游 URL、错误编号与完整堆栈。目录/文章错误直接显示在内容区，续载与轮询错误保留在页面的「请求错误详情」中；添加源失败在设置中保留详情。相同诊断会输出到服务端日志及浏览器控制台。接口返回 `error` 和 `diagnostics`，不把错误转换成成功或空结果。

「分类地址无效」会进一步区分 origin 不一致与分类地址未被页面发现，列出实际/预期 origin 和分类地址；这些校验仍保留。当前诊断供本机开发使用。

如果需要保持本地示例运行，同时保留对插件源地址的个人修改，可运行 `node tools/local-demo.mjs`。它仅在当前进程中使用 4180/4182，不改写插件文件。`npm start` 使用下文所述环境变量、已保存配置或 localhost 默认地址。


分类不再根据 `/category/` 字符串判断。`typeSelector` 指向类型导航元素（可选中链接或包含链接的容器），`articleTypeSelector` 指向文章所属分类元素。4180 使用站点标题同级的 `h2 a` 等导航结构，4182 使用主菜单和文章分类结构；名称取链接文字，地址取实际 `href`，不固定分类名称、slug 或 URL 前缀。查询参数不同的分类保留独立 ID，桌面/移动重复链接按完整 URL 去重。

后端会保存已发现的类型；请求某分类时，先确认它是实际发现的同来源链接，再按原始地址加载。缓存失效后会先重新发现首页类型。修改数据源 URL 会重建分类缓存，未发现的链接继续返回完整诊断信息。
