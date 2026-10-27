# 原图武器建模与接入

日期：二〇二六年十月二十六日。

已按用户要求直接使用现有原图完成手枪、冲锋枪与火箭炮的 Tripo 建模。其余已有原图的场景、敌人与装备已有 Tripo 模型，本轮复用现成资产，不重复扣费。输入只提取原图主视图并清除轮廓外的标题残片，没有重新生成概念图。

## 交付文件

| 资产 | 原始三角面 | 原始模型 | 可编辑母版 | 实际接入 |
| --- | ---: | --- | --- | --- |
| 手枪 | 109558 | [完整模型](../../assets/models/tripo/raw/pistol-textured-v2.glb) | [母版](../../assets/models/masters/pistol-tripo-v2.blend) | 已替换经典模式的手枪及装备页缩略图 |
| 冲锋枪 | 111658 | [完整模型](../../assets/models/tripo/raw/smg-textured-v2.glb) | [母版](../../assets/models/masters/smg-tripo-v2.blend) | 已替换经典模式的冲锋枪及装备页缩略图 |
| 火箭炮 | 114680 | [完整模型](../../assets/models/tripo/raw/rocket-launcher-textured-v2.glb) | [母版](../../assets/models/masters/rocket-launcher-tripo-v2.blend) | 模型已保存，尚未新增对应玩法 |

三件原始模型均有四千像素颜色、物理材质与法线贴图，已在 Blender 实际导入、检查像素有效性并完成双面渲染。完整模型和母版保留原始表面细节。手枪、冲锋枪游戏副本使用二千像素贴图；部件拆分保持原有表面与纹理坐标，未对主体执行减面。

手枪与冲锋枪的瞄具、枪托和弹匣由原图模型可提取部分加工，原装与升级件互斥显示。冲锋枪前握把继续复用已有免费配件。独立弹匣参与换弹动画。冲锋枪依据新握把位置向身体方向校准持枪距离，程序枪口的前向偏移与高度同步校准。装备预览增加室内环境反射，呈现原图模型的金属层次。

旧手枪、冲锋枪游戏文件和缩略图保留在 assets/models/external/processed/legacy-weapons-v1。主加工脚本检测到原图 Tripo 模型时会调用新流程，避免再次运行时把主体恢复成免费低模。

## 费用

本批三件各五十五积分，共一百六十五积分。项目累计一千三百五十五积分，二千积分预算内余六百四十五积分。网站提交后实际余额八百二十五积分。未充值、未重复提交。任务编号与原始文件摘要见 [项目账本](../../assets/models/tripo/tasks.json) 和 [本批进度](../modeling/weapon-tripo-progress.json)。

## 验收

本轮武器接入的八十八项既有自动测试通过，覆盖三种武器、四十种配件组合、七千六百八十个方向与换弹姿态样本、模块化和全装角色握持、枪口一致性、弹药与战斗回归。新增的材质约束要求手枪、冲锋枪同时保留颜色、物理材质与法线贴图，防止再次退回纯色材质。模块化样本最大左手握点误差约二点九四厘米，低于原有三厘米门槛。收尾时重新执行工作区最新回归，九十七项测试全部通过。

经典模块的隔离 TypeScript 检查与生产构建通过。验证期间另有剧情入口和相关模块正在并行编写，本次未覆盖其改动，也不将这项隔离构建当作完整剧情入口构建验收。验收页面直接启动当前 classic 模块，浏览器在后台运行，没有唤起或聚焦预览面板。

实际浏览器检查了新手枪标准配置、手枪三个兼容配件、冲锋枪四个配件、配置属性更新和实战部署。冲锋枪固定出生点实战约五十秒，观察到击倒十九个敌人、消耗弹药、自动换弹及主动换弹；主动换弹显示“取出弹匣”。手枪另在固定出生点不移动实战五十二秒，击倒十八个敌人后阵亡，证明实际射击链路工作，不将其作为生存平衡或通关验收。本次独立验收页未记录到浏览器警告或错误。

证据保存在 outputs/weapon-tripo-v2：

- [手枪实际装备页](../../outputs/weapon-tripo-v2/pistol-loadout.png)。
- [手枪全部兼容配件](../../outputs/weapon-tripo-v2/pistol-equipped.png)。
- [冲锋枪全部配件](../../outputs/weapon-tripo-v2/smg-equipped.png)。
- [冲锋枪实战换弹](../../outputs/weapon-tripo-v2/smg-combat-reload.png)。
- [Tripo 完成状态](../../outputs/weapon-tripo-v2/tripo-pistol-completed.png)。

可重复执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/inspect-tripo-weapons.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/prepare-tripo-weapons.py
npm test
```

## 审查

VERDICT: PASS

P0/P1 BLOCKERS:

无。已针对源文件替换、贴图依赖、重复扣费、部件互斥、共享模型与材质、角色握点、换弹位移、程序与实际枪口一致性、预览资源释放及加工流程回退进行检查。候选严重问题经反证后，没有发现当前支持范围内成立的阻塞问题。

UNVERIFIED RISKS:

- 尚未验证物理手机表现、长期连续运行和大规模战斗下的新增纹理显存占用。
- 本次没有建立人工制作耗时基线，不宣称达到百分之八十人工节省。
- 并行编写的剧情入口及火箭炮玩法不在本轮游戏验收范围。

NON-BLOCKING FINDINGS:

- 生成模型保留琥珀色装饰颜色，但没有独立发光贴图；近景仍有局部生成表面起伏，不等同于人工逐面重建的完全复刻。
- 前握把继续使用旧免费素材，其细节密度低于新的主体。
