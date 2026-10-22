# Cream Island v10

GNOME 3.36 / X11 原生顶栏灵动岛。v10 作为唯一通知提示入口：拦截 GNOME 原始横幅，保留通知历史、声音和免打扰；停用时恢复原始通知，不改写全局 show-banners。最终交互、架构、已知限制和整理记录见 [项目总结](docs/PROJECT_SUMMARY.md)。

在完整工程中构建、离线验证：

```sh
bash tests/run_all_tests.sh
bash build_package.sh
```

最终包为 `cream-island-v10-notifications.zip`。解压后在自己的普通桌面终端运行 `bash install.sh`。安装器会先禁用已启用旧版、将备份放到扩展扫描目录外，再复制文件；不自动启用。确认文件后自行重载 Shell/重新登录并启用 `cream-island@local`。卸载用 `bash uninstall.sh`，保留用户笔记与计时数据。

运行需要 GJS、Python gi、GStreamer（pulsesrc/level/fakesink）、pactl 及 GNOME Shell 3.36 相关 GI 库。离线测试额外需要 Node.js。测试只使用合成声音，不打开麦克风；真实桌面显示、延迟和输入设备仍需实机验收。本次整理没有安装、启用或重启桌面。

只读性能采样：`python3 scripts/capture_performance.py --seconds 5`。只连接经身份核验的本地 Bilibili 客户端，不访问网页、HTTP API 或浏览器桥。
