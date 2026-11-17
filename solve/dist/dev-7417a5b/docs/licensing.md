# 授权与版本说明

## 当前许可

SOLVE 从 0.7.1 起采用 **AGPL-3.0-only**（GNU Affero General Public License 第 3 版，仅此版本）。完整正文见根目录 LICENSE；版权和历史说明见 NOTICE。未另行声明的本项目源码及项目文档适用该许可；第三方内容保留各自许可。

采用这一协议是为了让本项目的修改与衍生版本持续开放。可以商用；分发受覆盖的修改版需遵守 AGPL 的源码和相同许可要求。支持网络交互的修改版还需向交互用户显著提供免费取得该版本对应源码的机会。仅在同一目录聚合独立程序、普通用户数据、单纯使用程序，不等于自动对这些内容重新授权。准确条件以协议正文为准。

## 对应源码

每个发布标签包含该版本源码、package-lock.json、构建脚本及安装说明。使用 Node.js 22 或更新版本，执行 `npm ci`、`npm run build` 可构建浏览器分发包；`npm run check` 执行现有验证。依赖的精确版本与获取位置由锁文件记录，浏览器包的 source map 包含参与构建的源码，THIRD_PARTY_NOTICES.txt 保留依赖许可。

分发包的 SOURCE_CODE.md 和面板页脚给出对应版本的源码入口。维护修改版时，应同步修改源码链接、版本号和构建信息，向用户提供实际运行版本的对应源码，包括适用的依赖修改和构建/安装资料；不能只提供上游项目链接来代替自己修改的源码。

## 历史版本

0.7.0 已以 Apache-2.0 公开发布。已授出的许可继续有效；本次变更不会追溯撤销此前获得的权利，也不会重写 v0.7.0 标签或替换它的安装包。当前 0.7.1 与后续本项目更新采用其各自明确声明的许可。

## 官方资料

- GNU AGPL 第 3 版：https://www.gnu.org/licenses/agpl-3.0.html
- GNU 关于网络修改版源码的说明：https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedModsAGPL
- SPDX 的仅第 3 版标识：https://spdx.org/licenses/AGPL-3.0-only.html
