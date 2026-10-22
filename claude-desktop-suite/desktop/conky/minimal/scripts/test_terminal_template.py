#!/usr/bin/python3
"""Test the real GtkBuilder property ordering and binding without a display."""
import copy
import os
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import GObject, Gtk


class HeaderProbe(GObject.Object, Gtk.Buildable):
    __gtype_name__ = 'ClaudeHeaderTemplateProbe'
    has_subtitle = GObject.Property(type=bool, default=True)
    title = GObject.Property(type=str, default='')

    def do_add_child(self, builder, child, child_type):
        if child_type == 'title':
            self.custom_title = child


class TitleProbe(GObject.Object):
    __gtype_name__ = 'ClaudeHeaderTitleProbe'
    label = GObject.Property(type=str, default='')


class TemplateTests(unittest.TestCase):
    def test_builder_order_and_dynamic_binding(self):
        path = Path(os.environ.get('CLAUDE_HEADER_TEMPLATE',
                    str(Path.home() / '.local/state/claude-desktop/terminal-ui/headerbar.ui')))
        template = ET.fromstring(path.read_text()).find('template')
        document = ET.Element('interface')
        root = ET.SubElement(document, 'object', {'class': 'ClaudeHeaderTemplateProbe',
                                                 'id': 'TerminalHeaderbar'})
        for item in template:
            if item.tag == 'property' and item.get('name') == 'has-subtitle':
                root.append(copy.deepcopy(item))
            elif item.tag == 'child':
                child = ET.SubElement(root, 'child', dict(item.attrib))
                if item.get('type') == 'title':
                    label = ET.SubElement(child, 'object', {'class': 'ClaudeHeaderTitleProbe',
                                                            'id': 'compact_title'})
                    prop = item.find("object/property[@name='label']")
                    label.append(copy.deepcopy(prop))
                else:
                    ET.SubElement(child, 'object', {'class': 'GObject'})
        builder = Gtk.Builder()
        builder.add_from_string(ET.tostring(document, encoding='unicode'))
        header = builder.get_object('TerminalHeaderbar')
        self.assertFalse(header.props.has_subtitle)
        self.assertEqual(header.custom_title, builder.get_object('compact_title'))
        for title in ('终端标题', 'updated title'):
            header.props.title = title
            self.assertEqual(header.custom_title.props.label, title)

    def test_reproduces_original_ordering_failure(self):
        builder = Gtk.Builder()
        builder.add_from_string('''<interface>
          <object class="ClaudeHeaderTemplateProbe" id="header">
            <child><object class="GObject"/></child>
            <property name="has-subtitle">False</property>
          </object>
        </interface>''')
        # GTK ignores the late property: this is the exact failure we fixed.
        self.assertTrue(builder.get_object('header').props.has_subtitle)


if __name__ == '__main__':
    unittest.main()
