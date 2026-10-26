# 中文名与物品图标

资源固定为 ATM10 8.3 / Minecraft 1.21.1。客户端包提供 KubeJS 资源覆盖，官方 ServerFiles-8.3.zip（CurseForge 文件 9190182）提供同版模组 JAR，Mojang 官方客户端和语言资源提供原版图标与中文名。下载 URL 与哈希见 `data/game-asset-sources.json`；逐 JAR SHA-256、逐物品资源路径见 `data/item-presentation.json`。

## 覆盖范围

原版首批 1,040 个身份的中文与真实图标全部保持（原有 trapped_soul 缺失提示保留）。本轮原生配方扩展后目录共有 16,397 个身份：14,032 个真实资源图标、1,591 个标签代表图标，以及 774 个明确缺失图标的身份。新增基础标识中有 1,978 个尚无可靠中文译文，以「待译名」显示英文原名；不把它们计作已经翻译。

Productive Trees 木种和神秘农业作物等动态名称使用同版中文词表组合。Chipped 部分装饰变种保留英文变种修饰词。所有缺失项与生成原因记录在 `data/item-presentation.json`。标签的成员现已从锁定版本资源递归解析，但运行时仍可能被修改；图标只表示成员或标签，不保证唯一性。

图标是本地、自包含 SVG，内嵌原始 PNG，或依据原始 JSON、OBJ、Gecko、Java 定义模型生成静态预览。特殊模型参数保存在 `data/java-item-models.json`，少量明确资源映射保存在 `data/icon-model-overrides.json`。动画取静态帧；游戏渲染器、着色器和全部运行时状态不作完整模拟。附魔效果由站点叠加。贴图与模型版权归各自作者所有。

## 重新生成

需要 Python 3.11+ 和 Node.js；资源生成仅用 Python 标准库，不启动游戏或执行下载的模组代码。额外资源首次下载约 1.3 GB，原始文件保存在被 Git 忽略的 `data/upstream/`。

```powershell
python scripts/fetch-data.py
npm run data:build
npm run assets:fetch
npm run assets:build
npm run test:assets
npm run assets:verify
```

`assets:verify` 检查所有中文名、图标文件和 SVG 安全边界，并与首次发布的配方和物品身份指纹对比。只增补展示元数据，数据集 ID、物品组件身份、配方及数量保持一致，因此已有进度和分享快照可继续使用。
