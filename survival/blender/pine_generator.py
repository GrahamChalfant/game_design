# Generates pine.glb in survival/public/models/ by "growing" a low-poly pine from a few rules,
# the same rules that made the photoreal test render convincing, scaled down to the game's style:
#   1. Branches grow in whorls (tiers) with gaps between them, not as one smooth cone.
#   2. Each tier sags under its own weight, then its branch tips turn up.
#   3. Tiers shrink toward the top, each one varied a little, and the odd branch is missing.
#   4. The trunk flares at the base, leans a few degrees, and has a couple of dead stubs low down.
#   5. Colour by depth: dark inside and under the tiers, mid green on top, light at the tips.
# Run: blender -b --python pine_generator.py [-- seed]
# Follows STYLE_GUIDE.md: one vertex-colour material ('tree', 'Col' attribute), palette colours,
# flat shading, 1 unit = 1 m, base at the origin, front faces Blender -Y.
import bpy, bmesh, math, os, random, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEED = int(ARGS[0]) if ARGS else 7

# Greens match the shipped pines (lighter than STYLE_GUIDE's swatches, which read too dark in-game).
PAL = dict(needles_dark=0x2F4533, needles=0x4B6A3E, needle_tip=0x6C864B,
           wood=0x6B4A32, wood_dark=0x54392A, driftwood=0x7A7067, moss=0x688841)

# Shape of the tree (pine.glb: ~9 m tall, ~3.6 m across, like the model it replaces).
HEIGHT = 9.2
SINK = 0.27        # the trunk starts this far below the ground, so slopes don't show a gap
CROWN_BASE = 1.15  # height of the lowest tier's branch tips
MAX_RADIUS = 1.75  # reach of the lowest tier's branches
LOBES = 5          # branches per tier at the bottom (one fewer higher up)
LEAN = 0.035       # sideways drift of the trunk per metre of height (~2 degrees)


def hexcol(name, var=0.0, lift=0.0):
    """Palette colour as linear RGBA, varied by ±var in value and mixed `lift` toward needle_tip."""
    h = PAL[name]
    rgb = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    if lift:
        t = [((PAL['needle_tip'] >> s) & 255) / 255 for s in (16, 8, 0)]
        rgb = [a + (b - a) * lift for a, b in zip(rgb, t)]
    k = 1 + random.uniform(-var, var)
    return (*[min(1.0, c * k) ** 2.2 for c in rgb], 1.0)


def mix(c1, c2, t):
    return tuple(a + (b - a) * t for a, b in zip(c1, c2))


class Builder:
    """Collects triangles and quads in one bmesh; each face remembers its own flat colour."""
    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new('ci')
        self.cols = []

    def face(self, pts, colour, up=0.0):
        """Adds a face, wound so its normal points away from the trunk (plus `up` metres of
        upward bias: 1 for top surfaces, -1 for undersides). Open skirts confuse Blender's
        automatic normal fix, so each face is oriented here instead."""
        centre = sum(pts, Vector()) / len(pts)
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        hint = centre - axis(centre.z) + Vector((0, 0, up))
        if normal.dot(hint) < 0:
            pts = pts[::-1]
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f[self.lay] = len(self.cols)
        self.cols.append(colour)
        return f


def axis(z):
    """Trunk centre at height z: a slight lean with a gentle wobble (rule 4)."""
    return Vector((LEAN * z + 0.05 * math.sin(z * 0.7), 0.03 * math.sin(z * 1.1 + 1), z))


def trunk_radius(z):
    return 0.2 * (1 - z / HEIGHT) ** 0.8 + 0.03 + 0.14 * math.exp(-(z + SINK) / 0.35)  # flare at the base


def build_trunk(b):
    sides = 6
    zs = [-SINK, 0.05, 0.45, 1.6, 4.0, 7.0]
    rot = random.uniform(0, 1)
    rings = []
    for z in zs:
        c, r = axis(z), trunk_radius(z)
        rings.append([c + Vector((r * math.cos(rot + math.tau * k / sides), r * math.sin(rot + math.tau * k / sides), 0))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            a, c = rings[i], rings[i + 1]
            colour = hexcol('wood_dark' if i == 0 else 'wood', 0.07)  # darker at the base, like AO
            b.face((a[k], a[(k + 1) % sides], c[(k + 1) % sides], c[k]), colour)
    # dead stubs on the bare lower trunk (rule 4): short, chunky, drooping
    for phi, z, length in ((0.6, 0.75, 0.42), (2.9, 0.95, 0.32), (4.6, 0.55, 0.36)):
        phi += random.uniform(-0.3, 0.3)
        d = Vector((math.cos(phi), math.sin(phi), -0.35)).normalized()
        base = axis(z) + Vector((math.cos(phi), math.sin(phi), 0)) * trunk_radius(z) * 0.6
        tip = base + d * length
        u = d.cross(Vector((0, 0, 1))).normalized(); v = d.cross(u)
        ring = [base + (u * math.cos(math.tau * k / 4) + v * math.sin(math.tau * k / 4)) * 0.055 for k in range(4)]
        for k in range(4):
            b.face((ring[k], ring[(k + 1) % 4], tip), hexcol('driftwood', 0.06))


def build_tier(b, z_tip, R, t, missing):
    """One whorl of branches (rules 1-3). From the trunk the skirt slopes down in one broad,
    light-catching surface, sags near the end (the branch bending under its weight), then the
    tips turn up. The rim is scalloped: each branch end is a broad lobe, never a spike."""
    c = axis(z_tip)
    rise = 0.45 + 0.45 * R                               # apex height above the branch ends
    apex = axis(z_tip + rise)
    under = axis(z_tip - 0.15 - 0.1 * R)                 # the skirt's underside meets the trunk here
    droop, upturn = 0.12 + 0.1 * R, 0.06 + 0.06 * R
    lobes = LOBES if t < 0.4 else LOBES - 1
    phase = random.uniform(0, math.tau)
    rings = ([], [], [])                                 # mid (0.5), outer (0.85) and rim (1.0) of the reach
    kind = []
    for j in range(lobes):
        centre = phase + math.tau * j / lobes + random.uniform(-0.15, 0.15)
        half = math.pi / lobes
        r = R * (0.68 if j in missing else random.uniform(0.88, 1.1))
        for ang, rr, k in ((centre - half * 0.45, r, 'lobe'), (centre + half * 0.45, r, 'lobe'),
                           (centre + half, R * 0.8, 'notch')):
            out = Vector((math.cos(ang), math.sin(ang), 0))
            line = lambda f: rise * (1 - f)              # straight slope from apex to tip height
            sag = droop if k == 'lobe' else droop * 0.6
            rings[0].append(c + out * rr * 0.5 + Vector((0, 0, line(0.5) - sag * 0.25)))
            rings[1].append(c + out * rr * 0.85 + Vector((0, 0, line(0.85) - sag)))
            rings[2].append(c + out * rr + Vector((0, 0, -sag + (upturn if k == 'lobe' else upturn * 0.4))))
            kind.append(k)
    n = len(kind)
    young = max(0.0, (t - 0.5) / 0.5) * 0.45              # upper tiers: fresher, lighter growth
    shade = 0.25 * max(0.0, 1 - t / 0.35)                 # lowest tiers sit in the crown's shadow
    for j in range(n):
        k = (j + 1) % n
        lobe = kind[j] == 'lobe' and kind[k] == 'lobe'
        top = mix(hexcol('needles', 0.05, lift=young), hexcol('needles_dark'), shade)
        b.face((apex, rings[0][j], rings[0][k]), top, up=1.0)
        b.face((rings[0][j], rings[1][j], rings[1][k], rings[0][k]), hexcol('needles', 0.06, lift=young + 0.15), up=1.0)
        # rule 5: the branch ends are the lightest part of the tree
        b.face((rings[1][j], rings[2][j], rings[2][k], rings[1][k]),
               hexcol('needle_tip', 0.06, lift=young) if lobe else hexcol('needles', 0.06, lift=young + 0.3), up=0.6)
        # underside: in its own shadow, which draws a dark band under every tier
        b.face((rings[2][k], rings[2][j], under), hexcol('needles_dark', 0.05), up=-1.0)


def build_leader(b, z0):
    """The top shoot: a thin spike with a slight bend."""
    base = axis(z0); top = axis(HEIGHT) + Vector((0.06, 0.02, 0))
    r = 0.24
    ring = [base + Vector((r * math.cos(math.tau * k / 5), r * math.sin(math.tau * k / 5), 0)) for k in range(5)]
    for k in range(5):
        b.face((ring[k], ring[(k + 1) % 5], top), hexcol('needle_tip', 0.06), up=0.2)


def grow():
    random.seed(SEED)
    b = Builder()
    build_trunk(b)
    # whorl heights: annual growth, a bit shorter toward the top, never perfectly even (rule 1)
    tiers, z = [], CROWN_BASE
    while z < HEIGHT - 1.25:
        tiers.append(z)
        z += random.uniform(1.0, 1.25) * (1 - 0.35 * (z / HEIGHT))
    for i, z in enumerate(tiers):
        t = (z - CROWN_BASE) / (HEIGHT - CROWN_BASE)
        R = (0.3 + MAX_RADIUS * (1 - t) ** 0.9) * random.uniform(0.88, 1.1)  # rule 3
        missing = {random.randrange(LOBES)} if (random.random() < 0.35 and i > 0) else set()
        build_tier(b, z, R, t, missing)
    build_leader(b, tiers[-1] + 0.55)
    return b


def finish(name, b):
    bm = b.bm
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ci = me.attributes['ci'].data
    for p in me.polygons:
        p.use_smooth = False
        for li in p.loop_indices:
            attr.data[li].color = b.cols[ci[p.index].value]
    me.attributes.remove(me.attributes['ci'])
    mat = bpy.data.materials.get('tree') or bpy.data.materials.new('tree')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    me.materials.append(mat)
    for e in me.edges:
        e.use_edge_sharp = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    print(f'@@ {name}: {len(me.polygons)} tris, size {tuple(round(d, 2) for d in o.dimensions)}')
    return o


def export(o, fname):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)


for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)
export(finish('pine', grow()), 'pine.glb')
