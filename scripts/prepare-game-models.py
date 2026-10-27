"""从可编辑母版导出独立游戏副本，统一朝向、减面和贴图尺寸。"""
import hashlib
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

workspace = Path(__file__).resolve().parents[1]
output = workspace / 'public/models/game'
output.mkdir(parents=True, exist_ok=True)
targets = {
    'ruined-storefront': 14000, 'road-barricade': 7000,
    'burned-sedan': 14000, 'burned-armored-van': 14000, 'burned-police-car': 14000,
    'enemy-rifleman': 9000, 'enemy-flanker': 9000,
    'alien-pouncer': 11000, 'alien-spitter': 11000, 'alien-boss': 20000,
    'enemy-weapon': 2800,
}
manifest = {}
for asset_id, triangle_budget in targets.items():
    source_id = 'assault-rifle-textured' if asset_id == 'enemy-weapon' else asset_id
    bpy.ops.wm.open_mainfile(filepath=str(workspace / 'assets/models/masters' / (source_id + '-v1.blend')))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    rotation = Matrix.Rotation(-math.pi / 2, 4, 'Z') if asset_id in ('enemy-rifleman', 'enemy-flanker', 'burned-police-car') else Matrix.Identity(4)
    for obj in meshes:
        transform = rotation @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = asset_id
    if asset_id == 'enemy-weapon':
        # 小尺寸敌方武器将原贴图采样为顶点色，合成一次绘制；玩家保留原材质。
        mesh = obj.data
        uv = np.array([tuple(loop.uv) for loop in mesh.uv_layers.active.data])
        material_ids = np.repeat([poly.material_index for poly in mesh.polygons], [poly.loop_total for poly in mesh.polygons])
        colors = np.ones((len(mesh.loops), 4), dtype=np.float32)
        for index, slot in enumerate(obj.material_slots):
            shader = next((node for node in slot.material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
            if not shader:
                continue
            socket = shader.inputs['Base Color']
            mask = material_ids == index
            colors[mask] = socket.default_value
            image = socket.links[0].from_node.image if socket.is_linked and socket.links[0].from_node.type == 'TEX_IMAGE' else None
            if image:
                w, h = image.size
                pixels = np.empty(w * h * 4, dtype=np.float32)
                image.pixels.foreach_get(pixels)
                pixels = pixels.reshape(h, w, 4)
                indices = uv[mask] % 1
                colors[mask] = pixels[(indices[:, 1] * h).astype(int), (indices[:, 0] * w).astype(int)]
        layer = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        layer.data.foreach_set('color', colors.ravel())
        mesh.color_attributes.active_color = layer
        material = bpy.data.materials.new('敌方武器顶点色')
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = .75
        vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'Color'
        material.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for poly in mesh.polygons:
            poly.material_index = 0
    obj.data.calc_loop_triangles()
    before = len(obj.data.loop_triangles)
    modifier = obj.modifiers.new('运行模型减面', 'DECIMATE')
    modifier.ratio = min(1.0, triangle_budget / before)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for image in bpy.data.images:
        if image.type == 'IMAGE' and max(image.size) > 1024:
            image.scale(1024, 1024)
            image.pack()
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector([min(point[i] for point in points) for i in range(3)])
    high = Vector([max(point[i] for point in points) for i in range(3)])
    extent = high - low
    obj.data.transform(Matrix.Translation(Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))))
    destination = output / (asset_id + '-v1.glb')
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                              export_animations=False, export_cameras=False, export_lights=False)
    obj.data.calc_loop_triangles()
    raw = destination.read_bytes()
    manifest[asset_id] = {'url': '/models/game/' + destination.name,
                          'size': [round(extent.x, 5), round(extent.z, 5), round(extent.y, 5)],
                          'triangles': len(obj.data.loop_triangles), 'bytes': len(raw),
                          'sha256': hashlib.sha256(raw).hexdigest()}
    print(json.dumps({'游戏副本': asset_id, '三角面': manifest[asset_id]['triangles'], '字节数': len(raw)}, ensure_ascii=False), flush=True)
(workspace / 'src/model-data.ts').write_text('// 游戏模型导出脚本生成；尺寸单位为米，依次为宽、高、深。\nexport const modelData = '
    + json.dumps(manifest, ensure_ascii=False, indent=2) + ' as const;\n', encoding='utf-8')
(workspace / 'docs/modeling/game-model-manifest.json').write_text(json.dumps(
    {'说明': '仅游戏副本经过减面与贴图缩小；原始文件和母版保持不变', '模型': manifest}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
