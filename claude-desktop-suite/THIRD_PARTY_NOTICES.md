# 第三方来源与素材边界

- [GNOME Shell](https://gitlab.gnome.org/GNOME/gnome-shell)：本地 GNOME Shell 3.36 的 MessageTray、扩展管理与窗口 API 是适配依据。本项目不打包 Shell 二进制或整个 Shell 源码。
- [GNOME Terminal](https://gitlab.gnome.org/GNOME/gnome-terminal)：`terminal/headerbar.ui` 是对本机 Terminal 3.36 资源模板的修改，保留 GPL-3.0-or-later 条款；完整 GPL 第 3 版文本见 `terminal/COPYING`。修改包括关闭副标题预留和添加动态绑定的自定义标题。
- [GTK](https://gitlab.gnome.org/GNOME/gtk)、[Conky](https://github.com/brndnmtthws/conky)、GStreamer、GLib/GObject 是运行依赖，不随包分发二进制。
- [WhiteSur GTK theme](https://github.com/vinceliuice/WhiteSur-gtk-theme)：可选基础主题，不随包重分发。套件只提供自己追加的标题栏 CSS，不复制 WhiteSur 完整资源或图标。
- [Dash to Dock](https://github.com/micheleg/dash-to-dock)、[Fully Transparent Top Bar](https://github.com/aunetx/gnome-shell-extension-fully-transparent-top-bar)：可选的 Dock 和顶栏提供者，仅写入相关用户设置，不随包分发其实现。
- Claude 色彩参考来自 [Anthropic brand guidelines](https://github.com/anthropics/skills/tree/main/skills/brand-guidelines)。项目与 Anthropic 没有官方关联，不包含品牌图片素材。

本包不包含用户的待办、速记、账号凭据、真实壁纸图片、录音或运行日志。测试 fixture 使用协议示例及合成音频。

原创扩展与工具尚未另行附加通用开源许可证；公开源码不改变第三方文件原有许可。若需要给整个项目选择统一开源许可证，请先检查相应授权兼容性并由项目所有者决定。
