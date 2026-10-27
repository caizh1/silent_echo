# 步枪开火录音

两段运行素材来自真实 AR-15／M4、五点五六毫米步枪录音，用于替代白噪声与振荡器合成的开火声音。

- 素材库：[免费枪械音效库](https://opengameart.org/content/the-free-firearm-sound-library)。
- 录制者：Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney。
- 授权：[CC0 公共领域贡献](https://creativecommons.org/publicdomain/zero/1.0/)，允许剪辑、混音、商业使用与再分发。
- 下载镜像：[原始素材目录](https://github.com/petroulacl/fps-asset-kit/tree/main/sfx/firearm_sfx/Prepared%20SFX%20Library/AR-15)。

原文件 `D_32P.wav` 的内嵌说明标记为射手前方近距离立体声，提供两次不同单发；`D_24P.wav` 标记为中距离立体声，提供低电平自然反射。运行素材不包含其他枪型，也没有声称提供独立枪机实录。

处理方式：剪除发射前空白，保留约一点五毫秒前沿；近距离单发混入少量中距离反射，反射轨道跳过首个爆响；滤除五十五赫兹以下低频和一万四千五百赫兹以上高频；首尾淡化并归一化至负三分贝峰值。每段为零点九五秒、四万八千赫兹、单声道、十六位无损波形，共一百八十二点五千字节。

复现：将原文件保存为项目内 `.runtime/rifle-audio/source/ar15-d32.wav` 与 `ar15-d24.wav`，运行 `python3 scripts/prepare-rifle-audio.py`。脚本依赖本机音视频处理工具；游戏运行不需要这些工具，也不访问素材网站。

| 文件 | 校验摘要 |
| --- | --- |
| 原始近距离录音 | `acee9d2106b68fe5956225a19d7aedf943d97793817f9bda9d486a2b74b0a812` |
| 原始中距离录音 | `4c6a54ca0583150bbb32b7f658bc64da9ad9ba42fd3aca769c6120b44af8d3f0` |
| `shot-01.wav` | `0ece1af3cf947e95330ee6a3f724c7ee2dee516afbd86af0b23eb52d8dc46646` |
| `shot-02.wav` | `ef886b2d6f599a4573f4c8049a3b0ef6991a711090bddf3d9612db015ced9b55` |
