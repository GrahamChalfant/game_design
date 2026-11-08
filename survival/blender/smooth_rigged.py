# The rigged, animated animals: they can't be rebuilt from scratch without rebuilding their
# skeletons and animations too, so instead each is brought in as its generator made it (boar.py
# and the like), rounded off with one level of subdivision (before its rig, so it still bends
# with the bones), shaded smooth, and written back in place with the same skeleton, animations
# and part names. A model already rounded off (shaded smooth) is left alone, so running this
# twice does no harm.
# The blocky facets turn into soft, organic bodies; the colours blend across the old faces.
# Run in an open Blender (Blender MCP or the Text Editor). It works in a collection of its
# own and removes what it brought in afterwards.
import os
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'public', 'models')
NAMES = [n for n in globals().get('NAMES', ['rabbit', 'boar'])]  # (the deer: deer.py)
LEVELS = {'player': 1}  # (default 1 for all; the player's hands are small, so no more)


def smooth(name):
    work = bpy.data.collections.new(f'smooth-{name}')
    bpy.context.scene.collection.children.link(work)
    layer = bpy.context.view_layer.layer_collection.children[work.name]
    bpy.context.view_layer.active_layer_collection = layer
    before = set(bpy.data.objects)
    actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(os.path.join(MODELS, f'{name}.glb')))
    brought = [o for o in bpy.data.objects if o not in before]
    if any(p.use_smooth for o in brought if o.type == 'MESH' for p in o.data.polygons):
        print(f'@@ {name}.glb: already rounded off, left alone')
        for o in brought:
            bpy.data.objects.remove(o)
        bpy.data.collections.remove(work)
        for action in [a for a in bpy.data.actions if a not in actions]:
            bpy.data.actions.remove(action)
        return
    for o in brought:
        # (Not the small separate details, eyes and buttons and the like: rounded off, they
        # shrink away from the surface they sit on and float.)
        if o.type != 'MESH' or o.name.endswith('-details'):
            continue
        # Weld it first: these models are flat-shaded, every face its own corners, and
        # subdividing loose faces shrinks each into a little patch with gaps round it. (The
        # colours are per corner, so they survive; the bone weights match where corners meet.)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
        bm.to_mesh(o.data)
        bm.free()
        sub = o.modifiers.new('Subdivision', 'SUBSURF')
        sub.levels = sub.render_levels = LEVELS.get(name, 1)
        # (Before the rig, so the rounder mesh is what the bones bend.)
        o.modifiers.move(o.modifiers.find('Subdivision'), 0)
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    for o in brought:
        o.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in brought if o.type == 'ARMATURE')
    out = os.path.abspath(os.path.join(MODELS, f'{name}.glb'))
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                              export_animations=True, export_animation_mode='ACTIONS', export_skins=True)
    tris = sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().loop_triangles) for o in brought if o.type == 'MESH')
    for o in brought:
        bpy.data.objects.remove(o)
    bpy.data.collections.remove(work)
    # (Its animations go too: left behind, the next model exported would take them all along.)
    for action in [a for a in bpy.data.actions if a not in actions]:
        bpy.data.actions.remove(action)
    print(f'@@ {name}.glb: about {tris} tris')


for name in NAMES:
    smooth(name)
print('@@ done')
