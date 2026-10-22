# 手动发布到 GitHub

建议新建公开仓库，名称 `claude-desktop-suite`。下面的网页操作不需要 SSH 密钥，也不需要把 GitHub Token 发给任何人。

## 1. 新建公开仓库

1. 登录 GitHub，打开右上角 **+ → New repository**。
2. 仓库名填 `claude-desktop-suite`，选择 **Public**。
3. 描述可填：`Claude-inspired desktop suite for GNOME 3.36 / X11: native island, glass notes, workspace wallpapers and compact terminal styling.`
4. 勾选初始化 README，方便下一步使用上传菜单；后续上传本项目 README 时替换它即可。
5. 点击 **Create repository**。

## 2. 上传可浏览的源码

1. 解压 `claude-desktop-suite-v1.0.0.zip`。
2. 在仓库页面选择 **Add file → Upload files**。
3. 打开解压后的 `claude-desktop-suite` 文件夹，把**里面**的文件和文件夹拖入上传区。不要再套一层同名目录。
4. GitHub 根目录应直接看到 `README.md`、`extensions/`、`desktop/`、`tools/`、`docs/` 等。
5. 如果浏览器限制一次上传的文件数，可分批上传，例如先根目录文档，再 `extensions/cream-island@local`，最后其他目录。保留目录结构。
6. 提交说明填写 `Initial release: Claude Desktop Suite 1.0.0`，提交到 `main`。
7. 检查首页 README 是否正常显示，安装和说明链接是否能打开。

只把 ZIP 放进仓库时，GitHub 无法直接浏览其中源码和自动显示项目说明，因此建议源码和发布附件都提供。

GitHub 网页上传说明及限制见 [添加文件的官方指南](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。

## 3. 发布下载包

1. 进入仓库 **Releases → Draft a new release**。
2. 新建标签 `v1.0.0`，目标分支选择 `main`。
3. 标题填 `Claude Desktop Suite v1.0.0`。
4. 把 `dist/claude-desktop-suite-v1.0.0.zip` 和同目录的 `.sha256` 文件拖到附件区域。
5. 说明可复制下面这一段，最后点击 **Publish release**。

```markdown
GNOME Shell 3.36 / X11 桌面定制套件，包含 Cream Island v10 和 Desktop Effects v3。

- 灵动岛接管通知提示，消除 GNOME 原始横幅重复弹出；保留通知历史、声音和免打扰，停用后恢复原生横幅。
- 米白玻璃待办与速记、Conky 系统及进程状态卡片。
- 仅桌面获得焦点时悬停翻正；可指定活动区显示卡片，切换时防闪现。
- 活动区独立壁纸、Claude 橙色顶栏悬停、米黄色紧凑终端标题栏、20% 终端透明度及米棕色 Dock。
- 提供安装、回退、配置、离线测试和完整中文说明。

支持 Ubuntu 20.04 / GNOME Shell 3.36 / X11。其他 Shell 版本及 Wayland 未支持。
安装前请阅读首页 README。WhiteSur、壁纸图片和个人笔记不包含在包内。
```

标签、附件和发布操作见 [GitHub Release 官方指南](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

## 用 Git 上传源码（可选）

如果已经安装并登录 GitHub CLI，可以在项目根目录运行以下命令。`gh auth login` 的登录流程在你的终端/浏览器完成。

```bash
gh auth login
git init -b main
git add .
git commit -m "Initial release: Claude Desktop Suite 1.0.0"
gh repo create claude-desktop-suite --public --source=. --remote=origin --push
gh release create v1.0.0 \
  dist/claude-desktop-suite-v1.0.0.zip \
  dist/claude-desktop-suite-v1.0.0.zip.sha256 \
  --title "Claude Desktop Suite v1.0.0" \
  --notes-file docs/RELEASE_NOTES.md
```

Ubuntu 20.04 的旧 Git 若不支持 `git init -b main`，改用 `git init`，完成首个提交后运行 `git branch -M main`。Git 若提示身份未配置，在**当前仓库**设置你自己的提交姓名与 GitHub 隐私邮箱后重试；不必修改全局设置。

## 发布前核对

- `bash tools/check.sh` 通过。
- `python3 tools/build_package.py` 生成最新 ZIP。
- ZIP 里不含个人待办、速记、账号信息、真实壁纸、缓存和日志。
- 首页写明 GNOME 3.36 / X11 限制，未宣称支持其他环境。
- README 链接、第三方来源与终端模板的许可证说明已保留。
- 确认公开发布的授权范围符合你的意愿；原创部分尚未附加通用开源许可证，第三方模板保留原有 GPL 条款。
