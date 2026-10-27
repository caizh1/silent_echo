"""记录现有头脸坐标并渲染头部近景，供装备适配与同机位验收。"""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
after='--after' in sys.argv
bpy.ops.wm.open_mainfile(filepath=str(root/('assets/models/masters/modular-soldier-headgear-v5.blend' if after else 'assets/models/masters/modular-soldier-full-kit-v4.blend')))
prefix='after' if after else 'before'
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
bpy.context.view_layer.update()
destination=root/'outputs/headgear-v5';destination.mkdir(parents=True,exist_ok=True)
report={'关节':{b.name:list(arm.matrix_world@b.head_local) for b in arm.data.bones if b.name in ['Head','Neck','Spine02']},'网格':[],'头部截面':[]}
for o in scene.objects:
 if o.type!='MESH':continue
 points=[o.matrix_world@v.co for v in o.data.vertices]
 if o.name.startswith('base-') or o.get('outfitSlot') in ['helmet','goggles','headset']:
  report['网格'].append({'名称':o.name,'槽位':o.get('outfitSlot'),'覆盖':o.get('coveredBy'),'下界':[min(p[i] for p in points) for i in range(3)],'上界':[max(p[i] for p in points) for i in range(3)],'材质':[m.name if m else None for m in o.data.materials]})
base=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('base-')]
points=[o.matrix_world@v.co for o in base for v in o.data.vertices]
for z in [1.55+i*.01 for i in range(28)]:
 selected=[p for p in points if abs(p.z-z)<.004]
 if selected:report['头部截面'].append({'高度':round(z,3),'前后':[min(p.x for p in selected),max(p.x for p in selected)],'左右':[min(p.y for p in selected),max(p.y for p in selected)]})
(destination/('fitted-measurements.json' if after else 'baseline-measurements.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
world=bpy.data.worlds.new('头部检查背景');world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.26,.28,.29,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.65;scene.world=world
target=Vector((.02,0,1.70))
for location,power in [((4,-4,5),700),((-4,3,4),600),((1,5,3),300)]:
 data=bpy.data.lights.new('头部检视柔光','AREA');data.energy=power;data.size=4
 light=bpy.data.objects.new('头部检视柔光',data);scene.collection.objects.link(light);light.location=location;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('头部检查相机');camera=bpy.data.objects.new('头部检查相机',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=.43
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
def render(name,offset):
 camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(destination/(name+'.png'));bpy.ops.render.render(write_still=True)
for name,offset in [('front',(5,0,0)),('side',(0,-5,0)),('angle',(5,-3,.6)),('back',(-5,0,0))]:render(prefix+'-'+name,offset)
for obj in scene.objects:
 if obj.get('outfitSlot') in ['helmet','goggles','headset']:obj.hide_render=True
 if obj.get('coveredBy')=='helmet':obj.hide_render=False
render(prefix+'-bare',(5,0,0))
print(json.dumps(report,ensure_ascii=False),flush=True)
