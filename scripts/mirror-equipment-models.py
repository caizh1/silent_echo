"""为单侧靴子、手套和护膝生成镜像副本，保留原始模型。"""
import json
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix

root = Path(__file__).resolve().parents[1]
output = root / 'assets/models/derived/equipment'
output.mkdir(parents=True, exist_ok=True)
results = []
for ident, label in [('tactical-boot', '战术靴'), ('tactical-glove', '战术手套'), ('tactical-knee-pad', '战术护膝')]:
    bpy.ops.wm.open_mainfile(filepath=str(root / 'assets/models/masters' / (ident + '-v1.blend')))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    before = sum(len(obj.data.polygons) for obj in meshes)
    reflection = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    for obj in meshes:
        obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world.inverted() @ reflection @ obj.matrix_world)
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in ('MESH', 'EMPTY'):
            obj.select_set(True)
    target = output / (ident + '-mirrored-v1.glb')
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True, export_cameras=False, export_lights=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    imported = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    after = sum(len(obj.data.polygons) for obj in imported)
    assert before == after and after > 0
    assert all(obj.matrix_world.determinant() > 0 for obj in imported)
    results.append({'名称': label + '镜像副本', '文件': str(target.relative_to(root)), '面数': after, '验证': '重新导入成功，面数相同，无负缩放对象', '镜像方式': '按母版世界横轴反射顶点并反转面绕序；材质及纹理坐标随几何保留'})
(root / 'docs/modeling/equipment-mirrors-v1.json').write_text(json.dumps({'镜像副本': results, '边界': '镜像件为静态网格，实际左右侧命名与角色坐标仍应在挂载时核对；不包含骨骼和蒙皮。'}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'已完成镜像副本数': len(results)}, ensure_ascii=False))

