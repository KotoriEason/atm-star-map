# 发布后续离线版本

普通用户的固定下载入口是 https://github.com/KotoriEason/atm-star-map/releases/latest 。后续版本继续在此仓库发布 Release，无需更换分享入口。

## 本地验证和打包

1. 修改源码，更新 `VERSION`、`CHANGELOG.md`、README 中的当前版本与下载文件名。
2. 安装依赖 `npm ci`，运行 `npm test`、`npm run test:offline` 和 `python -m unittest discover -s tests -p test_offline_package.py`。
3. 运行 `npm run build:offline`。首次打包需把官方 Node ZIP 放入 `data/upstream/offline-runtime/`；版本、URL 和固定摘要在 `scripts/build-offline.py` 中。下载命令见下方。
4. 例如发布下一版：`python scripts/build-offline.py --version 1.0.2`。保持同一固定来源，不自动改变端口或存储方案。
5. 执行 `python scripts/verify-offline-release.py releases/ATM-Star-Map-8.3-Offline-v1.0.2-win-x64.zip`；完整解压并从实际包验收启动、保存恢复和导入导出。

```powershell
New-Item -ItemType Directory -Force data/upstream/offline-runtime | Out-Null
Invoke-WebRequest https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip -OutFile data/upstream/offline-runtime/node-v24.22.1-win-x64.zip
```

构建器验证 Node 官方 ZIP/node.exe 的固定 SHA-256，生成 ZIP、`.zip.sha256`、包内逐文件清单和第三方许可证。不要把 Node 运行环境、ZIP、浏览器数据或原始下载缓存提交到 Git。

## GitHub 发布

使用维护者已登录的 GitHub CLI；先用 `gh api user --jq .login` 确认账号，再提交并推送已验证的源码。以下 1.0.2 是下一版示例；实际版本号、文件名、标签和源码提交必须一致。

```powershell
git add .
git commit -m "Release offline v1.0.2"
git push origin main
git tag v1.0.2
git push origin v1.0.2
gh release create v1.0.2 --repo KotoriEason/atm-star-map --verify-tag --draft --title "ATM 星图 v1.0.2 · Windows x64 离线版" --notes-file release-notes.md
gh release upload v1.0.2 releases/ATM-Star-Map-8.3-Offline-v1.0.2-win-x64.zip releases/ATM-Star-Map-8.3-Offline-v1.0.2-win-x64.zip.sha256 --repo KotoriEason/atm-star-map
gh release edit v1.0.2 --repo KotoriEason/atm-star-map --draft=false --latest
```

`release-notes.md` 应说明用户可见变化、运行要求、更新备份步骤、实际验收和 ZIP 摘要；创建后查看公开页面并重新下载校验附件。先存草稿和上传全部资产，再发布。不要替换已分发版本的文件；修正时使用新版本号。此流程不会自动更新用户电脑上的程序。

## 进度兼容

继续使用 `http://127.0.0.1:43183`；提醒更新前导出 JSON、停止旧窗口、新文件夹解压新版。若变更数据集 ID、存档结构或物品身份，先实现并验证迁移，不能仅修改版本号。
