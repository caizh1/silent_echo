# 头部装备第五版验收

日期：2026-10-26。游戏使用第五版头部装备；第四版母版、运行副本及历史资源包保留。

## 修改结果

基础人体与脸部不变。将三件分别缩放的旧装备改为围绕同一头型制作的连续厚壳头盔、连体战术目镜和贴耳通信耳机，补齐头盔下颌固定带。前额安装座随盔壳曲面贴合，头带位于盔壳内，目镜密封圈、镜框和烟灰镜片独立建模。头部漆面、织物和金属微表面烘焙为内嵌颜色、粗糙度与法线贴图；头部共四个蒙皮绘制网格，其中镜片单独透明。

运行副本：`public/models/game/modular-soldier-v5.glb`。母版：`assets/models/masters/modular-soldier-headgear-v5.blend`。十九个独立分件：`assets/models/derived/full-kit-v5/`。

## 验证证据

- `npm test`：六十四项全部通过。真实模型检查覆盖三种武器、配件、行走与换弹，共二千八百八十帧；头部相对头骨漂移为零，握点最大误差保持原有水平。
- `tests/headgear.test.ts`：逐项比较第四、第五版基础人体与非头部装备的真实顶点属性、拓扑、贴图、绑定逆矩阵与动画采样，完全一致；四个新头部网格的全部权重均为同一头骨的一，镜片保持独立透明。
- `npm run build`：通过。构建中的第五版运行副本与源文件逐字节相同。
- 独立分件导出与验证：十九个文件均可独立导入，四十一骨骼一致，骨骼矩阵及对应装备边界最大差异为零。
- 后台内置浏览器：实际游戏内分别卸下、装上头盔、目镜、耳机，所有对应节点均按按钮状态显隐且存在真实蒙皮；正背展示、行走和换弹截图已保存，浏览器错误为零。
- 实际游戏同一装配函数、相同灯光与机位的头部近景对照：`outputs/headgear-v5/comparison-front.png`、`comparison-side.png`、`comparison-back.png`。卸下三件头部装备的脸部对照：`comparison-bare.png`。可交互对照页位于同目录 `compare.html`，需通过本项目开发服务访问。
- 短时场景样本：一千九百二十乘一千零八十、六十敌人，采样一百一十六点六七秒，平均一百二十帧，百分之九十五帧间隔约九点三毫秒，采样时仍在运行，浏览器错误为零。仅为本机桌面开发验收样本，不代表手机、正常难度平衡或三十分钟稳定性。

结构与资源清单见 `docs/modeling/headgear-manifest-v5.json`；分件证明见 `docs/modeling/full-kit-parts-v5.json`；实机记录见 `docs/development/headgear-browser-v5.json`。

## 方案与代码审查

VERDICT: PASS

P0/P1 BLOCKERS: 无。

已检查：脸部误修改、头发遮罩与三件独立开关、透明镜片与实体框阴影、绑定坐标、头部相对运动、动作恢复、重复骨架与重复动画、辅助骨骼形状误导出、非头部资源回归、材质内嵌、绘制与三角面开销，以及构建实际引用。候选风险经现有保护和真实导出模型反证后，未发现成立的阻塞问题。

UNVERIFIED RISKS: 未进行手机热负载和三十分钟稳定性验证；没有扩展验证项目未支持的未来动作。

NON-BLOCKING FINDINGS: 当前脸型、面部原有低面细节与贴图接缝按用户要求保留。新版装备采用更完整、规整的表面，概念图中精细磨损、织物纹理与摄影质感仍有差别，不宣称逐像素还原。功能检查数量与性能样本不能替代原图相似度验收。构建仍有既有的脚本体积提示。本轮没有新增建模积分。

## 在项目中重建

依次使用后台 Blender 执行 `scripts/prepare-headgear-v5.py`、`scripts/bake-headgear-materials-v5.py`，再执行 `scripts/inspect-headgear-v5.py -- --after`。全身渲染使用 `scripts/render-full-kit-v4.py -- --v5`；分件导出使用 `scripts/export-full-kit-parts-v4.py -- --version 5`，然后执行 `npx tsx scripts/verify-full-kit-parts-v4.ts 5`。这套流程依赖完整项目中的第四版母版，不能把资源包视为脱离项目的完整重建环境。
