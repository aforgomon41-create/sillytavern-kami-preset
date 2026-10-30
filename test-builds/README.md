# 支线测试包

`frontend-rewrite` 支线的测试包，导入酒馆即可试用新前端（2026-10-30 起新旧不再并存，脚本列表里只有一套）。

- **只用于测试，不是正式版。** 支线不发 Release；远程更新只认 `main` 的正式版，测试包启动时不会自动更新。
- 只保留最新一份，旧的直接删掉（历史在 git 里）。
- 生成：`KAMI_ST_ROOT=… node build/build.mjs`，再把 `dist/` 里最新的 `kami-*-frontend-rewrite.json` 复制过来。
