#!/usr/bin/python3
"""Measure GNOME Terminal's installed headerbar template in an invisible test window."""
import json
import argparse
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--patched', action='store_true')
    parser.add_argument('--require-short', action='store_true')
    parser.add_argument('--max-height', type=int, default=20)
    args = parser.parse_args()
    if not Gtk.init_check()[0]:
        print('当前环境没有可用显示，未测量标题栏实际高度。')
        return 77
    server = next((p for p in (Path('/usr/libexec/gnome-terminal-server'),
                               Path('/usr/lib/gnome-terminal/gnome-terminal-server')) if p.exists()), None)
    if server is None:
        print('未找到已安装的 GNOME Terminal 模板，未测量。')
        return 77
    if args.patched:
        markup = (Path.home() / '.local/state/claude-desktop/terminal-ui/headerbar.ui').read_text()
    else:
        markup = subprocess.check_output(['gresource', 'extract', str(server),
                                         '/org/gnome/terminal/ui/headerbar.ui'], text=True)
    document = ET.fromstring(markup)
    template = document.find('template')
    template.tag = 'object'
    template.attrib = {'class': 'GtkHeaderBar', 'id': 'TerminalHeaderbar'}
    # The temporary model has no terminal actions; leave real terminals untouched.
    for element in template.iter():
        for prop in list(element):
            if prop.tag == 'property' and prop.get('name') in ('action-name', 'action-target'):
                element.remove(prop)
    builder = Gtk.Builder()
    builder.add_from_string(ET.tostring(document, encoding='unicode'))
    header = builder.get_object('TerminalHeaderbar')
    header.set_title('终端标题栏高度测试')
    if args.patched:
        if header.get_has_subtitle():
            raise RuntimeError('模板仍在预留副标题高度，请检查模板属性是否位于所有 child 之前。')
        custom_title = header.get_custom_title()
        if custom_title is None or custom_title != builder.get_object('compact_title'):
            raise RuntimeError('未加载自定义标题控件。')
        if custom_title.get_text() != '终端标题栏高度测试':
            raise RuntimeError('自定义标题未正确绑定标题属性。')
        header.set_title('动态标题绑定检查')
        if custom_title.get_text() != '动态标题绑定检查':
            raise RuntimeError('动态标题更新检查未通过。')
    window = Gtk.Window()
    window.get_style_context().add_class('terminal-window')
    window.get_style_context().add_class('background')
    window.set_skip_taskbar_hint(True)
    window.set_skip_pager_hint(True)
    window.set_accept_focus(False)
    window.set_focus_on_map(False)
    window.set_opacity(0)
    window.set_titlebar(header)
    window.set_default_size(600, 100)
    window.add(Gtk.DrawingArea())
    try:
        window.show_all()
        deadline = time.monotonic() + 0.3
        while time.monotonic() < deadline:
            while Gtk.events_pending() and time.monotonic() < deadline:
                Gtk.main_iteration_do(False)
            time.sleep(0.005)
        measurements = []
        def record(widget):
            minimum, natural = widget.get_preferred_height()
            context = widget.get_style_context()
            margin = context.get_margin(Gtk.StateFlags.NORMAL)
            measurements.append({'type': type(widget).__name__, 'classes': context.list_classes(),
                                 'minimum': minimum, 'natural': natural,
                                 'allocated_height': widget.get_allocated_height(),
                                 'margin_top': margin.top, 'margin_bottom': margin.bottom})
            if isinstance(widget, Gtk.Container):
                widget.forall(record)
        record(header)
        state = Path.home() / '.local/state/claude-desktop'
        state.mkdir(parents=True, exist_ok=True)
        filename = 'header-measurement-patched.json' if args.patched else 'header-measurement.json'
        (state / filename).write_text(json.dumps(measurements, indent=2))
        logical = header.get_allocated_height()
        print(f'按本机终端模板测得测试标题栏高度：{logical} 逻辑像素'
              f'（{logical * window.get_scale_factor()} 渲染像素）。')
        if logical > args.max_height:
            print(f'测量超过 {args.max_height}px，控件尺寸明细已保存到 ' + str(state / filename))
            if args.require_short:
                return 1
    finally:
        window.destroy()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        import sys
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
