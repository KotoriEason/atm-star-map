"""Package a prebuilt app and a verified official runtime; no third-party Python packages."""
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NODE_VERSION = '24.22.1'
NODE_ARCHIVE = 'node-v24.22.1-win-x64.zip'
NODE_SHA256 = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
NODE_EXE_SHA256 = 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'
NODE_URL = 'https://nodejs.org/dist/v24.22.1/' + NODE_ARCHIVE


def sha256(body):
    return hashlib.sha256(body).hexdigest()


def read_runtime(path):
    if sha256(path.read_bytes()) != NODE_SHA256:
        raise ValueError('Node.js 官方运行环境 SHA-256 校验失败；拒绝打包。')
    with zipfile.ZipFile(path) as archive:
        prefix = f'node-v{NODE_VERSION}-win-x64/'
        exe = archive.read(prefix + 'node.exe')
        license_text = archive.read(prefix + 'LICENSE')
    if sha256(exe) != NODE_EXE_SHA256 or not exe.startswith(b'MZ'):
        raise ValueError('Node.js 可执行文件 SHA-256 校验失败。')
    return {'runtime/node.exe': exe, 'licenses/Node.js-LICENSE.txt': license_text}


def public_file(app, url):
    if not url.startswith('/') or url.startswith('//') or '\\' in url or any(part in ('.', '..') for part in url.split('/')):
        raise ValueError('外部或无效资源 external resource: ' + url)
    path = (app / url.lstrip('/')).resolve()
    if not path.is_relative_to(app.resolve()) or not path.is_file():
        raise ValueError('缺少本地资源 missing resource: ' + url)
    return path


class ResourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('script', 'img', 'source', 'iframe') and values.get('src'):
            self.urls.append(values['src'])
        if tag == 'link' and values.get('rel') in ('stylesheet', 'icon', 'modulepreload', 'preload'):
            self.urls.append(values.get('href', ''))


def validate_app(app):
    manifest_path = app / 'catalog/manifest.json'
    if not manifest_path.is_file() or not (app / 'index.html').is_file():
        raise ValueError('缺少离线构建 missing app: run npm run build:offline first')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    names = [manifest['baseFile'], *manifest['items'], *manifest['recipes']]
    values = []
    for name in names:
        if not re.fullmatch(r'[a-f0-9]{24}\.json', name):
            raise ValueError('配方索引文件名无效。')
        path = app / 'catalog' / name
        if not path.is_file():
            raise ValueError('缺少配方分片 missing shard: ' + name)
        body = path.read_bytes()
        if not sha256(body).startswith(name[:24]):
            raise ValueError('配方分片 hash 校验失败: ' + name)
        values.append(json.loads(body))
    items = {}
    for part in values[1:1 + len(manifest['items'])]:
        items.update(part)
    recipes = [r for part in values[1 + len(manifest['items']):] for r in part]
    if len(items) != manifest['itemCount'] or len(recipes) != manifest['recipeCount']:
        raise ValueError('配方或物品数量 count 不一致。')
    for item in items.values():
        if item.get('icon'):
            try:
                public_file(app, item['icon'])
            except ValueError as error:
                raise ValueError('物品图标 icon 缺失或不是本地资源: ' + item['icon']) from error
    html = ResourceParser()
    html.feed((app / 'index.html').read_text(encoding='utf-8'))
    for url in html.urls:
        public_file(app, url)
    for css in app.rglob('*.css'):
        text = css.read_text(encoding='utf-8')
        if re.search(r'(?:@import\s*(?:url\()?|url\()\s*[\'\"]?(?:https?:|//)', text, re.I):
            raise ValueError('CSS 仍加载外部 external 字体或样式: ' + css.name)
    return {'itemCount': len(items), 'recipeCount': len(recipes), 'datasetId': values[0]['id']}


def third_party_notices():
    output = {}
    lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
    packages = []
    for path, metadata in lock['packages'].items():
        if not path or metadata.get('dev') or not path.startswith('node_modules/'):
            continue
        directory = ROOT / path
        package_json = json.loads((directory / 'package.json').read_text(encoding='utf-8'))
        name, version = package_json['name'], package_json['version']
        packages.append({'name': name, 'version': version, 'license': metadata.get('license', package_json.get('license', 'See included license'))})
        licenses = [p for p in directory.iterdir() if p.is_file() and re.match(r'licen[sc]e(?:\.|$)', p.name, re.I)]
        if not licenses:
            raise ValueError('缺少前端依赖许可证: ' + name)
        for file in licenses:
            output[f'licenses/web/{name.replace("/", "_")}/{file.name}'] = file.read_bytes()
    output['licenses/web-packages.json'] = json.dumps(packages, ensure_ascii=False, indent=2).encode('utf-8')
    return output


def build_release(app, runtime, output, version):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version):
        raise ValueError('版本号无效。')
    print('Validating local catalog, icons and resources...', file=sys.stderr, flush=True)
    info = validate_app(app)
    print('Verifying official runtime and collecting licenses...', file=sys.stderr, flush=True)
    extra = read_runtime(runtime)
    extra.update(third_party_notices())
    extra['server/server.mjs'] = (ROOT / 'offline/server.mjs').read_bytes()
    launcher = (ROOT / 'offline/start.cmd').read_text(encoding='utf-8').replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8')
    extra['启动ATM星图.cmd'] = launcher
    extra['Start.cmd'] = launcher
    extra['使用说明.txt'] = (ROOT / 'offline/README.txt').read_bytes()
    extra['licenses/物品资源来源.md'] = (ROOT / 'docs/item-resources.md').read_bytes()
    extra['licenses/配方数据核验.md'] = (ROOT / 'docs/data-verification.md').read_bytes()
    extra['第三方资源说明.txt'] = ('本程序不包含完整游戏、整合包或模组 JAR。物品图标与翻译归各自作者所有，仅用于识别配方。来源见 licenses/物品资源来源.md。\n前端依赖许可证及 Node.js 许可证见 licenses/。运行环境来源：' + NODE_URL + '\nSHA-256: ' + NODE_SHA256 + '\n').encode('utf-8')

    print('Indexing app files...', file=sys.stderr, flush=True)
    files = {f'app/{path.relative_to(app).as_posix()}': path for path in sorted(app.rglob('*')) if path.is_file()}
    records = {}
    for index, (name, path) in enumerate(files.items()):
        if index % 2000 == 0:
            print(f'Hashing app files {index}/{len(files)}...', file=sys.stderr, flush=True)
        if path.is_symlink() or not path.resolve().is_relative_to(app.resolve()):
            raise ValueError('构建目录不能含外部链接。')
        body = path.read_bytes()
        records[name] = {'sha256': sha256(body), 'bytes': len(body)}
    for name, body in extra.items():
        records[name] = {'sha256': sha256(body), 'bytes': len(body)}
    build_id = sha256(json.dumps(records, sort_keys=True).encode())
    release = {'app': 'atm-star-map-offline', 'protocol': 1, 'version': version, 'buildId': build_id, 'dataset': 'ATM10 8.3', 'catalog': info, 'origin': 'http://127.0.0.1:43183', 'platform': 'win32-x64', 'nodeVersion': NODE_VERSION, 'runtimeSource': NODE_URL, 'runtimeArchiveSha256': NODE_SHA256, 'createdAt': datetime.now(timezone.utc).isoformat()}
    extra['release.json'] = json.dumps(release, ensure_ascii=False, indent=2).encode('utf-8')
    records['release.json'] = {'sha256': sha256(extra['release.json']), 'bytes': len(extra['release.json'])}
    extra['files.sha256.json'] = json.dumps(records, ensure_ascii=False, indent=2).encode('utf-8')

    output.mkdir(parents=True, exist_ok=True)
    folder = f'ATM-Star-Map-8.3-Offline-v{version}'
    target = output / (folder + '-win-x64.zip')
    if target.exists():
        raise ValueError('交付包已存在；请使用新的版本号，避免覆盖已验收文件。')
    print('Writing ZIP...', file=sys.stderr, flush=True)
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, path in files.items():
            archive.write(path, folder + '/' + name)
        for name, body in extra.items():
            archive.writestr(folder + '/' + name, body)
    checksum = sha256(target.read_bytes())
    target.with_suffix('.zip.sha256').write_text(checksum + '  ' + target.name + '\n', encoding='utf-8')
    return {'archive': str(target.resolve()), 'sha256': checksum, 'bytes': target.stat().st_size, 'fileCount': len(files) + len(extra), 'release': release}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, default=ROOT / 'dist-offline')
    parser.add_argument('--runtime', type=Path, default=ROOT / 'data/upstream/offline-runtime' / NODE_ARCHIVE)
    parser.add_argument('--output', type=Path, default=ROOT / 'releases')
    parser.add_argument('--version', default='1.0.1')
    args = parser.parse_args()
    result = build_release(args.app, args.runtime, args.output, args.version)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
