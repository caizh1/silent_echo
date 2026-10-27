"""检查新基础士兵的骨骼层级与绑定空间，不修改原始模型。"""
import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/models/tripo/raw/base-soldier-rigged-v2.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
arm.data.pose_position='REST'
bpy.context.view_layer.update()
pts=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector([min(p[i] for p in pts) for i in range(3)])
hi=Vector([max(p[i] for p in pts) for i in range(3)])
print(json.dumps({'尺寸':list(hi-lo),'骨骼数':len(arm.data.bones),'骨骼':[{'名称':b.name,'头':list(arm.matrix_world@b.head_local),'尾':list(arm.matrix_world@b.tail_local)} for b in arm.data.bones]},ensure_ascii=False),flush=True)

