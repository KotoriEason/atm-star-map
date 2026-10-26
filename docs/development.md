# 源码开发与数据构建

请在仓库根目录执行下列命令。普通使用者只需下载 Releases 中的离线 ZIP。

## 本地运行

普通 Windows 用户请从 [GitHub Releases](https://github.com/KotoriEason/atm-star-map/releases/latest) 下载 x64 离线 ZIP；开发者也可使用本地 `releases/` 中生成的包：完整解压，双击“启动ATM星图.cmd”。内置官方 Node.js 运行环境，固定打开 `http://127.0.0.1:43183`，无需安装开发工具或联网。进度仍在当前浏览器中，跨在线/离线版迁移使用 JSON 导出和导入。详见 [离线版说明](../offline/README.txt)。

开发者构建离线发行包（Python 仅用于构建机）：

```powershell
npm run test:offline
python -m unittest discover -s tests -p test_offline_package.py
npm test
npm run build:offline
# 将官方 Node v24.22.1 Windows x64 ZIP 放入 data/upstream/offline-runtime/
# https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip
# 构建器会核对固定的官方 ZIP 和 node.exe SHA-256，并附带许可证。
npm run package:offline
python scripts/verify-offline-release.py releases/ATM-Star-Map-8.3-Offline-v1.0.1-win-x64.zip
```

打包器不会覆盖已存在的发行 ZIP；后续版本使用 `python scripts/build-offline.py --version 1.0.2`。本地服务只读且仅监听回环地址；端口冲突会提示处理，避免自动换端口导致浏览器进度看似丢失。发行包内的 `files.sha256.json` 和旁附 ZIP 校验文件可核对完整性。

源码开发要求 Node.js 22.12+ 和 npm；当前开发机为 24.18，离线包内置的独立运行环境为 24.22.1。

```powershell
npm ci
npm run dev
```

生产构建输出到 `dist/`，可部署至支持 HTTPS 的静态网站托管服务。

```powershell
npm test
npm run data:verify
npm run build
npm run preview
```

## 真实数据和边界

数据来自官方 ATM10 8.3 发布包（CurseForge 9190157）及其 manifest 锁定的 AllTheCompressed 4.4.0（7361502）。源文件哈希、路径、行号保存在数据集中。验证报告见 [docs/data-verification.md](data-verification.md)。

这不是完整游戏运行时导出。未收录的模组原生配方、动态调整、标签成员、工具合成余物和获取方式需要在游戏内 JEI 核验。未解析的表达式明确记录，不自动猜测。中文名优先采用对应版本语言文件，缺少的译名由项目补充；图标来自固定版本游戏贴图与模型。资源来源、覆盖范围和复现方式见 [docs/item-resources.md](item-resources.md)。

重新生成数据需要 Python 3.11+，将下载约 206 MB 的固定官方输入。下载和解压不会运行模组或 KubeJS 脚本；原始输入被 Git 忽略，不随站点发布。

```powershell
python scripts/fetch-data.py
npm run data:build
npm run data:verify
```

## 进度语义

- 每个项目的已拥有数量独立，不跨项目共享。
- 同一物品在一个目标的已展开分支间按数量分配，优先预留较浅层需求；额外计算一个隐藏层用于直接材料就绪检查。
- 带不同数据组件的物品分别记账。
- 已拥有中间产物替代其对应上游需求；原料齐全只标记可制作。
- “确认制作”扣除所消耗的直接材料，并记录完整批次的产出；不消耗显式声明的催化剂。
- “标记已有”和数量输入表示手动校正当前持有量，不代替确认制作动作。
- 就绪度是各类直接材料完成比例的平均值，不代表游戏耗时或工作量。
- 循环路线停止自动展开；最多展开 64 层、3,000 个需求节点，过大分支可新建为目标。

## 保存与分享

数据保存在当前网站来源的 IndexedDB。不同浏览器、设备、域名和端口不会自动共享存档。导出全部存档可备份、迁移；导入会追加独立副本，保留原有目标。

分享快照在 URL 的 `#s=` 片段内，包含当前目标的数量、路线、持有量和备注，不包含其他项目。打开后只读，复制后继续编辑自己的进度。快照较大时使用 JSON 文件分享。快照不提供实时协作或云同步。

## 代码结构

- `scripts/`：固定输入获取、只读 AST 解析、数据生成与验证。
- `src/domain/`：数量分配、项目校验、制作记账、分享编码。
- `src/storage.ts`：校验后串行写入 IndexedDB。
- `src/components/`：地图、物品详情、目标与分享对话框。
- `tests/`：核心逻辑回归测试和浏览器导入样本。

本站与 ATMTeam、Minecraft 或相关模组作者无关联。模组名称、翻译、贴图与模型归各自作者所有；图标仅用于识别配方物品，保留资源来源。不分发完整整合包、游戏客户端或模组 JAR。

## 原生配方扩展与游戏文件导入

现已扫描约 8 万份原生配方资源，目录包含约 2.2 万条制作/操作/标签路线、1,552 个递归材料标签和 2,570 类获取来源。范围是现有收录物品沿全部已支持路线构成的依赖闭包，不等于全部模组运行时 RecipeManager。条件未知、概率、多产物、逐刻化学品消耗及手工操作禁止自动确认制作。详细来源及未解析项见 `data/native-expansion-report.json`。

从「从游戏存档识别进度」选择单个 `level.dat` 或玩家 `.dat`，可本地识别背包、末影箱和标准内嵌容器。预览后追加独立的 ATM 之星目标，不覆盖现有目标。位置和限制见 [导入说明](minecraft-save-import.md)。

```powershell
npm run assets:fetch
npm run data:expand
npm run assets:build
npm run test:native
python scripts/verify-expansion.py
npm run assets:verify
npm test
npm run build
```

新增大目录以内容哈希 JSON 分片加载，每片小于 8 MB；配方数量增加不会生成单个巨大的 JavaScript 文件。未收录/尚未解决的节点继续标注待核验，不把它们当作基础材料。部分新增译名和动态模型仍待补齐，详见资源报告。
