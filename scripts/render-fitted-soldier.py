"""渲染适配母版的正、背、侧面，检查装备与人体的实际接触位置。"""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-fitted-v3.blend'))
scene=bpy.context.scene
world=bpy.data.worlds.new('适配检查背景');world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.16,.19,.21,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.7;scene.world=world
target=Vector((0,0,.94))
for position,power in [((4,-4,5),700),((-4,3,4),650)]:
 data=bpy.data.lights.new('检查柔光','AREA');data.energy=power;data.size=4
 light=bpy.data.objects.new('检查柔光',data);scene.collection.objects.link(light);light.location=target+Vector(position)
 light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('检查相机');camera=bpy.data.objects.new('检查相机',data);scene.collection.objects.link(camera);scene.camera=camera
data.type='ORTHO';data.ortho_scale=2.25
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=900;scene.render.resolution_percentage=100
destination=root/'.runtime/modular-soldier/fitted-v3';destination.mkdir(parents=True,exist_ok=True)
for name,offset in [('front',(5,0,0)),('back',(-5,0,0)),('side',(0,-5,0))]:
 camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(destination/(name+'.png'));bpy.ops.render.render(write_still=True)
for obj in scene.objects:
 if obj.get('outfitSlot'):obj.hide_render=True
 if obj.get('coveredBy'):obj.hide_render=False
camera.location=target+Vector((5,0,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(destination/'bare.png');bpy.ops.render.render(write_still=True)
