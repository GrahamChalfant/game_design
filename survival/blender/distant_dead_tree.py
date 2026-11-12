# Makes public/models/distant/tree-dead.glb: the dead tree (tree-dead.glb, hand-made: see
# trees.blend) in under a third of its triangles, for drawing far from the player (see trees.js
# and, for the spruce's own simple versions, conifers.py's DISTANT).
# Run: blender -b --python distant_dead_tree.py
# (or from the Blender MCP / Text Editor in an open Blender: your scene is left as it was)
import os
import bpy

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')
RATIO = 0.3  # the share of its triangles kept

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, 'tree-dead.glb'))
new = [o for o in bpy.data.objects if o not in before]
meshes = [o for o in new if o.type == 'MESH']
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    modifier = o.modifiers.new('simplify', 'DECIMATE')
    modifier.ratio = RATIO
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.select_all(action='DESELECT')
for o in new:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
os.makedirs(os.path.join(MODELS, 'distant'), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, 'distant', 'tree-dead.glb'), export_format='GLB',
                          use_selection=True, export_apply=True, export_animations=False)
print(f'@@ distant/tree-dead.glb: {sum(len(o.data.polygons) for o in meshes)} tris')
for o in new:
    bpy.data.objects.remove(o)
