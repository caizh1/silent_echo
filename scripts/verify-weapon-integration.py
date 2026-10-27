"""对当前源文件快照执行测试与生产构建，生成中文验收摘要；不把固定样本当作长期平衡结论。"""
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'outputs/weapon-integration'
OUTPUT.mkdir(parents=True, exist_ok=True)


def snapshot():
    files = [*ROOT.glob('src/*.ts'), *ROOT.glob('src/*.css'), *ROOT.glob('tests/*.ts')]
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files)}


def run(command):
    start = time.perf_counter()
    environment = dict(os.environ, NO_COLOR='1')
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, env=environment)
    return result, round(time.perf_counter() - start, 3)


before = snapshot()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    test_job = pool.submit(run, ['npm', 'test'])
    build_job = pool.submit(run, ['npm', 'run', 'build'])
    (tests, test_time), (build, build_time) = test_job.result(), build_job.result()
after = snapshot()


def count(label):
    values = re.findall(r'(?m)(?:[ℹ#]\s*)?' + label + r'\s+(\d+)\s*$', tests.stdout)
    return int(values[-1]) if values else None


rate = re.search(r'无瞄具 ([\d.]+)%，安装瞄具 ([\d.]+)%', tests.stdout)
models = []
for path in sorted((ROOT / 'public/models/weapons').glob('*-v1.glb')):
    models.append({'文件': str(path.relative_to(ROOT)), '字节数': path.stat().st_size,
                   '文件摘要': hashlib.sha256(path.read_bytes()).hexdigest()})
report = {
    '日期': '2026-10-25',
    '测试': {'退出码': tests.returncode, '用例数': count('tests'), '通过': count('pass'), '失败': count('fail'), '耗时秒': test_time},
    '生产构建': {'退出码': build.returncode, '耗时秒': build_time},
    '验证期间源码一致': before == after,
    '真实模型覆盖': {'武器种类': 3, '兼容配件组合': 40, '方向与换弹姿态样本': 7680, '双手握点误差门槛米': .03},
    '固定弹道样本': {'每种配置发射数': 1200, '无瞄具命中率百分比': float(rate.group(1)) if rate else None,
                  '安装瞄具命中率百分比': float(rate.group(2)) if rate else None, '边界': '只证明固定目标样本，不是正常难度平衡结论。'},
    '模型输出': models,
    '浏览器证据': 'outputs/weapon-integration/browser-validation.json',
    '源码快照': after,
    '未验证': ['长期正常难度平衡', '三十分钟连续稳定性', '物理手机表现', '相对真实人工基线节省百分之八十'],
}
(OUTPUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
passed = tests.returncode == build.returncode == 0 and count('tests') is not None and count('tests') >= 52 and before == after
print(json.dumps({'验证通过': passed, '测试': report['测试'], '生产构建': report['生产构建'], '验证期间源码一致': before == after}, ensure_ascii=False))
if not passed:
    print((tests.stdout + tests.stderr + build.stdout + build.stderr)[-3500:])
    sys.exit(1)
