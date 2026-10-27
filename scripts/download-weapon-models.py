"""下载作者公开提供的 CC0 外观模型，复用有效缓存，并记录中文来源与校验信息。"""
import concurrent.futures
import hashlib
import json
import subprocess
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'assets/models/external/raw'
QUATERNIUS = {
    'pistol': ('手枪主体', '1pknLfctBF_wgczDFKieFrJtfUVz8jkh5'),
    'smg': ('冲锋枪主体及原装弹匣', '1pn5Rju_kYZsJxGdJmndA53eY5bOUs6GR'),
    'stock': ('枪托', '17cyXhDjPZ2pW1a9p-SREfaepJXHQrJGc'),
    'foregrip': ('握把原件，接入时裁去护圈', '1CbL6oVsZf5_Nur4xnHt5-puFuU-EIP_6'),
    'magazine-smg': ('用于手枪弹匣适配的直弹匣原件', '1iF4ywd6YgAnd-8TLtCAPTextynA4NH5A'),
}
KENNEY_URL = 'https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip'
started = time.perf_counter()


def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.download')
    subprocess.run(['curl', '-fL', '--connect-timeout', '10', '--max-time', '45', '--retry', '1', '-sS', url, '-o', str(temporary)], check=True)
    temporary.replace(path)


def entry(path, label, url, author):
    return {'资产': label, '文件': str(path.relative_to(ROOT)), '作者': author, '下载来源': url,
            '字节数': path.stat().st_size, '文件摘要': hashlib.sha256(path.read_bytes()).hexdigest(), '授权': 'CC0'}


def quaternius(item):
    name, (label, identifier) = item
    path = RAW / 'quaternius' / (name + '.gltf')
    url = 'https://drive.usercontent.google.com/download?id=' + identifier + '&export=download'
    if not path.exists():
        download(url, path)
    data = json.loads(path.read_text())
    if data.get('asset', {}).get('version') != '2.0' or not data.get('meshes'):
        raise ValueError('下载文件不是有效模型：' + label)
    if any(not buffer.get('uri', '').startswith('data:') for buffer in data.get('buffers', [])):
        raise ValueError('模型存在未处理的外链缓冲：' + label)
    return entry(path, label, url, 'Quaternius')


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records = list(pool.map(quaternius, QUATERNIUS.items()))
archive = RAW / 'kenney-blaster-kit-v2.1.zip'
if not archive.exists():
    download(KENNEY_URL, archive)
with zipfile.ZipFile(archive) as package:
    if package.testzip():
        raise ValueError('原始压缩包校验未通过')
    for name, label in [('grenade-a.glb', '手雷'), ('scope-small.glb', '瞄具')]:
        path = RAW / 'kenney' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(package.read('Models/GLB format/' + name))
        records.append(entry(path, label, KENNEY_URL, 'Kenney'))
    texture = RAW / 'kenney/Textures/colormap.png'
    texture.parent.mkdir(parents=True, exist_ok=True)
    texture.write_bytes(package.read('Models/GLB format/Textures/colormap.png'))
records.append(entry(archive, '完整原始模型包，包含作者原始许可文件', KENNEY_URL, 'Kenney'))
report = {
    '核对日期': '2026-10-25',
    '用途': '《破城前线》的游戏外观模型，不用于实物制造。',
    '采用来源': [
        {'作者': 'Quaternius', '来源页': 'https://quaternius.com/packs/scifimodularguns.html', '作者声明': '免费用于个人与商业项目，授权为 CC0。'},
        {'作者': 'Kenney', '来源页': 'https://kenney.nl/assets/blaster-kit', '作者声明': '免费模型包，授权为 CC0。'},
    ],
    '许可链接': 'https://creativecommons.org/publicdomain/zero/1.0/',
    '选择调整': '原推荐的商店配件下载需要登录，没有可用登录会话，因此采用作者公开、无需登录的 CC0 备选；未提取受限预览模型。',
    '实际文件': records,
    '已有资产': '突击步枪主体沿用本项目已有的 Tripo 模型；其母版、原始文件和历史费用账本保持原样。',
    '加工说明': '调整材质配色、比例和挂点，裁切原装枪托与握把，扩容件向下延长；瞄具、枪托与弹匣按槽位显示或互斥替换。',
    '本轮费用': '素材免费下载；未使用 imagegen，未提交 Tripo 任务，未产生 Tripo 积分消耗。',
    '本次脚本耗时秒': round(time.perf_counter() - started, 3),
}
current = []
for identifier, label in [('pistol', '手枪'), ('smg', '冲锋枪'), ('rocket-launcher', '火箭炮')]:
    path = ROOT / 'assets/models/tripo/raw' / (identifier + '-textured-v2.glb')
    if path.exists():
        current.append({'资产': label, '来源': '本项目原图通过 Tripo 生成', '原始文件': str(path.relative_to(ROOT)),
                        '文件摘要': hashlib.sha256(path.read_bytes()).hexdigest()})
if current:
    report['当前原图模型'] = current
    report['历史记录说明'] = '上方免费手枪、冲锋枪原件是历史来源记录；游戏主体已改用原图 Tripo 模型，不再作为当前主体。'
    report['本轮费用'] = '本脚本仅下载免费素材；原图建模的实际 Tripo 费用单独记在 assets/models/tripo/tasks.json。'
destination = ROOT / 'docs/modeling/weapon-asset-sources.json'
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'校验完成': len(records), '来源记录': str(destination), '耗时秒': report['本次脚本耗时秒']}, ensure_ascii=False))
