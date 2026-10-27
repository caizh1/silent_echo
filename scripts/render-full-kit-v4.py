"""用统一正交机位检查全装母版、素装与逐区拆装，不修改目标图片。"""
import bpy,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
version=5 if '--v5' in sys.argv else 4
master='modular-soldier-headgear-v5.blend' if version==5 else 'modular-soldier-full-kit-v4.blend'
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/models/masters'/master))
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
world=bpy.data.worlds.new('正背检视背景');world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.38,.39,.38,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.8;scene.world=world
target=Vector((0,0,.93))
for location,power in [((4,-4,5),800),((-4,3,4),650),((1,5,3),350)]:
 data=bpy.data.lights.new('检视柔光','AREA');data.energy=power;data.size=4
 light=bpy.data.objects.new('检视柔光',data);scene.collection.objects.link(light);light.location=location;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('检视相机');camera=bpy.data.objects.new('检视相机',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=2.15
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
destination=root/('outputs/headgear-v5' if version==5 else 'outputs/full-kit-v4')
def render(name,offset):
 camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(destination/(name+'.png'));bpy.ops.render.render(write_still=True)
for name,offset in [('full-front',(5,0,0)),('full-back',(-5,0,0)),('full-left',(0,-5,0)),('full-right',(0,5,0)),('full-angle',(5,-3,1.1))]:render(name,offset)
for label,tier,slots in [('medium-front',2,{'helmet','goggles','headset','backpack','gloves','boots','kneepads'}),('light-front',1,{'goggles','gloves','boots'})]:
 for obj in scene.objects:
  slot=obj.get('outfitSlot');covered=obj.get('coveredBy')
  if slot:obj.hide_render=(obj.get('armorTier')!=tier) if slot=='armor' else slot not in slots
  if covered:obj.hide_render=covered in slots
 render(label,(5,0,0))
for obj in scene.objects:
 if obj.get('outfitSlot'):obj.hide_render=True
 if obj.get('coveredBy'):obj.hide_render=False
render('bare-front',(5,0,0));render('bare-back',(-5,0,0))
print('完整造型正背与四侧检查图已导出',flush=True)
