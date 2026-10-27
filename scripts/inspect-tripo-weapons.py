"""检查原图武器的网格与贴图，保存完整母版及双面预览，不覆盖游戏资产。"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {'pistol': ('手枪', .38), 'smg': ('冲锋枪', .68), 'rocket-launcher': ('火箭炮', 1.1)}
requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(TARGETS)

for identifier in requested:
    label, length = TARGETS[identifier]
    source = ROOT / 'assets/models/tripo/raw' / (identifier + '-textured-v2.glb')
    if not source.exists():
        raise FileNotFoundError('模型尚未下载：' + label)
    destination = ROOT / 'assets/models/masters' / (identifier + '-tripo-v2')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    assert meshes, '模型没有有效网格'

    def bounds():
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])

    if identifier == 'rocket-launcher':
        # 原始生成件在水平面斜放；仅旋转整个网格，使母版的长度轴与负向前一致。
        import numpy as np
        points = np.array([tuple(obj.matrix_world @ vertex.co)[:2] for obj in meshes for vertex in obj.data.vertices])
        values, vectors = np.linalg.eigh(np.cov(points, rowvar=False))
        direction = vectors[:, int(np.argmax(values))]
        if direction[1] < 0:
            direction *= -1
        rotation = Matrix.Rotation(math.atan2(float(direction[0]), float(direction[1])), 4, 'Z')
        for obj in meshes:
            obj.matrix_world = rotation @ obj.matrix_world
    low, high = bounds()
    scale = length / max(high - low)
    root = bpy.data.objects.new(identifier + '-asset-root', None)
    scene.collection.objects.link(root)
    for obj in list(scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    root.scale = (scale,) * 3
    low, high = bounds()
    root.location = (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)
    low, high = bounds()
    triangles = 0
    invalid = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        invalid += sum(not all(math.isfinite(c) for c in vertex.co) for vertex in obj.data.vertices)
    images = [im for im in bpy.data.images if im.type == 'IMAGE']
    materials = {slot.material for obj in meshes for slot in obj.material_slots if slot.material}
    report = {'资产': label, '原始文件': str(source.relative_to(ROOT)), '文件摘要': hashlib.sha256(source.read_bytes()).hexdigest(),
              '三角面': triangles, '网格数': len(meshes), '非有限顶点': invalid,
              '贴图': [{'名称': im.name, '尺寸': list(im.size), '像素有效': im.has_data} for im in images],
              '材质数': len(materials), '游戏拟定尺寸米': list(high - low),
              '母版': str(destination.with_suffix('.blend').relative_to(ROOT)),
              '说明': '保持完整生成网格与原始贴图；仅完成本地结构检查和双面渲染，游戏挂点与运行验收另行记录。'}
    assert not invalid and images and all(im.has_data for im in images), '顶点或贴图检查未通过'
    destination.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    world = bpy.data.worlds.new('preview-world')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs[0].default_value = (.13, .15, .17, 1)
    background.inputs[1].default_value = .6
    scene.world = world
    target = (low + high) / 2
    for name, offset, energy in [('key', (3, -2, 4), 650), ('fill', (-3, -1, 2), 450), ('rim', (1, 3, 3), 550)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size = energy * length * length, length * 2
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = target + Vector(offset) * length
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('preview-camera')
    camera = bpy.data.objects.new('preview-camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type, data.ortho_scale = 'ORTHO', length * 1.20
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    for suffix, offset in [('front', (3.5, -1.8, 1.3)), ('back', (-3.5, 1.8, 1.3))]:
        camera.location = target + Vector(offset) * length
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(destination) + '-' + suffix + '.png'
        bpy.ops.render.render(write_still=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(destination.with_suffix('.blend')))
    print(json.dumps({'检查完成': label, '三角面': triangles, '贴图数': len(images), '母版': str(destination.with_suffix('.blend'))}, ensure_ascii=False), flush=True)
