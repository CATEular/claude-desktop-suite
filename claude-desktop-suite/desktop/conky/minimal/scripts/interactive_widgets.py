#!/usr/bin/env python3
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib, Pango
import json
import os
from pathlib import Path
from sidebar_layout import card_bounds, column_settings

DATA_DIR = os.path.expanduser("~/.config/conky/minimal/data")
TODO_JSON = os.path.join(DATA_DIR, "todo.json")
NOTES_JSON = os.path.join(DATA_DIR, "notes.json")
TODO_TXT = os.path.join(DATA_DIR, "todo.txt")
NOTES_TXT = os.path.join(DATA_DIR, "notes.txt")

os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_TODOS = []
DEFAULT_NOTES = []

CSS = Path(__file__).with_name("claude-glass.css").read_bytes()

def esc(text):
    return GLib.markup_escape_text(str(text))

class DesktopWidgetsWindow(Gtk.Window):
    def __init__(self, width=350):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.set_title("Desktop_Interactive_Widgets")
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)
        self.set_decorated(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.stick()

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.set_visual(visual)
        self.set_app_paintable(True)

        self.target_w = width
        self._layout_pending = False
        self._fixed_width = None
        self._toast_timeout = None
        self.set_resizable(False)

        self.editing_todo_idx = None
        self.editing_note_idx = None

        self.todos = self.load_todos()
        self.notes = self.load_notes()
        self.clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)

        # Root container
        self.root_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        # Reserve space for the soft shadows inside the transparent window.
        self.root_box.set_margin_top(8)
        self.root_box.set_margin_bottom(12)
        self.root_box.set_margin_start(8)
        self.root_box.set_margin_end(8)
        self.root_box.set_size_request(width, -1)
        self.set_default_size(width + 16, -1)
        self.add(self.root_box)

        # ------------------- 1. TODO SECTION -------------------
        self.todo_container = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.todo_container.get_style_context().add_class("glass-card")
        self.root_box.pack_start(self.todo_container, False, False, 0)

        # Header
        header_todo = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        title_todo = Gtk.Label(label="TODO LIST")
        title_todo.get_style_context().add_class("widget-title")
        header_todo.pack_start(title_todo, False, False, 0)

        self.todo_count_label = Gtk.Label()
        self.todo_count_label.get_style_context().add_class("widget-sub")
        header_todo.pack_end(self.todo_count_label, False, False, 0)

        btn_add_todo = Gtk.Button(label="+")
        btn_add_todo.get_style_context().add_class("header-btn")
        btn_add_todo.set_tooltip_text("添加新待办")
        btn_add_todo.connect("clicked", self.toggle_todo_input)
        header_todo.pack_end(btn_add_todo, False, False, 0)

        self.todo_container.pack_start(header_todo, False, False, 0)

        # Divider
        div_todo = Gtk.Box()
        div_todo.get_style_context().add_class("divider")
        self.todo_container.pack_start(div_todo, False, False, 0)

        # Scrolled Window for TODOs
        self.todo_scroller = Gtk.ScrolledWindow()
        self.todo_scroller.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.AUTOMATIC)
        self.todo_scroller.set_propagate_natural_width(False)
        self.todo_scroller.set_max_content_height(160)
        self.todo_scroller.set_propagate_natural_height(True)
        self.todo_items_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=1)
        self.todo_scroller.add(self.todo_items_box)
        self.todo_container.pack_start(self.todo_scroller, False, False, 0)

        # Add Input Box
        self.todo_entry_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        self.todo_entry = Gtk.Entry()
        self.todo_entry.set_width_chars(1)
        self.todo_entry.set_placeholder_text("➕ 输入新待办，按回车添加...")
        self.todo_entry.get_style_context().add_class("custom-entry")
        self.todo_entry.connect("activate", self.on_add_todo)
        self.todo_entry_box.pack_start(self.todo_entry, True, True, 0)
        self.todo_container.pack_start(self.todo_entry_box, False, False, 0)

        # ------------------- 2. NOTES SECTION -------------------
        self.notes_container = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.notes_container.get_style_context().add_class("glass-card")
        self.root_box.pack_start(self.notes_container, False, False, 0)

        # Header
        header_notes = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        title_notes = Gtk.Label(label="QUICK NOTES")
        title_notes.get_style_context().add_class("widget-title")
        header_notes.pack_start(title_notes, False, False, 0)

        self.notes_count_label = Gtk.Label()
        self.notes_count_label.set_ellipsize(Pango.EllipsizeMode.END)
        self.notes_count_label.set_max_width_chars(10)
        self.notes_count_label.get_style_context().add_class("widget-sub")
        header_notes.pack_end(self.notes_count_label, False, False, 0)

        btn_add_note = Gtk.Button(label="+")
        btn_add_note.get_style_context().add_class("header-btn")
        btn_add_note.set_tooltip_text("添加桌面备忘速记")
        btn_add_note.connect("clicked", self.toggle_note_input)
        header_notes.pack_end(btn_add_note, False, False, 0)

        self.notes_container.pack_start(header_notes, False, False, 0)

        # Divider
        div_notes = Gtk.Box()
        div_notes.get_style_context().add_class("divider")
        self.notes_container.pack_start(div_notes, False, False, 0)

        # Scrolled Window for Notes
        self.notes_scroller = Gtk.ScrolledWindow()
        self.notes_scroller.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.AUTOMATIC)
        self.notes_scroller.set_propagate_natural_width(False)
        self.notes_scroller.set_max_content_height(160)
        self.notes_scroller.set_propagate_natural_height(True)
        self.notes_items_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=1)
        self.notes_scroller.add(self.notes_items_box)
        self.notes_container.pack_start(self.notes_scroller, False, False, 0)

        # Add Input Box
        self.notes_entry_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        self.notes_entry = Gtk.Entry()
        self.notes_entry.set_width_chars(1)
        self.notes_entry.set_placeholder_text("➕ 格式: 标题: 命令 (如 KiCad: eeschem) 回车...")
        self.notes_entry.get_style_context().add_class("custom-entry")
        self.notes_entry.connect("activate", self.on_add_note)
        self.notes_entry_box.pack_start(self.notes_entry, True, True, 0)
        self.notes_container.pack_start(self.notes_entry_box, False, False, 0)

        # Render data
        self.render_todos()
        self.render_notes()

        self.connect("realize", self.on_realize)
        self.connect("size-allocate", self.queue_layout)
        self.connect("notify::scale-factor", self.queue_layout)
        screen.connect("monitors-changed", self.queue_layout)
        screen.connect("size-changed", self.queue_layout)

    def on_realize(self, widget):
        self.queue_layout()

    def queue_layout(self, *args):
        if not self._layout_pending:
            self._layout_pending = True
            GLib.idle_add(self.relayout)

    def relayout(self):
        self._layout_pending = False
        display = self.get_display()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        if monitor is None:
            return False
        geometry = monitor.get_geometry()
        workarea = monitor.get_workarea()
        scale = max(1, monitor.get_scale_factor())
        config = Path(__file__).resolve().parents[1] / "system.conf"
        width, gap = column_settings(config, scale)
        rect = lambda r: (r.x, r.y, r.width, r.height)
        x, y, width, list_height = card_bounds(
            rect(geometry), rect(workarea), scale, width, gap,
            max(1, self.get_allocated_height()))
        # Card edges match Conky; the eight-pixel shadow gutters sit outside.
        self.root_box.set_size_request(width, -1)
        self.target_w = width
        if self._fixed_width != width:
            hints = Gdk.Geometry()
            hints.min_width = width + 16
            hints.max_width = width + 16
            hints.min_height = 1
            hints.max_height = 32767
            self.set_geometry_hints(None, hints, Gdk.WindowHints.MIN_SIZE | Gdk.WindowHints.MAX_SIZE)
            self._fixed_width = width
        for scroller in (self.todo_scroller, self.notes_scroller):
            maximum = min(160, list_height)
            if scroller.get_max_content_height() != maximum:
                scroller.set_max_content_height(maximum)
        self.move(x - 8, y)
        return False

    # ---------------- Data Load & Save ----------------
    def load_todos(self):
        if os.path.exists(TODO_JSON):
            try:
                with open(TODO_JSON, "r", encoding="utf-8") as f:
                    todos = json.load(f)
                    todos.sort(key=lambda t: t.get("done", False))
                    return todos
            except Exception:
                pass
        return list(DEFAULT_TODOS)

    def save_todos(self):
        # Always sort done items to the end
        self.todos.sort(key=lambda t: t.get("done", False))
        with open(TODO_JSON, "w", encoding="utf-8") as f:
            json.dump(self.todos, f, ensure_ascii=False, indent=2)
        try:
            with open(TODO_TXT, "w", encoding="utf-8") as f:
                for t in self.todos:
                    mark = "[x]" if t["done"] else "[ ]"
                    f.write(f"- {mark} {t['text']}\n")
        except Exception:
            pass

    def load_notes(self):
        if os.path.exists(NOTES_JSON):
            try:
                with open(NOTES_JSON, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return list(DEFAULT_NOTES)

    def save_notes(self):
        with open(NOTES_JSON, "w", encoding="utf-8") as f:
            json.dump(self.notes, f, ensure_ascii=False, indent=2)
        try:
            with open(NOTES_TXT, "w", encoding="utf-8") as f:
                for n in self.notes:
                    f.write(f"• {n['key']}: {n['val']}\n")
        except Exception:
            pass

    # ---------------- TODO Actions ----------------
    def toggle_todo_input(self, btn):
        if self.todo_entry_box.get_visible():
            self.todo_entry_box.hide()
        else:
            self.todo_entry_box.show_all()
            self.todo_entry.grab_focus()

    def on_add_todo(self, entry):
        text = entry.get_text().strip()
        if text:
            # Insert new item at the beginning of pending
            self.todos.insert(0, {"text": text, "done": False})
            self.save_todos()
            entry.set_text("")
            self.render_todos()
            self.todo_entry_box.hide()

    def render_todos(self):
        for c in self.todo_items_box.get_children():
            self.todo_items_box.remove(c)

        done_cnt = sum(1 for t in self.todos if t["done"])
        self.todo_count_label.set_text(f"{done_cnt}/{len(self.todos)} 完成")

        for idx, item in enumerate(self.todos):
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
            row.get_style_context().add_class("todo-row")

            # Check if this row is currently being edited
            if self.editing_todo_idx == idx:
                edit_entry = Gtk.Entry()
                edit_entry.set_width_chars(1)
                edit_entry.set_text(item["text"])
                edit_entry.get_style_context().add_class("inline-edit-entry")
                row.pack_start(edit_entry, True, True, 0)

                btn_save = Gtk.Button(label="✔")
                btn_save.get_style_context().add_class("save-btn")
                btn_save.set_tooltip_text("保存修改 (回车)")
                btn_save.connect("clicked", self.make_save_todo(idx, edit_entry))
                row.pack_end(btn_save, False, False, 0)

                btn_cancel = Gtk.Button(label="✕")
                btn_cancel.get_style_context().add_class("cancel-btn")
                btn_cancel.set_tooltip_text("取消编辑 (Esc)")
                btn_cancel.connect("clicked", self.cancel_edit_todo)
                row.pack_end(btn_cancel, False, False, 0)

                edit_entry.connect("activate", lambda e: self.make_save_todo(idx, edit_entry)(None))
                self.todo_items_box.pack_start(row, False, False, 0)
                continue

            # Checkbox Button (Green checkmark for done!)
            btn_check = Gtk.Button()
            btn_check.get_style_context().add_class("check-btn")
            lbl_check = Gtk.Label()
            if item["done"]:
                lbl_check.set_markup('<span color="#50603C" font_weight="bold" font_size="13000">✔</span>')
            else:
                lbl_check.set_markup('<span color="#A65438" font_weight="bold" font_size="13000">☐</span>')
            btn_check.add(lbl_check)
            btn_check.connect("clicked", self.make_todo_toggle(idx))
            row.pack_start(btn_check, False, False, 0)

            # Clickable Text Label
            ev = Gtk.EventBox()
            ev.set_visible_window(False)
            lbl_text = Gtk.Label()
            lbl_text.set_xalign(0)
            lbl_text.set_ellipsize(Pango.EllipsizeMode.END)
            lbl_text.set_width_chars(1)
            ev.set_tooltip_text(item["text"])
            t_escaped = esc(item["text"])
            if item["done"]:
                lbl_text.set_markup(f'<span strikethrough="true" color="#706253" font_size="11500">{t_escaped}</span> <span color="#81715F" font_size="9000">(已完成)</span>')
            else:
                lbl_text.set_markup(f'<span color="#3D342B" font_size="11500">{t_escaped}</span>')
            ev.add(lbl_text)
            ev.connect("button-press-event", self.make_todo_toggle_ev(idx))
            row.pack_start(ev, True, True, 0)

            # Delete button
            btn_del = Gtk.Button(label="×")
            btn_del.get_style_context().add_class("action-btn")
            btn_del.get_style_context().add_class("del-btn")
            btn_del.set_tooltip_text("删除此待办")
            btn_del.connect("clicked", self.make_todo_del(idx))
            row.pack_end(btn_del, False, False, 0)

            # Edit button ✎
            btn_edit = Gtk.Button(label="✎")
            btn_edit.get_style_context().add_class("action-btn")
            btn_edit.set_tooltip_text("编辑此待办")
            btn_edit.connect("clicked", self.make_start_edit_todo(idx))
            row.pack_end(btn_edit, False, False, 0)

            self.todo_items_box.pack_start(row, False, False, 0)

        self.todo_items_box.show_all()

    def make_todo_toggle(self, idx):
        def handler(b):
            self.todos[idx]["done"] = not self.todos[idx]["done"]
            self.save_todos()
            self.render_todos()
        return handler

    def make_todo_toggle_ev(self, idx):
        def handler(w, ev):
            if ev.type == Gdk.EventType.BUTTON_PRESS:
                self.todos[idx]["done"] = not self.todos[idx]["done"]
                self.save_todos()
                self.render_todos()
        return handler

    def make_start_edit_todo(self, idx):
        def handler(b):
            self.editing_todo_idx = idx
            self.render_todos()
        return handler

    def make_save_todo(self, idx, entry):
        def handler(b):
            new_text = entry.get_text().strip()
            if new_text and idx < len(self.todos):
                self.todos[idx]["text"] = new_text
                self.save_todos()
            self.editing_todo_idx = None
            self.render_todos()
        return handler

    def cancel_edit_todo(self, b):
        self.editing_todo_idx = None
        self.render_todos()

    def make_todo_del(self, idx):
        def handler(b):
            if idx < len(self.todos):
                self.todos.pop(idx)
                self.save_todos()
                self.render_todos()
        return handler

    # ---------------- NOTES Actions ----------------
    def toggle_note_input(self, btn):
        if self.notes_entry_box.get_visible():
            self.notes_entry_box.hide()
        else:
            self.notes_entry_box.show_all()
            self.notes_entry.grab_focus()

    def on_add_note(self, entry):
        text = entry.get_text().strip()
        if text:
            if ":" in text or "：" in text:
                sep = ":" if ":" in text else "："
                parts = text.split(sep, 1)
                k = parts[0].strip()
                v = parts[1].strip()
            else:
                k = "备忘"
                v = text
            self.notes.insert(0, {"key": k, "val": v})
            self.save_notes()
            entry.set_text("")
            self.render_notes()
            self.notes_entry_box.hide()

    def show_toast(self, msg):
        # Reuse the count slot instead of adding command text to the header.
        # This keeps clicks from increasing either card's width.
        if self._toast_timeout is not None:
            GLib.source_remove(self._toast_timeout)
        self.notes_count_label.set_text("已复制 ✓")
        self.notes_count_label.set_tooltip_text(msg)
        self._toast_timeout = GLib.timeout_add_seconds(2, self.clear_toast)

    def clear_toast(self):
        self._toast_timeout = None
        self.notes_count_label.set_text(f"{len(self.notes)} 条备忘")
        self.notes_count_label.set_tooltip_text(None)
        return False

    def copy_note(self, val):
        cmd = val.split()[0] if val else ""
        self.clipboard.set_text(cmd, -1)
        self.show_toast(f"已复制: {cmd} ✔")

    def render_notes(self):
        for c in self.notes_items_box.get_children():
            self.notes_items_box.remove(c)

        self.notes_count_label.set_text(f"{len(self.notes)} 条备忘")

        for idx, item in enumerate(self.notes):
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
            row.get_style_context().add_class("note-row")

            # Check if this row is being edited
            if self.editing_note_idx == idx:
                edit_k = Gtk.Entry()
                edit_k.set_text(item["key"])
                edit_k.set_width_chars(5)
                edit_k.get_style_context().add_class("inline-edit-entry")
                row.pack_start(edit_k, False, False, 0)

                sep_lbl = Gtk.Label(label=":")
                sep_lbl.set_markup('<span color="#A65438">:</span>')
                row.pack_start(sep_lbl, False, False, 0)

                edit_v = Gtk.Entry()
                edit_v.set_width_chars(1)
                edit_v.set_text(item["val"])
                edit_v.get_style_context().add_class("inline-edit-entry")
                row.pack_start(edit_v, True, True, 0)

                btn_save = Gtk.Button(label="✔")
                btn_save.get_style_context().add_class("save-btn")
                btn_save.set_tooltip_text("保存 (回车)")
                btn_save.connect("clicked", self.make_save_note(idx, edit_k, edit_v))
                row.pack_end(btn_save, False, False, 0)

                btn_cancel = Gtk.Button(label="✕")
                btn_cancel.get_style_context().add_class("cancel-btn")
                btn_cancel.set_tooltip_text("取消编辑")
                btn_cancel.connect("clicked", self.cancel_edit_note)
                row.pack_end(btn_cancel, False, False, 0)

                edit_v.connect("activate", lambda e: self.make_save_note(idx, edit_k, edit_v)(None))
                self.notes_items_box.pack_start(row, False, False, 0)
                continue

            bullet = Gtk.Label()
            bullet.set_markup('<span color="#A65438" font_weight="bold">•</span>')
            row.pack_start(bullet, False, False, 0)

            # Clickable note label (Click to copy command!)
            ev = Gtk.EventBox()
            ev.set_visible_window(False)
            ev.set_tooltip_text("点击直接复制命令到剪贴板")
            lbl_note = Gtk.Label()
            lbl_note.set_xalign(0)
            lbl_note.set_ellipsize(Pango.EllipsizeMode.END)
            lbl_note.set_width_chars(1)
            ev.set_tooltip_text(f"{item['key']}: {item['val']}\n点击复制完整内容")
            k_esc = esc(item["key"])
            v_esc = esc(item["val"])
            lbl_note.set_markup(f'<span color="#A65438" font_weight="bold">{k_esc}: </span><span color="#3D342B" font_size="11500">{v_esc}</span>')
            ev.add(lbl_note)
            ev.connect("button-press-event", self.make_note_copy_ev(item["val"]))
            row.pack_start(ev, True, True, 0)

            # Delete button
            btn_del = Gtk.Button(label="×")
            btn_del.get_style_context().add_class("action-btn")
            btn_del.get_style_context().add_class("del-btn")
            btn_del.set_tooltip_text("删除此备忘")
            btn_del.connect("clicked", self.make_note_del(idx))
            row.pack_end(btn_del, False, False, 0)

            # Edit button ✎
            btn_edit = Gtk.Button(label="✎")
            btn_edit.get_style_context().add_class("action-btn")
            btn_edit.set_tooltip_text("编辑此备忘")
            btn_edit.connect("clicked", self.make_start_edit_note(idx))
            row.pack_end(btn_edit, False, False, 0)

            # Copy button
            btn_copy = Gtk.Button(label="📋")
            btn_copy.get_style_context().add_class("action-btn")
            btn_copy.set_tooltip_text("复制命令到剪贴板")
            btn_copy.connect("clicked", self.make_note_copy_handler(item["val"]))
            row.pack_end(btn_copy, False, False, 0)

            self.notes_items_box.pack_start(row, False, False, 0)

        self.notes_items_box.show_all()

    def make_note_copy_ev(self, val):
        def handler(w, ev):
            if ev.type == Gdk.EventType.BUTTON_PRESS:
                self.copy_note(val)
        return handler

    def make_note_copy_handler(self, val):
        def handler(b):
            self.copy_note(val)
        return handler

    def make_start_edit_note(self, idx):
        def handler(b):
            self.editing_note_idx = idx
            self.render_notes()
        return handler

    def make_save_note(self, idx, edit_k, edit_v):
        def handler(b):
            k = edit_k.get_text().strip()
            v = edit_v.get_text().strip()
            if k and idx < len(self.notes):
                self.notes[idx]["key"] = k
                self.notes[idx]["val"] = v
                self.save_notes()
            self.editing_note_idx = None
            self.render_notes()
        return handler

    def cancel_edit_note(self, b):
        self.editing_note_idx = None
        self.render_notes()

    def make_note_del(self, idx):
        def handler(b):
            if idx < len(self.notes):
                self.notes.pop(idx)
                self.save_notes()
                self.render_notes()
        return handler

def main():
    screen = Gdk.Screen.get_default()
    provider = Gtk.CssProvider()
    provider.load_from_data(CSS)
    Gtk.StyleContext.add_provider_for_screen(screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    win = DesktopWidgetsWindow()
    win.show_all()
    win.todo_entry_box.hide()
    win.notes_entry_box.hide()
    Gtk.main()

if __name__ == "__main__":
    main()
