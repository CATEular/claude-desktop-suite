"""Exercise install/restore against temporary home directories, without a session."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('suite_manager', ROOT / 'tools/manage.py')
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


class InstallerTests(unittest.TestCase):
    def test_fresh_install_and_restore_preserves_new_notes(self):
        with tempfile.TemporaryDirectory(prefix='suite-home-') as temporary:
            home = Path(temporary)
            plan = manager.build_plan(home, home)
            self.assertFalse(list(home.iterdir()), 'planning must not write to home')
            backup = manager.write_plan(home, plan)
            config = json.loads((home / '.config/claude-desktop-effects/settings.json').read_text())
            self.assertEqual(config['sidebarWorkspaces'], [2])
            self.assertTrue((home / '.local/share/gnome-shell/extensions/claude-desktop-effects@local/logic.js').is_file())
            self.assertIn(str(home), (home / '.config/systemd/user/gnome-terminal-server.service.d/claude-header.conf').read_text())
            self.assertNotIn('@DATA_MOUNT@', (home / '.config/conky/minimal/system.conf').read_text())
            notes = home / '.config/conky/minimal/data/notes.json'
            notes.write_text('[{"key":"keep", "val":"my new note"}]')
            manager.restore_files(home, backup)
            self.assertTrue(notes.is_file(), 'restore must retain notes created after installation')
            self.assertEqual(json.loads(notes.read_text())[0]['key'], 'keep')
            self.assertFalse((home / '.local/bin/desktop-effects').exists())

    def test_existing_data_css_and_permissions_roundtrip(self):
        with tempfile.TemporaryDirectory(prefix='suite-home-') as temporary:
            home = Path(temporary)
            relative = '.config/gtk-3.0/gtk.css'
            css = home / relative
            css.parent.mkdir(parents=True)
            css.write_text('/* my preexisting CSS */\n')
            css.chmod(0o600)
            data = home / '.config/conky/minimal/data/todo.json'
            data.parent.mkdir(parents=True)
            data.write_text('[{"text":"keep", "done":false}]')
            config = home / '.config/claude-desktop-effects/settings.json'
            config.parent.mkdir(parents=True)
            config.write_text('{"wallpapers":["file:///existing.jpg"], "sidebarWorkspaces":[1,3]}')
            original = {path: path.read_bytes() for path in (css, data, config)}
            plan = manager.build_plan(home, home)
            backup = manager.write_plan(home, plan)
            self.assertEqual(data.read_bytes(), original[data])
            self.assertEqual(config.read_bytes(), original[config])
            # Repeated planning does not duplicate the managed CSS block.
            again = manager.build_plan(home, home)
            self.assertEqual(again[relative]['data'].decode().count(manager.STYLE_BEGIN), 1)
            manager.restore_files(home, backup)
            for path in original:
                self.assertEqual(path.read_bytes(), original[path])
            self.assertEqual(css.stat().st_mode & 0o777, 0o600)

    def test_rejects_escape_and_restores_internal_symlink(self):
        with tempfile.TemporaryDirectory(prefix='suite-home-') as temporary:
            home = Path(temporary)
            with self.assertRaises(ValueError):
                manager.safe_target(home, '../outside')
            target = home / 'original'
            target.write_text('original')
            link = home / 'link'
            link.symlink_to(target)
            backup = manager.write_plan(home, {'link': {'data': b'new', 'mode': 0o644}})
            self.assertFalse(link.is_symlink())
            self.assertEqual(target.read_text(), 'original')
            manager.restore_files(home, backup)
            self.assertTrue(link.is_symlink())
            self.assertEqual(link.read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
