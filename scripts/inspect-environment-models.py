"""批量检查城市与敌人模型，保留原始文件并生成比例统一的母版和双面预览。"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

workspace = Path(__file__).resolve().parents[1]
targets = {
    'ruined-storefront': ('商店废墟', 8.0, '宽度'),
    'road-barricade': ('道路掩体', 3.0, '最长边'),
    'burned-sedan': ('轿车残骸', 4.6, '最长边'),
    'burned-armored-van': ('装甲车残骸', 5.8, '最长边'),
    'burned-police-car': ('警车残骸', 4.8, '最长边'),
    'enemy-rifleman': ('人类步枪兵', 1.82, '高度'),
    'enemy-flanker': ('人类突击兵', 1.82, '高度'),
    'alien-pouncer': ('外星扑击兽', 2.6, '最长边'),
    'alien-spitter': ('外星喷射者', 2.1, '高度'),
    'alien-boss': ('外星首领', 4.2, '高度'),
}
requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(targets)
for asset_id in requested:
    label, size, axis = targets[asset_id]
    source = workspace / 'assets/models/tripo/raw' / (asset_id + '-v1.glb')
    if not source.exists():
        print('尚未下载，跳过：' + label, flush=True)
        continue
    destination = workspace / 'assets/models/masters' / (asset_id + '-v1')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    assets = list(scene.objects)
    meshes = [obj for obj in assets if obj.type == 'MESH']
    if not meshes:
        raise ValueError('模型不包含网格：' + label)

    def bounds():
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        return (Vector([min(p[i] for p in points) for i in range(3)]),
                Vector([max(p[i] for p in points) for i in range(3)]))

    low, high = bounds()
    extent = high - low
    denominator = extent.z if axis == '高度' else extent.x if axis == '宽度' else max(extent)
    if denominator <= 0 or not all(math.isfinite(v) for v in (*low, *high)):
        raise ValueError('模型坐标异常：' + label)
    root = bpy.data.objects.new(asset_id + '-root', None)
    scene.collection.objects.link(root)
    for obj in assets:
        if obj.parent is None:
            obj.parent = root
    # 两类外星角色原始朝向相反，统一母版的正面检视方向。
    if asset_id in ('alien-spitter', 'alien-boss'):
        root.rotation_euler.z = math.pi
    root.scale = (size / denominator,) * 3
    low, high = bounds()
    root.location = (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)
    low, high = bounds()
    extent = high - low
    triangles = 0
    invalid = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        invalid += sum(not all(math.isfinite(v) for v in vertex.co) for vertex in obj.data.vertices)
    images = [image for image in bpy.data.images if image.type == 'IMAGE']
    report = {'资产': label, '源文件': str(source), '网格数': len(meshes),
              '三角面总数': triangles, '非有限顶点数': invalid,
              '材质数': len(bpy.data.materials), '贴图数': len(images),
              '贴图': [{'名称': image.name, '尺寸': list(image.size), '有像素数据': image.has_data} for image in images],
              '尺寸米': list(extent), '尺度约定': axis + '为' + str(size) + '米，属于游戏拟定尺度',
              '朝向调整': '绕竖轴旋转一百八十度' if asset_id in ('alien-spitter', 'alien-boss') else '保持原始朝向',
              '骨架数': sum(obj.type == 'ARMATURE' for obj in assets),
              '动作数': len(bpy.data.actions),
              '说明': '仅证明结构、贴图和双面静态检视；骨骼、变形、碰撞和游戏性能须另行验收。'}
    if invalid or not images or any(not image.has_data for image in images):
        raise ValueError('顶点或贴图检查未通过：' + label)
    destination.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    world = bpy.data.worlds.new('preview-world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .15, .17, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .55
    scene.world = world
    scale = max(extent)
    target = Vector((0, 0, extent.z / 2))
    for name, offset, power in [('key', (2, -3, 4), 650), ('fill', (-3, -1, 2), 450), ('rim', (1, 3, 3), 550)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size = power * scale * scale, scale * 2
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = target + Vector(offset) * scale
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('preview-camera')
    camera = bpy.data.objects.new('preview-camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type, data.ortho_scale = 'ORTHO', scale * 1.45
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    for suffix, offset in [('front', (3, -5, 2.6)), ('back', (-3, 5, 2.6))]:
        camera.location = target + Vector(offset) * scale
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(destination) + '-' + suffix + '.png'
        bpy.ops.render.render(write_still=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(destination.with_suffix('.blend')))
    print(json.dumps({'检查完成': label, '三角面': triangles, '贴图数': len(images)}, ensure_ascii=False), flush=True)
