"""将修正版士兵与独立装备统一到同一骨架，导出换装游戏副本与静态适配母版。"""
import bpy,bmesh,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.kdtree import KDTree
root=Path(__file__).resolve().parents[1]
source=root/'assets/models/tripo/raw/base-soldier-walk-v3.glb'
out=root/'public/models/game/modular-soldier-v3.glb'
work=root/'.runtime/modular-soldier/fitted-v3'
work.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene
arm=next(o for o in scene.objects if o.type=='ARMATURE')
base=next(o for o in scene.objects if o.type=='MESH')
base_images=set(bpy.data.images)
arm.data.pose_position='REST'
bpy.context.view_layer.update()
def vertices(obj):return [obj.matrix_world@v.co for v in obj.data.vertices]
def bounds(points):
 return Vector([min(p[i] for p in points) for i in range(3)]),Vector([max(p[i] for p in points) for i in range(3)])
lo,hi=bounds(vertices(base));factor=1.82/(hi.z-lo.z)
normalizer=bpy.data.objects.new('soldier-normalization',None);scene.collection.objects.link(normalizer)
for obj in list(scene.objects):
 if obj!=normalizer and obj.parent is None:obj.parent=normalizer
normalizer.scale=(factor,)*3;normalizer.location=(-(lo.x+hi.x)*factor/2,-(lo.y+hi.y)*factor/2,-lo.z*factor)
bpy.context.view_layer.update()
def joint(name):return arm.matrix_world@arm.data.bones[name].head_local
joints={name:joint(name) for name in arm.data.bones.keys()}
assert joints['Head'].z>1.3 and abs(joints['L_Hand'].y)>.5
original_points=vertices(base);tree=KDTree(len(original_points))
for i,p in enumerate(original_points):tree.insert(p,i)
tree.balance()
source_groups={g.index:g.name for g in base.vertex_groups}
source_weights=[[(source_groups[g.group],g.weight) for g in v.groups if g.weight>1e-6] for v in base.data.vertices]
all_bones=set(arm.data.bones.keys())
def nearest_weights(point):
 found=tree.find_n(point,4);weights={}
 for _,index,distance in found:
  influence=1/max(distance,.002)**2
  for name,weight in source_weights[index]:
   if name in all_bones:weights[name]=weights.get(name,0)+weight*influence
 items=sorted(weights.items(),key=lambda e:e[1],reverse=True)[:4];total=sum(w for _,w in items)
 assert total>0
 return [(name,w/total) for name,w in items]
def reduce(obj,budget):
 obj.data.calc_loop_triangles();count=len(obj.data.loop_triangles)
 if count>budget:
  bpy.context.view_layer.objects.active=obj;obj.select_set(True)
  modifier=obj.modifiers.new('游戏减面','DECIMATE');modifier.ratio=budget/count
  bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)
reduce(base,28000)
# 身体被装备覆盖的区域独立保留，卸下装备时恢复原始皮肤与服装。
hand_limit=min(abs(joints['L_Hand'].y),abs(joints['R_Hand'].y))-.005
def coverage(face):
 p=base.matrix_world@face.calc_center_median()
 if p.z<.19:return 'boots'
 if abs(p.y)>hand_limit and p.z>1.15:return 'gloves'
 if p.z>1.73:return 'helmet'
 if .99<p.z<1.36 and abs(p.y)<.185 and abs(p.x)>.035:return 'armor'
 return ''
bm=bmesh.new();bm.from_mesh(base.data);bm.faces.ensure_lookup_table()
categories={face.index:coverage(face) for face in bm.faces};bm.free()
body_parts=[]
for category in ['', 'boots','gloves','helmet','armor']:
 obj=base.copy();obj.data=base.data.copy();scene.collection.objects.link(obj);obj.name='base-'+(category or 'body')
 mesh=bmesh.new();mesh.from_mesh(obj.data);mesh.faces.ensure_lookup_table()
 bmesh.ops.delete(mesh,geom=[f for f in mesh.faces if categories[f.index]!=category],context='FACES')
 loose=[v for v in mesh.verts if not v.link_faces]
 if loose:bmesh.ops.delete(mesh,geom=loose,context='VERTS')
 mesh.to_mesh(obj.data);mesh.free()
 if category:obj['coveredBy']=category
 body_parts.append(obj)
bpy.data.objects.remove(base,do_unlink=True)
equipment=[]
shared_materials={}
def import_gear(ident):
 before=set(scene.objects)
 bpy.ops.import_scene.gltf(filepath=str(root/'assets/models/tripo/raw'/(ident+'-v1.glb')))
 imported=[o for o in scene.objects if o not in before]
 obj=next(o for o in imported if o.type=='MESH')
 if ident in shared_materials:
  obj.data.materials.clear()
  for material in shared_materials[ident]:obj.data.materials.append(material)
 else:shared_materials[ident]=list(obj.data.materials)
 points=vertices(obj)
 obj.parent=None;obj.matrix_world=Matrix.Identity(4)
 for vertex,p in zip(obj.data.vertices,points):vertex.co=p
 for other in imported:
  if other!=obj:bpy.data.objects.remove(other,do_unlink=True)
 return obj,points
def fit(ident,slot,width,depth,height,floor,cx=0,cy=0,tier=0,side=0):
 obj,points=import_gear(ident);low,high=bounds(points);extent=high-low;center=(low+high)/2
 transformed=[]
 for p in points:
  x=(p.x-center.x)/extent.x;y=(p.y-center.y)/extent.y;z=(p.z-low.z)/extent.z
  if slot=='backpack':
   x=-x;y=-y
   px=-.13+(x-.13)*(.30 if x<=.13 else .70)
   point=Vector((px,y*width,z*height+floor))
  elif slot=='gloves':
   # 原手套背面朝前、手指朝上；穿戴时手背朝上，手指沿手臂向外。
   wrist=joints['R_Hand'];point=Vector((wrist.x-y*width,wrist.y+.028-z*height,wrist.z+x*depth))
   if side>0:
    point.y=-point.y;point+=joints['L_Hand']-Vector((wrist.x,-wrist.y,wrist.z))
  else:point=Vector((x*depth+cx,y*width+cy,z*height+floor))
  transformed.append(point)
 for vertex,p in zip(obj.data.vertices,transformed):vertex.co=p
 if slot=='gloves' and side>0:
  mesh=bmesh.new();mesh.from_mesh(obj.data);bmesh.ops.reverse_faces(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);mesh.free()
 if side<0 and slot in ('boots','kneepads'):
  # 左右件按人体横轴反射，保持鞋尖与护膝正面朝向不变。
  for vertex in obj.data.vertices:vertex.co.y=2*cy-vertex.co.y
  mesh=bmesh.new();mesh.from_mesh(obj.data);bmesh.ops.reverse_faces(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);mesh.free()
 # 下载网格在贴图接缝处有重复顶点，先焊接再减面，避免各片独立塌缩产生裂缝。
 welded=bmesh.new();welded.from_mesh(obj.data)
 bmesh.ops.remove_doubles(welded,verts=list(welded.verts),dist=.000005)
 bmesh.ops.recalc_face_normals(welded,faces=list(welded.faces));welded.to_mesh(obj.data);welded.free()
 # 非均匀缩放、反射与减面后清除原定制法线，重新计算当前形体的法线。
 obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
 reduce(obj,6500 if slot in ('armor','backpack') else 3600 if slot in ('gloves','boots') else 4200)
 obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
 for polygon in obj.data.polygons:polygon.use_smooth=True
 obj.name='equipment-'+ident+('-left' if side>0 else '-right' if side<0 else '')
 obj['outfitSlot']=slot;obj['sourceAsset']=ident
 if tier:obj['armorTier']=tier
 # 所有装备共享同一骨架；软质及关节部件按真实身体邻域转移权重。
 world_points=[v.co.copy() for v in obj.data.vertices]
 obj.vertex_groups.clear()
 groups={name:obj.vertex_groups.new(name=name) for name in all_bones}
 for i,p in enumerate(world_points):
  weights=[('Head',1)] if slot in ('helmet','goggles','headset') else [('Spine02',1)] if slot=='backpack' else nearest_weights(p)
  for name,weight in weights:groups[name].add([i],weight,'REPLACE')
 obj.parent=arm;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
 inverse=arm.matrix_world.inverted()
 for vertex,p in zip(obj.data.vertices,world_points):vertex.co=inverse@p
 modifier=obj.modifiers.new('共享角色骨架','ARMATURE');modifier.object=arm
 equipment.append(obj);return obj
head=joints['Head']
fit('tactical-helmet','helmet',.245,.285,.30,1.555,cx=head.x)
fit('tactical-goggles','goggles',.224,.265,.080,head.z+.105,cx=head.x+.010)
fit('tactical-headset','headset',.285,.225,.295,1.545,cx=head.x)
fit('tactical-backpack','backpack',.35,.30,.48,1.02)
for tier,(height,floor,width,depth) in enumerate([(.55,1.02,.49,.42),(.61,.99,.52,.44),(.70,.94,.57,.46)],1):
 fit('body-armor-'+['i','ii','iii'][tier-1],'armor',width,depth,height,floor,tier=tier)
for side,name in [(1,'L'),(-1,'R')]:
 foot=joints[name+'_Foot'];knee=joints[name+'_Calf']
 fit('tactical-boot','boots',.142,.335,.255,0,cx=foot.x+.075,cy=foot.y,side=side)
 fit('tactical-glove','gloves',.112,.060,.21,0,side=side)
 fit('tactical-knee-pad','kneepads',.16,.23,.225,knee.z-.11,cx=knee.x+.025,cy=knee.y,side=side)
for image in bpy.data.images:
 size=1024 if image in base_images else 512
 if image.type=='IMAGE' and max(image.size)>size:image.scale(size,size);image.pack()
# 权重检查先于导出，不能用只有静态形体的文件冒充可穿戴模型。
report=[]
for obj in body_parts+equipment:
 obj.data.calc_loop_triangles()
 empty=sum(not any(g.weight>1e-6 for g in v.groups) for v in obj.data.vertices)
 assert empty==0, (obj.name,empty)
 assert all(all(math.isfinite(c) for c in v.co) for v in obj.data.vertices)
 report.append({'名称':obj.name,'槽位':obj.get('outfitSlot'),'覆盖区域':obj.get('coveredBy'),'三角面':len(obj.data.loop_triangles),'无权重顶点':empty})
arm.data.pose_position='POSE';scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
 if obj.type in ('MESH','ARMATURE','EMPTY'):obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
# 静态适配母版保留全部互斥部件，默认只显示重装组合。
arm.data.pose_position='REST'
for obj in equipment:obj.hide_render=obj.get('outfitSlot')=='armor' and obj.get('armorTier')!=3
for obj in body_parts:obj.hide_render=bool(obj.get('coveredBy'))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-fitted-v3.blend'))
result={'源角色':str(source.relative_to(root)),'运行文件':str(out.relative_to(root)),'骨骼数':len(arm.data.bones),'动作数':len(bpy.data.actions),'装备网格数':len(equipment),'模型':report,'总三角面':sum(r['三角面'] for r in report),'字节数':out.stat().st_size,'校验值':hashlib.sha256(out.read_bytes()).hexdigest(),'边界':'手部沿现有手骨运动，当前骨架没有独立指骨；穿戴动作与细节还需浏览器实测。'}
(root/'docs/modeling/modular-soldier-manifest-v3.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'导出完成':str(out),'总三角面':result['总三角面'],'字节数':result['字节数']},ensure_ascii=False),flush=True)

