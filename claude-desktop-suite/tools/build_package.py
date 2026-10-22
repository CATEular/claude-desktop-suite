#!/usr/bin/python3
"""Build a source-only ZIP and SHA-256 checksums from this repository."""
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.0'


def source_files():
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or any(part in ('.git', '__pycache__', 'dist', '.venv') for part in path.relative_to(ROOT).parts):
            continue
        if path.name == 'gschemas.compiled' or path.suffix in ('.pyc', '.zip', '.log'):
            continue
        yield path


def main():
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    archive = dist / f'claude-desktop-suite-v{VERSION}.zip'
    epoch = int(os.environ.get('SOURCE_DATE_EPOCH', '1792627200'))
    timestamp = datetime.fromtimestamp(epoch, timezone.utc).timetuple()[:6]
    manifest = []
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in source_files():
            relative = path.relative_to(ROOT).as_posix()
            data = path.read_bytes()
            manifest.append(hashlib.sha256(data).hexdigest() + '  ' + relative)
            info = zipfile.ZipInfo('claude-desktop-suite/' + relative, timestamp)
            info.create_system = 3
            executable = path.suffix == '.sh' or relative.startswith('tools/') and path.suffix == '.py'
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(info, data)
        info = zipfile.ZipInfo('claude-desktop-suite/MANIFEST.sha256', timestamp)
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(info, '\n'.join(manifest) + '\n')
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / (archive.name + '.sha256')).write_text(checksum + '  ' + archive.name + '\n')
    with zipfile.ZipFile(archive) as output:
        assert output.testzip() is None
        assert not any('/.git/' in name or '__pycache__' in name or name.endswith('.pyc') for name in output.namelist())
    print(archive)
    print(f'{len(manifest)} source files; {archive.stat().st_size} bytes; SHA256 {checksum}')


if __name__ == '__main__':
    main()
