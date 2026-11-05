# 支线测试包

> 2026-11-04 起 `frontend-rewrite` 已合并进 `main`：这里留的是合并前最后一份支线测试包。main 上的构建产物不带支线后缀，**是正式版的候选**，发版走 `.audit/publish-release.mjs`，不放这里。

`frontend-rewrite` 支线的测试包，导入酒馆即可试用新前端（2026-10-30 起新旧不再并存，脚本列表里只有一套）。

- **只用于测试，不是正式版。** 支线不发 Release；远程更新只认 `main` 的正式版，测试包启动时不会自动更新。
- 只保留最新一份，旧的直接删掉（历史在 git 里）。
- 生成：`KAMI_ST_ROOT=… node build/build.mjs`，再把 `dist/` 里最新的 `kami-*-frontend-rewrite.json` 复制过来。
