import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('offline_package', ROOT / 'scripts/build-offline.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)
verify_spec = importlib.util.spec_from_file_location('verify_offline', ROOT / 'scripts/verify-offline-release.py')
verifier = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verifier)


class OfflinePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='atm-package-')
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / 'app'
        (self.app / 'catalog').mkdir(parents=True)
        (self.app / 'item-icons').mkdir()
        (self.app / 'assets').mkdir()
        (self.app / 'index.html').write_text('<html><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css"></html>', encoding='utf-8')
        (self.app / 'assets/main.js').write_text('console.log("offline")', encoding='utf-8')
        (self.app / 'assets/main.css').write_text('body{font-family:system-ui}', encoding='utf-8')
        (self.app / 'item-icons/icon.svg').write_text('<svg/>', encoding='utf-8')

        def chunk(value):
            body = json.dumps(value).encode()
            name = hashlib.sha256(body).hexdigest()[:24] + '.json'
            (self.app / 'catalog' / name).write_bytes(body)
            return name

        self.item_file = chunk({'item:test': {'icon': '/item-icons/icon.svg'}})
        self.manifest = {'baseFile': chunk({'id': 'fixture'}), 'items': [self.item_file], 'recipes': [chunk([])], 'itemCount': 1, 'recipeCount': 0}
        (self.app / 'catalog/manifest.json').write_text(json.dumps(self.manifest), encoding='utf-8')

    def test_accepts_complete_self_contained_bundle(self):
        info = package.validate_app(self.app)
        self.assertEqual(info['itemCount'], 1)
        self.assertEqual(info['recipeCount'], 0)

    def test_refuses_missing_or_tampered_recipe_shards(self):
        (self.app / 'catalog' / self.item_file).write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '校验|hash'):
            package.validate_app(self.app)
        (self.app / 'catalog' / self.item_file).unlink()
        with self.assertRaisesRegex(ValueError, '缺少|missing'):
            package.validate_app(self.app)

    def test_refuses_missing_item_icons(self):
        (self.app / 'item-icons/icon.svg').unlink()
        with self.assertRaisesRegex(ValueError, '图标|icon'):
            package.validate_app(self.app)

    def test_refuses_external_stylesheets_and_css_fonts(self):
        css = self.app / 'assets/main.css'
        for text in ['@import url("https://fonts.googleapis.com/a");', '@font-face{src:url(//cdn.example/font.woff2)}']:
            css.write_text(text, encoding='utf-8')
            with self.assertRaisesRegex(ValueError, '外部|external'):
                package.validate_app(self.app)
        css.write_text('', encoding='utf-8')
        (self.app / 'index.html').write_text('<script src="https://cdn.example/app.js"></script>', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '外部|external'):
            package.validate_app(self.app)

    def test_refuses_corrupt_runtime_before_extracting_or_running_it(self):
        path = Path(self.temp.name) / 'bad.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('node.exe', b'MZ-unverified')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            package.read_runtime(path)

    def test_detects_item_count_inconsistency(self):
        self.manifest['itemCount'] = 2
        (self.app / 'catalog/manifest.json').write_text(json.dumps(self.manifest), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '数量|count'):
            package.validate_app(self.app)

    def test_real_zip_contains_launchers_runtime_licenses_and_verifiable_file_manifest(self):
        # The large official binary is checked by read_runtime and release acceptance.
        # Replace only that external artifact and license collection; run the real builder.
        runtime_files = {'runtime/node.exe': b'MZ-test-runtime', 'licenses/Node.js-LICENSE.txt': b'fixture-node-license'}
        with patch.object(package, 'read_runtime', return_value=runtime_files), patch.object(package, 'third_party_notices', return_value={'licenses/web/example/LICENSE': b'fixture-license'}):
            result = package.build_release(self.app, Path('fixture-runtime.zip'), Path(self.temp.name) / 'output', '1.0.0-test')
        archive_path = Path(result['archive'])
        folder = 'ATM-Star-Map-8.3-Offline-v1.0.0-test/'
        with zipfile.ZipFile(archive_path) as archive:
            names = set(archive.namelist())
            for name in ['Start.cmd', '启动ATM星图.cmd', 'runtime/node.exe', 'server/server.mjs', 'app/index.html', 'app/catalog/manifest.json', 'licenses/Node.js-LICENSE.txt', 'licenses/web/example/LICENSE', 'release.json', 'files.sha256.json']:
                self.assertIn(folder + name, names)
            records = json.loads(archive.read(folder + 'files.sha256.json'))
            for name, record in records.items():
                body = archive.read(folder + name)
                self.assertEqual(hashlib.sha256(body).hexdigest(), record['sha256'])
                self.assertEqual(len(body), record['bytes'])
            self.assertEqual(archive.read(folder + 'runtime/node.exe'), b'MZ-test-runtime')
        checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        self.assertEqual(archive_path.with_suffix('.zip.sha256').read_text().split()[0], checksum)
        verified = verifier.verify(archive_path, Path(self.temp.name) / '解压 路径')
        self.assertEqual(verified['sha256'], checksum)
        self.assertTrue((Path(verified['extractedRoot']) / 'Start.cmd').is_file())
        corrupt = Path(self.temp.name) / 'corrupt.zip'
        with zipfile.ZipFile(archive_path) as original, zipfile.ZipFile(corrupt, 'w') as target:
            for name in original.namelist():
                body = original.read(name)
                target.writestr(name, b'tampered' if name == folder + 'app/assets/main.js' else body)
        corrupt.with_suffix('.zip.sha256').write_text(hashlib.sha256(corrupt.read_bytes()).hexdigest())
        rejected_destination = Path(self.temp.name) / 'rejected'
        with self.assertRaisesRegex(ValueError, 'File checksum'):
            verifier.verify(corrupt, rejected_destination)
        self.assertFalse((rejected_destination / folder.rstrip('/')).exists(), 'A rejected archive must not leave a runnable partial app')
        archive_path.with_suffix('.zip.sha256').write_text('0' * 64)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            verifier.verify(archive_path)


if __name__ == '__main__':
    unittest.main()
