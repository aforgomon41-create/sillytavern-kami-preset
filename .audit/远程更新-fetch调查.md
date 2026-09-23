# 排查报告：远程更新「Failed to fetch」（2026-09-23）

任务：用户在手机（中国移动网络）上点「立即更新」，下载产物报 `Failed to fetch`。
要求：真实浏览器复现并定性根因 → 逐通道实测 → 按顺序回退的下载链 → 离线自测 → 端到端验证。

---

## 一、根因：不是 CORS，不是代码，是用户手机的网络到 GitHub 下载域名不通

定性证据（全部实测，不是猜）：

1. **本机真实浏览器里，那条下载地址一次成功**（探针页 `.audit/fetch-probe.html`，宿主页
   `http://127.0.0.1:8796/.audit/fetch-probe.html`，页面上下文就是普通前端 fetch）：
   - GitHub 直链 `github.com/.../releases/download/v0.90-122/kami-v0.90-122-20260923.json`
     → HTTP 200，2.3 秒，`content-length: 2564600`，SHA-256
     `4fe04b0e41e6de06…05932c4` 与本地 `dist/kami-v0.90-122-20260923.json` 逐字节一致。
   - 控制台与 network 里没有 CORS 报错、没有 `net::ERR_*`。
2. **API 附件接口同样成功**（见下面通道表第②行）。
3. 用户日志里「读 Releases `api.github.com`」多次成功（第 3 次检查成功、第 4 次检查失败），
   同一环境里时通时不通 —— 这是**连接层的不稳定**，不是跨域被拦（跨域被拦是稳定的必失败）。

结论：脚本代码与 GitHub 侧都没问题；`Failed to fetch` 是用户手机网络到
`github.com` / `release-assets.githubusercontent.com` 连通性差（国内运营商对该 CDN 主机经常连不上，
`api.github.com` 相对好一些）。手机换 Wi-Fi 后同一条链路很大概率直接成功。

---

## 二、四条通道真实浏览器实测表

宿主页 = `http://127.0.0.1:8796/.audit/fetch-probe.html`（http 源，跨域规则与真机一致）。

| 通道 | 结果 | HTTP | 耗时 | 说明 | CORS 头 |
|---|---|---|---|---|---|
| ① GitHub 直链（现在用的） | ✅ | 200 | 2.3s | 2,564,600 B，SHA 与本地 dist 一致 | 响应可读，无拦截 |
| ② API 附件接口 `assets/583032175` + `Accept: octet-stream` | ✅ | 200 | 8.4s | 同样 2,564,600 B，SHA 一致；302 最终落同一台 CDN | 可读 |
| ③ raw 镜像 `raw.githubusercontent.com/…/main/readme.md` | ✅ | 200 | 0.5s | 通道本体通；但按 tag 取**预设 JSON** → HTTP 404（文件根本不在仓库里） | 可读 |
| ④ jsDelivr 镜像 `cdn.jsdelivr.net/gh/…@main/readme.md` | ✅ | 200 | 1.2s | 通道本体通；按 tag 取预设 JSON → HTTP 404 | 可读 |
| 对照：一个本机坏通道 `example.com/dl/…json`（自测用） | ❌ | TypeError | — | 仅在离线自测里模拟，本机不起这个 URL | — |

关键读数：**② ③ ④ 三条回退通道里，只有②（API 附件）现在就可用于真正的预设 JSON**；
③④ 通道是通的，但指向预设 JSON 时 404，因为那个文件只有 Release 附件里才有、仓库里没提交。

另外实测确认：② 最终同样 302 到 `release-assets.githubusercontent.com`，与①同台 CDN。
它作为回退通道的价值是「入口域名不同」+「将来丢弃时同样能复用」，不是新一台服务器；
在中国移动网络下它的**实际增益未知**（本机测试环境连它没压力，但用户手机环境没参与测试）。

---

## 三、改了什么（`src/scripts/70-远程更新.js`）

1. **下载链**（`buildChain` / `downloadViaChain`）：
   按序逐条试，哪条成功用哪条；每条通道先试 2 次（间隔 1.5 秒）再换下一条 ——
   手机网络抖一下的第二枪，比立即换道成功率更高。链上通道：
   ① Release 直链（永远在链上）→ ② API 附件接口 → ③ raw 镜像 → ④ jsDelivr 镜像。
2. **日志写明回退与最终通道**（用户看得懂的说法）：
   - 失败时：`通道「GitHub 直链」第 1 次尝试没成功：网络连不上 GitHub（这个网络下访问它不通）`
   - 换道时：`这条走到底也没通（网络层问题），回退到下一条：GitHub API 附件`
   - 成功回退时：`回退成功：用的不是首选那一条，最终走的是「GitHub API 附件」（前面试过的通道：GitHub 直链）`
3. **错误提示可操作**：全失败时错误文案改为一句人话汇总，带定性
   （「网络连不上 GitHub（这个网络下访问它不通）」）与手动下载路径
   （`https://github.com/<owner>/<repo>/releases` + 具体文件名 + 「导入酒馆」）；
   不再是干巴巴的 `Failed to fetch`。
4. **镜像通道 ③④ 做成可开可关、默认关**（`USE_RAW_MIRROR=false`、`USE_JSD_MIRROR=false`），
   且**脚本变量可运行时改**（`kami-update` 里加 `mirrorRaw` / `mirrorJsdelivr` / `rawDir`），
   不必重新构建就能翻转。
5. **保留原行为**：版本解析、附件挑选（含「被 GitHub 削掉前缀」兜底，
   由 `assetFileName()` 沿用 `remote.name`）、弹窗流程、已下载过跳过、
   斜杠命令串字符安全（新文案全部经现有 `escText()` 检查过的同一类通道：toast 不是斜杠命令，
   弹窗 HTML 路径没动）。
6. **保留镜像承诺**：把「要不要把 JSON 提交进仓库」明确留给派活方（见第五节），
   脚本侧只提供开关，不自己决定。

## 四、自测改了什么（`test/harness/update-flow.mjs`）

新增两条用例（覆盖本次的回退链）：

- **① 首选直链 TypeError 失败 → 回退到 API 附件通道成功**：
  假 fetch 拦直链 2 次报 TypeError，断言断言：预设最终装上、presets 数在、
  日志里写出「回退成功」与最终通道名、API 附件接口带 `Accept: octet-stream`。
- **② 所有通道都失败 → 给出可操作错误文案**：
  断言 `错误里有「换 Wi-Fi / 手动下载 / releases」`，不再是单句 Failed to fetch；
  且预设没装上、没写 `imported`、toast 是 error。

自测假 fetch 升级为**按 URL 分流**（Release 清单 / 附件接口 / 直链可分别拦截），
原来的假 fetch 对所有 URL 一把 200，这正是老用例永远测不出 CORS/网络问题的原因。

自测其他改动：`releaseOf()` 现在带 `id`（供通道②定位附件）、
下载链重试延迟 `RETRY_DELAY_MS` 在两条新用例里清零（离线假定时器没有真实时钟）。

## 五、派活方需要拍板的事（我没替你决定）

**要不要把预设 JSON 提交进仓库？**（通道 ③④ 的前提）

现在仓库里没有这份文件，所以 ③④ 两条镜像通道虽然通道本身实测是通的，
对真正的预设 JSON 完全用不上。选择只有两档：

- **A. 不提交**（现在这样）：持续依赖 Release 直链 + API 附件接口（同台 CDN，入口域名不同）。
  用户如果换到国内相对可达的网络后运营商直连仍频繁失败，这版改动救不了；
  优点：仓库体积不涨、发版流程不变。
- **B. 提交**（把 `kami-v={<新构建号>}-<日期>.json` 放进仓库 rawDir 目录）：
  通道 ③④ 才真正有货可用，jsDelivr（国内可达性最好）就真的在工作。
  代价：① 每发一版预设 JSON 就多进仓库一次（一份 ~2.5 MB，十来版后仓库体积明显往上涨，
  raw 镜像/JSdelivr 都只认 tag 下的那一份，无法回收过去版本）；② 发版流程多一步（额外 commit）；
  ③ 派活方需要把 `USE_RAW_MIRROR` / `USE_JSD_MIRROR` 任一改 true（或写脚本变量 `mirrorRaw`/`mirrorJsdelivr`）。

本案的实际根因是「手机网络到 GitHub 下载域名不通」，**这不是 ② 能兜住的场景**（同台 CDN）。
最可能有效的是 **④ jsDelivr**，但那要先走 B 才能供上真文件。

## 六、端到端验证（真实浏览器，两种模式）

加载改好的脚本本体（`/dev/70-远程更新.js`，与构建打进预设的是同一份源）在真浏览器里
跑完整更新流程（真 Releases 接口 → 真附件下载 → 弹窗确认自动选「立即更新」→ 假 importRawPreset 收货）：

**模式 normal（直链正常）**：
- imported = `kami-v0.90-122-20260923`
- 字节 = **2,564,600**（与本地 dist/Release 附件一致）
- SHA-256 = `4fe04b0e41e6de0602abb758254823fe837be2c402886e0df7ba7cca905932c4`（与本地 dist 一致）
- uniqueSnippet = `"name":"测试mvu初始化脚本`（从下载到的正文里抓的独有段）
- 日志链路完整：读 Releases → 选附件 → 弹窗 → 直链一次成功 → 已写入 → toast(success)

**模式 blockdirect（强制拦直链 2 次 → 验证回退）**：
- 直链第 1/2、2/2 两次都报「网络连不上 GitHub（这个网络下访问它不通）」→ 自动退到 API 附件
- 日志核心行：`回退成功：用的不是首选那一条，最终走的是「GitHub API 附件」（前面试过的通道：GitHub 直链）`
- imported 也是同一份 2,564,600 B / 同 SHA → **回退链在真浏览器里把同一份文件完整装上了**

（`lastAction=imported`、`scriptVars.imported='v0.90-122'` 两种模式都对。）

## 七、剩下的事与风险

- **没试成/意义有限的通道**：③④ 本体通但对预设 JSON 是 404 材料（文件不在仓库）；
  ② 与①同台 CDN，在用户手机网络上真实效果我没有真机数据，只能说「多一条入口，不是托底」。
- **限流保护**：我的排查只调过 Releases 接口 1 次（本机端，Node 侧一次）+ 浏览器探针 1 次，
  其余全部是附件下载与 raw 静态文件，不计入 API 配额。
- **没改的东西**：releases 接口本身没有加重试；`check` 失败时已有的 `lastCheckAt` 时间戳
  照旧会让 6 小时内不重复连网 —— 手机上「某次检查失败后 6 小时内不再自动查」的原有行为没动
  （离线自测的那 3 项老用例都还锚它）。如果以后想「检查也重试 + 失败不记时间戳」，
  属于新改动，需要派活方再定。
- **附件名被削前缀的兜底**（`assetFileName` = `remote.name` + `.json`）与「已下载过就跳过」、
  版本解析照旧没动，老 67 项自测没动、照常全绿（合计 84/84）。

## 八、测试与构建读数

```
node test/harness/update-flow.mjs  →  结果：84 / 84 通过   (原 67 项全保留)
node build/build.mjs               →  [完成] dist/kami-v0.90-123-20260923.json (2572790 bytes)
                                      [启用] 🔄 远程更新 v1.2  (44725B, sha e4fc28af8bfd)  <= 70-远程更新.js
                                      全部前端通过验证
```

## 九、文件清单（本次动过的）

- `src/scripts/70-远程更新.js`（下载链 + 可操作错误文案 + 镜像开关，67→84 项自测通过）
- `test/harness/update-flow.mjs`（假 fetch 分流 + 两条新用例）
- `.audit/fetch-probe.html`（排查辅助页：四通道真浏览器实测）
- `.audit/e2e-update.html`（端到端验证辅助页：normal / blockdirect 两模式）
- `.audit/远程更新-fetch调查.md`（本报告）

## 十、留下的门槛说明（供派活方决定下一步）

到底「哪条通道最有希望」我没法凭电脑实测打包票：**手机的真实网络参与不进来**，
我这边只能证明「代码与 GitHub 侧完全没问题、通道判定正确」。
真正要判定 ② 与 ③④ 谁在中国移动网络下有效，需要用户在新版脚本发布后实际试一次
（脚本日志现在会写明用了哪条通道，用户或我们看的懂）。
