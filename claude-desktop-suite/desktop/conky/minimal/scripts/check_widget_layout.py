#!/usr/bin/python3
"""Exercise GTK interactions against temporary data before restarting the widgets."""
import json
from pathlib import Path
import tempfile
import time

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk
import interactive_widgets as widgets


def settle():
    deadline = time.monotonic() + 0.18
    while time.monotonic() < deadline:
        while Gtk.events_pending() and time.monotonic() < deadline:
            Gtk.main_iteration_do(False)
        time.sleep(0.005)


def main():
    if not Gtk.init_check()[0]:
        print('No display available for GTK interaction checks.')
        return 77
    with tempfile.TemporaryDirectory(prefix='claude-widget-check-') as temporary:
        for name in ('TODO_JSON', 'NOTES_JSON', 'TODO_TXT', 'NOTES_TXT'):
            setattr(widgets, name, str(Path(temporary) / name.lower()))
        Path(widgets.TODO_JSON).write_text(json.dumps([
            {'text': '待办与很长的文本' * 35, 'done': False}]))
        Path(widgets.NOTES_JSON).write_text(json.dumps([
            {'key': '标题' * 30, 'val': '/a/very/long/command/' * 40 + ' --test'}]))
        provider = Gtk.CssProvider()
        provider.load_from_data(widgets.CSS)
        Gtk.StyleContext.add_provider_for_screen(
            widgets.Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        window = widgets.DesktopWidgetsWindow()
        # Keep this temporary test window invisible and leave the real clipboard alone.
        window.set_opacity(0)
        class Clipboard:
            def set_text(self, value, length):
                pass
        window.clipboard = Clipboard()
        try:
            window.show_all()
            window.todo_entry_box.hide()
            window.notes_entry_box.hide()
            settle()
            baseline = window.get_size()[0]
            widths = [('initial', baseline)]
            def check(name):
                settle()
                width = window.get_size()[0]
                widths.append((name, width))
                assert width == baseline, (name, baseline, width)
            window.copy_note(window.notes[0]['val'])
            check('copy long command')
            window.copy_note(window.notes[0]['val'])
            check('copy repeatedly')
            window.clear_toast()
            check('clear notification')
            window.toggle_todo_input(None)
            window.todo_entry.set_text('new long task ' * 80)
            check('add task input')
            window.on_add_todo(window.todo_entry)
            check('save task')
            window.make_todo_toggle(0)(None)
            check('complete task')
            window.make_start_edit_todo(0)(None)
            check('edit task')
            window.cancel_edit_todo(None)
            window.make_start_edit_note(0)(None)
            check('edit note')
            window.cancel_edit_note(None)
            window.toggle_note_input(None)
            window.notes_entry.set_text('long note: ' + 'content ' * 80)
            check('add note input')
            window.on_add_note(window.notes_entry)
            check('save note')
            print('GTK width checks passed: ' + ', '.join(name for name, _ in widths))
        finally:
            if window._toast_timeout is not None:
                widgets.GLib.source_remove(window._toast_timeout)
            window.destroy()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
