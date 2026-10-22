# 排查手册

## 更新后还是旧效果

GNOME 会缓存 JavaScript 模块。关闭旧的“桌面效果”设置窗口，在 X11 按 `Alt+F2`，输入 `r` 回车，再重新打开设置。单纯禁用/启用扩展不一定加载新代码。不要在 Wayland 使用此方法，Wayland 需要注销重新登录，而本包仅声明支持 X11。

## 原始通知仍弹出

先确认安装和运行的是 Cream Island v10：

```bash
gnome-extensions info cream-island@local
gnome-extensions list --enabled
notify-send "通知测试" "正常情况下只显示灵动岛提示"
```

如果刚更新文件，先重载 Shell。不要关闭系统 `show-banners` 来隐藏重复弹窗，否则灵动岛预览也会进入免打扰。停用灵动岛后原生通知应恢复，这属于预期行为。其他应用自己绘制的提示窗口不属于 GNOME 通知横幅，不在本修复范围。

## 完全没有通知预览

检查免打扰、锁屏状态和应用自身的通知开关。灵动岛在功能正文打开或正在显示媒体内容时，可能只更新未读标记，不强行打断当前内容。到灵动岛的通知页查看历史。

## 右侧卡片没有显示

打开“桌面效果 → 右侧卡片”，确认当前活动区已勾选。默认示例只勾选活动区 2。再确认后台组件存在：

```bash
python3 ~/.config/conky/minimal/scripts/widget_service.py status
tail -n 50 ~/.local/state/claude-desktop-suite/widgets.log
```

结束后台进程会停止显示；运行 `widget_service.py start` 恢复。不要到 Dock 中关闭进程来“隐藏图标”，这套窗口本来就使用不出现在任务栏的窗口属性。

## 鼠标过去不翻正

先点击桌面空白处，让桌面获得焦点，再移到卡片。普通应用仍被选中时不会翻正。检查侧斜开关是否启用，以及桌面图标扩展是否正常。

## 隐藏活动区闪一下

确认 Desktop Effects 为 v3，并重载 Shell，使同步可见性/不透明度保护生效。如同时安装了其他修改窗口透明度或动画的扩展，可暂时关闭该扩展排除冲突。

## 终端标题栏仍然很高

先运行 `systemctl --user daemon-reload`。保存工作，关闭全部普通 GNOME Terminal 窗口，再重新打开。现有服务中的新窗口仍可能沿用旧模板。

安装后可在桌面终端测量：

```bash
python3 ~/.config/conky/minimal/scripts/measure_terminal_header.py --patched --require-short --max-height 36
```

这会创建不可见的临时测试窗口，检查动态标题绑定和尺寸，不关闭真实终端。`36` 是回归检查上限，不是强制设置标题栏高度。

## 安装器无法连接桌面

在正在运行的 GNOME 3.36 桌面中的普通终端执行，不要通过 sudo、无会话的 SSH 或受限环境执行。`install --dry-run` 可以离线检查文件计划；真正安装需要确认扩展已停用，不能把连接失败当成停用成功。

## 需要恢复

参照 README 的 `manage.py restore`。不要直接删除用户数据文件夹。安装备份和设置快照位于 `~/.local/state/claude-desktop-suite/backups/`；每次安装有独立目录。
