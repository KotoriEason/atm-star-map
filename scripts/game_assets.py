"""Read pinned resources and bake self-contained inventory icons without running mods.

SVG wrappers contain the original PNG bytes and static model geometry. No image AI,
executed mod code, external image requests or replacement illustrative artwork.
"""
import base64
import copy
import functools
import hashlib
import html
import io
import json
import math
import pathlib
import posixpath
import re
import struct
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / 'data' / 'upstream'
HAS_CHINESE = re.compile(r'[\u3400-\u9fff]')


def clean_name(value):
    return re.sub(r'§[0-9a-fk-or]', '', str(value), flags=re.I).strip()

def merge_languages(layers):
    merged = {}
    for layer in layers:
        merged.update(layer)
    return merged


def translate_base(item_id, language, overrides):
    namespace, path = item_id.lstrip('#').split(':', 1)
    # Block items generally use block.*; generated items use item.*. Exact keys
    # take priority over fuzzy lookup; not every registry path is a language key.
    for suffix in [path, path.replace('/', '.')]:
        for kind in ['item', 'block', 'fluid', 'chemical', 'gas', 'entity', 'module']:
            key = f'{kind}.{namespace}.{suffix}'
            result = clean_name(language.get(key, ''))
            if HAS_CHINESE.search(result):
                return result
    result = clean_name(overrides.get(item_id, ''))
    return result if HAS_CHINESE.search(result) else None

def derived_name(item_id,zh,en,reverse):
    """Resolve names generated at runtime from the pack's own Chinese word tables."""
    ns,path=item_id.lstrip('#').split(':',1)
    for suffix,label in [('_essence','精华'),('_seeds','种子'),('_crop','作物')]:
        if ns in ['mysticalagriculture','mysticalagradditions'] and path.endswith(suffix):
            crop=zh.get('crop.'+ns+'.'+path[:-len(suffix)],'')
            if HAS_CHINESE.search(crop):return clean_name(crop)+label
    if ns=='productivetrees':
        for suffix,label in [('stripped_log','去皮原木'),('stripped_wood','去皮木'),('hanging_sign','悬挂告示牌'),('fence_gate','栅栏门'),('pressure_plate','压力板'),('bookshelf','书架'),('trapdoor','活板门'),('sapling','树苗'),('leaves','树叶'),('planks','木板'),('stairs','楼梯'),('slab','台阶'),('button','按钮'),('fence','栅栏'),('door','门'),('sign','告示牌'),('log','原木'),('wood','木'),('boat','船')]:
            if path.endswith('_'+suffix):
                stem=path[:-len(suffix)-1];name=zh.get(('leaves_type' if suffix=='leaves' else 'wood_type')+'.productivetrees.'+stem,'')
                if HAS_CHINESE.search(name):return clean_name(name).removesuffix('木')+label
    if ns=='chipped' and path.endswith('_leaves'):
        name=zh.get('leaves_type.chipped.'+path[:-7],'')
        if HAS_CHINESE.search(name):return clean_name(name)+'树叶'
    names=[clean_name(en.get(f'{kind}.{ns}.{path}','')) for kind in ['item','block','chemical','fluid']]
    for name in names:
        if name.lower() in reverse:return reverse[name.lower()]
        compressed=re.fullmatch(r'(.+) ([1-9])x',name)
        if ns=='allthecompressed' and compressed and compressed[1].lower() in reverse:return f'{compressed[2]}重压缩'+reverse[compressed[1].lower()]
    # Cosmetic block families can reuse the exact base material translation while
    # preserving the untranslated variant qualifier instead of inventing a name.
    if ns=='chipped':
        for n in range(0,len(path.split('_'))):
            base='_'.join(path.split('_')[n:]);name=translate_base('minecraft:'+base,zh,{})
            if name:return '雕饰'+name+' · '+path[:-(len(base)+1)].replace('_',' ')
    return None


def variant_name(base, key, language):
    if '[' not in key:
        return base.replace('%s', '').strip()
    if 'unobtainium_vibranium_alloy_block[' in key and 'minecraft:unbreaking' in key:
        return '觉醒' + base
    if 'allthetweaks:patrick_star[' in key and 'minecraft:mending' in key:
        return '灌注' + base
    data = re.search(r'hostilenetworks:data=(\d+)', key)
    if data:
        entity = language.get('entity.minecraft.ender_dragon', '末影龙')
        return f'{entity}数据模型 · 数据 {data[1]}'
    enchant = re.search(r'levels:\{["\']?([\w:]+)["\']?:(\d+)', key)
    if enchant:
        ns, name = enchant[1].split(':', 1)
        label = language.get(f'enchantment.{ns}.{name}', name)
        level = language.get(f'enchantment.level.{enchant[2]}', enchant[2])
        return f'{base} · {label} {level}'
    if 'occultism:dragon_familiar' in key:
        return f'{base} · 巨龙魔灵'
    if 'productivebees:soul_lava' in key:
        return '灵魂熔岩蜜蜂刷怪蛋'
    if 'productivebees:withered' in key:
        return '凋零蜜蜂蜂脾'
    if 'minecraft:witch' in key:
        return f'{base} · 女巫'
    if 'wither_skull' in key:
        return f'{base} · 凋零之颅 X'
    if 'apothic_attributes:long_wither' in key:
        return f'{base} · 延长凋零'
    if 'ae2:stored_energy' in key:
        return f'{base} · 已充能'
    if 'fluid_content' in key:
        return f'{base} · 已装填'
    # Preserve identity qualification for other component-bearing items.
    return base.replace('%s', '').strip() + ' · 特定数据'


def texture_name(reference, textures):
    if not reference.startswith('#') and reference in textures:
        reference = '#' + reference
    visited = set()
    while reference.startswith('#'):
        if reference in visited or reference[1:] not in textures:
            raise ValueError('Unresolved or cyclic texture reference')
        visited.add(reference)
        reference = textures[reference[1:]]
    return reference if ':' in reference else f'minecraft:{reference}'


def resolve_model(model_id, get_model, trail=()):
    if ':' not in model_id:
        model_id = 'minecraft:' + model_id
    if model_id in trail or len(trail) >= 32:
        raise ValueError('Model parent cycle')
    current = get_model(model_id)
    if current is None:
        if 'builtin/' in model_id:
            return {'root_parent': model_id, 'textures': {}}
        raise ValueError(f'Model missing: {model_id}')
    parent = current.get('parent')
    base = resolve_model(parent, get_model, (*trail, model_id)) if parent else {'textures': {}}
    merged = {**base, **copy.deepcopy(current)}
    merged['textures'] = {**base.get('textures', {}), **current.get('textures', {})}
    merged['display'] = {**base.get('display', {}), **current.get('display', {})}
    return merged


def rotate(point, angles, origin=(8, 8, 8)):
    x, y, z = [point[i] - origin[i] for i in range(3)]
    for axis, degrees in enumerate(angles):
        a = math.radians(degrees)
        c, s = math.cos(a), math.sin(a)
        if axis == 0:
            y, z = y * c - z * s, y * s + z * c
        elif axis == 1:
            x, z = x * c + z * s, -x * s + z * c
        else:
            x, y = x * c - y * s, x * s + y * c
    return [x + origin[0], y + origin[1], z + origin[2]]


def model_faces(model):
    result = []
    gui = model.get('display', {}).get('gui', {})
    rotation = gui.get('rotation', [30, 225, 0])
    for element in model.get('elements', []):
        x0, y0, z0 = element['from']
        x1, y1, z1 = element['to']
        quads = {
            'north': [(x1,y1,z0),(x0,y1,z0),(x0,y0,z0),(x1,y0,z0)],
            'south': [(x0,y1,z1),(x1,y1,z1),(x1,y0,z1),(x0,y0,z1)],
            'west': [(x0,y1,z0),(x0,y1,z1),(x0,y0,z1),(x0,y0,z0)],
            'east': [(x1,y1,z1),(x1,y1,z0),(x1,y0,z0),(x1,y0,z1)],
            'up': [(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],
            'down': [(x0,y0,z1),(x1,y0,z1),(x1,y0,z0),(x0,y0,z0)],
        }
        for side, face in element.get('faces', {}).items():
            transformed = []
            for point in quads[side]:
                local_rotation = element.get('rotation')
                if local_rotation:
                    angles = [0,0,0]
                    angles['xyz'.index(local_rotation['axis'])] = local_rotation['angle']
                    point = rotate(point, angles, local_rotation.get('origin', [8,8,8]))
                for bone in element.get('bone_rotations',[]):point=rotate(point,bone['angles'],bone['origin'])
                transformed.append(rotate(point, rotation))
            points = [(p[0], -p[1]) for p in transformed]
            a, b, c = points[:3]
            area = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            if area <= 0.000001:
                continue
            uv = face.get('uv', [0,0,16,16])
            result.append({'points': points, 'depth': sum(p[2] for p in transformed)/4, 'texture': face['texture'],
                           'uv': uv, 'uv_rotation': face.get('rotation',0), 'tintindex': face.get('tintindex'),
                           'shade': {'up':1,'down':.55,'north':.78,'south':.78,'east':.65,'west':.65}[side] if element.get('shade',True) else 1})
    return sorted(result, key=lambda f:f['depth'])


def cube_model(textures):
    return {'textures':textures,'elements':[{'from':[0,0,0],'to':[16,16,16],'faces':{
        side:{'texture':'#'+side} for side in ['north','south','east','west','up','down']}}]}


def collect_elements(value):
    if isinstance(value,list):
        return [element for child in value for element in collect_elements(child)]
    if isinstance(value,dict):
        if all(k in value for k in ['from','to','faces']):return [value]
        return [element for child in value.values() for element in collect_elements(child)]
    return []

def obj_faces(text, materials, rotation, flip_v):
    vertices=[];uvs=[];polygons=[];material=next(iter(materials),None)
    for line in text.splitlines():
        parts=line.strip().split()
        if not parts:continue
        if parts[0]=='v':vertices.append(tuple(float(n)*16 for n in parts[1:4]))
        elif parts[0]=='vt':uvs.append((float(parts[1]),1-float(parts[2]) if flip_v else float(parts[2])))
        elif parts[0]=='usemtl':material=parts[1]
        elif parts[0]=='f' and material in materials:
            positions=[];coords=[]
            for ref in parts[1:]:
                indices=ref.split('/');v=int(indices[0]);uv=int(indices[1]) if len(indices)>1 and indices[1] else 0
                if not v or not -len(vertices)<= (v-1 if v>0 else v)<len(vertices):raise ValueError('OBJ vertex index outside available geometry')
                if uv and not -len(uvs)<=(uv-1 if uv>0 else uv)<len(uvs):raise ValueError('OBJ UV index outside available coordinates')
                positions.append(vertices[v-1 if v>0 else v]);coords.append(uvs[uv-1 if uv>0 else uv] if uv else (0,0))
            transformed=[rotate(p,rotation) for p in positions];points=[(p[0],-p[1]) for p in transformed]
            a,b,c=points[:3];area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            if abs(area)>1e-6:polygons.append({'points':points,'depth':sum(p[2] for p in transformed)/len(points),'texture':materials[material],'uv_points':coords,'shade':1})
    return sorted(polygons,key=lambda p:p['depth'])


def box_element(origin,size,uv,width,height,texture='#skin'):
    x,y,z=origin;w,h,d=size;u,v=uv
    rectangles={'west':[u,v+d,u+d,v+d+h],'north':[u+d,v+d,u+d+w,v+d+h],
                'east':[u+d+w,v+d,u+2*d+w,v+d+h],'south':[u+2*d+w,v+d,u+2*d+2*w,v+d+h],
                'up':[u+d,v,u+d+w,v+d],'down':[u+d+w,v,u+d+2*w,v+d]}
    return {'from':[x,y,z],'to':[x+w,y+h,z+d],'faces':{side:{'texture':texture,'uv':[r[0]/width*16,r[1]/height*16,r[2]/width*16,r[3]/height*16]} for side,r in rectangles.items()}}


def gecko_model(data,texture,gui):
    geo=data['minecraft:geometry'][0];description=geo['description'];width=description['texture_width'];height=description['texture_height']
    bones={b['name']:b for b in geo['bones']};elements=[]
    for bone in geo['bones']:
        rotations=[];current=bone
        for _ in range(32):
            if current.get('rotation'):rotations.append({'origin':current.get('pivot',[0,0,0]),'angles':current['rotation']})
            if not current.get('parent'):break
            current=bones[current['parent']]
        for cube in bone.get('cubes',[]):
            if isinstance(cube.get('uv'),list):element=box_element(cube['origin'],cube['size'],cube['uv'],width,height)
            elif isinstance(cube.get('uv'),dict):
                element={'from':cube['origin'],'to':[a+b for a,b in zip(cube['origin'],cube['size'])],'faces':{}}
                for side,face in cube['uv'].items():
                    u,v=face['uv'];uw,vh=face['uv_size'];element['faces'][side]={'texture':'#skin','uv':[u/width*16,v/height*16,(u+uw)/width*16,(v+vh)/height*16]}
            else:continue
            element['bone_rotations']=rotations
            if cube.get('rotation'):element['rotation']={'axis':'x','angle':cube['rotation'][0],'origin':cube.get('pivot',[0,0,0])}
            elements.append(element)
    return {'textures':{'skin':texture},'elements':elements,'display':{'gui':gui}}


class AssetStore:
    def __init__(self, dataset):
        self.index = {}
        self.jars = {}
        self.provenance = []
        self.models = {}
        self.json_cache = {}
        self.language_layers = []
        namespaces = {i['id'].lstrip('#').split(':')[0] for i in dataset['items'].values()}
        mods_path = UPSTREAM / 'mods'
        mods_path.mkdir(exist_ok=True)
        survey = json.loads((UPSTREAM/'resource-survey.json').read_text(encoding='utf-8'))
        with zipfile.ZipFile(UPSTREAM/'ServerFiles-8.3.zip') as server:
            additional=[n for n in server.namelist() if n.startswith('mods/') and n.endswith('.jar') and 'cyclopscore' in n.lower()]
            for entry in dict.fromkeys([*survey['relevantArchives'],*additional]):
                target = mods_path/pathlib.PurePosixPath(entry).name
                if not target.exists():
                    target.write_bytes(server.read(entry))
                self.add_archive(target)
        self.add_archive(UPSTREAM/'minecraft-1.21.1-client.jar', namespaces={'minecraft'})
        if (UPSTREAM/'neoforge-21.1.259-universal.jar').exists():self.add_archive(UPSTREAM/'neoforge-21.1.259-universal.jar')
        self.add_archive(UPSTREAM/'ATM10-8.3.zip', prefix='overrides/kubejs/')
        self.index['assets/minecraft/lang/zh_cn.json'] = ('file',str(UPSTREAM/'minecraft-1.21.1-zh_cn.json'))

    def add_archive(self, path, prefix='', namespaces=None, depth=0):
        jar = zipfile.ZipFile(path)
        self.jars[str(path)] = jar
        self.provenance.append({'archive':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        for entry in jar.namelist():
            if not entry.startswith(prefix):
                continue
            resource = entry[len(prefix):]
            if resource.startswith('assets/') and resource.endswith(('.png','.json','.mcmeta','.obj','.mtl')):
                if namespaces and resource.split('/')[1] not in namespaces:
                    continue
                self.index[resource] = (str(path),entry)
                if '/lang/' in resource and resource.endswith(('zh_cn.json','en_us.json')):
                    self.language_layers.append((resource,str(path),entry))
            if '/tags/item/' in resource and resource.endswith('.json'):
                self.index[resource] = (str(path),entry)
            # Official optional 2D models for Draconic Evolution's dynamic items.
            if '/assets/draconicevolution/' in resource and resource.endswith(('.json','.png')):
                nested=resource[resource.index('assets/draconicevolution/'):]
                if '/models/item/' in nested:
                    self.index.setdefault(nested,(str(path),entry))
            if depth<2 and entry.startswith('META-INF/jarjar/') and entry.endswith('.jar'):
                target=UPSTREAM/'mods'/('nested-'+pathlib.PurePosixPath(entry).name)
                if not target.exists():target.write_bytes(jar.read(entry))
                self.add_archive(target,depth=depth+1)

    @functools.lru_cache(maxsize=4096)
    def read(self, path):
        source=self.index.get(path)
        if source is None:
            return None
        return pathlib.Path(source[1]).read_bytes() if source[0]=='file' else self.jars[source[0]].read(source[1])

    def json(self,path):
        if path not in self.json_cache:
            raw=self.read(path)
            try:self.json_cache[path]=json.loads(raw) if raw else None
            except (ValueError,UnicodeError):self.json_cache[path]=None
        return self.json_cache[path]

    def model(self,model_id):
        ns,path=model_id.split(':',1)
        raw=self.json(f'assets/{ns}/models/{path}.json')
        if not raw:return None
        model=copy.deepcopy(raw);loader=model.get('loader','')
        if loader=='modern_industrialization:use_block_model':
            block=model['block'];bns,bpath=block.split(':',1)
            return {'parent':f'{bns}:block/{bpath}'}
        if loader=='modern_industrialization:machine':
            casing=resolve_model(f'modern_industrialization:machine_casing/{model["casing"]}',self.model)
            overlay=model.get('default_overlays',{}).get('front')
            if overlay:
                casing['textures']['front_overlay']=overlay
                casing['elements']=copy.deepcopy(casing.get('elements',[]))+[{'from':[0,0,-.01],'to':[16,16,-.01],
                    'faces':{'north':{'texture':'#front_overlay','uv':[0,0,16,16]}},'shade':False}]
            return casing
        if loader=='modularbees:connect_model':
            return cube_model({side:model.get(side,model.get('top' if side in ['up','down'] else 'sides')) for side in ['north','south','east','west','up','down']})
        if loader=='neoforge:separate_transforms' and isinstance(model.get('base'),dict):
            return model['base']
        if loader=='neoforge:composite':
            flattened={'textures':dict(model.get('textures',{})),'elements':[],'display':model.get('display',{})}
            for child_name,child in model.get('children',{}).items():
                child=copy.deepcopy(child)
                if child.get('parent'):
                    parent=resolve_model(child['parent'],self.model)
                    child={**parent,**child,'textures':{**parent.get('textures',{}),**child.get('textures',{})}}
                for key,texture in child.get('textures',{}).items():flattened['textures'][f'{child_name}_{key}']=texture
                for element in collect_elements(child.get('elements',[])):
                    for face in element['faces'].values():
                        if face['texture'].startswith('#'):face['texture']=f'#{child_name}_{face["texture"][1:]}'
                    flattened['elements'].append(element)
            return flattened
        if loader=='mekanism:energy_cube':
            model['elements']=collect_elements({k:v for k,v in model.items() if k not in ['textures','display']})
        if loader=='mekanism:robit':model.setdefault('textures',{})['robit']='mekanism:entity/robit/robit'
        return model

    def languages(self):
        zh=[json.loads((UPSTREAM/'minecraft-1.21.1-zh_cn.json').read_text(encoding='utf-8'))];en=[]
        for resource,archive,entry in self.language_layers:
            try:values=json.loads(self.jars[archive].read(entry))
            except (ValueError,UnicodeError):continue
            target=zh if resource.endswith('/zh_cn.json') else en
            target.append(values)
        return merge_languages(zh),merge_languages(en)

    def texture(self,texture_id):
        if ':' not in texture_id:texture_id='minecraft:'+texture_id
        ns,path=texture_id.split(':',1)
        name=posixpath.normpath(f'assets/{ns}/textures/{path}.png')
        data=self.read(name)
        if not data or data[:8]!=b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Texture missing: {texture_id}')
        width,height=struct.unpack('>II',data[16:24])
        meta=self.json(name+'.mcmeta') or {}
        animation=meta.get('animation',{})
        fw=animation.get('width',min(width,height)) if 'animation' in meta else width
        fh=animation.get('height',min(width,height)) if 'animation' in meta else height
        first=(animation.get('frames') or [0])[0]
        frame=first.get('index',0) if isinstance(first,dict) else first
        x=(frame%(width//fw))*fw;y=(frame//(width//fw))*fh
        return {'data':base64.b64encode(data).decode(),'width':width,'height':height,'frameWidth':fw,'frameHeight':fh,'x':x,'y':y,'source':name}


def texture_image(texture, transform='', tint=None):
    image=f'<image width="{texture["width"]}" height="{texture["height"]}" x="{-texture["x"]}" y="{-texture["y"]}" href="data:image/png;base64,{texture["data"]}" image-rendering="pixelated"/>'
    if tint:
        r,g,b=[int(tint[i:i+2],16)/255 for i in (0,2,4)]
        image=f'<filter id="tint"><feColorMatrix type="matrix" values="{r} 0 0 0 0 0 {g} 0 0 0 0 0 {b} 0 0 0 0 0 1 0"/></filter><g filter="url(#tint)">{image}</g>'
    return f'<g transform="{transform}">{image}</g>' if transform else image


def flat_icon(store, layers, tint=None):
    pieces=[];sources=[]
    for i,reference in enumerate(layers):
        t=store.texture(reference);sources.append(t['source'])
        scale=56/max(t['frameWidth'],t['frameHeight'])
        x=(64-t['frameWidth']*scale)/2;y=(64-t['frameHeight']*scale)/2
        pieces.append(f'<svg x="{x:.3f}" y="{y:.3f}" width="{t["frameWidth"]*scale:.3f}" height="{t["frameHeight"]*scale:.3f}" viewBox="0 0 {t["frameWidth"]} {t["frameHeight"]}" overflow="hidden">{texture_image(t,tint=tint if i==0 else None)}</svg>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'+''.join(pieces)+'</svg>',sources


def render_faces(store, faces, textures):
    if not faces:raise ValueError('Model has no static visible geometry')
    xs=[p[0] for f in faces for p in f['points']];ys=[p[1] for f in faces for p in f['points']]
    minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
    scale=56/max(maxx-minx,maxy-miny)
    ox=(64-(maxx-minx)*scale)/2-minx*scale;oy=(64-(maxy-miny)*scale)/2-miny*scale
    body=[];sources=[];definitions=[];texture_ids={};shade_ids={}
    for i,face in enumerate(faces):
        texture_id=texture_name(face['texture'],textures);t=store.texture(texture_id);sources.append(t['source'])
        if texture_id not in texture_ids:
            tid=f't{len(texture_ids)}';texture_ids[texture_id]=tid
            definitions.append(f'<g id="{tid}">{texture_image(t)}</g>')
        points=[(p[0]*scale+ox,p[1]*scale+oy) for p in face['points']]
        # Rotate UV correspondence, retaining the actual model's chosen face.
        shift=(face.get('uv_rotation',0)//90)%4;points=points[shift:]+points[:shift]
        if 'uv_points' in face:uvs=face['uv_points']
        else:
            u0,v0,u1,v1=face['uv'];uvs=[(u0/16,v0/16),(u1/16,v0/16),(u1/16,v1/16),(u0/16,v1/16)]
        p0,p1,p2=points[:3];s0,s1,s2=[(u*t['frameWidth'],v*t['frameHeight']) for u,v in uvs[:3]]
        ux,vx=s1[0]-s0[0],s1[1]-s0[1];uy,vy=s2[0]-s0[0],s2[1]-s0[1];det=ux*vy-uy*vx
        if abs(det)<1e-9:continue
        dx1,dy1=p1[0]-p0[0],p1[1]-p0[1];dx2,dy2=p2[0]-p0[0],p2[1]-p0[1]
        a=(dx1*vy-dx2*vx)/det;c=(dx2*ux-dx1*uy)/det;b=(dy1*vy-dy2*vx)/det;d=(dy2*ux-dy1*uy)/det
        e=p0[0]-a*s0[0]-c*s0[1];f=p0[1]-b*s0[0]-d*s0[1]
        polygon=' '.join(f'{x:.4f},{y:.4f}' for x,y in points)
        shade=face.get('shade',1);filter_ref=''
        if shade<1:
            if shade not in shade_ids:
                sid=f'sh{len(shade_ids)}';shade_ids[shade]=sid
                definitions.append(f'<filter id="{sid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="{shade} 0 0 0 0 0 {shade} 0 0 0 0 0 {shade} 0 0 0 0 0 1 0"/></filter>')
            filter_ref=f' filter="url(#{shade_ids[shade]})"'
        body.append(f'<clipPath id="c{i}"><polygon points="{polygon}"/></clipPath><g clip-path="url(#c{i})"{filter_ref}><use href="#{texture_ids[texture_id]}" transform="matrix({a} {b} {c} {d} {e} {f})"/></g>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>'+''.join(definitions)+'</defs>'+''.join(body)+'</svg>',sorted(set(sources))


def block_icon(store,model):return render_faces(store,model_faces(model),model.get('textures',{}))


def obj_icon(store,model):
    ref=model['model'];ns,path=ref.split(':',1);resource=f'assets/{ns}/{path}'
    raw=store.read(resource)
    if not raw:raise ValueError(f'OBJ missing: {ref}')
    text=raw.decode('utf-8');materials={}
    for name in re.findall(r'^mtllib\s+(.+)$',text,re.M):
        mtl_path=posixpath.normpath(posixpath.join(posixpath.dirname(resource),name.strip()))
        raw=store.read(mtl_path)
        if not raw:continue
        current=None
        for line in raw.decode('utf-8').splitlines():
            if line.startswith('newmtl '):current=line[7:].strip()
            elif line.startswith('map_Kd ') and current:
                texture=line[7:].strip().replace('\\','/')
                if '/assets/' in texture:
                    texture=texture.split('/assets/',1)[1];tns,texture=texture.split('/textures/',1);texture=tns+':'+texture.removesuffix('.png')
                materials[current]=texture
    if model.get('texture_override'):
        names=set(materials)|set(re.findall(r'^usemtl\s+(\S+)',text,re.M))|{'__default'}
        materials={name:model['texture_override'] for name in sorted(names)}
    faces=obj_faces(text,materials,model.get('display',{}).get('gui',{}).get('rotation',[30,225,0]),model.get('flip_v',True))
    return render_faces(store,faces,model.get('textures',{}))


def item_icon(store, item_id):
    ns,path=item_id.lstrip('#').split(':',1)
    overrides=json.loads((ROOT/'data/icon-model-overrides.json').read_text(encoding='utf-8'))
    java_models=json.loads((ROOT/'data/java-item-models.json').read_text(encoding='utf-8'))
    if item_id in java_models:
        source=java_models[item_id];elements=[]
        for part in source['parts']:
            element=box_element(part['origin'],part['size'],part['uv'],source['textureWidth'],source['textureHeight'])
            if part.get('rotation'):element['bone_rotations']=[{'angles':part['rotation'],'origin':part.get('pivot',[0,0,0])}]
            elements.append(element)
        model={'textures':{'skin':source['texture']},'elements':elements,'display':{'gui':{'rotation':source['rotation']}}}
        svg,sources=block_icon(store,model)
        return svg,{'status':'model','textures':sources,'note':source['source']}
    if item_id in overrides['textures']:
        svg,sources=flat_icon(store,overrides['textures'][item_id],overrides['tints'].get(item_id))
        return svg,{'status':'texture','textures':sources,'note':overrides['notes'].get(item_id,'贴图或染色来自本版模组资源/注册脚本。')}
    candidates=[f'{ns}:item/{path}',f'{ns}:block/{path}']
    if item_id in overrides['models']:candidates.insert(0,overrides['models'][item_id])
    if item_id=='ars_nouveau:archmage_spell_book':
        raw=store.model('ars_nouveau:item/archmage_spell_book')
        model=gecko_model(store.json('assets/ars_nouveau/geo/spellbook_closed.geo.json'),'ars_nouveau:item/spellbook_purple',raw.get('display',{}).get('gui',{}))
        svg,sources=block_icon(store,model)
        return svg,{'status':'model','textures':sources,'model':'ars_nouveau:geo/spellbook_closed.geo.json','note':'按模组渲染器使用默认紫色书皮和合拢几何模型。'}
    if re.fullmatch(r'draconicevolution:(basic|wyvern|draconic)_(io|wireless)_crystal',item_id):
        kind='crystal_half' if '_wireless_' in item_id else 'crystal'
        model={'model':f'draconicevolution:models/block/{kind}.obj','texture_override':'draconicevolution:models/crystal_no_shader','display':{'gui':{'rotation':[20,30,0]}}}
        svg,sources=obj_icon(store,model)
        # RenderItemEnergyCrystal's exact non-shader baseColour arrays.
        rgb={'basic':(0.0,0.2,0.3),'wyvern':(0.47,0.0,0.58),'draconic':(1.0,0.4,0.1)}[path.split('_')[0]]
        r,g,b=rgb;filter_xml=f'<defs><filter id="tierTint" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="{r} 0 0 0 0 0 {g} 0 0 0 0 0 {b} 0 0 0 0 0 1 0"/></filter></defs><g filter="url(#tierTint)">'
        split=svg.index('>')+1;svg=svg[:split]+filter_xml+svg[split:-6]+'</g></svg>'
        return svg,{'status':'model','textures':sources,'model':model['model'],'note':'模组晶体 OBJ、无着色器贴图与 RenderItemEnergyCrystal 的对应等级原始染色值；不模拟着色器动画。'}
    if item_id=='draconicevolution:reactor_core':
        model={'model':'draconicevolution:models/block/reactor/reactor_core.obj','texture_override':'draconicevolution:block/reactor/reactor_core','display':{'gui':{'rotation':[20,25,0]}}}
        svg,sources=obj_icon(store,model)
        return svg,{'status':'model','textures':sources,'model':model['model'],'note':'模组反应堆核心静态几何预览，不模拟运行时着色器。'}
    if item_id=='evilcraft:broom':
        combined={'textures':{},'elements':[],'display':{'gui':{'rotation':[30,30,-35]}}}
        refs=['evilcraft:broom_part/brush_wheat','evilcraft:broom_part/cap_gem','evilcraft:broom_part/rod_wood']
        for index,ref in enumerate(refs):
            part=resolve_model(ref,store.model)
            for k,v in part['textures'].items():combined['textures'][f'p{index}_{k}']=v
            for element in copy.deepcopy(part.get('elements',[])):
                for face in element['faces'].values():
                    key=face['texture'].lstrip('#')
                    if key in part['textures']:face['texture']=f'#p{index}_{key}'
                combined['elements'].append(element)
        svg,sources=block_icon(store,combined)
        return svg,{'status':'model','textures':sources,'model':'; '.join(refs),'note':'使用模组无组件时的默认组合：小麦刷、暗色宝石帽、木杆。'}
    reasons=[]
    for candidate in candidates:
        try:
            model=resolve_model(candidate,store.model)
            if model.get('loader')=='neoforge:obj':
                svg,sources=obj_icon(store,model)
                return svg,{'status':'model','model':candidate,'textures':sources,'note':'由模组原始 OBJ 静态渲染。'}
            layers=[texture_name(model['textures'][key],model['textures']) for key in sorted(model.get('textures',{})) if re.fullmatch(r'layer\d+',key)]
            if layers:
                svg,sources=flat_icon(store,layers)
                return svg,{'status':'texture','model':candidate,'textures':sources}
            if model.get('elements'):
                svg,sources=block_icon(store,model)
                return svg,{'status':'model','model':candidate,'textures':sources}
            reasons.append(f'{candidate}: custom loader or entity renderer')
        except (ValueError,KeyError,TypeError,ZeroDivisionError) as error:
            reasons.append(str(error))
    # A directly named item texture is also an authoritative resource fallback.
    for texture in [f'{ns}:item/{path}',f'{ns}:items/{path}',f'{ns}:block/{path}']:
        try:
            svg,sources=flat_icon(store,[texture])
            return svg,{'status':'texture','textures':sources,'note':'direct named texture'}
        except ValueError:pass
    raise ValueError('; '.join(reasons))


def main():
    dataset=json.loads((ROOT/'src/data/atm10-8.3.json').read_text(encoding='utf-8'))
    store=AssetStore(dataset)
    zh,en=store.languages()
    reverse={clean_name(en[k]).lower():clean_name(v) for k,v in zh.items() if k in en and HAS_CHINESE.search(clean_name(v)) and not re.search(r'%[sd]',v) and k.startswith(('item.','block.','crop.','wood_type.','leaves_type.','chemical.','fluid.'))}
    overrides_path=ROOT/'data/zh-cn-overrides.json'
    overrides=json.loads(overrides_path.read_text(encoding='utf-8')) if overrides_path.exists() else {'items':{},'tags':{}}
    previous_path=ROOT/'data/item-presentation.json'
    previous=json.loads(previous_path.read_text(encoding='utf-8')).get('baseItems',{}) if '--incremental' in sys.argv and previous_path.exists() else {}
    output={};missing_names=[];missing_icons=[];counts={}
    icons=ROOT/'public/item-icons';icons.mkdir(exist_ok=True)
    for item_id in sorted({i['id'] for i in dataset['items'].values()}):
        if item_id.startswith('#'):
            continue
        name=translate_base(item_id,zh,overrides['items']) or derived_name(item_id,zh,en,reverse)
        if not name:
            missing_names.append(item_id);ns,path=item_id.split(':',1);english=next((en[k] for k in [f'item.{ns}.{path}',f'block.{ns}.{path}'] if k in en),path.replace('_',' '));name='待译名 · '+clean_name(english)
        cached=previous.get(item_id,{})
        if cached.get('icon') and (ROOT/'public'/cached['icon'].lstrip('/')).exists():
            info=cached['iconSource'];counts[info['status']]=counts.get(info['status'],0)+1
            output[item_id]={'name':name,'icon':cached['icon'],'iconSource':info};continue
        try:
            svg,info=item_icon(store,item_id)
            digest=hashlib.sha256(svg.encode()).hexdigest()[:20]
            filename=f'{digest}.svg';(icons/filename).write_text(svg,encoding='utf-8')
            counts[info['status']]=counts.get(info['status'],0)+1
            output[item_id]={'name':name,'icon':f'/item-icons/{filename}','iconSource':info}
        except (ValueError,KeyError,TypeError) as error:
            missing_icons.append({'id':item_id,'reason':str(error)})
            output[item_id]={'name':name,'icon':None,'iconSource':{'status':'missing'}}
    # Material tags do not have unique inventory artwork. Use a real member when
    # available, and the vanilla name-tag artwork for unresolved tag membership.
    for tag in sorted({i['id'] for i in dataset['items'].values() if i['id'].startswith('#')}):
        ns,path=tag[1:].split(':',1);data=store.json(f'data/{ns}/tags/item/{path}.json') or {}
        members=[v if isinstance(v,str) else v.get('id','') for v in data.get('values',[])]
        member=next((v for v in members if not v.startswith('#') and output.get(v,{}).get('icon')),None)
        if member:record=copy.deepcopy(output[member]);record['iconSource']={'status':'tag','representative':member,'note':'材料标签没有唯一图标，此处显示一个已知成员。'}
        else:
            svg,sources=item_icon(store,'minecraft:name_tag');digest=hashlib.sha256(svg.encode()).hexdigest()[:20];filename=f'{digest}.svg'
            (icons/filename).write_text(svg,encoding='utf-8');record={'icon':f'/item-icons/{filename}','iconSource':{**sources,'status':'tag','note':'材料标签没有唯一图标，使用原版命名牌作标签标识。'}}
        member_names=[output[m]['name'] for m in dataset.get('tags',{}).get(tag,[]) if m in output and not output[m]['name'].startswith('待译名')]
        record['name']=overrides['tags'].get(tag) or ('任意'+member_names[0] if member_names else '材料标签 · '+tag.lstrip('#'));output[tag]=record
    full_items={}
    for key,item in dataset['items'].items():
        record=output[item['id']];name=variant_name(record['name'] or item['name'],key,zh)
        if not HAS_CHINESE.search(name):raise ValueError('Missing Chinese item name: '+key)
        full_items[key]={'name':name,'icon':record['icon'] or '/item-icons/missing.svg',
                         'iconStatus':record['iconSource']['status'],'iconSource':record['iconSource'],
                         'nameSource':'untranslated' if record['name'].startswith('待译名') else 'game-language' if translate_base(item['id'],zh,{}) else 'project-translation'}
    report={'sources':store.provenance,'counts':counts,'missingChinese':missing_names,'missingIcons':missing_icons,'baseItems':output,'tags':overrides['tags'],'items':full_items}
    (ROOT/'data/item-presentation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    used={pathlib.PurePosixPath(v['icon']).name for v in full_items.values()}
    # Only remove obsolete content-hashed output generated by this script.
    for path in icons.glob('*.svg'):
        if re.fullmatch(r'[a-f0-9]{20}\.svg',path.name) and path.name not in used:path.unlink()
    # Language resources are metadata inputs, not assets served by the app.
    (UPSTREAM/'merged-zh_cn.json').write_text(json.dumps(zh,ensure_ascii=False),encoding='utf-8')
    (UPSTREAM/'asset-paths.json').write_text(json.dumps(sorted(store.index),ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'baseIds':len(output),'icons':counts,'missingNames':len(missing_names),'missingIcons':len(missing_icons),'examples':missing_icons[:18]},ensure_ascii=True,indent=2))


if __name__=='__main__':
    main()
