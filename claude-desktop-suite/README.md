# Claude Desktop Suite

给 **Ubuntu 20.04 / GNOME Shell 3.36 / X11** 使用的 Claude 暖色桌面配置：原生灵动岛、米白玻璃便签、侧斜状态卡片、活动区独立壁纸、橙色顶栏悬停，以及紧凑的终端标题栏和米棕色 Dock。

套件版本 **1.0.0**，包含 Cream Island **v10** 和 Desktop Effects **v3**。仅声明支持上面的桌面环境，不适用于 GNOME 40+、其他桌面或 Wayland。它是对现有桌面的用户级配置，不是独立发行版。

## 功能

| 部分 | 实际行为 |
| --- | --- |
| 灵动岛 | 原生顶栏时钟，悬停显示 8 个功能入口，点击才打开正文；支持计时器、本地媒体、通知、活动区、壁纸、电源、控制中心和启动器 |
| 单一通知入口 | 灵动岛启用期间拦截 GNOME 原始横幅，保留灵动岛通知、通知历史、声音和免打扰；停用时恢复原生横幅 |
| 麦克风指示 | 有效录音会话和默认输入设备匹配时显示录音状态及真实峰值；锁屏或停止录音后关闭采样，不保存音频 |
| 右侧卡片 | Conky 系统/进程状态，加可编辑的 TODO / QUICK NOTES 米白便签；后台运行，不占普通应用 Dock 图标 |
| 悬停侧斜 | 默认明显侧斜，仅桌面获得焦点时悬停翻正；编辑便签可继续操作，在其他应用内经过右侧不会触发 |
| 活动区筛选 | 勾选哪些活动区显示整组卡片，娱乐区可隐藏；切换时同步防止重新显示导致闪现 |
| 活动区壁纸 | 每个活动区选择自己的本地图片，未设置时使用原壁纸；GNOME 概览缩略图仍由 Shell 管理 |
| 顶栏 | 悬停使用 Claude 橙 `#D97757` 背景和深棕色文字，适配深浅壁纸 |
| 终端 | 灰黑背景、20% 透明度、米黄色标题栏 `#EAD7AF`、16px 标题，标题栏高度随内容适应 |
| Dock | 米棕色背景 `#C7AD85`；不修改图标尺寸或 Dock 透明度 |

玻璃效果通过半透明底色、圆角、细边和阴影实现，不包含实时背景模糊或折射。WhiteSur 主题与壁纸图片不随包分发。

## 安装前准备

先确认环境：

```bash
gnome-shell --version
echo "$XDG_SESSION_TYPE"
```

应为 GNOME Shell `3.36.x` 和 `x11`。Ubuntu 20.04 可在普通桌面终端安装依赖：

```bash
sudo apt install gnome-shell gnome-shell-extension-prefs gjs \
  python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-gstreamer-1.0 \
  gir1.2-gvc-1.0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  pulseaudio-utils conky-all gnome-terminal dconf-cli libglib2.0-bin \
  fonts-ubuntu libnotify-bin unzip
```

离线测试额外使用 Node.js。GPU 数据需要系统中可用的 `nvidia-smi`；这份监控布局以 NVIDIA 为目标。AMD/Intel GPU 数据源需另行适配，缺少 NVIDIA 工具时显示回退值。

完整外观建议预先安装并选中 WhiteSur，以及 Dash to Dock 和 Fully Transparent Top Bar 扩展；本套件保留现有主题选择。缺少它们时可以使用灵动岛和卡片，但 Dock/动态顶栏的对应设置不会产生相同效果。第三方组件见 [来源说明](THIRD_PARTY_NOTICES.md)。

## 安装与启用

解压发布包，进入最外层 `claude-desktop-suite` 文件夹。先预览将写入的文件：

```bash
python3 tools/manage.py install --dry-run
```

在**真实桌面终端**中安装，整个安装命令不使用 sudo：

```bash
python3 tools/manage.py install
```

第二块存储默认监控用户主目录所在文件系统；有独立数据盘时传入其挂载点：

```bash
python3 tools/manage.py install --data-mount "/实际的数据盘挂载点"
```

安装器先禁用这两项已有扩展，然后备份和复制用户级文件，保留现有便签数据与壁纸选择，不替换系统二进制、不结束终端任务。备份在 `~/.local/state/claude-desktop-suite/backups/`。

GNOME 会缓存扩展 JavaScript。安装后先按 **Alt+F2 → 输入 `r` → 回车** 重载 X11 Shell，然后运行：

```bash
python3 tools/manage.py enable
python3 tools/manage.py apply-appearance
```

`enable` 启用两项扩展并启动右侧后台组件；`apply-appearance` 应用终端和 Dock 配色，并单独备份修改前的设置。安装生成的自动启动项会在后续登录时启动卡片。

终端模板由用户级 D-Bus / systemd 启动配置加载。已有终端服务不会被强制结束：保存工作，关闭所有普通 GNOME Terminal 窗口后重新打开，或下次重新登录，才能让新的终端服务加载标题栏。系统 GTK 用户样式也可能需要新进程启动后才能完整生效。

## 日常设置

打开“桌面效果”应用，或运行：

```bash
~/.local/bin/desktop-effects
```

- **壁纸页**：选择每个活动区的本地图片；这里调整的是可配置的编号数量，不会强制创建或删除 GNOME 活动区。
- **右侧卡片页**：调整角度、等待时间和动画速度；取消“在所有活动区显示”，再勾选需要保留卡片的编号。
- **顶栏页**：开关橙色悬停背景。

新安装的示例配置在活动区 **2** 显示卡片，侧斜 **72°**，离开后等待 **200ms**，翻转时长 **259ms**。旧安装已有设置会保留，覆盖示例不会重置你的壁纸。

使用灵动岛：

```bash
gnome-extensions prefs cream-island@local
notify-send "通知测试" "这条通知应只由灵动岛提示"
```

不要通过关闭 GNOME 全局 `show-banners` 解决重复通知：那是灵动岛共用的免打扰开关，也会关闭灵动岛预览。v10 会精确拦截原始横幅，不需要手动改这个开关。

右侧组件独立管理：

```bash
python3 ~/.config/conky/minimal/scripts/widget_service.py status
python3 ~/.config/conky/minimal/scripts/widget_service.py restart
python3 ~/.config/conky/minimal/scripts/widget_service.py stop
```

只管理本套件的进程，保留其他 Conky 实例。窗口不显示在 Dock 不等于进程不存在；结束后台进程会停止显示，本地笔记数据仍保留。

## 数据与恢复

| 内容 | 本地路径 |
| --- | --- |
| 待办、速记 | `~/.config/conky/minimal/data/todo.json`、`notes.json` |
| 壁纸与活动区筛选 | `~/.config/claude-desktop-effects/settings.json` |
| 灵动岛本地数据 | `~/.local/share/cream-island/` |
| 安装与配色备份 | `~/.local/state/claude-desktop-suite/backups/` |
| 组件日志 | `~/.local/state/claude-desktop-suite/widgets.log` |

仅停用效果：

```bash
python3 tools/manage.py disable
```

恢复最近一次安装前的文件和已备份配色：

```bash
python3 tools/manage.py restore
systemctl --user daemon-reload
```

指定历史备份可加 `--backup /实际备份目录`。恢复时先停用套件，结束本套件组件，恢复已有文件并删除本次新增的非数据文件；保留用户待办、速记和灵动岛数据。恢复后重载 Shell，再按需启用之前使用的扩展。多次安装对应多份快照，`latest-backup` 指向最近一次安装；备份并非“最初出厂桌面”的承诺。

## 测试、构建与发布

```bash
bash tools/check.sh
python3 tools/build_package.py
```

产物是 `dist/claude-desktop-suite-v1.0.0.zip`，另有 SHA-256 校验文件。压缩包内包含全部源码、文档、测试和 `MANIFEST.sha256`，不包含 Git 历史、缓存、运行日志或个人桌面数据。

离线检查覆盖通知拦截与恢复、真实 GObject 信号、免打扰、卡片焦点与活动区切换、防闪现、标题模板、安装回退和数据保留。合成麦克风测试不打开实际麦克风。真实屏幕效果、硬件和第三方扩展共存仍需要桌面验收。

手动发布步骤见 **[发布到 GitHub](docs/PUBLISHING.md)**。实现说明见 [架构与已知限制](docs/ARCHITECTURE.md)，常见问题见 [排查手册](docs/TROUBLESHOOTING.md)。
