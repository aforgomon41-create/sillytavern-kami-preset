# SOLVE 0.9.0-preview.1

当前为预览版，真实页面边界仍有待验收项目。安装前备份聊天；三种载体需统一版本。

原生：解压后将 solve 文件夹放入酒馆自定义扩展目录，manifest.json 必须直接位于 solve 下，再重载酒馆。
动态：将 solve 文件夹全部托管到 HTTP(S)，导入其 dynamic.js 并注册作者定义；只用官方数据结构时，在角色脚本里一行 import 其 auto.js 即可。
对应源码随包附在 SOURCE_CODE.zip；不要单独复制一个入口文件。
