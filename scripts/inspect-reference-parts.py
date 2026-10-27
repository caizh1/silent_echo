"""检查原始全装士兵的静止部件，保留材质并输出可见构造及骨骼尺寸。"""
import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
destination=root/'.runtime/full-kit-v4/reference';destination.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/models/tripo/raw/soldier-walk-v1.glb'))
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
bpy.context.view_layer.update();meshes=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('tripo_part_')]
def actual_points(obj):
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
 result=[evaluated.matrix_world@v.co for v in mesh.vertices];evaluated.to_mesh_clear();return result
points=[p for o in meshes for p in actual_points(o)]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
factor=1.82/(high.z-low.z);normalizer=bpy.data.objects.new('reference-normalization',None);scene.collection.objects.link(normalizer)
for o in list(scene.objects):
 if o!=normalizer and o.parent is None:o.parent=normalizer
normalizer.scale=(factor,)*3;normalizer.location=(-(low.x+high.x)*factor/2,-(low.y+high.y)*factor/2,-low.z*factor)
bpy.context.view_layer.update()
report={'骨骼':{b.name:{'头':list(arm.matrix_world@b.head_local),'尾':list(arm.matrix_world@b.tail_local)} for b in arm.data.bones},'部件':[]}
for o in meshes:
 points=actual_points(o)
 report['部件'].append({'名称':o.name,'最小':list(map(min,zip(*points))),'最大':list(map(max,zip(*points))),'材质':[m.name for m in o.data.materials]})
(destination/'structure.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
world=bpy.data.worlds.new('检查背景');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.21,.23,.24,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.7;scene.world=world
for location,power in [((4,-4,5),750),((-4,3,4),650)]:
 data=bpy.data.lights.new('柔光','AREA');data.energy=power;data.size=4;light=bpy.data.objects.new('柔光',data);scene.collection.objects.link(light);light.location=location;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('检查相机');camera=bpy.data.objects.new('检查相机',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=900;scene.render.resolution_percentage=100
groups=[('all',None,2.13,(0,0,.94)),('waist',[6,14],.65,(0,0,1.04)),('thighs',[2],.68,(0,0,.82)),('arm-left',[13,15],.85,(0,.45,1.42)),('calves',[0,12],.70,(0,0,.44)),('collar',[7],.36,(0,0,1.56))]
for label,ids,scale,target in groups:
 for obj in meshes:obj.hide_render=ids is not None and obj.name not in ['tripo_part_'+str(i) for i in ids]
 target=Vector(target);data.ortho_scale=scale
 for suffix,offset in [('front',(5,0,0)),('back',(-5,0,0))]:
  camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(destination/(label+'-'+suffix+'.png'));bpy.ops.render.render(write_still=True)
print('原始全装部件检查完成',flush=True)
