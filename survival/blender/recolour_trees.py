# Moves the hand-made trees in trees.blend onto the muted, colder palette (see STYLE_GUIDE.md),
# saves trees.blend, and exports each tree's GLB to survival/public/models/.
# Run: blender -b --python recolour_trees.py
#
# These trees were modelled by hand, so there's no script to rebuild them with new colours.
# Instead this shifts their vertex colours: leaves towards sage and olive, spruce needles
# towards a darker blue-green, bark a touch greyer. It only runs once per .blend (it marks
# the file), so running it again just re-exports.
import colorsys, os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
MARK = 'palette_muted'

LEAVES = {'broadleaf', 'sapling-broadleaf'}
NEEDLES = {'pine', 'pine-skinny', 'pine-small', 'pine-small-snow', 'pine-snow', 'pine-tall', 'pine-wide', 'sapling-pine'}
TREES = sorted(LEAVES | NEEDLES | {'tree-dead'})


def lerp_hue(h, target, t):
    d = ((target - h + 0.5) % 1.0) - 0.5
    return (h + d * t) % 1.0


def shift(rgb, kind):
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    deg = h * 360
    if 45 <= deg <= 190 and s > 0.12:  # foliage
        if kind == 'leaves':
            h, s, v = lerp_hue(h, 78 / 360, 0.6), s * 0.62, min(1, v * 1.04)
        else:
            h, s, v = lerp_hue(h, 158 / 360, 0.65), s * 0.72, v * 0.95
    elif s > 0.15 and (deg < 45 or deg > 330):  # bark and wood
        s *= 0.8
    return colorsys.hsv_to_rgb(h, s, v)


bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'trees.blend'))
scene = bpy.context.scene
if not scene.get(MARK):
    for name in TREES:
        o = bpy.data.objects[name]
        kind = 'leaves' if name in LEAVES else 'needles'
        for attr in o.data.color_attributes:
            for d in attr.data:
                r, g, b = shift(tuple(d.color_srgb[:3]), kind)
                d.color_srgb = (r, g, b, d.color_srgb[3])
    scene[MARK] = True
    bpy.ops.wm.save_mainfile()
    print('@@ recoloured trees.blend')

for name in TREES:
    o = bpy.data.objects[name]
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    # The trees stand in a row in trees.blend, but the game puts each one where it's told,
    # so export it from the origin (its trunk base) or it lands metres off to the side.
    where = o.location.copy()
    o.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, f'{name}.glb')), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)
    o.location = where
    print(f'@@ {name}.glb')
