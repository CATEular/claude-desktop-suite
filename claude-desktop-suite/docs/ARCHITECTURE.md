# 架构与已知限制

## 文件布局

```text
extensions/
  cream-island@local/          灵动岛 v10、GSettings schema、测试、文档
  claude-desktop-effects@local/活动区壁纸、卡片旋转/隐藏、顶栏悬停
desktop/conky/minimal/         两个 Conky 窗口、GTK 便签、状态采样和后台管理
terminal/                     GNOME Terminal 标题栏模板及原模板许可
styles/                       16px 紧凑米黄色标题栏、顶栏配色参考
examples/                     空数据和可移植配置示例
tools/                        安装/恢复、离线检查和源码打包
tests/                        桌面效果与安装器回归
docs/                         发布、排查和结构说明
```

## 灵动岛与通知

`extension.js` 注册原生 `PanelMenu.Button`，只把功能正文放在 overlay；不修改顶栏高度或工作区域。普通时钟通过一次软隐藏接替，停用时恢复原来的可见状态。

`notificationService.js` 长期订阅 Source 的 `notification-added` 和 `notification-show`。同一通知共享 ID，计数只增加一次；历史 UI 按需构建，更新合并到 idle。通知短预览由 `islandState.js` 维护单个可取消的 5 秒超时。

v10 的 `NativeBannerSuppressor` 使用 GNOME 3.36 `MessageTray._sources` 中的原始 `showId`，通过 GObject 精确阻塞该 handler。灵动岛自己的信号订阅继续工作，通知保持在 Source 历史里；额外的声音 handler 保留策略允许的声音。Source 动态加入/移除和 disable 时配对释放，不关闭全局 `show-banners`，不修改应用通知偏好。已有横幅通过 Shell 正常清理关闭，已有队列会清空。

这依赖 Shell 私有 API，所以支持范围明确限制为 3.36。API 不匹配时扩展会报告错误并执行清理，恢复原始通知，而不是静默丢弃通知。普通与紧急通知均使用灵动岛入口；锁屏与免打扰行为沿用灵动岛现有隐私状态机。

`mediaService.js` 通过本地 D-Bus MPRIS 接口与已核验身份的 Bilibili 桌面客户端连接；不读取浏览器标签或网页 API。麦克风 helper 仅在有效外部录音会话、默认输入匹配且未锁屏时开启 GStreamer 内存峰值采样，不保存声音。

## 卡片与活动区

Desktop Effects 通过三个精确窗口标题识别自己的窗口：`ClaudeDesktop-System`、`ClaudeDesktop-Processes`、`Desktop_Interactive_Widgets`。保留原 pivot、旋转、可见性和不透明度；不处理普通应用窗口。

窗口围绕右侧边缘侧斜，轮询间隔为 80ms；先检查桌面焦点，才允许鼠标区域触发翻正。切换到应用立即清除旧悬停等待。GNOME Desktop Icons 的 Shell 焦点和便签编辑窗口也有对应判断。

未选中活动区中，Conky 的 desktop 窗口隐藏，GTK utility 窗口还会最小化，避免不可见输入区域挡住点击。v3 附加持久的零不透明度及同步可见性/不透明度事件保护，防止 Mutter 在活动区切换后重新显示窗口造成闪现。回到允许的活动区及停用时恢复原状态。

`sidebarWorkspaces: null` 表示全部活动区，`[2]` 表示仅第 2 个，`[]` 表示全部隐藏。按当前编号匹配，活动区重新排序后规则也按新编号解释。

## 壁纸、终端与颜色

壁纸在活动区切换后通过 `org.gnome.desktop.background picture-uri` 更新，配置中保存本地图片 URI。此实现不替换 GNOME 概览的背景模型，因此不承诺概览各缩略图同时显示不同壁纸。

终端标题栏采用用户级 `G_RESOURCE_OVERLAYS` 覆盖 GNOME Terminal 的 `headerbar.ui`。关闭 `has-subtitle` 并绑定自定义标题，绕开 GTK3 内部隐藏的副标题尺寸测量盒；单独缩小文字不足以减小标题栏。模板属性必须在子节点之前，否则 GtkBuilder 可能忽略属性。

系统二进制保持原样。已有终端服务已加载资源时，新开窗口仍可能沿用旧模板，直到服务自然退出并重新启动。模板针对本机 GNOME Terminal 3.36 资源路径，其他版本需要重新适配。

## 安装和进程管理

安装器先在内存中构建所有目标文件，严格编译 schema，再在用户桌面确认环境并禁用这两项扩展。备份逐个记录已有文件、符号链接及原本不存在的路径；失败时回退已写入的文件。已有待办、速记和壁纸设置不覆盖。

`widget_service.py` 使用锁避免重复启动，按同一用户下精确脚本/配置参数识别自己的进程；不会执行 `killall conky`。后台日志集中保存，stop 只发送 SIGTERM，不强制结束无关进程。

## 已知适配项

- Conky 的宽度、偏移、字体来自高分屏布局；低分辨率或不同缩放需要调整 `system.conf`、`processes.conf`。
- GPU 采集针对 NVIDIA `nvidia-smi`；无 NVIDIA 的设备可能显示默认值。CPU 温度只检查 `coretemp`，不支持的机器会回退到默认温度值，不能将其当作实测。
- 多显示器、不同主题、第三方动画扩展可能影响卡片位置与动画，需要实机检查。
- 两个自定义扩展同时修改顶栏和背景，但没有替换窗口管理器或 shell。升级 Shell 主版本后应先停用并重新适配。
