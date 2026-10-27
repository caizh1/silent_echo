"""导出独立素装、独立全装及同绑定坐标下的十七套装备分件。"""
import bpy,json,hashlib,sys,argparse
from pathlib import Path
from mathutils import Matrix
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--version',type=int,choices=[4,5],default=4)
version=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []).version
master='modular-soldier-headgear-v5.blend' if version==5 else 'modular-soldier-full-kit-v4.blend'
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/models/masters'/master))
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE')
arm.animation_data_clear();arm.data.pose_position='POSE'
for bone in arm.pose.bones:bone.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
meshes=[o for o in scene.objects if o.type=='MESH' and (o.name.startswith('base-') or o.get('outfitSlot'))];bases=[o for o in meshes if o.name.startswith('base-')];gear=[o for o in meshes if o.get('outfitSlot')]
parents=[o for o in scene.objects if o.type in ('ARMATURE','EMPTY')]
for obj in meshes:obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
destination=root/('assets/models/derived/full-kit-v'+str(version));destination.mkdir(parents=True,exist_ok=True)
result=[]
def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parents+objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=arm
 name=name.removesuffix('-v4')+'-v'+str(version);path=destination/(name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
 result.append({'文件':str(path.relative_to(root)),'网格数':len(objects),'字节数':path.stat().st_size,'校验值':hashlib.sha256(path.read_bytes()).hexdigest()})
export('base-soldier-v4',bases)
export('full-kit-soldier-v4',[o for o in bases if not o.get('coveredBy')]+[o for o in gear if o.get('outfitSlot')!='armor' or o.get('armorTier')==3])
for slot in sorted(set(o['outfitSlot'] for o in gear)):
 if slot=='armor':
  for tier,label in [(1,'i'),(2,'ii'),(3,'iii')]:export('armor-'+label+'-v4',[o for o in gear if o.get('outfitSlot')=='armor' and o.get('armorTier')==tier])
 else:export(slot+'-v4',[o for o in gear if o.get('outfitSlot')==slot])
report={'说明':'静止姿态、保留四十一骨骼与绑定权重；素装、全装及十七套装备均在同一绑定坐标；独立全装不包含轻中档胸甲，不会叠穿三档','文件':result,'边界':'这些文件用于编辑复用；游戏使用包含一段行走与全部档位的合并运行副本。分件在完整项目内重建。第三方重新生成或独立归一化后需重新核对坐标。'}
(root/('docs/modeling/full-kit-parts-v'+str(version)+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'分件目录':str(destination),'文件数':len(result),'总字节':sum(item['字节数'] for item in result)},ensure_ascii=False),flush=True)
