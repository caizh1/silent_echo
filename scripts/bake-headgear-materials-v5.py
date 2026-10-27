"""将头部漆面、织物与金属微表面烘焙为内嵌贴图，再按穿戴槽合并绘制。"""
import bpy,math,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
master=root/'assets/models/masters/modular-soldier-headgear-v5.blend'
bpy.ops.wm.open_mainfile(filepath=str(master));scene=bpy.context.scene
arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
gear=[o for o in scene.objects if o.type=='MESH' and o.get('sourceAsset')=='headgear-fitted-v5']
opaque=[o for o in gear if o.get('headgearPart')!='lens']
lenses=[o for o in gear if o.get('headgearPart')=='lens']
slot_objects={slot:[o for o in opaque if o.get('outfitSlot')==slot] for slot in ['helmet','goggles','headset']}
for o in gear:o.hide_set(False);o.hide_viewport=False;o.hide_render=False
bpy.ops.object.select_all(action='DESELECT')
for o in opaque:o.select_set(True)
bpy.context.view_layer.objects.active=opaque[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')
materials=set(m for o in opaque for m in o.data.materials)
for m in materials:
 nodes=m.node_tree.nodes;links=m.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
 color=tuple(p.inputs['Base Color'].default_value);rough=p.inputs['Roughness'].default_value
 coords=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=240;noise.inputs['Detail'].default_value=2;noise.inputs['Roughness'].default_value=.7;links.new(coords.outputs['Generated'],noise.inputs['Vector'])
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(c*.84 for c in color[:3])+(1,);ramp.color_ramp.elements[1].color=tuple(c*1.12 for c in color[:3])+(1,)
 links.new(noise.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],p.inputs['Base Color'])
 roughramp=nodes.new('ShaderNodeMapRange');roughramp.inputs['To Min'].default_value=max(0,rough-.055);roughramp.inputs['To Max'].default_value=min(1,rough+.045);links.new(noise.outputs['Fac'],roughramp.inputs['Value']);links.new(roughramp.outputs['Result'],p.inputs['Roughness'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.00012 if '织' not in m.name else .00025;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
images={}
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.bake.margin=8;scene.render.bake.use_selected_to_active=False
destination=root/'assets/textures/headgear-v5';destination.mkdir(parents=True,exist_ok=True)
for label,kind,size in [('base-color','DIFFUSE',2048),('roughness','ROUGHNESS',1024),('normal','NORMAL',2048)]:
 image=bpy.data.images.new('头部装备-'+label,width=size,height=size,alpha=False);image.colorspace_settings.name='sRGB' if label=='base-color' else 'Non-Color'
 for m in materials:
  for node in m.node_tree.nodes:node.select=False
  node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;node.select=True;m.node_tree.nodes.active=node
 bpy.ops.object.bake(type=kind,pass_filter={'COLOR'} if kind=='DIFFUSE' else set(),use_clear=True)
 image.filepath_raw=str(destination/(label+'.png'));image.file_format='PNG';image.save();image.pack();images[label]=image
shared=bpy.data.materials.new('第五版头部烘焙材质');shared.use_nodes=True;nodes=shared.node_tree.nodes;links=shared.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Metallic'].default_value=.18
for label,input_name in [('base-color','Base Color'),('roughness','Roughness')]:
 node=nodes.new('ShaderNodeTexImage');node.image=images[label];links.new(node.outputs['Color'],p.inputs[input_name])
node=nodes.new('ShaderNodeTexImage');node.image=images['normal'];normal=nodes.new('ShaderNodeNormalMap');links.new(node.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal'])
combined=[]
for slot in ['helmet','goggles','headset']:
 objects=slot_objects[slot];bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.view_layer.objects.active;o.name='equipment-'+slot+'-fitted-v5'
 o.data.materials.clear();o.data.materials.append(shared)
 for face in o.data.polygons:face.material_index=0
 o['outfitSlot']=slot;o['sourceAsset']='headgear-fitted-v5';o['headgearPart']='opaque';combined.append(o)
output=root/'public/models/game/modular-soldier-v5.glb';arm.data.pose_position='POSE';scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in ['ARMATURE','EMPTY'] or o.type=='MESH' and (o.name.startswith('base-') or o.get('outfitSlot')):o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
arm.data.pose_position='REST'
for o in scene.objects:
 if o.type=='MESH' and (o.name.startswith('base-') or o.get('outfitSlot')):o.hide_render=bool(o.get('coveredBy')) or (o.get('outfitSlot')=='armor' and o.get('armorTier')!=3)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(master))
report=json.loads((root/'docs/modeling/headgear-manifest-v5.json').read_text());report['头部装备']=[]
for o in combined+lenses:
 o.data.calc_loop_triangles();report['头部装备'].append({'名称':o.name,'槽位':o['outfitSlot'],'材质':o.data.materials[0].name,'三角面':len(o.data.loop_triangles),'顶点':len(o.data.vertices)})
report['字节数']=output.stat().st_size;report['校验值']=hashlib.sha256(output.read_bytes()).hexdigest();report['内嵌头部贴图']=['二维漆面颜色图','二维粗糙度图','切线空间微表面法线图'];report['头部绘制网格数']=len(report['头部装备'])
(root/'docs/modeling/headgear-manifest-v5.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'烘焙完成':True,'头部绘制网格数':len(report['头部装备']),'字节数':report['字节数']},ensure_ascii=False),flush=True)
