#!/usr/bin/env bash
set -e

UUID="cream-island@local"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCHEMA_FILE="$HOME/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.cream-island.gschema.xml"
SCHEMA_DIR="$HOME/.local/share/glib-2.0/schemas"
NATIVE_HOST_FILE="$HOME/.config/google-chrome/NativeMessagingHosts/org.cream_island.bilibili.json"

echo "=== Cream Island 卸载程序 ==="

# 1. 禁用扩展
if command -v gnome-extensions >/dev/null 2>&1; then
    echo "正在禁用扩展..."
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

# 2. 移除扩展目录
if [ -d "$EXT_DIR" ]; then
    echo "正在移除扩展目录: $EXT_DIR..."
    rm -rf "$EXT_DIR"
fi

# 3. 移除 schema
if [ -f "$SCHEMA_FILE" ]; then
    echo "正在移除 GSettings Schema..."
    rm -f "$SCHEMA_FILE"
    glib-compile-schemas "$SCHEMA_DIR" 2>/dev/null || true
fi

# 4. 移除 Chrome Native Messaging 配置文件
if [ -f "$NATIVE_HOST_FILE" ]; then
    echo "正在移除 Chrome Native Messaging 桥接配置..."
    rm -f "$NATIVE_HOST_FILE"
fi

echo ""
echo "=========================================================="
echo "✓ Cream Island 已成功卸载。"
echo "  用户备忘录与计时器数据已保留在: $HOME/.local/share/cream-island"
echo "  如需彻底清除用户数据，可手动执行: rm -rf $HOME/.local/share/cream-island"
echo "=========================================================="
