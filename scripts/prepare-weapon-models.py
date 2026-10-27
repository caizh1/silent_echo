"""将已下载的免费外观模型加工成统一坐标、独立槽位的游戏 GLB，并生成实物网格预览。"""
import hashlib
import json
import math
import runpy
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'assets/models/external/raw'
OUTPUT = ROOT / 'public/models/weapons'
OUTPUT.mkdir(parents=True, exist_ok=True)
reports = []


def bounds(objects):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(c) for obj in objects if obj.type == 'MESH' for c in obj.bound_box]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])


def import_meshes(path, turn=False, length=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.update()
    for obj in objects:
        obj.data.transform(obj.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        if turn:
            obj.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    if length:
        low, high = bounds(objects)
        factor = length / (high.y - low.y)
        center = (low + high) / 2
        transform = Matrix.Scale(factor, 4) @ Matrix.Translation(-center)
        for obj in objects:
            obj.data.transform(transform)
    for material in {m for obj in objects for m in obj.data.materials if m}:
        if not material.use_nodes:
            continue
        shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not shader:
            continue
        # 原有步枪保留真实贴图；免费模块配色统一为石墨灰、橄榄和少量镜片色。
        if 'quaternius' in str(path):
            name = material.name.split('.')[0].lower()
            color = {'main': (.045, .065, .045, 1), 'white': (.07, .085, .075, 1), 'grey': (.025, .035, .03, 1),
                     'black': (.012, .016, .015, 1), 'glass': (.12, .22, .17, 1)}.get(name, (.055, .075, .06, 1))
            shader.inputs['Base Color'].default_value = color
            shader.inputs['Metallic'].default_value = .35 if name != 'glass' else .7
            shader.inputs['Roughness'].default_value = .55 if name != 'glass' else .18
        elif 'kenney' in str(path):
            for link in list(material.node_tree.links):
                if link.to_socket == shader.inputs['Base Color']:
                    material.node_tree.links.remove(link)
            shader.inputs['Base Color'].default_value = (.055, .075, .065, 1)
            shader.inputs['Metallic'].default_value = .4
            shader.inputs['Roughness'].default_value = .5
    return objects


def join(objects, name):
    objects = [o for o in objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    # 材质重复槽位合并后按材质保留，不复制原始大贴图。
    for image in bpy.data.images:
        if image.type == 'IMAGE' and max(image.size) > 1024:
            image.scale(1024, 1024)
    return obj


def position_part(objects, name, size, anchor, front=False, top=False):
    low, high = bounds(objects)
    factor = size / max(high - low)
    pivot = (low + high) / 2
    if front:
        pivot.y = low.y
    if top:
        pivot.z = high.z
    transform = Matrix.Translation(Vector(anchor)) @ Matrix.Scale(factor, 4) @ Matrix.Translation(-pivot)
    for obj in objects:
        obj.data.transform(transform)
    return join(objects, name)


def split_stock(objects, plane):
    # 从实际网格裁出原装后部，升级时整体替换，避免两支枪托叠放。
    original = join(objects, 'weapon-body-mesh')
    stock = original.copy()
    stock.data = original.data.copy()
    bpy.context.collection.objects.link(stock)
    stock.name = 'stock-standard'
    for obj, clear_inner, clear_outer in [(original, False, True), (stock, True, False)]:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=.00001,
                                       plane_co=Vector((0, plane, 0)), plane_no=Vector((0, 1, 0)),
                                       clear_inner=clear_inner, clear_outer=clear_outer)
        edges = [e for e in result['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges)
        bm.to_mesh(obj.data)
        bm.free()
    return original, stock


def marker(name, position):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    return obj


def preview(name, meshes):
    low, high = bounds(meshes)
    target = (low + high) / 2
    scale = max(high - low)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 720, 420
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('weapon-preview-world')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs[0].default_value = (.075, .095, .10, 1)
    world.node_tree.nodes.get('Background').inputs[1].default_value = .6
    scene.world = world
    for offset, energy in [((3, -1, 4), 550), ((-3, 2, 2), 450), ((1, 3, 3), 500)]:
        data = bpy.data.lights.new('weapon-preview-light', 'AREA')
        data.energy, data.size = energy * scale * scale, scale * 2
        obj = bpy.data.objects.new('weapon-preview-light', data)
        scene.collection.objects.link(obj)
        obj.location = target + Vector(offset) * scale
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('weapon-preview-camera')
    camera = bpy.data.objects.new('weapon-preview-camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type, data.ortho_scale = 'ORTHO', scale * 1.34
    camera.location = target + Vector((3.5, -1.8, 1.5)) * scale
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUTPUT / (name + '-preview.png'))
    bpy.ops.render.render(write_still=True)


for weapon, length in [('pistol', .38), ('smg', .68), ('rifle', .95)]:
    # 已有原图 Tripo 模型时，交给专用流程处理，防止重新生成时退回免费低模。
    if weapon in ['pistol', 'smg'] and (ROOT / 'assets/models/tripo/raw' / (weapon + '-textured-v2.glb')).exists():
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if weapon == 'rifle':
        source = ROOT / 'public/models/assault-rifle-textured-v1.glb'
        parts = import_meshes(source, length=length)
        magazine = next(o for o in parts if o.name == 'tripo_part_0')
        stock_names = {'tripo_part_' + str(i) for i in [4, 5, 9, 15, 32, 33, 41]}
        stock_parts = [o for o in parts if o.name in stock_names]
        obsolete = [o for o in parts if o.name in {'tripo_part_3', 'tripo_part_30', 'tripo_part_36'}]
        body = [o for o in parts if o != magazine and o not in stock_parts and o not in obsolete]
        stock = join(stock_parts, 'stock-standard')
        for obj in obsolete:
            bpy.data.objects.remove(obj, do_unlink=True)
        body = join(body, 'weapon-body-mesh')
        right, left = (0, .20, -.09), (0, -.02, -.06)
        rear, optic_anchor = .23, (0, -.075, .12)
    else:
        source = RAW / 'quaternius' / (weapon + '.gltf')
        parts = import_meshes(source, turn=True, length=length)
        magazines = [o for o in parts if 'magazine' in o.name.lower()]
        if magazines:
            magazine = join(magazines, 'magazine-standard')
        else:
            clip = import_meshes(RAW / 'quaternius/magazine-smg.gltf', turn=True)
            for obj in clip:
                obj.data.transform(Matrix.Rotation(.3, 4, 'X'))
            magazine = position_part(clip, 'magazine-standard', .09, (0, .16, -.055), top=True)
        other = [o for o in parts if o not in magazines]
        if weapon == 'smg':
            body, stock = split_stock(other, .18)
        else:
            body = join(other, 'weapon-body-mesh')
            stock = None
        right, left = ((0, .12, -.055), (.025, .105, -.06)) if weapon == 'pistol' else ((0, .13, -.075), (0, -.13, -.075))
        rear, optic_anchor = (.15, (0, -.01, .09)) if weapon == 'pistol' else (.18, (0, -.055, .22))
    magazine.name = 'magazine-standard'
    # 扩容件与原装件占用同一槽位；几何增长向下，连接端保持不动。
    low, high = bounds([magazine])
    extended = magazine.copy()
    extended.data = magazine.data.copy()
    bpy.context.collection.objects.link(extended)
    extended.name = 'magazine-extended'
    transform = Matrix.Translation(Vector((0, 0, high.z))) @ Matrix.Diagonal((1.05, 1.05, 1.5, 1)) @ Matrix.Translation(Vector((0, 0, -high.z)))
    extended.data.transform(transform)
    scope = position_part(import_meshes(RAW / 'kenney/scope-small.glb'), 'optic', .105 if weapon == 'pistol' else .15, optic_anchor)
    # 科幻模块原轴向为正 X，转到统一前向负 Y。
    stock_height = -.02 if weapon == 'pistol' else .12 if weapon == 'smg' else .015
    upgraded_stock = position_part(import_meshes(RAW / 'quaternius/stock.gltf', turn=True), 'stock-upgraded', .19 if weapon == 'pistol' else .28, (0, rear, stock_height), front=True)
    grip = None
    if weapon != 'pistol':
        grip_parts = import_meshes(RAW / 'quaternius/foregrip.gltf', turn=True)
        # 原件包含向前延长的护圈，裁去护圈，保留实体握持部分作为游戏前握把。
        for obj in grip_parts:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=.00001,
                                  plane_co=Vector((0, -.18, 0)), plane_no=Vector((0, 1, 0)), clear_inner=True)
            bm.to_mesh(obj.data)
            bm.free()
        grip = position_part(grip_parts, 'grip', .13, (0, -.13 if weapon == 'smg' else -.09, .105 if weapon == 'smg' else .015), top=True)
    marker('right-grip', right)
    marker('left-grip', left)
    marker('grip-hand', (0, -.13 if weapon == 'smg' else -.09, .025 if weapon == 'smg' else -.065))
    low, high = bounds([body])
    front = [body.matrix_world @ vertex.co for vertex in body.data.vertices if (body.matrix_world @ vertex.co).y < low.y + .012]
    muzzle_height = round(sum(point.z for point in front) / len(front), 3)
    marker('muzzle', (0, -({'pistol': .56, 'smg': .72, 'rifle': .83}[weapon] - .33), muzzle_height))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert all(image.has_data for image in bpy.data.images if image.type == 'IMAGE'), '模型贴图依赖缺失'
    for obj in meshes:
        low, high = bounds([obj])
        center = (low + high) / 2
        obj.data.transform(Matrix.Translation(-center))
        obj.location = center
        obj.data.calc_loop_triangles()
        assert all(all(math.isfinite(c) for c in v.co) for v in obj.data.vertices), '模型包含非有限顶点'
    report = {'武器': weapon, '源文件': str(source.relative_to(ROOT)), '源文件摘要': hashlib.sha256(source.read_bytes()).hexdigest(),
              '输出': '/models/weapons/' + weapon + '-v1.glb', '三角面总数含替换件': sum(len(o.data.loop_triangles) for o in meshes),
              '语义节点': [o.name for o in bpy.context.scene.objects], '说明': '三角面总数包含互斥替换件；实际游戏只显示当前配置。'}
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (weapon + '-v1.glb')), export_format='GLB', export_yup=True, export_animations=False)
    # 缩略图展示全配件配置；游戏中由实际选项控制，原装和升级件互斥。
    magazine.hide_render = True
    if stock:
        stock.hide_render = True
    preview(weapon, [o for o in meshes if not o.hide_render])
    reports.append(report)
    print(json.dumps(report, ensure_ascii=False), flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
grenade = import_meshes(RAW / 'kenney/grenade-a.glb')
position_part(grenade, 'grenade-body', .18, (0, 0, 0))
for material in bpy.data.materials:
    shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if material.use_nodes else None
    if shader:
        for link in list(material.node_tree.links):
            if link.to_socket == shader.inputs['Base Color']:
                material.node_tree.links.remove(link)
        shader.inputs['Base Color'].default_value = (.15, .22, .09, 1)
        shader.inputs['Metallic'].default_value = .28
        shader.inputs['Roughness'].default_value = .64
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / 'grenade-v1.glb'), export_format='GLB', export_yup=True, export_animations=False)
destination = ROOT / 'docs/modeling/weapon-model-validation.json'
destination.write_text(json.dumps({'模型': reports, '手雷来源': 'Kenney Blaster Kit 2.1，CC0，最长边零点一八米', '检查边界': '模型导出与有限坐标检查；动画、碰撞和实机另行验收。'}, ensure_ascii=False, indent=2) + '\n')
if all((ROOT / 'assets/models/tripo/raw' / (weapon + '-textured-v2.glb')).exists() for weapon in ['pistol', 'smg']):
    runpy.run_path(str(ROOT / 'scripts/prepare-tripo-weapons.py'), run_name='__main__')
