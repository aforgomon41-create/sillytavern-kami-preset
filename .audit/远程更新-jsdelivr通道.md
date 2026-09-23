# 远程更新接上 jsDelivr 通道（2026-09-23，本报告）

任务：产物 JSON 已提交进仓库 `mirror/`（提交 `a9e30d9`），脚本侧照此改造 —— jsDelivr 通道默认开、
下载链重排、版本检查加清单兜底、尽力而为的 SHA-256 校验；自测与真浏览器端到端验证。

**结论（一句话）**：改完后，手机连不到 GitHub 的场景下（接口和下载都不通），版本发现靠 jsDelivr
清单兜底、下载靠 jsDelivr 镜像，两条链都真浏览器实测走通；端到端两种模式拿到的文件字节数与
SHA-256 都等于 `mirror/manifest.json` 里的 `bytes` / `sha256`。

---

## 一、`src/scripts/70-远程更新.js` 改了什么（v1.2 → v1.3）

1. **jsDelivr 镜像通道默认开**：`USE_JSD_MIRROR = true`（主力兜底，不再是「等拍板的实验通道」）。
   raw 镜像 `USE_RAW_MIRROR` 保持默认关。旧通道目录常量 `RAW_DIR='release'` 删除，镜像路径统一写死
   `mirror/`（仓库现状）；运行时覆写变量 `mirrorRaw`（raw 开关）保留。
2. **下载链重排**（`buildChain`，`:350-402`）：
   **① GitHub Release 直链 → ② jsDelivr `@<tag>/mirror/<file>` → ③ jsDelivr `@main/mirror/<file>`
   → ④ GitHub API 附件 → ⑤ GitHub raw 镜像（默认关）**。
   每条通道 2 次尝试、间隔 1.5s 的既有逻辑逐字保留。
   - `<tag>` = `versionLabel(remote)`（形如 `v0.90-124`），`<file>` = `assetFileName(remote)`。
   - ③ 防「tag 打早了、tag 提交里没有这份文件」：`@main` 永远有最新那份。
   - 清单兜底的一版没有 GitHub 直链（只有 jsDelivr 地址）→ 通道①自动不上链
     （`buildChain` 里按 `url` 是否 jsDelivr 判定，标签不会写错、也不重复请求）。
3. **版本检查加 jsDelivr 清单兜底**（`fetchManifestRemote` + `check()` 改造，`:700-760` 附近）：
   - 先读 Releases 接口；**任何失败**（网络 / 404 / 限流 / 没 JSON 附件）→ 再读一次
     `https://cdn.jsdelivr.net/gh/<o>/<r>@main/mirror/manifest.json`；
   - 用清单拼一个与 `fetchReleases()` 同形的 `remote`：`name`=去 `.json` 的文件名、
     `version`=manifest version、`major/minor/build` 从清单 file 解析（`parseVersion` 认现行正式名），
     `url` = jsDelivr `@main/mirror/<file>`、`assetId`=null、`notes`=manifest 的 notes、
     `sha256`=manifest 的 sha256、`from`='manifest'；
   - 然后照常走「比版本 → 卡空闲 → 原生弹窗 → 下载链 → 写盘」。
   - 日志写明来源：`这一版是从 jsDelivr 清单发现的（GitHub Releases 接口没读成，多半是网络问题）`
     或（Releases 成功时）`仓库最新：v0.90-124（来自 GitHub Releases）`。
   - 两条路都断才报错，错误里带两边定性（`…（jsDelivr 清单兜底也没成：…）`）。
   - 清单文件名解析不出版本号 → 明确报错（绝不瞎猜一边）。
4. **尽力而为的完整性校验**（`subtleAvailable` / `sha256Hex` / `verifySha`，`:607-640` 附近）：
   - `remote.sha256` 存在**且** `crypto.subtle` 可用 → 下载正文算 SHA-256（TextEncoder + subtle.digest）
     对比；不一致 → 报「下载到的文件校验不通过（SHA-256 对不上），可能没下全；请换个网络再重试一次」，
     **不写盘、不记 imported**；
   - `crypto.subtle` 不可用（酒馆走局域网 http 的非安全上下文）→ 记一行日志优雅跳过，照样安装；
   - 没带哈希（Releases 路径的版本本来就没有）→ 记日志跳过。
   - 下载成功后新增一行字节数日志（`下载到 N 字节的预设`），方便对读数。
5. **发版约定写进脚本尾部注释**：先提交 `mirror/`（JSON + manifest）→ purge `@main` 清单缓存
   → 再打 tag / 发 Release（jsDelivr @<tag> 只认 tag 提交里有的文件）。
6. **没动的**：版本解析、附件挑选（含「附件名被 GitHub 削前缀」兜底）、原生弹窗流程、
   「已经下载过就跳过」、斜杠命令串字符安全、INSTANCE_ID 与 BFCache 逻辑、6 小时检查间隔。

## 二、自测（`test/harness/update-flow.mjs`）

`node test/harness/update-flow.mjs` → **117 / 117 通过**（原 84 项全保留；新增六组用例共 33 条断言）。

假 fetch 升级为按 URL 三向分流（GitHub API 清单 / API 附件 / jsDelivr 清单 / jsDelivr 镜像文件 / 直链）
与新增开关：`failReleases`（Releases 接口 TypeError，模拟手机连不上 api.github.com）、`jsdTag404`
（@<tag> 404，模拟 tag 打早了）、`manifest`（自定义/置空清单）。

新增的六组（用户点名的四条全在内）：
- ① **Releases 接口读失败 → jsDelivr 清单兜底发现 v0.90-97 → jsDelivr 下载成功装上**，
  日志写明「从 jsDelivr 清单发现的」（手机形态直复现）。断言 8 条。
- ② **jsDelivr `@<tag>` 404 → 自动落 `@main` 成功**（直链也拦)：两通道先后请求记录与
  「回退成功…jsDelivr 镜像（最新）」日志各一条。断言 7 条。
- ③ **清单 sha256 与正文不一致 → 报错、不写盘、不记 imported**，错误文案带「校验不通过 / 重试」。
  断言 7 条。
- ④ **`crypto.subtle` 不存在（源码屏蔽 subtleAvailable 判据模拟局域网 http）→ 跳过校验照样装上**，
  日志写明跳过原因。断言 4 条。
- ⑤ 清单兜底比版本：清单版本比本机旧 → 不弹窗（清单路径同样走三级比较）。断言 3 条。
- ⑥ 清单文件名解析不出版本号 → 明确报错、不弹窗。断言 2 条。

另有 2 条旧口径对齐性修改：原「Releases 404 直接收场」与「没有 JSON 附件的 Release」用例，
因清单兜底会把版本重新救回来，改成「清单兜住 → 成功（declined）」、「两边都断死 → 双定性错误」；
直链失败回退用例改为关掉 jsDelivr 常量（新链序下 jsDelivr 在 API 附件之前），断言本体没动（全绿）。

## 三、端到端验证（真浏览器，两种模式）

宿主：`http://127.0.0.1:8794/.audit/e2e-update-jsdelivr.html?mode=…`（harness 静态服务器，加载
`/dev/70-远程更新.js` = 与构建进产物是同一份源；弹窗用假 `triggerSlash` 自动选「立即更新」；
`importRawPreset` 假实现收货后算字节与 SHA-256）。

**⚠ 重要实验条件**：GitHub 上 Release v0.90-124 还没发布（真实 Releases 列表最新是 v0.90-122，
2026-09-23 实查），且仓库还没有 `v0.90-124` tag（jsDelivr `@v0.90-124/mirror/manifest.json`
返回 page_not_found）。所以：
- **模式 A** 用「注入了 v0.90-124 记录的真实 Releases 响应」模拟发版后状态（发 Release 本来就是
  人做的下一步）。注入只影响版本发现，**下载完全打真网络**。
- **模式 B** 完全真实（api.github.com 拦掉 → 读真 jsDelivr 清单 → 下真文件）。

**模式 A（直链被拦）读数**：
- `lastAction=imported`，`importedName=kami-v0.90-124-20260923`（与清单名一致）
- `importedBytes=2572791` = 清单 `bytes` ✓
- `importedSHA256=cac13a56414b667d005c222172a413de56fbc9630c95e00bec4a618b1602cd06` = 清单 `sha256` ✓
- 被拦请求数=2（直链两枪都被拦）
- 关键日志：
  `通道「GitHub 直链」第 1/2、2/2 次尝试没成功：网络连不上 GitHub…` →
  `回退到下一条：jsDelivr 镜像（按版本）` → `@v0.90-124/mirror/…json 第 1/2、2/2 次：HTTP 404`
  （真实 404：tag 还没有）→ `回退到下一条：jsDelivr 镜像（最新）` →
  `@main/mirror/kami-v0.90-124-20260923.json 成功（第 1 次尝试）` →
  `回退成功：…最终走的是「jsDelivr 镜像（最新）」` → `下载到 2572791 字节` → `已写入预设`。
- 备注：这是 Releases 路径的版本，remote 不带 sha256，日志正确写明「校验跳过（不是清单走的版本）」。

**模式 B（连 API 接口也拦）读数**：
- `lastAction=imported`，`importedName=kami-v0.90-124-20260923`
- `importedBytes=2572791` = 清单 `bytes` ✓
- `importedSHA256=cac13a56…cd06` = 清单 `sha256` ✓（**且脚本自己完成校验**：
  `完整性校验通过：SHA-256 与清单一致`）
- 关键日志：
  `读 Releases 没成功：Failed to fetch` → `改从 jsDelivr 清单找最新版本：…@main/mirror/manifest.json`
  → `这一版是从 jsDelivr 清单发现的` → `仓库最新：v0.90-124（来自 jsDelivr 清单）` → 弹窗 →
  下载链：`@v0.90-124 404 ×2 → @main 成功` → 校验通过 → 写盘 → toast success。
- `scriptVars.imported='v0.90-124'`。

两模式都验证了「几条镜像通道留着没走（GitHub raw 镜像）」的通道旁路日志和 2 次/通道的重试节奏。

## 四、自测与端到端关键结论

- **离线自测**：117/117（改前基线 84/84，一项版本号断言按 v1.3 合规更新；六组新用例见上）。
- **真浏览器**：两种手机形态都装上了**同一份** 2,572,791 B / `cac13a56…cd06` 的文件，
  与 `mirror/manifest.json` 完全一致。

## 五、剩下没验到的部分与风险

1. **真机没参与**：本机网到 jsDelivr 是通的，中国移动网络到 `cdn.jsdelivr.net` 的真实连通性
   只能由用户实测（脚本日志会写明用了哪条通道，能看懂）。
2. **发版纪律依赖（关键）**：jsDelivr `@<tag>` 取文件要求 tag 提交里有这份文件。v0.90-124 的
   Release / tag 还没发（发版顺序按脚本尾部注释写的新流程：先提交 mirror → purge → 打 tag/发 Release）。
   在 tag 存在之前，`@<tag>` 通道一定是 404，全靠 ③ `@main` 兜住 —— **实测确认 ③ 兜得住**
   （两模式最终都是它成功）。
3. **manifest 的 `bytes` 只记日志、不参与校验**（本次按规格只做了 sha256 校验）；若发版时
   manifest 手写错 sha256，会把好文件判成坏 —— 校验失败文案已带「重试」和「可能没下全」的人话。
4. **版本检查的清单兜底把「6 小时时间戳」记为成功**（version OK 即记 lastCheckAt）——
   如果清单能发现版本但下载全失败，6 小时内不会自动重试（与既有「检查失败也记时间戳」口径一致，未改）。
5. **限流未变**：清单兜底走的是 jsDelivr 静态地址（不占 GitHub API 配额）；Releases 成功路径照旧。
6. **没验**：酒馆真机（手机/PC）上原生弹窗与写盘的一手表现 —— 端到端页用的是与真机同语义的
   假 `triggerSlash` / `importRawPreset`，与上一轮验证同口径。

## 六、文件清单（本次动过）

- `src/scripts/70-远程更新.js`（v1.3：下载链重排 + 清单兜底 + SHA-256 校验）
- `test/harness/update-flow.mjs`（84 → 117 项）
- `.audit/e2e-update-jsdelivr.html`（端到端验证页，两模式）
- `.audit/远程更新-jsdelivr通道.md`（本报告）

没动：`mirror/`、`docs/`、`build/`、`.audit/publish-release.mjs`、其它脚本与文件。
