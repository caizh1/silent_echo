"""保留第四版人体，围绕同一头型重建硬壳头盔、密封目镜与通信耳机。"""
import bpy,bmesh,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-full-kit-v4.blend'))
scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update()
original_actions=set(bpy.data.actions)
def fingerprint(o):
 h=hashlib.sha256()
 for v in o.data.vertices:h.update(repr((tuple(v.co),[(o.vertex_groups[g.group].name,g.weight) for g in v.groups])).encode())
 for f in o.data.polygons:h.update(repr((tuple(f.vertices),f.material_index)).encode())
 for layer in o.data.uv_layers:
  for d in layer.data:h.update(repr(tuple(d.uv)).encode())
 return h.hexdigest()
body={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and o.name.startswith('base-')}
unrelated={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and o.get('outfitSlot') not in [None,'helmet','goggles','headset']}
for o in list(scene.objects):
 if o.get('outfitSlot') in ['helmet','goggles','headset']:bpy.data.objects.remove(o,do_unlink=True)
created=[]
def material(name,color,roughness=.6,metallic=0,alpha=1):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic;p.inputs['Alpha'].default_value=alpha
 m.diffuse_color=(*color,alpha);return m
shell_mat=material('暗橄榄连续复合盔壳',(.044,.049,.038),.60,.12)
rubber=material('石墨黑橡胶密封边',(.012,.015,.014),.82)
hardware=material('深灰倒角金属件',(.038,.042,.037),.48,.45)
patch=material('暗橄榄织物贴片',(.029,.033,.025),.94)
strap=material('深灰固定织带',(.016,.020,.017),.88)
edge=material('盔壳细边与螺钉',(.074,.077,.061),.55,.35)
amber=material('琥珀识别小标',(.50,.22,.035),.38,.15)
lens=material('烟灰透明聚碳酸酯镜片',(.10,.15,.14),.13,.08,.34)

def mesh(name,slot,verts,faces,mat,smooth=False):
 data=bpy.data.meshes.new(name+'-geometry');data.from_pydata(verts,[],faces);data.materials.append(mat);data.update()
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 for f in data.polygons:f.use_smooth=smooth
 o=bpy.data.objects.new('equipment-'+name,data);scene.collection.objects.link(o);o['outfitSlot']=slot;o['sourceAsset']='headgear-fitted-v5';o['headgearPart']=name;created.append(o);return o
def finish(o,bevel=0):
 if bevel:
  bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True)
  mod=o.modifiers.new('真实小倒角','BEVEL');mod.width=bevel;mod.segments=3;mod.limit_method='ANGLE';bpy.ops.object.modifier_apply(modifier=mod.name)
  for f in o.data.polygons:f.use_smooth=True
  mod=o.modifiers.new('平面与倒角加权法线','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=50
  bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 return o
def box(name,slot,center,size,mat,bevel=.001,rotation=None):
 points=[]
 for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]:
  p=Vector((x*size[0]/2,y*size[1]/2,z*size[2]/2));points.append(Vector(center)+(rotation@p if rotation else p))
 return finish(mesh(name,slot,points,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat),bevel)
def tube(name,slot,points,radius,mat,segments=8):
 verts=[];faces=[]
 for i,p in enumerate(points):
  p=Vector(p);axis=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])).normalized();u=axis.cross(Vector((0,0,1)))
  if u.length<.1:u=axis.cross(Vector((0,1,0)))
  u.normalize();v=axis.cross(u)
  for j in range(segments):verts.append(p+radius*(u*math.cos(j*2*math.pi/segments)+v*math.sin(j*2*math.pi/segments)))
 for i in range(len(points)-1):
  for j in range(segments):faces.append((i*segments+j,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,(i+1)*segments+j))
 faces.extend([tuple(reversed(range(segments))),tuple((len(points)-1)*segments+j for j in range(segments))]);return mesh(name,slot,verts,faces,mat,True)
def ribbon(name,slot,points,width,thickness,mat,normals=None):
 verts=[];faces=[]
 for i,p in enumerate(points):
  p=Vector(p);axis=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])).normalized()
  normal=Vector(normals[i]) if normals else Vector((p.x,p.y,0)).normalized();side=axis.cross(normal).normalized();normal=side.cross(axis).normalized()
  for a,b in [(-1,-1),(-1,1),(1,1),(1,-1)]:verts.append(p+side*a*width/2+normal*b*thickness/2)
 for i in range(len(points)-1):
  for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 faces.extend([(3,2,1,0),tuple((len(points)-1)*4+j for j in range(4))]);return mesh(name,slot,verts,faces,mat,True)
def smooth_path(points,steps=5,closed=False):
 p=[Vector(v) for v in points];result=[]
 for i in range(len(p) if closed else len(p)-1):
  a=p[(i-1)%len(p)] if closed or i else p[0];b=p[i];c=p[(i+1)%len(p)];d=p[(i+2)%len(p)] if closed or i+2<len(p) else p[-1]
  for j in range(steps):
   t=j/steps;result.append((2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
 if not closed:result.append(p[-1])
 return result

# 壳体是完整双层曲面，固定厚度和连续法线，不再对三件装备分别缩放。
cx=-.004;cz=1.686;rx=.146;ry=.114;rz=.147
def bottom(phi):
 front=max(0,math.cos(phi));back=max(0,-math.cos(phi));return 1.706+.016*front**2-.035*back**2
def dome(theta,phi,lift=0):return Vector((cx+(rx+lift)*math.sin(theta)*math.cos(phi),(ry+lift)*math.sin(theta)*math.sin(phi),cz+(rz+lift)*math.cos(theta)))
segments=96;rings=28;verts=[];faces=[]
for inner in [False,True]:
 for i in range(rings+1):
  for j in range(segments):
   phi=2*math.pi*j/segments;maximum=math.acos((bottom(phi)-cz)/rz);theta=max(.0001,i/rings*maximum);verts.append(dome(theta,phi,-.0045 if inner else 0))
layer=(rings+1)*segments
for i in range(rings):
 for j in range(segments):
  a=i*segments+j;b=i*segments+(j+1)%segments;c=(i+1)*segments+(j+1)%segments;d=(i+1)*segments+j
  faces.append((a,b,c,d));faces.append((d+layer,c+layer,b+layer,a+layer))
for j in range(segments):faces.append((rings*segments+j,rings*segments+(j+1)%segments,rings*segments+(j+1)%segments+layer,rings*segments+j+layer))
helmet=mesh('helmet-shell','helmet',verts,faces,shell_mat,True)
bm=bmesh.new();bm.from_mesh(helmet.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00003);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(helmet.data);bm.free()
rim=[]
for j in range(segments+1):
 phi=2*math.pi*j/segments;rim.append(dome(math.acos((bottom(phi)-cz)/rz),phi,.0008))
tube('helmet-rubber-rim','helmet',rim,.003,rubber,10)
def dome_patch(name,theta1,theta2,phi1,phi2,mat,lift=.0015):
 verts=[];faces=[];n=12;m=12
 for i in range(n+1):
  for j in range(m+1):verts.append(dome(theta1+(theta2-theta1)*i/n,phi1+(phi2-phi1)*j/m,lift))
 for i in range(n):
  for j in range(m):a=i*(m+1)+j;faces.append((a,a+1,a+m+2,a+m+1))
 return mesh(name,'helmet',verts,faces,mat,True)
for sign in [-1,1]:
 dome_patch('helmet-front-patch-'+str(sign),.50,.98,sign*.30,sign*.72,patch)
 dome_patch('helmet-rear-patch-'+str(sign),.55,1.45,math.pi+sign*.35,math.pi+sign*.89,patch)
 dome_patch('helmet-crown-panel-'+str(sign),.15,.48,sign*.24,sign*1.30,patch,.002)
dome_patch('helmet-crown-spine',.06,1.12,-.075,.075,hardware,.002)
# 前额安装座有真实凹槽、四角螺钉和斜向贴壳底座。
tilt=Matrix.Rotation(-.46,3,'Y');anchor=Vector((.135,0,1.756))
box('helmet-front-mount-base','helmet',anchor,(.010,.057,.065),hardware,.004,tilt)
box('helmet-front-mount-recess','helmet',anchor+tilt@Vector((.006,0,.002)),(.002,.027,.040),rubber,.002,tilt)
for sign in [-1,1]:box('helmet-front-mount-rail-'+str(sign),'helmet',anchor+tilt@Vector((.010,sign*.019,.002)),(.009,.007,.047),edge,.0015,tilt)
box('helmet-front-mount-latch','helmet',anchor+tilt@Vector((.012,0,-.020)),(.010,.044,.008),hardware,.0015,tilt)
def screw(name,slot,center,normal,radius=.003):
 normal=Vector(normal).normalized();end=Vector(center)+normal*.001;tube(name,slot,[Vector(center)-normal*.001,end],radius,edge,12)
 tube(name+'-slot',slot,[end+Vector((0,-radius*.55,0)),end+Vector((0,radius*.55,0))],radius*.13,rubber,4)
for y in [-.023,.023]:
 for z in [-.025,.025]:screw('helmet-mount-bolt-'+str(y)+'-'+str(z),'helmet',anchor+tilt@Vector((.007,y,z)),tilt@Vector((1,0,0)),.0028)
# 底座随额部壳面弯曲，避免降低盔顶后安装座上缘悬空。
for obj in created:
 if 'helmet-front-mount' not in obj.name and 'helmet-mount-bolt' not in obj.name:continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True);bm.to_mesh(obj.data);bm.free()
 for vertex in obj.data.vertices:
  p=vertex.co;surface_x=cx+rx*math.sqrt(max(.001,1-(p.y/ry)**2-((p.z-cz)/rz)**2));plane_x=anchor.x+math.tan(-.46)*(p.z-anchor.z);p.x+=surface_x+.006-plane_x
 obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
box('helmet-rear-marker-base','helmet',(-.143,0,1.729),(.009,.055,.036),hardware,.004)
box('helmet-rear-marker-inset','helmet',(-.149,0,1.730),(.002,.037,.018),patch,.001)
box('helmet-rear-marker','helmet',(-.151,0,1.731),(.002,.019,.005),amber,.001)
for sign in [-1,1]:
 # 侧导轨沿壳体外侧展开；前后端固定，空槽单独建模。
 railpoints=[(.075,sign*.097,1.722),(.026,sign*.115,1.719),(-.055,sign*.111,1.705),(-.104,sign*.087,1.689)]
 ribbon('helmet-side-rail-'+str(sign),'helmet',railpoints,.019,.007,hardware,[(0,sign,0)]*4)
 for i,p in enumerate(railpoints):screw('helmet-rail-bolt-'+str(sign)+'-'+str(i),'helmet',Vector(p)+Vector((0,sign*.005,0)),(0,sign,0),.0033)
 for i in range(4):box('helmet-rail-channel-'+str(sign)+'-'+str(i),'helmet',(.020-i*.022,sign*.120,1.714-i*.003),(.012,.0015,.006),rubber,.001)
 box('helmet-rail-amber-'+str(sign),'helmet',(.060,sign*.108,1.728),(.011,.003,.005),amber,.001)

# 以当前人体曲面计算面罩留量；镜框、软密封圈和镜片使用独立几何。
body_verts=[];body_faces=[]
for obj in [o for o in scene.objects if o.type=='MESH' and o.name.startswith('base-')]:
 offset=len(body_verts);body_verts.extend(obj.matrix_world@v.co for v in obj.data.vertices);body_faces.extend(tuple(offset+i for i in f.vertices) for f in obj.data.polygons)
surface=BVHTree.FromPolygons(body_verts,body_faces)
def glass_x(y,z):
 hit=surface.ray_cast(Vector((.30,y,z)),Vector((-1,0,0)),.25)[0]
 designed=.158-.062*(abs(y)/.108)**2
 return max(designed,hit.x+.010 if hit else designed)
outline=[(-.100,1.691),(-.090,1.703),(-.048,1.708),(0,1.707),(.048,1.708),(.090,1.703),(.100,1.691),(.096,1.670),(.082,1.660),(.041,1.659),(.024,1.666),(0,1.678),(-.024,1.666),(-.041,1.659),(-.082,1.660),(-.096,1.670)]
for sign in [0]:
 path=smooth_path([(y,z,0) for y,z in outline],5,True);center=Vector((0,1.685,0));count=len(path)
 def loop(scale,offset):
  out=[]
  for i,p in enumerate(path):
   tangent=(path[(i+1)%len(path)]-path[(i-1)%len(path)]).normalized();normal=Vector((-tangent.y,tangent.x,0))
   q=p+normal*(scale-1)*.035;y,z=q.x,q.y;out.append(Vector((glass_x(y,z)+offset,y,z)))
  return out
 def ring(name,outer_scale,inner_scale,front,back,mat):
  verts=loop(outer_scale,front)+loop(inner_scale,front)+loop(outer_scale,back)+loop(inner_scale,back);faces=[]
  for a,b in [(0,1),(2,0),(1,3),(3,2)]:
   for j in range(count):faces.append((a*count+j,a*count+(j+1)%count,b*count+(j+1)%count,b*count+j))
  return mesh(name,'goggles',verts,faces,mat,True)
 ring('goggles-seal-'+str(sign),1.12,.95,-.003,-.010,rubber)
 ring('goggles-frame-'+str(sign),1.05,.90,.003,-.004,hardware)
 ring('goggles-inner-rim-'+str(sign),.92,.88,.0035,.001,rubber)
 ring('goggles-edge-trim-'+str(sign),1.045,1.015,.004,.002,edge)
 boundary=loop(.90,.0005);verts=[Vector((glass_x(center.x,center.y)+.002,center.x,center.y))]+boundary;faces=[]
 # 扇面增加径向采样，镜片顺着面部弯曲而非以大三角切过鼻梁。
 radial=6;verts=[Vector((glass_x(center.x,center.y)+.002,center.x,center.y))]
 for r in range(1,radial+1):
  for p in boundary:
   y=center.x+(p.y-center.x)*r/radial;z=center.y+(p.z-center.y)*r/radial;verts.append(Vector((glass_x(y,z)+.0005,y,z)))
 for j in range(count):faces.append((0,1+j,1+(j+1)%count))
 for r in range(radial-1):
  for j in range(count):a=1+r*count+j;b=1+r*count+(j+1)%count;c=b+count;d=a+count;faces.append((a,b,c,d))
 mesh('goggles-lens-'+str(sign),'goggles',verts,faces,lens,True)
for sign in [-1,1]:
 box('goggles-side-latch-'+str(sign),'goggles',(.097,sign*.105,1.690),(.025,.013,.027),hardware,.003)
 box('goggles-latch-inset-'+str(sign),'goggles',(.102,sign*.113,1.690),(.013,.002,.014),rubber,.001)
strap_points=[]
for i in range(65):
 angle=math.pi*.5+math.pi*i/64;strap_points.append((-.004+.121*math.cos(angle),.109*math.sin(angle),1.688))
ribbon('goggles-retention-strap','goggles',strap_points,.023,.003,strap)
for sign in [-1,1]:ribbon('goggles-temple-strap-'+str(sign),'goggles',[(.096,sign*.107,1.688),(.026,sign*.112,1.688),(-.005,sign*.111,1.688)],.023,.003,strap)

# 耳罩围绕耳部，而不是把整副耳机拉伸到下颌与盔顶。
def side_plate(name,slot,sign,contour,inner,outer,mat,bevel=.0015):
 verts=[(x,sign*y,z) for y in [inner,outer] for x,z in contour];n=len(contour)
 faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return finish(mesh(name,slot,verts,faces,mat),bevel)
ear_outline=[(-.047,1.713),(.005,1.714),(.027,1.696),(.029,1.633),(.008,1.610),(-.047,1.612),(-.065,1.635),(-.066,1.689)]
for sign in [-1,1]:
 center=Vector((-.019,1.662))
 cushion=[tuple(center+(Vector(p)-center)*1.04) for p in ear_outline]
 side_plate('headset-ear-cushion-'+str(sign),'headset',sign,cushion,.100,.115,rubber,.004)
 side_plate('headset-ear-shell-'+str(sign),'headset',sign,ear_outline,.113,.138,shell_mat,.005)
 smaller=[tuple(center+(Vector(p)-center)*.70) for p in ear_outline]
 side_plate('headset-ear-panel-'+str(sign),'headset',sign,smaller,.139,.144,hardware,.002)
 box('headset-ear-indicator-'+str(sign),'headset',(-.022,sign*.146,1.682),(.007,.002,.011),amber,.001)
 for i,z in enumerate([1.637,1.649]):box('headset-ear-button-'+str(sign)+'-'+str(i),'headset',(-.042,sign*.146,z),(.010,.003,.007),rubber,.0015)
 for signx,x in [(-1,-.054),(1,.014)]:
  tube('headset-yoke-'+str(sign)+'-'+str(signx),'headset',smooth_path([(x,sign*.122,1.673),(x,sign*.125,1.712),(-.021,sign*.117,1.724)],5),.0025,hardware,8)
  screw('headset-yoke-screw-'+str(sign)+'-'+str(signx),'headset',(x,sign*.141,1.673),(0,sign,0),.003)
headband=[];normals=[]
for i in range(65):
 a=math.pi*i/64;headband.append((-.020,.110*math.cos(a),1.706+.120*math.sin(a)));normals.append((0,math.cos(a),math.sin(a)))
ribbon('headset-under-helmet-band','headset',headband,.025,.004,strap,normals)
tube('headset-boom','headset',smooth_path([(.005,.140,1.637),(.055,.132,1.625),(.125,.095,1.612),(.164,.051,1.609)],6),.0025,hardware,10)
box('headset-microphone-foam','headset',(.165,.041,1.609),(.018,.033,.014),rubber,.006)

# 下颌带归属头盔；与耳机、目镜独立拆装，走向贴合当前下颌。
for sign in [-1,1]:
 points=[(.073,sign*.096,1.722),(.075,sign*.099,1.677),(.088,sign*.090,1.628),(.103,sign*.073,1.602),(.119,sign*.044,1.579),(.113,0,1.563)]
 path=smooth_path(points,6);normals=[Vector((max(.3,p.x*5),sign*max(.12,abs(p.y)*10),-.25 if p.z<1.59 else 0)).normalized() for p in path]
 ribbon('helmet-chin-front-'+str(sign),'helmet',path,.010,.0025,strap,normals)
 points=[(-.100,sign*.080,1.686),(-.072,sign*.104,1.648),(.012,sign*.105,1.609),(.103,sign*.073,1.602)]
 ribbon('helmet-chin-rear-'+str(sign),'helmet',smooth_path(points,7),.011,.0025,strap)
 box('helmet-chin-adjuster-'+str(sign),'helmet',(.102,sign*.078,1.606),(.015,.009,.020),hardware,.002)
box('helmet-chin-pad','helmet',(.116,0,1.565),(.010,.061,.015),rubber,.004)

# 合并同槽位、同材质的小零件，保持透明镜片与不透明框体分离，降低绘制次数。
groups={}
for o in created:groups.setdefault((o['outfitSlot'],o.data.materials[0].name),[]).append(o)
combined=[]
for (slot,mat),objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 obj=bpy.context.view_layer.objects.active;is_lens=obj.data.materials[0]==lens;obj.name='equipment-'+slot+'-'+('lens' if is_lens else str(len(combined)))
 obj['outfitSlot']=slot;obj['sourceAsset']='headgear-fitted-v5';obj['headgearPart']='lens' if is_lens else 'opaque'
 world=[obj.matrix_world@v.co for v in obj.data.vertices];obj.vertex_groups.clear();vg=obj.vertex_groups.new(name='Head');vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
 obj.parent=arm;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
 inverse=arm.matrix_world.inverted()
 for v,p in zip(obj.data.vertices,world):v.co=inverse@p
 mod=obj.modifiers.new('共用头骨绑定','ARMATURE');mod.object=arm
 combined.append(obj)
assert all(fingerprint(bpy.data.objects[name])==value for name,value in body.items()),'基础人体被意外修改'
assert all(fingerprint(bpy.data.objects[name])==value for name,value in unrelated.items()),'非头部装备被意外修改'
assert set(bpy.data.actions)==original_actions,'动作发生变化'
output=root/'public/models/game/modular-soldier-v5.glb'
for o in scene.objects:
 if o.type=='MESH' and (o.name.startswith('base-') or o.get('outfitSlot')):o.hide_set(False);o.hide_viewport=False;o.hide_render=False
arm.data.pose_position='POSE';scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
 if obj.type in ['ARMATURE','EMPTY'] or obj.type=='MESH' and (obj.name.startswith('base-') or obj.get('outfitSlot')):obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
arm.data.pose_position='REST'
for obj in scene.objects:
 if obj.type=='MESH' and (obj.name.startswith('base-') or obj.get('outfitSlot')):obj.hide_render=bool(obj.get('coveredBy')) or (obj.get('outfitSlot')=='armor' and obj.get('armorTier')!=3)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/models/masters/modular-soldier-headgear-v5.blend'))
report={'说明':'保留第四版人体与脸部，围绕同一头型重建头部三类装备','人体完全一致':True,'非头部装备完全一致':True,'基础网格校验':body,'非头部网格校验':unrelated,'头部装备':[],'骨骼数':len(arm.data.bones),'动作数':len(bpy.data.actions),'字节数':output.stat().st_size,'校验值':hashlib.sha256(output.read_bytes()).hexdigest(),'新增建模积分':0}
for o in combined:
 o.data.calc_loop_triangles();report['头部装备'].append({'名称':o.name,'槽位':o['outfitSlot'],'材质':o.data.materials[0].name,'三角面':len(o.data.loop_triangles),'顶点':len(o.data.vertices)})
(root/'docs/modeling/headgear-manifest-v5.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['基础网格校验','非头部网格校验','头部装备']},ensure_ascii=False),flush=True)
