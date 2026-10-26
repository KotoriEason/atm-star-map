"""Verify the exact release archive and optionally extract it without overwriting files."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def verify(archive_path, destination=None):
    checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    expected = archive_path.with_suffix('.zip.sha256').read_text(encoding='utf-8').split()[0]
    if checksum != expected:
        raise ValueError('ZIP checksum mismatch')
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        prefix = names[0].split('/')[0] + '/'
        records = json.loads(archive.read(prefix + 'files.sha256.json'))
        expected_names = {prefix + name for name in records} | {prefix + 'files.sha256.json'}
        if set(names) != expected_names or len(names) != len(set(names)):
            raise ValueError('Archive entries do not match the file manifest')
        for required in ['Start.cmd', '启动ATM星图.cmd', '使用说明.txt', 'runtime/node.exe', 'server/server.mjs', 'app/index.html', 'app/catalog/manifest.json', 'licenses/Node.js-LICENSE.txt', 'release.json']:
            if prefix + required not in names:
                raise ValueError('Missing required file: ' + required)
        if destination:
            destination = destination.resolve()
            extracted = destination / prefix.rstrip('/')
            if extracted.exists():
                raise ValueError('Extraction destination already exists; refusing to overwrite')
        for name in names:
            relative = name[len(prefix):]
            parts = relative.split('/')
            if not name.startswith(prefix) or any(part in ('', '.', '..', '.git', 'node_modules', '.openai') or part.startswith('.env') for part in parts) or '\\' in name or ':' in name:
                raise ValueError('Unexpected or unsafe archive path: ' + name)
            body = archive.read(name)
            if relative in records:
                record = records[relative]
                if len(body) != record['bytes'] or hashlib.sha256(body).hexdigest() != record['sha256']:
                    raise ValueError('File checksum mismatch: ' + name)
        # Validate the whole archive before creating any runnable extracted files.
        if destination:
            extracted.mkdir(parents=True, exist_ok=False)
            for name in names:
                target = (destination / name).resolve()
                if not target.is_relative_to(destination):
                    raise ValueError('Unsafe extraction target')
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as file:
                    file.write(archive.read(name))
        release = json.loads(archive.read(prefix + 'release.json'))
    return {'archive': str(archive_path.resolve()), 'sha256': checksum, 'verifiedFiles': len(records), 'zipEntries': len(names), 'extractedRoot': str(extracted) if destination else None, 'release': release}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--extract', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = verify(args.archive, args.extract)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(text + '\n', encoding='utf-8')
    print(text)
