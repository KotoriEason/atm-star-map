# ATM10 8.3 数据验证记录

验证日期：2026-10-25。验证层级为发布包和模组文件的静态核对，未声称游戏运行时已核验。

## 固定输入

| 输入 | 官方来源 | SHA-256 |
| --- | --- | --- |
| All the Mods 10-8.3.zip | https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190157 | `24440fb355de69b28af6ff18556b5d0598bb93570b2b745552cdb1bcb5448c8f` |
| allthecompressed-1.21.1-4.4.0.jar | https://www.curseforge.com/minecraft/mc-mods/allthecompressed/files/7361502 | `d1b0c1135d8c206b8f18c73afa08256c74f8b9504626f90e2a64614c92163c36` |

发布包 manifest：All the Mods 10 / 8.3 / Minecraft 1.21.1 / neoforge-21.1.259。AllTheCompressed 的 projectID 514045、fileID 7361502 与同一 manifest 匹配。

## ATM 之星主路线

来源：发布包 `overrides/kubejs/server_scripts/modpack/runic_multis/recipes/star_altar.js`，第 33 行开始。设备 `modern_industrialization:star_altar`，配方参数 2048 / 200，产出 `allthetweaks:atm_star` ×1。

| 直接材料 | 数量 |
| --- | ---: |
| `allthemodium:unobtainium_allthemodium_alloy_block` | 28 |
| `allthecompressed:nether_star_block_3x` | 15 |
| `allthemodium:unobtainium_vibranium_alloy_block`，附魔耐久 I 且带 Awakened 自定义名称 | 2 |
| `allthetweaks:oblivion_shard` | 1 |
| `mysticalagradditions:creative_essence` | 1 |
| `allthetweaks:nexium_emitter` | 1 |
| `allthetweaks:withers_compass` | 1 |
| `allthetweaks:improbable_probability_device` | 1 |
| `allthetweaks:dragon_soul` | 1 |
| `allthetweaks:philosophers_fuel` | 1 |
| `allthetweaks:pulsating_black_hole` | 1 |
| `allthetweaks:dimensional_seed` | 1 |
| `allthetweaks:patrick_star` | 1 |

另有源脚本中的碎片/注魔派大星路线，独立列为备选，不与主路线材料混合。

## 解析与覆盖

扫描 174 个 server_scripts 文件。生成 556 条已解析配方、1,040 个不同物品身份；303 个不能可靠求值的表达式保存在 `data/extraction-report.json`。覆盖工作台有序/无序配方、部分 Create 自定义合成、符文机器链、已核对的合金辅助函数，以及 7 类压缩材料的 1–9 重原生压缩配方。

解析器读取 AST，不运行下载的 JavaScript。只有已证明的模组存在条件才能取真；未知条件跳过并报告。未显式指定 ID 的配方使用本地来源 ID，详情面板明确区分。物品组件原文保留在身份 key 中。

原生压缩配方直接从固定 JAR 的 JSON 读取。例如三重压缩下界之星块需要 9 个二重块，继续向下是 9 个一重块，再到 9 个 `allthetweaks:nether_star_block`。基础星块本身未在当前数据中展开，不编造其配方。

## 尚未核验

- 未启动完整 8.3 实例，未导出服务器最终 RecipeManager 或 JEI 客户端特殊配方。
- 模组原生配方只导入所述压缩系列；其他未收录来源明确显示待核验。
- 部分脚本移除、替换、动态条件、标签成员和物品自带 crafting remainder 仍可能影响最终结果。
- 掉落、世界生成、Boss 条件和概率产出未作全量导入。
- 静态配方声明不等同于整合包最终运行时可用性证明。

## 可复现检查

`npm run data:verify` 检查所有已保留源文件 SHA-256、固定主路线数量、组件身份、引用和正数数量，并把发布包重新解析后的主配方与交付数据对照。源输入不存在时，只运行已交付数据的结构与固定事实检查，并明确打印该限制。

## 中文与图标资源

显示名现已优先采用 8.3 对应游戏语言资源，缺失译名补译；图标来自同版原始贴图或模型的静态预览。覆盖 1,040 个物品身份，其中 985 个实际资源图标、54 个材料标签代表图标、1 个明确缺失。来源与局限见 [item-resources.md](item-resources.md)。此展示更新没有扩大配方核验范围。

## 原生扩展（本轮）

扫描有效配方资源约 80,818 份；当前交付 22,512 条唯一制作/标签/操作路线、16,397 个物品身份、1,552 个递归标签、2,570 类获取来源。可解析的包内移除规则排除了 438 个候选输出；104 个脚本表达式仍未解析，原生类型与条件的未解析明细见 `data/native-expansion-report.json`。这些数目包含标签选择和手册前置操作，不等于完整运行时配方覆盖。

`python scripts/verify-expansion.py` 从对应 JAR/发布包重新读取每个交付来源并核对字节哈希；生成的标签与世界生成汇总单独标识。基础材料定义为已找到采集、掉落或明确手册操作的节点，未解决节点继续标记待核验。

图谱按展开分支计算额外一个隐藏层，不预先展开整张庞大依赖图；深度上限增至 64，单次计划最多 3,000 节点。大师灌注水晶的无限复用语义由本版 MasterInfusionCrystalItem 继承的 BaseReusableItem(0) 证实；旧配方 ID 和原始记录保持原样，规划层据此处理催化剂。
