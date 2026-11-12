# 预览交付与复现

当前版本为 0.9.0-preview.1（预发布），上一个公开预览版为 0.8.4-preview.2。开发版产物和已发布附件分开保存。本地接口边界检查通过不代表全部页面验收完成，真实页面证据和范围见 acceptance-release-plan.md 和 verification.md。JSON Patch 是唯一正式变更格式。

## 构建与打包

要求 Node.js 22 或更新版本。

```sh
npm ci
npm run check:portable
npm run package
npm run test:release
```

输出目录为 `artifacts/releases/<版本>/`，不会自动提交、上传或创建远程发布：

| 文件 | 用途 |
| --- | --- |
| SOLVE-native-版本.zip | 解压 solve 文件夹到酒馆自定义扩展目录，manifest.json 位于该文件夹根部 |
| SOLVE-dynamic-版本.zip | 将 solve 全目录托管到 HTTP(S)，作者脚本导入 dynamic.js |
| SOLVE-embedded-版本.zip | 酒馆助手脚本 JSON、完整内嵌引擎及作者入门定义 |
| SOLVE-source-版本.zip | 此次实际源码、锁文件、构建脚本、测试和文档 |
| release.json / SHA256SUMS.txt | 版本、文件大小和 SHA256 校验；远程发布状态不由打包命令推定 |

每种分发包内部均附带相同的 SOURCE_CODE.zip 及其校验值。项目仓库页脚只标注为“项目源码”，不再假设尚未发布的版本标签已经存在。预览源代码以随包归档为准。

三种运行分发使用相同的引擎/UI 构建文件；原生和动态包共享 solve 目录布局。内嵌脚本 JSON 是只含 hp 的入门例子，正式作者应替换定义；导入前停用旧版本脚本，避免版本冲突。包内不包含本机验收 HUD、测试角色身份、聊天、个人连接配置、node_modules 或日志。

## 检查内容

自动检查覆盖类型、全部 Node 回归、三载体构建及独立 JavaScript 上下文运行。发布检查额外核对 ZIP CRC、SHA256、版本和入口、源码一致性、目录隔离、确定性打包及无本机测试脚本泄漏。

GitHub 工作流分别在 Linux/Windows 执行同一流程并保存构建产物。它只读仓库，不连接 localhost 酒馆、不调用模型、不自动公开发布。工作流是否真实运行通过必须查看远程结果，本地成功不能替代远程 CI。

## 正式发布前

0.8.4-preview.2 的页面主流程及环境恢复已有记录，0.9.0-dev.8 也已有独立环境下的作者入口、长聊天与缓存实机记录。维护者按拟发布范围核对对应版本的证据，并确认剩余事项。提交源码后，再建立与版本一致的标签和 Release，上传安装包与校验清单，并核对源码归档和对应提交。[当前状态](implementation-status.md) · [验证记录](verification.md)

验收辅助脚本位于完整工作区，包含本机路径的维护工具不进入对外运行包或对应构建源码归档。当前测试场景和原始报告位置记录在 verification.md。
