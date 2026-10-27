"""导入已下载模型，生成结构报告、独立母版和检视渲染，不修改原始文件。"""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

source, destination, kind = sys.argv[sys.argv.index('--') + 1:]
output = Path(destination)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
scene = bpy.context.scene
bone_shapes = {bone.custom_shape for obj in scene.objects if obj.type == 'ARMATURE' for bone in obj.pose.bones if bone.custom_shape}
assets = [obj for obj in scene.objects if obj not in bone_shapes]
meshes = [obj for obj in assets if obj.type == 'MESH' and not obj.hide_render]

def bounds(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    evaluated = [obj.evaluated_get(graph) for obj in objects]
    points = [obj.matrix_world @ Vector(corner) for obj in evaluated for corner in obj.bound_box]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])

bpy.context.view_layer.update()
low, high = bounds(meshes)
extent = high - low
factor = (1.82 / extent.z) if kind == 'soldier' else (0.9 / max(extent))
root = bpy.data.objects.new(kind + '-asset-root', None)
scene.collection.objects.link(root)
for obj in assets:
    if obj.parent is None:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
root.scale = (factor,) * 3
bpy.context.view_layer.update()
low, high = bounds(meshes)
root.location = (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)
bpy.context.view_layer.update()
low, high = bounds(meshes)

items = []
for obj in meshes:
    obj.data.calc_loop_triangles()
    a, b = bounds([obj])
    items.append({'部件': obj.name, '三角面': len(obj.data.loop_triangles),
                  '顶点': len(obj.data.vertices), '最小坐标': list(a), '最大坐标': list(b),
                  '材质': [slot.material.name if slot.material else None for slot in obj.material_slots]})
report = {'源文件': str(Path(source).resolve()), '网格数': len(meshes),
          '三角面总数': sum(item['三角面'] for item in items),
          '骨架数': sum(obj.type == 'ARMATURE' for obj in assets),
          '动作数': len(bpy.data.actions), '归一化尺寸': list(high - low), '部件': items,
          '说明': '仅完成结构导入与静态检视，尚未完成游戏运行、换装或动作变形验收。'}
armatures = [obj for obj in assets if obj.type == 'ARMATURE']
report['骨骼数'] = sum(len(obj.data.bones) for obj in armatures)
report['无有效权重的顶点数'] = sum(1 for obj in meshes for vertex in obj.data.vertices if not any(group.weight > 0.000001 for group in vertex.groups)) if armatures else None
report['动作'] = [{'名称': action.name, '起止帧': list(action.frame_range)} for action in bpy.data.actions]
output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

world = bpy.data.worlds.new('preview-world')
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs[0].default_value = (0.16, 0.17, 0.19, 1)
world.node_tree.nodes.get('Background').inputs[1].default_value = 0.5
scene.world = world
for name, location, energy, size in [('key-light', (3, -4, 5), 700, 4), ('fill-light', (-3, -2, 3), 450, 3), ('rim-light', (1, 4, 4), 600, 3)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = energy, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, high.z / 2)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

camera_data = bpy.data.cameras.new('preview-camera')
camera = bpy.data.objects.new('preview-camera', camera_data)
scene.collection.objects.link(camera)
target = Vector((0, 0, high.z / 2))
camera.location = target + Vector((5, -2.6, 1.5))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = max(high - low) * 1.3
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(output.with_suffix('.png').resolve())
if bpy.data.actions:
    scene.frame_start = int(min(action.frame_range[0] for action in bpy.data.actions))
    scene.frame_end = int(max(action.frame_range[1] for action in bpy.data.actions))
    scene.frame_set((scene.frame_start + scene.frame_end) // 2)
    posed_low, posed_high = bounds(meshes)
    posed_target = (posed_low + posed_high) / 2
    camera.location = posed_target + Vector((5, -2.6, 1.5))
    camera.rotation_euler = (posed_target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.ortho_scale = max(posed_high - posed_low) * 1.3
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend').resolve()))
bpy.ops.render.render(write_still=True)
print(json.dumps({'母版': str(output.with_suffix('.blend')), '报告': str(output.with_suffix('.json')), '预览': str(output.with_suffix('.png'))}, ensure_ascii=False))
