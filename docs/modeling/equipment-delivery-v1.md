# 主角战术装备四视图与三维初稿交付

已使用内置 ImageGen 生成十套独立装备四视图，并通过用户已登录的 Tripo 工作台完成十件模型生成与下载。所有模型均提供带内嵌贴图的原始 GLB、可编辑 Blender 母版及双面预览。靴子、手套和护膝另有三份镜像 GLB。

本次交付为静态建模初稿。一级、二级、三级属于游戏装备美术档位，不代表真实防护认证。“高端装备”是原创外观方向，不声明现实装备性能排名。

## 下载与预览

完整文件包：[装备资源包](../../outputs/equipment-v1/equipment-assets-v1.zip)。文件包保留项目内相对路径。

| 装备 | 四视图 | 带贴图模型 | 可编辑母版 | 双面预览 | 三角面 |
| --- | --- | --- | --- | --- | --- |
| 战术目镜 | [图集](../../assets/concepts/equipment/tactical-goggles-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-goggles-v1.glb) | [Blender](../../assets/models/masters/tactical-goggles-v1.blend) | [正面](../../assets/models/masters/tactical-goggles-v1-front.png) / [背面](../../assets/models/masters/tactical-goggles-v1-back.png) | 37701 |
| 战术背包 | [图集](../../assets/concepts/equipment/tactical-backpack-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-backpack-v1.glb) | [Blender](../../assets/models/masters/tactical-backpack-v1.blend) | [正面](../../assets/models/masters/tactical-backpack-v1-front.png) / [背面](../../assets/models/masters/tactical-backpack-v1-back.png) | 38439 |
| 战术靴 | [图集](../../assets/concepts/equipment/tactical-boot-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-boot-v1.glb) | [Blender](../../assets/models/masters/tactical-boot-v1.blend) | [正面](../../assets/models/masters/tactical-boot-v1-front.png) / [背面](../../assets/models/masters/tactical-boot-v1-back.png) | 38491 |
| 防弹衣一级 | [图集](../../assets/concepts/equipment/body-armor-i-views-v1.png) | [GLB](../../assets/models/tripo/raw/body-armor-i-v1.glb) | [Blender](../../assets/models/masters/body-armor-i-v1.blend) | [正面](../../assets/models/masters/body-armor-i-v1-front.png) / [背面](../../assets/models/masters/body-armor-i-v1-back.png) | 38824 |
| 防弹衣二级 | [图集](../../assets/concepts/equipment/body-armor-ii-views-v1.png) | [GLB](../../assets/models/tripo/raw/body-armor-ii-v1.glb) | [Blender](../../assets/models/masters/body-armor-ii-v1.blend) | [正面](../../assets/models/masters/body-armor-ii-v1-front.png) / [背面](../../assets/models/masters/body-armor-ii-v1-back.png) | 37324 |
| 防弹衣三级 | [图集](../../assets/concepts/equipment/body-armor-iii-views-v1.png) | [GLB](../../assets/models/tripo/raw/body-armor-iii-v1.glb) | [Blender](../../assets/models/masters/body-armor-iii-v1.blend) | [正面](../../assets/models/masters/body-armor-iii-v1-front.png) / [背面](../../assets/models/masters/body-armor-iii-v1-back.png) | 37137 |
| 模块化战术头盔 | [图集](../../assets/concepts/equipment/tactical-helmet-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-helmet-v1.glb) | [Blender](../../assets/models/masters/tactical-helmet-v1.blend) | [正面](../../assets/models/masters/tactical-helmet-v1-front.png) / [背面](../../assets/models/masters/tactical-helmet-v1-back.png) | 38237 |
| 通信耳机 | [图集](../../assets/concepts/equipment/tactical-headset-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-headset-v1.glb) | [Blender](../../assets/models/masters/tactical-headset-v1.blend) | [正面](../../assets/models/masters/tactical-headset-v1-front.png) / [背面](../../assets/models/masters/tactical-headset-v1-back.png) | 38308 |
| 战术手套 | [图集](../../assets/concepts/equipment/tactical-glove-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-glove-v1.glb) | [Blender](../../assets/models/masters/tactical-glove-v1.blend) | [正面](../../assets/models/masters/tactical-glove-v1-front.png) / [背面](../../assets/models/masters/tactical-glove-v1-back.png) | 38574 |
| 战术护膝 | [图集](../../assets/concepts/equipment/tactical-knee-pad-views-v1.png) | [GLB](../../assets/models/tripo/raw/tactical-knee-pad-v1.glb) | [Blender](../../assets/models/masters/tactical-knee-pad-v1.blend) | [正面](../../assets/models/masters/tactical-knee-pad-v1-front.png) / [背面](../../assets/models/masters/tactical-knee-pad-v1-back.png) | 37259 |

## 多视图与镜像使用

图集按左上正面、右上背面、左下左侧、右下右侧排列。独立方向图保存在各装备的输入目录下，文件名为 front.png、back.png、left.png、right.png。Tripo 槽位顺序是前、左侧、右侧、后，应按文件方向逐个对应。四格拼图不能直接作为四个独立物体上传。

左右视图显示同一装备的两侧；通信耳机的麦克风保留单侧差异。靴子、手套和护膝先生成单侧，再通过几何反射生成另一侧，无额外 Tripo 消耗。镜像件不含骨骼或蒙皮，正式挂载时仍要按角色坐标检查内外侧。

- 战术靴：[镜像模型](../../assets/models/derived/equipment/tactical-boot-mirrored-v1.glb)。
- 战术手套：[镜像模型](../../assets/models/derived/equipment/tactical-glove-mirrored-v1.glb)。
- 战术护膝：[镜像模型](../../assets/models/derived/equipment/tactical-knee-pad-mirrored-v1.glb)。

## 检查结果与费用

十件原始模型均通过 GLB 容器与缓冲区边界检查、实际 Blender 导入、有限顶点检查、三张二千像素内嵌贴图检查和双面目视检查；合计 380,294 三角面。三份镜像件重新导入成功，面数与原件相同，未包含负缩放对象。模型母版使用拟定游戏尺度，原始下载文件保持服务输出。

本轮十项各四十五积分，共四百五十积分。项目累计一千零六十积分，二千积分预算内余量九百四十积分，网站实际回读余额一千一百二十积分。未充值，未重复付费提交。

任务编号、费用与文件校验值见 [项目账本](../../assets/models/tripo/tasks.json)；完整检查记录见 [装备验收记录](equipment-validation-v1.json)；生成提示词见 [中文提示词](../design/equipment-prompts-v1.md)。已有十件场景与敌人资产和本轮十件装备合计二十件静态资产的完整性复核通过。

## 已知美术缺陷与验收边界

- 背包肩带与包体之间的隐蔽面有黄黑贴图污染。
- 靴筒后侧有多余绑带状重建细节。
- 护膝背部衬垫有少量非设计色斑。
- 各件的硬表面倒角、织物细节和配色仍存在生成简化，不视为近景最终品质通过。
- 尚未完成角色穿戴贴合、骨骼与蒙皮、手套指部变形、碰撞、降面、游戏光照及性能验收。原始模型未直接接入游戏。

## 静态初稿交付审查

VERDICT: PASS

P0/P1 BLOCKERS：无。已反证核对任务唯一性、实际单次扣费、预算上限、文件容器、内嵌贴图、网格与双面外观，未发现阻止本批静态建模初稿交付的严重问题。

UNVERIFIED RISKS：角色挂载、变形、运行时性能与真实镜头效果尚未验收，不影响静态初稿文件交付结论。

NON-BLOCKING FINDINGS：上述贴图污染、色斑和重建细节应在近景最终美术交付前精修；本次已明确记录，未将其标记为最终美术验收通过。

