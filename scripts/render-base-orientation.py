"""渲染基础角色的四个正交方向与俯视图，检查头脸、胸背和鞋尖朝向。"""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
ident=sys.argv[sys.argv.index('--')+1]
source=root/'assets/models/tripo/raw'/(ident+'.glb')
output=root/'.runtime/modular-soldier'/ident
output.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
target=(low+high)/2
scale=high.z-low.z
world=bpy.data.worlds.new('检查背景');world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');background.inputs[0].default_value=(.18,.21,.23,1);background.inputs[1].default_value=.7;scene.world=world
for position,power in [((4,-4,5),700),((-4,3,4),650)]:
 data=bpy.data.lights.new('检查柔光','AREA');data.energy=power;data.size=4;o=bpy.data.objects.new('检查柔光',data);scene.collection.objects.link(o);o.location=target+Vector(position);o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('检查相机');camera=bpy.data.objects.new('检查相机',data);scene.collection.objects.link(camera);scene.camera=camera
data.type='ORTHO';data.ortho_scale=scale*1.16
scene.render.engine='CYCLES';scene.cycles.samples=10;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
for name,offset in [('positive-x',(5,0,0)),('negative-x',(-5,0,0)),('negative-y',(0,-5,0)),('positive-y',(0,5,0)),('top',(0,0,5))]:
 camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(output/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps({'检查图目录':str(output)},ensure_ascii=False),flush=True)

