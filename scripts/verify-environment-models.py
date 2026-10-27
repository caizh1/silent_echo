"""核对已交付静态模型的下载身份、容器、贴图和本地检视产物。"""
import hashlib
import json
import struct
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
ledger = json.loads((workspace / 'assets/models/tripo/tasks.json').read_text())
tasks = [task for task in ledger['任务'] if task.get('本地原始文件') and task.get('可编辑母版')]
assert len(tasks) >= 9 and len({task['任务标识'] for task in tasks}) == len(tasks)
results = []
for task in tasks:
    source = workspace / task['本地原始文件']
    raw = source.read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    json_length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(raw[20:20 + json_length])
    binary_length, kind = struct.unpack_from('<II', raw, 20 + json_length)
    assert kind == 0x004E4942
    assert len(gltf['buffers']) == 1
    assert gltf['buffers'][0]['byteLength'] <= binary_length
    assert 20 + json_length + 8 + binary_length == total
    assert all(view.get('byteOffset', 0) + view['byteLength'] <= binary_length
               for view in gltf.get('bufferViews', []))
    assert len(gltf['images']) == 3
    assert all('bufferView' in image for image in gltf['images'])
    saved = next(item for item in ledger['下载文件'] if item['文件'] == task['本地原始文件'])
    assert saved['字节数'] == len(raw)
    assert saved['校验值'] == hashlib.sha256(raw).hexdigest()
    master = workspace / task['可编辑母版']
    report = json.loads(master.with_suffix('.json').read_text())
    assert 0 < report['三角面总数'] <= 40000 and report['非有限顶点数'] == 0
    assert report['骨架数'] == 0 and report['动作数'] == 0
    assert all(image['尺寸'] == [2048, 2048] and image['有像素数据'] for image in report['贴图'])
    assert master.is_file()
    assert (workspace / task['正面预览']).is_file() and (workspace / task['背面预览']).is_file()
    results.append({'资产': task['资产'], '文件完整性': '通过', '内嵌贴图': '通过',
                    '网格与材质': '通过', '可编辑母版': '已保存', '双面静态检视': '已完成',
                    '三角面': report['三角面总数'], '文件字节数': len(raw)})
assert ledger['已用积分'] == sum(item['积分'] for item in ledger['费用记录']) <= ledger['预算上限']
assert ledger['预算内余量'] == ledger['预算上限'] - ledger['已用积分']
validation = {'验收范围': '已交付静态资产的文件、结构、贴图与本地检视产物；不代表动画或游戏通过',
              '检查结果': results, '总三角面': sum(item['三角面'] for item in results),
              '总字节数': sum(item['文件字节数'] for item in results),
              '累计积分': ledger['已用积分'], '项目预算余量': ledger['预算内余量'],
              '网站回读余额': ledger['网站最新显示余额'],
              '检查边界': '此脚本只验证静态资产；当前游戏接入与浏览器性能结果见模型接入记录，最终骨骼与长期稳定性另行验收'}
(workspace / 'docs/modeling/environment-enemy-validation.json').write_text(
    json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'通过资产数': len(results), '总三角面': validation['总三角面'],
                  '总字节数': validation['总字节数']}, ensure_ascii=False))
