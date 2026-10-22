#!/usr/bin/env bash
set -euo pipefail

UUID="cream-island@local"
SRC_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCHEMA_DIR="$HOME/.local/share/glib-2.0/schemas"

BACKUP_BASE="$HOME/.local/share/cream-island/backups"

echo "=== Cream Island 安装程序 ==="

# Stop an existing loaded version before replacing files. A failed session
# connection is an installation failure, never evidence of a disabled extension.
if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "缺少 gnome-extensions，无法确认扩展已禁用；未修改安装目录。" >&2
    exit 1
fi
if ! gnome-extensions list >/dev/null; then
    echo "无法访问 GNOME 会话，未修改安装目录。" >&2
    exit 1
fi
ENABLED_EXTENSIONS="$(gnome-extensions list --enabled)"
if grep -Fxq "$UUID" <<< "$ENABLED_EXTENSIONS"; then
    gnome-extensions disable "$UUID"
    ENABLED_EXTENSIONS="$(gnome-extensions list --enabled)"
    if grep -Fxq "$UUID" <<< "$ENABLED_EXTENSIONS"; then
        echo "禁用失败，未修改安装目录。" >&2
        exit 1
    fi
fi

# 1. 检查已存在同 UUID 目录并保留备份（存放在扩展扫描目录外部，防止 UUID 不匹配警告）
if [ -d "$EXT_DIR" ]; then
    mkdir -p "$BACKUP_BASE"
    BACKUP_DIR="$BACKUP_BASE/${UUID}.bak.$(date +%Y%m%d_%H%M%S)"
    echo "发现已存在的扩展目录，正在创建安全备份到外部目录: $BACKUP_DIR"
    cp -r "$EXT_DIR" "$BACKUP_DIR"
    rm -rf "$EXT_DIR"
fi

# 2. 安装扩展文件
echo "正在安装扩展文件到 $EXT_DIR..."
mkdir -p "$EXT_DIR"
cp -r "$SRC_DIR/metadata.json" "$EXT_DIR/"
cp -r "$SRC_DIR/extension.js" "$EXT_DIR/"
cp -r "$SRC_DIR/prefs.js" "$EXT_DIR/"
cp -r "$SRC_DIR/stylesheet.css" "$EXT_DIR/"
cp -r "$SRC_DIR/schemas" "$EXT_DIR/"
cp -r "$SRC_DIR/modules" "$EXT_DIR/"
mkdir -p "$EXT_DIR/scripts"
cp "$SRC_DIR/scripts/microphone_level.py" "$EXT_DIR/scripts/"

# 3. 安装并编译 schema
echo "正在安装 GSettings Schema 到 $SCHEMA_DIR..."
mkdir -p "$SCHEMA_DIR"
cp -f "$SRC_DIR/schemas/org.gnome.shell.extensions.cream-island.gschema.xml" "$SCHEMA_DIR/"
glib-compile-schemas "$SCHEMA_DIR"
glib-compile-schemas "$EXT_DIR/schemas"

echo ""
echo "=========================================================="
echo "✓ Cream Island 安装完成（默认未启用）"
echo "=========================================================="
echo "启用命令："
echo "  gnome-extensions enable $UUID"
echo ""
echo "禁用命令："
echo "  gnome-extensions disable $UUID"
echo ""
echo "打开设置："
echo "  gnome-extensions prefs $UUID"
echo ""
echo "注意："
echo "1. 本脚本未自动重启 GNOME Shell，未执行 Alt+F2 r，未自动注销。"
echo "2. 若在 X11 桌面下生效新代码，可在终端运行 gnome-extensions enable $UUID"
echo "   或在 X11 下按 Alt+F2 输入 r 回车重新加载 Shell 后启用。"
echo "3. 媒体控制：仅连接通过 owner PID 验证的本地 Bilibili 桌面客户端 MPRIS。"
