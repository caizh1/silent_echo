"""以原始完整造型为参照，拆分真实部件并重定位到新版素装士兵骨架。"""
import bpy,bmesh,json,math,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-fitted-v3.blend'))
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
bpy.context.view_layer.update()
base_parts=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('base-')]
original_equipment=[o for o in scene.objects if o.get('outfitSlot')]
base_images=set(bpy.data.images)
base_actions=set(bpy.data.actions)
def actual_mesh(obj):
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();copy=mesh.copy();evaluated.to_mesh_clear();return copy
def actual_points(obj):
 mesh=actual_mesh(obj);points=[obj.matrix_world@v.co for v in mesh.vertices];bpy.data.meshes.remove(mesh);return points
def bounds(points):return Vector([min(p[i] for p in points) for i in range(3)]),Vector([max(p[i] for p in points) for i in range(3)])
before=set(scene.objects)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/models/tripo/raw/soldier-walk-v1.glb'))
imported=[o for o in scene.objects if o not in before];old_arm=next(o for o in imported if o.type=='ARMATURE');old_arm.data.pose_position='REST'
bpy.context.view_layer.update();sources={o.name:o for o in imported if o.type=='MESH' and o.name.startswith('tripo_part_')}
low,high=bounds([p for obj in sources.values() for p in actual_points(obj)])
factor=1.82/(high.z-low.z)
normalizer=Matrix.Translation(Vector((-(low.x+high.x)*factor/2,-(low.y+high.y)*factor/2,-low.z*factor)))@Matrix.Scale(factor,4)
old_matrices={b.name:normalizer@old_arm.matrix_world@b.matrix_local for b in old_arm.data.bones}
new_matrices={b.name:arm.matrix_world@b.matrix_local for b in arm.data.bones}
transfers={}
for name in new_matrices:
 if name not in old_matrices:continue
 old_head=old_matrices[name].translation;new_head=new_matrices[name].translation
 displacement=new_head-old_head
 # 两副骨架均为同方向静止姿态。用关节位移场调整跨度，避免自动绑定的滚转把护具翻到腿后。
 # 原骨架髋关节前后位置偏向腹部，躯干与腿部沿原造型中心线保留厚度。
 if not any(part in name for part in ['Upperarm','Forearm','Hand']):displacement.x=0
 transfers[name]=Matrix.Translation(displacement)
new_joints={b.name:arm.matrix_world@b.head_local for b in arm.data.bones}
body_points=[];body_faces=[]
for obj in base_parts:
 mesh=actual_mesh(obj);offset=len(body_points);body_points.extend(obj.matrix_world@v.co for v in mesh.vertices)
 body_faces.extend(tuple(offset+i for i in face.vertices) for face in mesh.polygons);bpy.data.meshes.remove(mesh)
body_surface=BVHTree.FromPolygons(body_points,body_faces)
strap_material=bpy.data.materials.new('全套深灰织带');strap_material.use_nodes=True
strap_shader=strap_material.node_tree.nodes.get('Principled BSDF');strap_shader.inputs['Base Color'].default_value=(.017,.019,.017,1);strap_shader.inputs['Roughness'].default_value=.82
buckle_material=bpy.data.materials.new('石墨灰带扣');buckle_material.use_nodes=True
buckle_shader=buckle_material.node_tree.nodes.get('Principled BSDF');buckle_shader.inputs['Base Color'].default_value=(.035,.038,.033,1);buckle_shader.inputs['Metallic'].default_value=.4;buckle_shader.inputs['Roughness'].default_value=.52
created=[]
def leg_slice(sign,z):
 points=[p for p in body_points if sign*p.y>.025 and abs(p.z-z)<.018]
 lo,hi=bounds(points);return Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,z)),(hi.x-lo.x)/2,(hi.y-lo.y)/2
def band(label,slot,center,axis,width,bone,radii=(.105,.095),fit_surface=True):
 axis=axis.normalized();u=Vector((1,0,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u)
 segments=64;points=[]
 for depth in [-width/2,width/2]:
  ring=center+axis*depth
  for shell in [0,1]:
   for step in range(segments):
    angle=2*math.pi*step/segments;direction=u*math.cos(angle)+v*math.sin(angle)
    hit,_,_,_=body_surface.ray_cast(ring,direction,.25) if fit_surface else (None,None,None,None)
    distance=(hit-ring).length if hit else 1/math.sqrt((math.cos(angle)/radii[0])**2+(math.sin(angle)/radii[1])**2)
    if not .02<distance<.19:distance=sum(radii)/2
    points.append(ring+direction*(distance+.004+shell*.003))
 faces=[]
 for a,b in [(0,1),(1,3),(3,2),(2,0)]:
  for step in range(segments):faces.append((a*segments+step,a*segments+(step+1)%segments,b*segments+(step+1)%segments,b*segments+step))
 strap_faces=len(faces)
 if slot!='forearms':
  # 带扣位于腿前偏内侧，随同一骨段运动，采用真实倒角几何。
  angle=-.42 if center.y>0 else .42;normal=u*math.cos(angle)+v*math.sin(angle);tangent=axis.cross(normal)
  hit,_,_,_=body_surface.ray_cast(center,normal,.25)
  radius=(hit-center).length if hit else sum(radii)/2;anchor=center+normal*(radius+.009)
  for offset,dimensions in [(-.014*tangent,(.007,.005,width+.012)),(.014*tangent,(.007,.005,width+.012)),(-axis*(width/2+.003),(.007,.033,.005)),(axis*(width/2+.003),(.007,.033,.005))]:
   start=len(points)
   for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]:points.append(anchor+offset+normal*x*dimensions[0]/2+tangent*y*dimensions[1]/2+axis*z*dimensions[2]/2)
   faces.extend(tuple(start+i for i in face) for face in [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
 mesh=bpy.data.meshes.new('贴体织带几何');mesh.from_pydata(points,[],faces);mesh.materials.append(strap_material);mesh.materials.append(buckle_material)
 for face in list(mesh.polygons)[strap_faces:]:face.material_index=1
 obj=bpy.data.objects.new('equipment-fitted-'+label,mesh);scene.collection.objects.link(obj)
 if slot!='forearms':
  bpy.context.view_layer.objects.active=obj;obj.select_set(True);bevel=obj.modifiers.new('带扣小倒角','BEVEL');bevel.width=.0008;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.7;bpy.ops.object.modifier_apply(modifier=bevel.name);obj.select_set(False)
 obj['outfitSlot']=slot;obj['sourceAsset']='fitted-strap';bind(obj,[[(bone,1)]]*len(obj.data.vertices));created.append(obj);return obj
def cut(obj,predicate):
 mesh=bmesh.new();mesh.from_mesh(obj.data)
 bmesh.ops.delete(mesh,geom=[f for f in mesh.faces if not predicate(f.calc_center_median())],context='FACES')
 loose=[v for v in mesh.verts if not v.link_faces]
 if loose:bmesh.ops.delete(mesh,geom=loose,context='VERTS')
 mesh.to_mesh(obj.data);mesh.free()
 if not obj.data.polygons:raise ValueError('选区为空：'+obj.name)
def clean_and_reduce(obj,budget):
 mesh=bmesh.new();mesh.from_mesh(obj.data);bmesh.ops.remove_doubles(mesh,verts=list(mesh.verts),dist=.000005)
 bmesh.ops.recalc_face_normals(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);mesh.free()
 obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
 obj.data.calc_loop_triangles();count=len(obj.data.loop_triangles)
 if count>budget:
  bpy.context.view_layer.objects.active=obj;obj.select_set(True)
  modifier=obj.modifiers.new('保留轮廓减面','DECIMATE');modifier.ratio=budget/count;bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)
 obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
 for face in obj.data.polygons:face.use_smooth=True
def bind(obj,weights):
 obj.vertex_groups.clear();groups={name:obj.vertex_groups.new(name=name) for name in new_matrices}
 for i,items in enumerate(weights):
  for name,weight in items:groups[name].add([i],weight,'REPLACE')
 inverse=arm.matrix_world.inverted();points=[v.co.copy() for v in obj.data.vertices]
 obj.parent=arm;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
 for v,p in zip(obj.data.vertices,points):v.co=inverse@p
 modifier=obj.modifiers.new('共享素装角色骨架','ARMATURE');modifier.object=arm
def clip_boxes(obj,boxes):
 combined=bmesh.new()
 for box in boxes:
  piece=bmesh.new();piece.from_mesh(obj.data)
  for axis,(minimum,maximum) in box.items():
   for value,sign in [(minimum,-1),(maximum,1)]:
    if value is None:continue
    point=Vector();point[axis]=value;normal=Vector();normal[axis]=sign
    bmesh.ops.bisect_plane(piece,geom=list(piece.verts)+list(piece.edges)+list(piece.faces),dist=.000001,plane_co=point,plane_no=normal,clear_outer=True)
  loose=[v for v in piece.verts if not v.link_faces]
  if loose:bmesh.ops.delete(piece,geom=loose,context='VERTS')
  temporary=bpy.data.meshes.new('裁切临时网格');piece.to_mesh(temporary);piece.free();combined.from_mesh(temporary);bpy.data.meshes.remove(temporary)
 combined.to_mesh(obj.data);combined.free()
 if not obj.data.polygons:raise ValueError('精确裁切结果为空：'+obj.name)
def donor(part,slot,label,predicate=lambda p:True,budget=4500,tier=0,inflate=1,boxes=None):
 source=sources['tripo_part_'+str(part)];obj=source.copy();obj.data=actual_mesh(source);scene.collection.objects.link(obj)
 obj.name='equipment-reference-'+label;obj.animation_data_clear();obj.modifiers.clear();obj.parent=None;obj.matrix_world=Matrix.Identity(4)
 for vertex in obj.data.vertices:vertex.co=normalizer@source.matrix_world@vertex.co
 if boxes:clip_boxes(obj,boxes)
 else:cut(obj,predicate)
 clean_and_reduce(obj,budget)
 groups={g.index:g.name for g in obj.vertex_groups};weights=[]
 for vertex in obj.data.vertices:
  items=sorted([(groups[g.group],g.weight) for g in vertex.groups if groups[g.group] in transfers and g.weight>1e-6],key=lambda item:item[1],reverse=True)[:4]
  total=sum(w for _,w in items)
  if total<=0:raise ValueError('原始部件存在空权重：'+obj.name)
  items=[(name,weight/total) for name,weight in items]
  original=vertex.co.copy();vertex.co=sum((transfers[name]@original*weight for name,weight in items),Vector())
  if slot=='armor':vertex.co.y*=1.06
  if slot=='belt':vertex.co.x*=1.12
  if inflate!=1:
   dominant=max(items,key=lambda item:item[1])[0]
   bone=arm.data.bones[dominant];a=arm.matrix_world@bone.head_local;b=arm.matrix_world@bone.tail_local;axis=b-a
   closest=a+axis*max(0,min(1,(vertex.co-a).dot(axis)/max(axis.length_squared,1e-9)))
   vertex.co=closest+(vertex.co-closest)*inflate
  if slot=='backpack':weights.append([('Spine02',1)])
  elif slot in ('thighpouches','kneepads','shinguards'):
   side='L' if 'left' in label else 'R';weights.append([(side+('_Thigh' if slot=='thighpouches' else '_Calf'),1)])
  else:weights.append(items)
 if slot in ('thighpouches','shinguards'):
  sign=1 if 'left' in label else -1;z=sum(v.co.z for v in obj.data.vertices)/len(obj.data.vertices)
  center,_,ry=leg_slice(sign,z);inside=min(sign*v.co.y for v in obj.data.vertices)
  offset=sign*(sign*center.y+ry+.004-inside)
  low,high=bounds([v.co for v in obj.data.vertices]);dx=center.x-(low.x+high.x)/2
  for vertex in obj.data.vertices:vertex.co.y+=offset;vertex.co.x+=dx
 if slot=='boots':
  bottom=min(v.co.z for v in obj.data.vertices)
  for vertex in obj.data.vertices:vertex.co.z-=bottom
 obj['outfitSlot']=slot;obj['sourceAsset']='reference-'+label;obj['referencePart']=part
 if tier:obj['armorTier']=tier
 bind(obj,weights);created.append(obj);return obj

# 完整造型先替换胸背与脚部，保留新版头脸及已有三档换装的轻中档。
replaced=[o for o in original_equipment if o.get('outfitSlot') in ('backpack','boots','kneepads') or (o.get('outfitSlot')=='armor' and o.get('armorTier')==3)]
for obj in replaced:bpy.data.objects.remove(obj,do_unlink=True)
# 原胸甲下缘较短，下腹始终保留完整服装，不能因穿甲而出现贯穿腰部的洞。
upper=next(o for o in base_parts if o.get('coveredBy')=='armor')
abdomen=upper.copy();abdomen.data=upper.data.copy();scene.collection.objects.link(abdomen);abdomen.name='base-abdomen';del abdomen['coveredBy']
cut(abdomen,lambda p:(abdomen.matrix_world@p).z<1.16);cut(upper,lambda p:(upper.matrix_world@p).z>=1.16);del upper['coveredBy'];base_parts.append(abdomen)
donor(1,'armor','chest-iii',budget=11500,tier=3)
for part in [15,16]:donor(part,'armor','vest-side-'+str(part),budget=1000,tier=3)
donor(4,'backpack','backpack',budget=6000)
donor(6,'belt','battle-belt',budget=6000)
donor(7,'neckguard','collar',boxes=[{2:(None,1.59)}],budget=1400)
for side,part in [('left',13),('right',3)]:
 donor(part,'shoulders','shoulder-'+side,boxes=[{1:(-.405,.405)}],budget=2400,inflate=1.10)
 donor(part,'elbows','elbow-'+side,boxes=[{1:((.405,.565) if side=='left' else (-.565,-.405))}],budget=2000,inflate=1.10)
 donor(part,'forearms','forearm-'+side,boxes=[{1:((.565,None) if side=='left' else (None,-.565))}],budget=2200,inflate=1.08)
 bone='L' if side=='left' else 'R';wrist=new_joints[bone+'_Hand'];axis=wrist-new_joints[bone+'_Forearm']
 band('wrist-'+side,'forearms',wrist-axis.normalized()*.012,axis,.030,bone+'_Hand',(.034,.030),False)
for sign,side,calf,boot in [(1,'left',0,8),(-1,'right',12,9)]:
 outer=(.205,None) if sign>0 else (None,-.205)
 donor(2,'thighpouches','thigh-pouch-'+side,boxes=[{1:outer,2:(.70,.99)}],budget=3000,inflate=1)
 donor(calf,'kneepads','knee-'+side,boxes=[{0:(.035,None),2:(.495,None)}],budget=3000,inflate=1)
 outer=(.245,None) if sign>0 else (None,-.245)
 donor(calf,'shinguards','shin-'+side,boxes=[{1:outer,2:(.255,.48)}],budget=2000,inflate=1)
 letter='L' if sign>0 else 'R'
 for slot,zvalues,width in [('thighpouches',[.745,.815],.023),('kneepads',[new_joints[letter+'_Calf'].z-.04,new_joints[letter+'_Calf'].z+.075],.025),('shinguards',[.30,.425],.025)]:
  for i,z in enumerate(zvalues):
   center,rx,ry=leg_slice(sign,z);bone=letter+('_Thigh' if slot=='thighpouches' or(slot=='kneepads' and i==1) else '_Calf')
   axis=new_joints[letter+'_Calf']-new_joints[letter+'_Thigh'] if slot=='thighpouches' else Vector((0,0,1))
   band(slot+'-'+side+'-'+str(i),slot,center,axis,width,bone,(rx,ry))
 donor(boot,'boots','boot-'+side,budget=3500)

# 将目镜镜片与镜框分开，透明镜片保留新版眼睛，避免把镜片当金属片遮住面部。
goggles=next(o for o in scene.objects if o.get('outfitSlot')=='goggles')
lens=bpy.data.materials.new('烟灰透明镜片');lens.use_nodes=True
shader=lens.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.18,.23,.20,1);shader.inputs['Alpha'].default_value=.24;shader.inputs['Roughness'].default_value=.20
goggles.data.materials.append(lens);lens_index=len(goggles.data.materials)-1;lens_faces=0;head=new_joints['Head']
for face in goggles.data.polygons:
 p=sum((goggles.matrix_world@goggles.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
 inside=min(((p.y-offset)/.045)**2+((p.z-head.z-.145)/.023)**2 for offset in [-.052,.052])<1
 if p.x>head.x+.070 and inside:face.material_index=lens_index;lens_faces+=1
goggles['transparentLensFaces']=lens_faces
assert lens_faces>0,'未识别到目镜镜片表面'

# 删除只用于提取的原始全装场景，不能用隐藏旧人物冒充新人物穿戴。
for obj in imported:
 if obj.name in bpy.data.objects:bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):
 if action not in base_actions:bpy.data.actions.remove(action)
equipment=[o for o in scene.objects if o.get('outfitSlot')]
for image in bpy.data.images:
 if image not in base_images and image.type=='IMAGE' and max(image.size)>1024:image.scale(1024,1024);image.pack()
report=[]
for obj in base_parts+equipment:
 obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
 obj.data.calc_loop_triangles();invalid=sum(not any(g.weight>1e-6 for g in v.groups) for v in obj.data.vertices)
 assert invalid==0,(obj.name,invalid)
 assert all(all(math.isfinite(c) for c in v.co) for v in obj.data.vertices),obj.name
 report.append({'名称':obj.name,'槽位':obj.get('outfitSlot'),'来源':obj.get('sourceAsset'),'原始部件':obj.get('referencePart'),'护甲档位':obj.get('armorTier'),'三角面':len(obj.data.loop_triangles),'无权重顶点':invalid})
arm.data.pose_position='POSE';scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
 if obj.type in ('MESH','ARMATURE','EMPTY'):obj.select_set(True)
bpy.context.view_layer.objects.active=arm
output=root/'public/models/game/modular-soldier-v4.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
arm.data.pose_position='REST'
for obj in equipment:obj.hide_render=obj.get('outfitSlot')=='armor' and obj.get('armorTier')!=3
for obj in base_parts:obj.hide_render=bool(obj.get('coveredBy'))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-full-kit-v4.blend'))
result={'说明':'原图完整造型提取并适配到修正版素装骨架；待整体渲染与实机验收','骨骼数':len(arm.data.bones),'动作数':len(bpy.data.actions),'新增与替换网格':len(created),'装备网格数':len(equipment),'穿戴类别':sorted(set(o['outfitSlot'] for o in equipment)),'模型':report,'总三角面':sum(r['三角面'] for r in report),'字节数':output.stat().st_size,'校验值':hashlib.sha256(output.read_bytes()).hexdigest(),'新增积分':0,'原始模型保留':True}
(root/'docs/modeling/full-kit-manifest-v4.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'运行副本':str(output),'装备网格数':len(equipment),'穿戴类别':len(result['穿戴类别']),'三角面':result['总三角面'],'字节数':result['字节数']},ensure_ascii=False),flush=True)
