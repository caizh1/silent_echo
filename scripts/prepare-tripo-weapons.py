"""将原图生成的手枪、冲锋枪加工成游戏槽位，保留原始模型和完整贴图母版。"""
import hashlib
import json
import shutil
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'assets/models/tripo/raw'
OUTPUT = ROOT / 'public/models/weapons'
BACKUP = ROOT / 'assets/models/external/processed/legacy-weapons-v1'
BACKUP.mkdir(parents=True, exist_ok=True)
for identifier in ['pistol', 'smg']:
    for suffix in ['-v1.glb', '-preview.png']:
        source = OUTPUT / (identifier + suffix)
        destination = BACKUP / source.name
        if source.exists() and not destination.exists():
            shutil.copy2(source, destination)


def bounds(objects):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])


def import_body(identifier):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(RAW / (identifier + '-textured-v2.glb')))
    meshes = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH']
    for obj in meshes:
        obj.data.transform(obj.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    low, high = bounds(meshes)
    length = .38 if identifier == 'pistol' else .68
    transform = Matrix.Scale(length / (high.y - low.y), 4) @ Matrix.Translation(-(low + high) / 2)
    for obj in meshes:
        obj.data.transform(transform)
    body = meshes[0]
    assert len(meshes) == 1, '当前源模型应是单一网格，避免静默漏掉部件'
    body.name = 'weapon-body-mesh'
    if identifier == 'pistol':
        low, high = bounds([body])
        front = [v.co.z for v in body.data.vertices if v.co.y < low.y + .008]
        shift = .051 - sum(front) / len(front)
    else:
        # 先按真实握把位置安放模型，再使程序枪口使用同一高度。
        shift = -.020
    body.data.transform(Matrix.Translation((0, 0, shift)))
    return body


def extract_region(body, name, planes):
    """沿区域边界切开原网格后分离，原有表面与纹理坐标保持一致。"""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for axis, value, sign in planes:
        origin = Vector((0, 0, 0))
        normal = Vector((0, 0, 0))
        origin[axis], normal[axis] = value, 1
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                               plane_co=origin, plane_no=normal, dist=.000001)
    bm.to_mesh(body.data)
    bm.free()
    part = body.copy()
    part.data = body.data.copy()
    part.name = name
    bpy.context.collection.objects.link(part)
    for obj, keep_inside in [(part, True), (body, False)]:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        remove = []
        for face in bm.faces:
            center = face.calc_center_median()
            inside = all((center[axis] - value) * sign >= -.0000001 for axis, value, sign in planes)
            if inside != keep_inside:
                remove.append(face)
        bmesh.ops.delete(bm, geom=remove, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        # 只封此次切口，不封原有枪口或瞄具的结构开孔。
        edges = [edge for edge in bm.edges if edge.is_boundary and any(
            all(abs(v.co[axis] - value) < .00001 for v in edge.verts) for axis, value, _ in planes)]
        if edges:
            for face in bmesh.ops.holes_fill(bm, edges=edges).get('faces', []):
                face.material_index = len(obj.data.materials)
                face.smooth = False
        bm.normal_update()
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.materials.append(cap_material)
    assert part.data.polygons, '指定区域没有提取到网格：' + name
    return part


def clone_part(original, name):
    obj = original.copy()
    obj.data = original.data.copy()
    obj.name = name
    bpy.context.collection.objects.link(obj)
    return obj


def fit_part(obj, length, anchor, top=False, front=False):
    low, high = bounds([obj])
    pivot = (low + high) / 2
    if top:
        pivot.z = high.z
    else:
        pivot.z = low.z
    if front:
        pivot.y = low.y
        pivot.z = (low.z + high.z) / 2
    obj.data.transform(Matrix.Translation(Vector(anchor)) @ Matrix.Scale(length / max(high - low), 4) @ Matrix.Translation(-pivot))


def marker(name, coordinate):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = coordinate


def preview(identifier):
    """缩略图展示默认配置，直接渲染实际导出的模型部件。"""
    scene = bpy.context.scene
    for name in ['optic', 'stock-upgraded', 'magazine-extended', 'grip']:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = True
    meshes = [obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render]
    low, high = bounds(meshes)
    target, extent = (low + high) / 2, max(high - low)
    world = bpy.data.worlds.new('preview-world')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs[0].default_value = (.13, .15, .17, 1)
    background.inputs[1].default_value = .6
    scene.world = world
    for name, offset, energy in [('key', (3, -2, 4), 650), ('fill', (-3, -1, 2), 450), ('rim', (1, 3, 3), 550)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size = energy * extent * extent, extent * 2
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = target + Vector(offset) * extent
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('preview-camera')
    camera = bpy.data.objects.new('preview-camera', data)
    scene.collection.objects.link(camera)
    camera.location = target + Vector((3.5, -1.8, 1.3)) * extent
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO', extent * 1.24
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUTPUT / (identifier + '-preview.png'))
    bpy.ops.render.render(write_still=True)


reports = []
for identifier in ['pistol', 'smg']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cap_material = bpy.data.materials.new('cut-surface')
    cap_material.use_nodes = True
    shader = next(node for node in cap_material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.035, .04, .035, 1)
    shader.inputs['Metallic'].default_value = .25
    shader.inputs['Roughness'].default_value = .65
    body = import_body(identifier)
    if identifier == 'smg':
        optic = extract_region(body, 'optic', [(2, .102, 1), (1, -.13, 1), (1, .06, -1)])
        stock = extract_region(body, 'stock-standard', [(1, .145, 1)])
        magazine = extract_region(body, 'magazine-standard', [(2, -.01, -1), (1, -.04, -1)])
        upgraded = clone_part(stock, 'stock-upgraded')
        upgraded.data.transform(Matrix.Translation((0, .145, 0)) @ Matrix.Diagonal((1.05, 1.1, 1.05, 1)) @ Matrix.Translation((0, -.145, 0)))
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(BACKUP / 'smg-v1.glb'))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        grip = next(obj for obj in imported if obj.name.split('.')[0] == 'grip')
        grip.data.transform(grip.matrix_world)
        grip.parent = None
        grip.matrix_world = Matrix.Identity(4)
        for obj in imported:
            if obj != grip:
                bpy.data.objects.remove(obj, do_unlink=True)
        grip.name = 'grip'
        fit_part(grip, .11, (0, -.225, -.025), top=True)
        marker('right-grip', (0, .075, -.075))
        marker('left-grip', (.015, -.20, -.025))
        marker('grip-hand', (0, -.225, -.105))
        muzzle_forward = -.39
    else:
        magazine = extract_region(body, 'magazine-standard', [(2, -.129, -1)])
        template = import_body('smg')
        optic = extract_region(template, 'optic', [(2, .102, 1), (1, -.13, 1), (1, .06, -1)])
        upgraded = extract_region(template, 'stock-upgraded', [(1, .145, 1)])
        bpy.data.objects.remove(template, do_unlink=True)
        fit_part(optic, .095, (0, -.005, .084))
        fit_part(upgraded, .19, (0, .175, .025), front=True)
        marker('right-grip', (0, .12, -.055))
        marker('left-grip', (.025, .105, -.06))
        marker('grip-hand', (.025, .105, -.06))
        muzzle_forward = -.23
    extended = clone_part(magazine, 'magazine-extended')
    low, high = bounds([magazine])
    extended.data.transform(Matrix.Translation((0, 0, high.z)) @ Matrix.Diagonal((1.015, 1.015, 1.5, 1)) @ Matrix.Translation((0, 0, -high.z)))
    low, high = bounds([body])
    front = [v.co.z for v in body.data.vertices if v.co.y < low.y + .008]
    muzzle_height = round(sum(front) / len(front), 6)
    marker('muzzle', (0, muzzle_forward, muzzle_height))
    # 游戏副本用二千像素贴图，四千像素原始 GLB 与母版均完整保留。
    used_materials = {slot.material for obj in bpy.context.scene.objects if obj.type == 'MESH' for slot in obj.material_slots if slot.material}
    images = {node.image for material in used_materials if material.use_nodes for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    for image in images:
        if max(image.size) > 2048:
            image.scale(2048, 2048)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    triangles = 0
    for obj in meshes:
        low, high = bounds([obj])
        center = (low + high) / 2
        obj.data.transform(Matrix.Translation(-center))
        obj.location = center
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (identifier + '-v1.glb')), export_format='GLB', export_yup=True, export_animations=False)
    reports.append({'武器': identifier, '源文件': 'assets/models/tripo/raw/' + identifier + '-textured-v2.glb',
                    '源文件摘要': hashlib.sha256((RAW / (identifier + '-textured-v2.glb')).read_bytes()).hexdigest(),
                    '输出': '/models/weapons/' + identifier + '-v1.glb', '三角面总数含替换件': triangles,
                    '语义节点': [obj.name for obj in bpy.context.scene.objects], '贴图最大尺寸': 2048,
                    '枪口局部高度米': muzzle_height, '程序枪口高度米': round(1.28 + muzzle_height, 6),
                    '说明': '主体与可提取配件来自原图 Tripo 模型；冲锋枪前握把复用原免费配件。互斥替换件不同时显示。'})
    print(json.dumps(reports[-1], ensure_ascii=False), flush=True)
    preview(identifier)

path = ROOT / 'docs/modeling/weapon-model-validation.json'
validation = json.loads(path.read_text())
validation['模型'] = reports + [item for item in validation['模型'] if item['武器'] not in ['pistol', 'smg']]
validation['检查边界'] = '原图模型分槽位导出；功能、实际握持与浏览器验收另行记录。'
path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
