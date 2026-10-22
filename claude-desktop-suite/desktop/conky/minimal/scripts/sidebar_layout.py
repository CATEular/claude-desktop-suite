"""Position the GTK cards in the same column as the existing Conky widgets."""
import re
from pathlib import Path


def column_settings(config_path, scale):
    config = Path(config_path).read_text()
    def number(key, fallback):
        match = re.search(r'\b' + key + r'\s*=\s*(\d+)', config)
        return int(match.group(1)) if match else fallback
    return round(number('maximum_width', 700) / scale), round(number('gap_x', 70) / scale)


def card_bounds(geometry, workarea, scale, requested_width, right_gap, height):
    """All rectangles and results use GTK application pixels, including origins."""
    gx, gy, gw, gh = geometry
    wx, wy, ww, wh = workarea
    width = max(1, min(requested_width, ww - min(2 * right_gap, ww // 5)))
    x = max(wx, min(gx + gw - right_gap - width, wx + ww - width))
    # Keep the current order: system, processes, then the two cards.
    preferred_y = gy + round(gh * 0.625)
    bottom = wy + wh - max(12, round(24 / scale))
    y = max(wy, min(preferred_y, bottom - height))
    return x, y, width, max(48, (bottom - y - 170) // 2)
