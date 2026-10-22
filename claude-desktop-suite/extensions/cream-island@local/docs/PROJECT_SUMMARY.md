# Cream Island 最终项目总结（v10）

## 当前行为与环境

目标环境是 Ubuntu 20.04、GNOME Shell 3.36.9、X11；开发排查涉及 NVIDIA、St scale factor 2 和文字缩放1.2。这不是对其他 Shell 版本或 Wayland 的兼容承诺。UUID `cream-island@local` 和 schema ID 保持不变。

静默顶栏显示等宽、对称的 `HH ● mm`。悬停一次显示全部8个功能图标；普通预览不构建重页面，点击具体图标才打开正文。图标点击区属于原生顶栏分配，外部点击、Esc 或关闭正文会收起工具栏。活动/功能使用时隐藏普通时钟；麦克风活动且未预览/展开时，右侧显示固定宽 `HH:MM`，共享系统时钟更新，不增加轮询或每分钟重新布局。倒计时运行/暂停时保留固定数字读数。

8个功能为计时器、本地媒体、通知、工作区、壁纸、电源、控制中心、应用启动器，另有麦克风录音状态与真实输入峰值。日历和功能概览界面已移除，历史笔记数据没有删除。正文使用480逻辑像素目标高度并受屏幕约束，页面内容滚动；导航与正文缓存保留。

## 实际架构

| 模块 | 职责 |
| --- | --- |
| `extension.js` | enable/disable生命周期、原生状态区注册、共享时钟与服务接线、锁屏隐私、单次软隐藏并恢复原时钟 |
| `capsule.js`、`dockController.js`、`layout.js` | 顶栏内容、目标宽去重、真实点击区分配、仅背景动画、单位与屏幕边界 |
| `panel.js`、`pageFlow.js` | 固定正文视口、8页导航、缓存页面、一次modal键盘抓取、外点/Esc、可取消构页及清理 |
| `islandState.js`、`runtime.js` | 通知/媒体/展开优先级、单个5秒通知超时、隐私、值去重和single-idle合并 |
| `mediaService.js`、`mediaView.js` | 事件驱动MPRIS、异步owner/PID核验、失效属性与迟到结果防护；仅可见媒体页低频读取Position |
| `notificationService.js`、`notificationCenterView.js` | 长期源信号订阅、通知去重、可见历史刷新与录音状态区 |
| `micService.js`、`pulseSessions.js`、`microphone_level.py` | Gvc候选事件、pactl订阅/查询、Corked/Mute及默认输入匹配、helper生命周期、真实峰值 |
| `timerService.js`、`timerView.js`、`storage.js` | 倒计时持久化、仅活动tick、可见Cairo进度环、笔记/计时数据 |
| `batch.js` 及各功能View | 列表每批最多6项，壁纸异步每批读24条；完成后的缓存页避免重复重建 |
| `config.js`、`appearance.js`、`prefs.js` | 一次性历史设置迁移、外观设置、偏好界面 |

顶栏通过 `Main.panel.addToStatusArea` 挂载 PanelMenu.Button 的container；只有功能正文使用overlay，不增高原顶栏或修改workarea。动画不缩放文字、不逐帧改祖先宽度。面板是不透明底色、细边高光和单层暗影，不是真背景折射或液态玻璃；没有 BlurEffect、shader、全屏截图采样。

## 已确认缺陷与教训

- 原生挂载必须遵循container所有权，不能重复parent；enable失败需清理后重新抛错，不能假装已启用。Mutter6没有 `Clutter.Point`，使用真实API验证过的 `set_pivot_point`。
- JS actor stage单位与已缩放CSS自然尺寸不能重复混用。固定小外框、放大的padding和多列内容曾造成上下/水平裁切；仅检查文字省略标记不能证明垂直可见。CSS类名不一致也曾导致主题规则未应用。
- v7沿用 `height > 0`，可能将仅标题的自然高度当成整个正文高度，后续继续锁死。生产回归以初始height96、scale2证明现实现请求960的明确视口；缓存重开重新呈现正文。
- 单纯把重工作包进idle不等于消除主线程工作。现实现移除切页时的整树preferred-height遍历，列表分批、可见才刷新、缓存完成不重建，并保留实际同步构页毫秒诊断。没有实机帧率或延迟改善数据。
- 所有异步结果必须受epoch/销毁状态约束；查询单飞加一次重查、5秒超时，订阅失败后拒绝迟到结果。helper的自身事件不能触发失败重启风暴。
- 录音流存在不等于正在录音，Gvc `is_running` 也不能当录音真相。实际条件是默认输入设备上外部source-output未Corked、未Mute；锁屏、错误或订阅中断fail closed。helper自流 `cream-island-level@local` 必须排除。

## 数据与权限边界

媒体仅接本地 `io.github.msojocs.bilibili.desktop`，先验证unique owner的PID与程序身份，再读取MPRIS。没有B站网页/HTTP API、浏览器标签或浏览器媒体元数据读取、封面下载、网页桥或NativeMessaging部署。客户端若仍错误上报Playing和旧metadata，不能仅凭MPRIS证明视频已关闭；脱敏诊断提供协议状态而不输出标题/URL。

麦克风峰值是默认输入设备的真实内存采样，不是按应用独立电平；不保存音频。只有有效外部运行录音会话且未锁屏时启动GStreamer helper，停止/锁屏/disable时取消读取并终止helper。无数据明确为电平不可用，不以随机动画冒充声音振幅。

安装器在用户普通桌面终端执行，先确认会话及禁用旧版，再备份到扩展扫描目录外；默认不自动启用。卸载器保留对旧Chrome NativeHost单个配置文件的针对性迁移清理，不代表当前部署浏览器桥。卸载保留 `~/.local/share/cream-island` 数据；本次整理没有访问或删除这些用户数据。

## 验证和维护

`bash tests/run_all_tests.sh` 执行当前JS/Python/shell语法、metadata、严格schema编译、Mutter6/Gvc实际GI接口、生产入口清理、布局、状态机、服务异步边界、真实Capsule→PageFlow→Panel接线、存储/计时/MPRIS、mic协议与生命周期，以及生产GStreamer NULL构建和合成0/0.2/0.5峰值回归。合成测试不打开实际麦克风；Python语法在内存编译，运行测试禁写字节码。

`bash build_package.sh` 只生成 `cream-island-v10-notifications.zip`，包含运行文件、两个只读/峰值脚本、安装/卸载器和当前文档。`python3 scripts/capture_performance.py --seconds 5` 为只读采样，100% CPU定义为占满一个核心，输出脱敏计数；无Shell/DBus时明确不可用。真实Shell渲染、X11交互、实际输入设备、CPU与点击延迟仍需用户桌面验证，离线测试不能替代。

## v10 通知行为

`NativeBannerSuppressor` 根据本机 GNOME 3.36 MessageTray 的 `_sources` / `showId`，用 GObject 精确阻塞原始通知横幅的 source handler。灵动岛自己的订阅、通知历史和策略允许的通知声音继续工作；全局免打扰设置不改写。新通知源自动接管，移除通知源或停用时配对释放。已显示横幅通过 Shell 正常清理关闭，旧队列清空且通知留在 Source 历史中。

实际 GObject 回归覆盖现有/新加入通知源、1000次重复更新、历史保留、声音、免打扰和停用恢复；也验证不会解除其他组件已有的信号阻塞。测试不连接实际通知总线。v10 修改的是运行代码和对应文档，不再沿用 v9 代码冻结声明。
