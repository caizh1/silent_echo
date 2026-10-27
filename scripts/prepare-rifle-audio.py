"""将两次真实步枪单发剪成游戏音效，保留瞬态与自然反射。"""

import array
import json
import math
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".runtime/rifle-audio/source"
OUTPUT = ROOT / "public/audio/rifle"
RATE = 48000
LENGTH = round(RATE * .95)


def read_recording(name):
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(SOURCE / name),
        "-af", "highpass=f=55,lowpass=f=14500", "-ac", "1", "-ar", str(RATE),
        "-f", "f32le", "-",
    ], check=True, capture_output=True)
    return array.array("f", result.stdout)


direct = read_recording("ar15-d32.wav")
reflections = read_recording("ar15-d24.wav")
OUTPUT.mkdir(parents=True, exist_ok=True)
report = []
for index, (direct_onset, reflected_onset) in enumerate([
    (.7037291667, .5488125), (5.6474166667, 3.9099375),
], start=1):
    # 留下一点瞬态前沿；反射录音跳过首个爆响，避免第二次枪声。
    direct_start = round((direct_onset - .0015) * RATE)
    reflected_start = round((reflected_onset - .0015) * RATE)
    mixed = []
    for i in range(LENGTH):
        time = i / RATE
        reflection_gain = .22 * min(1, max(0, (time - .07) / .025))
        fade_in = min(1, i / 12)
        fade_out = min(1, (LENGTH - 1 - i) / (RATE * .2))
        mixed.append((direct[direct_start + i] + reflections[reflected_start + i] * reflection_gain) * fade_in * fade_out)
    # 降采样后的真峰值也纳入归一化，防止原始录音的重建过冲。
    scale = 10 ** (-3 / 20) / max(map(abs, mixed))
    pcm = array.array("h", (round(sample * scale * 32767) for sample in mixed))
    path = OUTPUT / f"shot-{index:02}.wav"
    with wave.open(str(path), "wb") as target:
        target.setparams((1, 2, RATE, 0, "NONE", "无压缩"))
        target.writeframes(pcm.tobytes())
    report.append({
        "文件": path.relative_to(ROOT).as_posix(), "时长秒": LENGTH / RATE,
        "采样率": RATE, "声道数": 1, "峰值分贝": -3,
        "均方根分贝": round(20 * math.log10(math.sqrt(sum((x * scale) ** 2 for x in mixed) / LENGTH)), 2),
        "字节数": path.stat().st_size,
    })
print(json.dumps({"处理结果": report}, ensure_ascii=False, indent=2))
