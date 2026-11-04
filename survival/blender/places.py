# Generates the models for the places around the map (src/pois.js, src/details.js):
#   cabin.glb, hunting-stand.glb, lean-to.glb, campsite.glb, truck.glb,
#   fallen-log.glb, fence.glb, fence-broken.glb   (in survival/public/models/)
# Run: blender -b --python places.py
#
# Follows STYLE_GUIDE.md: vertex colour ('Col'), palette colours with per-face variation,
# flat shading, 1 unit = 1 m, front faces Blender -Y (+z in the game), fixed seeds.
#
# Everything is authored here in the GAME's axes (x right, y up, z toward the front) and
# converted with g(): Blender (x, -z, y). Parts that should fade when they're between the
# camera and the player are separate objects named with "wall" or "roof" (see cutaway.js).
# The things you search (cupboard, chest, crates, packs, the glovebox) stay in the game's
# code, so they can open: these models are everything else.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(
    wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, cut=0xd9b98a, end_grain=0x9c7a56,
    weathered=0x8a7a68, plank=0x7d6243, chink=0x9c8f78, shingle=0x4a4139, shingle_dark=0x3a332d,
    moss=0x5e7444, moss_dark=0x435440, stone=0x86877f, stone_dark=0x58585a, lichen=0x949266,
    iron=0x2e2c2a, rust=0x8a4a2a, rust_dark=0x6a3a24, paint=0x5a6a4a, paint_pale=0x7a8a68,
    glass=0x2a3a44, chrome=0x9aa0a6, tyre=0x23211f, hide=0x8a6a4a, hide_pale=0xb08a5a,
    bone=0xd8c49a, wool=0x8c3a2a, straw=0xbfae72, canvas=0x6b6a45, tarp=0x3d5a78, camo=0x4d5a3a,
    camo_dark=0x3a4530, needles=0x2f4a40, needles_dark=0x1f3530, ash=0x3a3633, char=0x2d2824,
    ember=0x7a3a20, lamp=0xd9a52b, ochre=0xbfae72,
)


def col(name, var=0.06):
    h = PAL[name]
    k = 1 + random.uniform(-var, var)
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def g(x, y, z):
    """Game axes (y up, z front) to Blender (z up, -y front)."""
    return Vector((x, -z, y))


def material(name, rough=0.92):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    v = nt.nodes.new('ShaderNodeVertexColor')
    v.layer_name = 'Col'
    nt.links.new(v.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


class Builder:
    """Collects parts in one bmesh; each face remembers its flat colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new('ci')
        self.cols = []

    def add(self, verts, faces, c):
        vs = [self.bm.verts.new(p) for p in verts]
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            face[self.lay] = len(self.cols)
            self.cols.append(c() if callable(c) else c)

    # A box from game-space centre and size, turned `turn` round y and tilted `tilt` round x
    # (then `roll` round z).
    def box(self, center, size, c, turn=0.0, tilt=0.0, roll=0.0):
        sx, sy, sz = (s / 2 for s in size)
        m = Matrix.Rotation(turn, 3, 'Y') @ Matrix.Rotation(tilt, 3, 'X') @ Matrix.Rotation(roll, 3, 'Z')
        corners = [Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
        cx, cy, cz = center
        verts = [g(*(Vector((cx, cy, cz)) + m @ p)) for p in corners]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        self.add(verts, faces, c)

    # A round(ish) pole or log from a to b (game space), n sides, radius r (→ r*taper at b).
    def pole(self, a, b, r, c, n=6, taper=1.0, cap=None, wobble=0.0):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        v = d.cross(u)
        rot = random.uniform(0, 1)
        rings = []
        for t, rr in ((0, r), (1, r * taper)):
            p = a.lerp(b, t)
            rings.append([p + (u * math.cos(rot + math.tau * k / n) + v * math.sin(rot + math.tau * k / n)) * rr * (1 + random.uniform(-wobble, wobble)) for k in range(n)])
        verts = [g(*p) for p in rings[0] + rings[1]]
        self.add(verts, [(j, (j + 1) % n, (j + 1) % n + n, j + n) for j in range(n)], c)
        self.add(verts, [tuple(range(n))[::-1], tuple(range(n, 2 * n))], cap or c)

    # A faceted stone (convex hull of random points) at a game-space centre.
    def stone(self, center, size, c, points=9):
        tmp = bmesh.new()
        for _ in range(points):
            tmp.verts.new(Vector(center) + Vector([random.uniform(-1, 1) * s for s in size]))
        bmesh.ops.convex_hull(tmp, input=tmp.verts[:])
        index = {v: i for i, v in enumerate(tmp.verts)}
        verts = [g(*v.co) for v in tmp.verts]
        self.add(verts, [tuple(index[v] for v in f.verts) for f in tmp.faces], c)
        tmp.free()

    # A flat sheet (game space) over a grid of points from `at(u, v)` (u, v in 0..1).
    def sheet(self, at, nu, nv, c):
        verts = [g(*at(i / nu, j / nv)) for j in range(nv + 1) for i in range(nu + 1)]
        faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i) for j in range(nv) for i in range(nu)]
        self.add(verts, faces, c)
        self.add(verts, [f[::-1] for f in faces], c)  # (seen from both sides)


def build(name, b, mat):
    bm = b.bm
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ci = me.attributes['ci'].data
    for p in me.polygons:
        p.use_smooth = False
        for li in p.loop_indices:
            a.data[li].color = b.cols[ci[p.index].value]
    me.attributes.remove(me.attributes['ci'])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def export(objects, fname):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    tris = sum(len(o.data.polygons) for o in objects)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)
    print(f'@@ {fname}: {tris} tris in {len(objects)} parts')
    for o in objects:
        bpy.data.objects.remove(o)


bpy.ops.wm.read_factory_settings(use_empty=True)
WOOD = material('wood', 0.93)
METAL = material('metal', 0.75)
CLOTH = material('cloth', 0.95)
ROCKMAT = material('rock', 0.95)


def weathered():
    return col(random.choice(('wood', 'wood', 'wood_dark', 'weathered')), 0.08)


# =========================================================================================
# CABIN  (sizes as CABIN in src/poiModels.js: inside ±2.6 × ±2.1, walls 2.2 high, ridge 3.5)
random.seed(11)
W, D, WALL, DOOR, WALL_H, PEAK, EAVE = 2.6, 2.1, 0.15, 0.55, 2.2, 3.5, 2.05
LOG_R, ROW, OVER = 0.15, 0.28, 0.32


def log_x(b, x0, x1, y, z):
    b.pole((x0, y, z), (x1, y, z), LOG_R * random.uniform(0.92, 1.06), weathered, n=8, taper=random.uniform(0.9, 1.0), cap=lambda: col('end_grain', 0.07), wobble=0.06)


def log_z(b, z0, z1, y, x):
    b.pole((x, y, z0), (x, y, z1), LOG_R * random.uniform(0.92, 1.06), weathered, n=8, taper=random.uniform(0.9, 1.0), cap=lambda: col('end_grain', 0.07), wobble=0.06)


def spans(a, b, gaps):
    out, start = [], a
    for g0, g1 in sorted(gaps):
        if g0 > start:
            out.append((start, g0))
        start = max(start, g1)
    if b > start:
        out.append((start, b))
    return out


walls = {k: Builder() for k in ('front', 'back', 'left', 'right')}
x0, x1 = -W - WALL - OVER, W + WALL + OVER
z0, z1 = -D - WALL - OVER, D + WALL + OVER
y = -0.12
while y < WALL_H:
    for s0, s1 in spans(x0, x1, [(-DOOR, DOOR)] if y < 1.95 else []):
        log_x(walls['front'], s0, s1, y, D + WALL)
    for s0, s1 in spans(x0, x1, [(0.5, 1.6)] if 0.85 < y < 1.6 else []):
        log_x(walls['back'], s0, s1, y, -D - WALL)
    ys = y + ROW / 2
    log_z(walls['left'], z0, z1, ys, -W - WALL)
    for s0, s1 in spans(z0, z1, [(-0.6, 0.5)] if 0.85 < ys < 1.6 else []):
        log_z(walls['right'], s0, s1, ys, W + WALL)
    # Pale chinking between the logs, inside the wall line.
    for name, size, at in (('front', (2 * W + 0.3, 0.07, 0.12), (0, y + ROW / 2, D + WALL)), ('back', (2 * W + 0.3, 0.07, 0.12), (0, y + ROW / 2, -D - WALL)),
                           ('left', (0.12, 0.07, 2 * D + 0.3), (-W - WALL, ys + ROW / 2, 0)), ('right', (0.12, 0.07, 2 * D + 0.3), (W + WALL, ys + ROW / 2, 0))):
        if at[1] < WALL_H - 0.1 and not (name == 'front' and at[1] < 1.95) and round(y / ROW) % 2 == 0:
            walls[name].box(at, size, lambda: col('chink', 0.05))
    y += ROW
# Gables: shorter and shorter logs up to the ridge.
y = WALL_H + ROW / 2
while y < PEAK - 0.15:
    half = (D + WALL + 0.1) * (1 - (y - WALL_H) / (PEAK - WALL_H))
    log_z(walls['left'], -half, half, y, -W - WALL)
    log_z(walls['right'], -half, half, y, W + WALL)
    y += ROW
# Door frame, and the door hanging open into the room (planks with a Z brace).
for sx in (-1, 1):
    walls['front'].box((sx * (DOOR + 0.04), 0.97, D + WALL), (0.09, 1.95, 0.32), lambda: col('wood_dark', 0.05))
walls['front'].box((0, 1.98, D + WALL), (DOOR * 2 + 0.2, 0.1, 0.32), lambda: col('wood_dark', 0.05))
door_turn = -1.45
hinge = Vector((-DOOR, 0, D + WALL - 0.1))
for i in range(4):
    off = Matrix.Rotation(door_turn, 3, 'Y') @ Vector((0.14 + i * 0.27, 0.95, 0))
    walls['front'].box(tuple(hinge + off), (0.26, 1.88, 0.05), lambda: col('plank', 0.08), turn=door_turn)
for yy in (0.4, 1.5):
    off = Matrix.Rotation(door_turn, 3, 'Y') @ Vector((0.55, yy, -0.04))
    walls['front'].box(tuple(hinge + off), (1.0, 0.1, 0.04), lambda: col('wood_dark'), turn=door_turn)
# Window frames with a cross bar, one shutter hanging.
for name, center, size in (('back', (1.05, 1.22, -D - WALL), (1.2, 0.08, 0.32)), ('right', (W + WALL, 1.22, -0.05), (0.32, 0.08, 1.2))):
    b = walls[name]
    b.box((center[0], 0.86, center[2]), size, lambda: col('wood_dark'))
    b.box((center[0], 1.6, center[2]), size, lambda: col('wood_dark'))
    if name == 'back':
        b.box((center[0], 1.22, center[2]), (0.06, 0.74, 0.1), lambda: col('wood_dark'))
    else:
        b.box((center[0], 1.22, center[2]), (0.1, 0.74, 0.06), lambda: col('wood_dark'))
walls['right'].box((W + WALL + 0.3, 1.0, 0.75), (0.05, 0.75, 0.5), lambda: col('plank', 0.08), turn=0.4, roll=0.25)

# Roof: rows of split cedar shakes on both slopes, each row overlapping the one below, the
# shakes of uneven widths and a little askew; moss creeping over them in soft patches (more
# on the shady back slope), a few gaps where shakes have blown off, boards along the gables,
# a ridge cap and the stove pipe with its rain cap.
roof = Builder()
run = D + WALL + 0.55
rise = PEAK - EAVE
slope = math.atan2(rise, run)
length = math.hypot(run, rise)
rows = 13
half_x = W + WALL + 0.55
moss_spots = [(random.uniform(-half_x, half_x), random.uniform(0.25, 1.0), (1, -1)[k % 2], random.uniform(0.6, 1.2)) for k in range(10)]


def mossiness(x, t, side):
    m = 0.0
    for mx, mt, ms, mr in moss_spots:
        if ms == side:
            m = max(m, 1 - math.hypot((x - mx) / mr, (t - mt) * length / mr))
    return m


for side in (1, -1):
    for r in range(rows):
        t = (r + 0.5) / rows
        zc = side * run * t
        yc = PEAK - rise * t + 0.1 + (r % 2) * 0.012
        across = -half_x + (0.12 if r % 2 else 0)  # (rows staggered)
        while across < half_x - 0.05:
            w = min(random.uniform(0.22, 0.42), half_x - across)
            x = across + w / 2
            across += w
            if random.random() < 0.025 and 0.2 < t < 0.9:
                continue  # a missing shake
            m = mossiness(x, t, side) + random.uniform(-0.15, 0.15)
            shade = 'moss_dark' if m > 0.6 else 'moss' if m > 0.35 else 'driftwood' if random.random() < 0.06 else random.choice(('shingle', 'shingle', 'shingle_dark'))
            roof.box((x, yc + random.uniform(0, 0.025), zc), (w - 0.025, 0.045, length / rows * 1.45), lambda s=shade: col(s, 0.05),
                     tilt=side * slope + random.uniform(-0.04, 0.04), turn=random.uniform(-0.03, 0.03))
    for sx in (-1, 1):  # barge boards along the gable ends
        roof.box((sx * (half_x + 0.01), (PEAK + EAVE) / 2 + 0.05, side * run / 2), (0.06, 0.2, length + 0.05), lambda: col('wood_dark'), tilt=side * slope)
    for k in range(4):  # moss cushions where it's thickest
        mx, mt, ms, mr = moss_spots[k]
        if ms == side:
            roof.stone((mx, PEAK - rise * mt + 0.16, side * run * mt), (0.22, 0.06, 0.18), lambda: col('moss', 0.08), points=8)
roof.box((0, PEAK + 0.16, 0), (2 * (half_x + 0.05), 0.1, 0.36), lambda: col('wood_dark'), tilt=0)
for sx in (-1, 1):
    roof.box((0, PEAK + 0.12, sx * 0.17), (2 * (half_x + 0.05), 0.06, 0.12), lambda: col('wood_dark', 0.05), tilt=sx * slope)
roof.pole((2.1, 0.75, -1.65), (2.1, PEAK + 0.7, -1.65), 0.08, lambda: col('iron', 0.05), n=8)  # the stove pipe
roof.pole((2.1, PEAK - 0.35, -1.65), (2.1, PEAK - 0.25, -1.65), 0.16, lambda: col('rust_dark', 0.05), n=8)  # its flashing
roof.pole((2.1, PEAK + 0.82, -1.65), (2.1, PEAK + 1.0, -1.65), 0.2, lambda: col('rust', 0.06), n=8, taper=0.15)  # the rain cap

# Floor, foundation stones, the step up to the door.
floor = Builder()
z = -D - 0.1
while z < D + 0.1:
    w = random.uniform(0.3, 0.42)
    floor.box((0, -0.05, z + w / 2), (2 * W + 0.25, 0.1, w - 0.015), lambda: col('plank', 0.1))
    z += w
for sx in (-1, 1):
    for sz in (-1, 1, 0):
        floor.stone((sx * (W + WALL), -0.45, sz * (D + WALL)), (0.35, 0.4, 0.35), lambda: col(random.choice(('stone', 'stone_dark', 'lichen')), 0.06))
floor.box((0, -0.14, D + WALL + 0.5), (1.5, 0.08, 0.7), lambda: col('plank', 0.1))
floor.box((0, -0.33, D + WALL + 0.82), (1.5, 0.3, 0.12), lambda: col('wood_dark'))

# Inside: bed, stove, table and chairs, a shelf, a rug, firewood.
inside = Builder()
bx, bz = -1.4, -1.55  # the bed (2 m along x)
for x in (-0.95, 0.95):
    for z in (-0.36, 0.36):
        inside.box((bx + x, 0.25, bz + z), (0.08, 0.5, 0.08), lambda: col('wood_dark'))
inside.box((bx, 0.42, bz), (2.0, 0.08, 0.8), lambda: col('wood'))
inside.box((bx - 0.97, 0.7, bz), (0.07, 0.5, 0.8), lambda: col('wood'))
inside.box((bx, 0.52, bz), (1.9, 0.12, 0.72), lambda: col('straw', 0.06))
inside.box((bx + 0.3, 0.6, bz), (1.25, 0.06, 0.76), lambda: col('wool', 0.06), roll=0.02)
inside.box((bx - 0.75, 0.62, bz), (0.3, 0.1, 0.5), lambda: col('bone', 0.04))
sx, sz = 2.0, -1.55  # the stove
inside.box((sx, 0.48, sz), (0.62, 0.5, 0.5), lambda: col('iron', 0.05))
inside.box((sx, 0.75, sz), (0.68, 0.05, 0.56), lambda: col('iron', 0.08))
inside.box((sx, 0.45, sz + 0.26), (0.3, 0.26, 0.02), lambda: col('rust_dark', 0.05))
for x in (-0.25, 0.25):
    for z in (-0.18, 0.18):
        inside.box((sx + x, 0.12, sz + z), (0.06, 0.24, 0.06), lambda: col('iron'))
for i in range(5):  # firewood beside it
    inside.pole((sx - 0.75, 0.08 + (i // 3) * 0.13, sz - 0.3 + (i % 3) * 0.14), (sx - 0.75, 0.08 + (i // 3) * 0.13, sz + 0.3 + (i % 3) * 0.14 - 0.3), 0.065, lambda: col('wood', 0.08), n=5, cap=lambda: col('cut'))
tx, tz = 1.3, 0.6  # the table
inside.box((tx, 0.76, tz), (1.15, 0.06, 0.72), lambda: col('plank', 0.06))
for x in (-0.5, 0.5):
    for z in (-0.28, 0.28):
        inside.box((tx + x, 0.37, tz + z), (0.07, 0.74, 0.07), lambda: col('wood_dark'))
inside.pole((tx - 0.2, 0.79, tz - 0.1), (tx - 0.2, 0.8, tz - 0.1), 0.13, lambda: col('stone', 0.05), n=8)  # a plate
inside.pole((tx + 0.15, 0.79, tz + 0.15), (tx + 0.15, 0.9, tz + 0.15), 0.045, lambda: col('rust', 0.05), n=6)  # a tin mug
inside.box((tx + 0.35, 0.89, tz - 0.12), (0.12, 0.2, 0.12), lambda: col('chrome', 0.05))  # the lantern
inside.box((tx + 0.35, 0.89, tz - 0.12), (0.08, 0.12, 0.13), lambda: col('lamp', 0.05))


def chair(b, x, z, turn, tipped=False):
    m = Matrix.Rotation(turn, 3, 'Y')
    if tipped:
        m = m @ Matrix.Rotation(math.pi / 2, 3, 'Z')
    lift = 0.23 if tipped else 0

    def at(px, py, pz):
        p = m @ Vector((px, py, pz))
        return (x + p.x, p.y + lift, z + p.z)

    b.box(at(0, 0.45, 0), (0.45, 0.05, 0.45), lambda: col('plank', 0.06), turn=turn, roll=math.pi / 2 if tipped else 0)
    b.box(at(0, 0.72, -0.2), (0.45, 0.5, 0.05), lambda: col('plank', 0.06), turn=turn, roll=math.pi / 2 if tipped else 0)
    for px in (-0.19, 0.19):
        for pz in (-0.19, 0.19):
            b.box(at(px, 0.22, pz), (0.05, 0.45, 0.05), lambda: col('wood_dark'), turn=turn, roll=math.pi / 2 if tipped else 0)


chair(inside, 0.55, 0.7, math.pi / 2)
chair(inside, 1.95, 1.45, 0.6, tipped=True)
inside.box((-0.2, 0.012, 0.15), (1.7, 0.025, 1.05), lambda: col('wool', 0.08))  # the rug
inside.box((-0.2, 0.013, 0.15), (1.4, 0.026, 0.8), lambda: col('ochre', 0.08))
inside.box((-0.2, 0.014, 0.15), (1.1, 0.027, 0.55), lambda: col('wool', 0.1))
inside.box((-0.6, 1.45, -D + 0.12), (1.2, 0.05, 0.25), lambda: col('plank'))  # a shelf on the back wall
for i in range(4):
    inside.pole((-1.05 + i * 0.28, 1.48, -D + 0.12), (-1.05 + i * 0.28, 1.48 + random.uniform(0.12, 0.2), -D + 0.12), 0.05, lambda: col(random.choice(('rust', 'bone', 'glass', 'chrome')), 0.06), n=6)

cabin = [build('cabin-wall-front', walls['front'], WOOD), build('cabin-wall-back', walls['back'], WOOD),
         build('cabin-wall-left', walls['left'], WOOD), build('cabin-wall-right', walls['right'], WOOD),
         build('cabin-roof', roof, WOOD), build('cabin-floor', floor, WOOD), build('cabin-inside', inside, WOOD)]
export(cabin, 'cabin.glb')

# =========================================================================================
# HUNTING STAND  (as STAND: platform ±1.1 at 3 m, ladder down to z = 2.6, ±0.42 wide)
random.seed(22)
P, H, FOOT, LH = 3.0, 1.1, 2.6, 0.42
frame = Builder()
corners = [(1, 1), (1, -1), (-1, -1), (-1, 1)]
for cx, cz in corners:
    frame.pole((cx * (H + 0.25), -0.6, cz * (H + 0.25)), (cx * H, P + 1.05, cz * H), 0.075, lambda: col('wood', 0.08), n=6, taper=0.85, cap=lambda: col('cut'))
for (ax, az), (bx_, bz_) in (((1, 1), (1, -1)), ((-1, 1), (-1, -1)), ((1, -1), (-1, -1))):
    frame.pole((ax * (H + 0.15), 0.4, az * (H + 0.15)), (bx_ * H, P - 0.25, bz_ * H), 0.04, lambda: col('wood_dark', 0.06), n=5)
    frame.pole((bx_ * (H + 0.15), 0.4, bz_ * (H + 0.15)), (ax * H, P - 0.25, az * H), 0.04, lambda: col('wood_dark', 0.06), n=5)
for z in (-H, H):  # joists
    frame.box((0, P - 0.13, z), (2 * H + 0.3, 0.12, 0.1), lambda: col('wood_dark'))
x = -H - 0.05
while x < H + 0.05:  # deck planks
    w = random.uniform(0.17, 0.24)
    frame.box((x + w / 2, P - 0.04, 0), (w - 0.02, 0.06, 2 * H + 0.15), lambda: col('plank', 0.1))
    x += w
rail = P + 0.92
for a, b_ in (((-H, rail, -H), (H, rail, -H)), ((-H, rail, -H), (-H, rail, H)), ((H, rail, -H), (H, rail, H))):
    frame.pole(a, b_, 0.04, lambda: col('weathered', 0.06), n=5)
    frame.pole((a[0], rail - 0.45, a[2]), (b_[0], rail - 0.45, b_[2]), 0.03, lambda: col('weathered', 0.06), n=5)
for sx in (-1, 1):  # ladder rails and rungs
    frame.pole((sx * LH, -0.1, FOOT + 0.1), (sx * LH, P + 0.45, H - 0.05), 0.045, lambda: col('wood', 0.06), n=5)
rungs = 9
for i in range(rungs):
    t = (i + 0.6) / (rungs + 0.4)
    yy = t * P
    zz = FOOT - (FOOT - H) * t
    frame.pole((-LH, yy, zz), (LH, yy, zz), 0.03, lambda: col('wood_dark', 0.06), n=5)
frame.box((0.25, P + 0.45, -H + 0.25), (0.95, 0.06, 0.32), lambda: col('plank'))  # the seat
for x in (-0.15, 0.65):
    frame.box((x, P + 0.22, -H + 0.25), (0.06, 0.45, 0.06), lambda: col('wood_dark'))
frame.box((H - 0.1, rail + 0.03, 0.2), (0.04, 0.04, 0.5), lambda: col('wood_dark'))  # a gun rest across the rail
canopy = Builder()
for cx, cz in corners:
    canopy.pole((cx * H, P + 0.9, cz * H), (cx * H, P + 2.05 - cz * 0.18, cz * H), 0.035, lambda: col('wood_dark'), n=5)


def tarp_at(u, v):
    x = (u - 0.5) * (2 * H + 0.5)
    z = (v - 0.5) * (2 * H + 0.7)
    sag = math.sin(u * math.pi) * math.sin(v * math.pi) * 0.12
    return (x, P + 2.05 - z * 0.17 - sag, z)


canopy.sheet(tarp_at, 4, 4, lambda: col(random.choice(('camo', 'camo', 'camo_dark', 'moss_dark')), 0.08))
export([build('hunting-stand', frame, WOOD), build('hunting-stand-roof', canopy, CLOTH)], 'hunting-stand.glb')

# =========================================================================================
# LEAN-TO  (as LEAN_TO: ±1.6 wide, front posts at z = 0.75, roof down to z = -1.25)
random.seed(33)
LW, LD = 1.6, 1.5
poles = Builder()
for sx in (-1, 1):
    poles.pole((sx * LW, -0.2, LD / 2), (sx * LW, 2.05, LD / 2), 0.07, lambda: col('wood', 0.08), n=6, cap=lambda: col('cut'))
    poles.pole((sx * LW, 2.0, LD / 2 + 0.1), (sx * LW, -0.1, -LD / 2 - 0.55), 0.06, lambda: col('wood', 0.08), n=6)
poles.pole((-LW - 0.35, 2.0, LD / 2), (LW + 0.35, 2.0, LD / 2), 0.07, lambda: col('wood_dark', 0.06), n=6, cap=lambda: col('cut'))
poles.pole((-LW - 0.2, 1.0, -0.3), (LW + 0.2, 1.0, -0.3), 0.05, lambda: col('wood', 0.06), n=5)
for i in range(8):  # a bed of spruce boughs
    poles.stone((random.uniform(-1.2, 1.3), 0.05, random.uniform(-0.7, 0.4)), (0.4, 0.06, 0.25), lambda: col(random.choice(('needles', 'needles_dark', 'moss_dark')), 0.06), points=7)
RX, RZ = 2.6, 0.4  # the drying rack
for dz in (-0.75, 0.75):
    poles.pole((RX, -0.2, RZ + dz), (RX, 1.75, RZ + dz), 0.045, lambda: col('wood_dark'), n=5)
poles.pole((RX, 1.68, RZ - 0.85), (RX, 1.68, RZ + 0.85), 0.04, lambda: col('wood_dark'), n=5)
for dz, tone in ((-0.35, 'hide'), (0.35, 'hide_pale')):
    k = 8
    rim = [(RX + 0.02, 1.08 + 0.48 * math.cos(math.tau * i / k), RZ + dz + 0.3 * math.sin(math.tau * i / k)) for i in range(k)]
    verts = [g(*p) for p in rim] + [g(RX + 0.03, 1.08, RZ + dz)]
    poles.add(verts, [(i, (i + 1) % k, k) for i in range(k)], lambda: col(tone, 0.06))
    poles.add(verts, [((i + 1) % k, i, k) for i in range(k)], lambda: col(tone, 0.06))  # (both sides)
    poles.pole((RX, 1.68, RZ + dz), (RX, 1.56, RZ + dz), 0.01, lambda: col('bone'), n=4)
BX, BZ = -2.3, 1.2  # the chopping block, with chips round it
poles.pole((BX, 0, BZ), (BX, 0.5, BZ), 0.24, lambda: col('wood_dark', 0.06), n=7, cap=lambda: col('cut', 0.05))
for i in range(6):
    poles.box((BX + random.uniform(-0.6, 0.6), 0.015, BZ + random.uniform(-0.6, 0.6)), (0.12, 0.02, 0.06), lambda: col('cut', 0.08), turn=random.uniform(0, 3))
bark = Builder()
roof_len = math.hypot(LD + 0.55, 2.1)
tilt = math.atan2(2.1, LD + 0.55)
strips = 8
for i in range(strips):
    x = -LW - 0.1 + (i + 0.5) * ((2 * LW + 0.2) / strips)
    w = (2 * LW + 0.2) / strips + 0.06
    bark.box((x, 1.0 + random.uniform(-0.02, 0.02), -0.25), (w, 0.05, roof_len), lambda: col(random.choice(('wood_dark', 'driftwood', 'wood')), 0.08), tilt=tilt, roll=random.uniform(-0.05, 0.05))
    if random.random() < 0.4:
        bark.box((x, 1.05, -0.25 + random.uniform(-0.4, 0.4)), (w * 0.7, 0.04, 0.5), lambda: col('moss', 0.08), tilt=tilt)
export([build('lean-to', poles, WOOD), build('lean-to-roof', bark, WOOD)], 'lean-to.glb')

# =========================================================================================
# CAMPSITE  (origin at the fire; seats at (-1.4, 0.3) and (0.4, 1.5); tent at (-1.2, -2.0))
random.seed(44)
camp = Builder()
for i in range(9):
    a = math.tau * i / 9
    camp.stone((math.cos(a) * 0.52, 0.06, math.sin(a) * 0.52), (0.14, 0.1, 0.12), lambda: col(random.choice(('stone', 'stone_dark')), 0.06), points=8)
camp.pole((0, 0.005, 0), (0, 0.02, 0), 0.42, lambda: col('ash', 0.05), n=9)
for a in (0.2, 1.4, 2.6):
    d = Vector((math.cos(a), 0, math.sin(a)))
    camp.pole(tuple(d * -0.3 + Vector((0, 0.07, 0))), tuple(d * 0.32 + Vector((0, 0.05, 0))), 0.05, lambda: col('char', 0.06), n=5)
for a in (0, 2.1, 4.2):  # a tripod with a pot hanging over the fire
    camp.pole((math.cos(a) * 0.65, 0, math.sin(a) * 0.65), (0, 1.2, 0), 0.025, lambda: col('wood_dark'), n=4)
camp.pole((0, 1.18, 0), (0, 0.55, 0), 0.006, lambda: col('iron'), n=4)
camp.pole((0, 0.35, 0), (0, 0.55, 0), 0.13, lambda: col('iron', 0.06), n=8, taper=1.1)
for (x, z, turn) in ((-1.4, 0.3, 0.3), (0.4, 1.5, 1.6)):
    m = Matrix.Rotation(turn, 3, 'Y')
    a = Vector((x, 0.17, z)) + m @ Vector((-0.7, 0, 0))
    b_ = Vector((x, 0.17, z)) + m @ Vector((0.7, 0, 0))
    camp.pole(tuple(a), tuple(b_), 0.17, lambda: col('wood', 0.08), n=7, cap=lambda: col('cut', 0.06), wobble=0.05)
for i, (x, z) in enumerate(((-0.6, 0.9), (0.7, 0.85), (0.95, -0.7))):  # tin cans
    if i == 2:
        camp.pole((x - 0.06, 0.04, z), (x + 0.06, 0.04, z), 0.04, lambda: col('rust', 0.08), n=6)
    else:
        camp.pole((x, 0, z), (x, 0.11, z), 0.04, lambda: col('rust', 0.08), n=6)
tent = Builder()
TX, TZ, TT = -1.2, -2.0, 0.25
m = Matrix.Rotation(TT, 3, 'Y')


def tent_side(side):
    def at(u, v):
        x = (u - 0.5) * 2.3
        ridge = 0.6 - u * 0.4  # the ridge pole broke at one end and sags
        y = ridge * (1 - v) + 0.02 * v - math.sin(u * math.pi) * math.sin(v * math.pi) * 0.2
        z = side * (0.15 + v * 0.75)
        p = m @ Vector((x, y, z))
        return (TX + p.x, p.y, TZ + p.z)
    return at


for side in (-1, 1):
    tent.sheet(tent_side(side), 4, 3, lambda: col(random.choice(('tarp', 'tarp', 'canvas')), 0.08))
p0 = m @ Vector((-1.15, 0.62, 0))
p1 = m @ Vector((0.7, 0.3, 0))
tent.pole((TX + p0.x, p0.y, TZ + p0.z), (TX + p1.x, p1.y, TZ + p1.z), 0.03, lambda: col('wood_dark'), n=4)
p2 = m @ Vector((-1.15, 0, 0))
tent.pole((TX + p2.x, 0, TZ + p2.z), (TX + p0.x, p0.y, TZ + p0.z), 0.03, lambda: col('wood_dark'), n=4)
export([build('campsite', camp, WOOD), build('campsite-tent', tent, CLOTH)], 'campsite.glb')

# =========================================================================================
# TRUCK  (an old forest service pickup, ~1.9 × 5 m, front +z, passenger door open at +x)
random.seed(55)
truck = Builder()


def rusty(base='paint'):
    return lambda: col('rust' if random.random() < 0.35 else random.choice((base, base, 'paint_pale')), 0.07)


truck.box((0, 0.62, 0), (1.75, 0.3, 4.9), lambda: col('iron', 0.05))  # chassis
truck.box((0, 0.95, 1.65), (1.7, 0.42, 1.5), rusty())  # bonnet
truck.box((0, 0.84, 2.45), (1.6, 0.3, 0.12), lambda: col('chrome', 0.1))  # grille
for x in (-0.6, 0.6):
    truck.pole((x, 0.95, 2.43), (x, 0.95, 2.48), 0.11, lambda: col('chrome' if x < 0 else 'glass', 0.08), n=8)
truck.box((0, 0.55, 2.55), (1.9, 0.14, 0.12), lambda: col('chrome', 0.1))  # bumpers
truck.box((0, 0.55, -2.5), (1.9, 0.14, 0.12), lambda: col('rust_dark', 0.06))
for sx in (-1, 1):  # front wings with wheel arches
    truck.box((sx * 0.88, 0.95, 1.65), (0.2, 0.42, 1.5), rusty())
truck.box((0, 1.12, 0.45), (1.75, 0.65, 0.95), rusty())  # cab, lower
for (x, z, w, d) in ((-0.84, 0.0, 0.07, 0.07), (0.84, 0.0, 0.07, 0.07), (-0.84, 0.9, 0.07, 0.07), (0.84, 0.9, 0.07, 0.07)):
    truck.box((x, 1.72, z), (w, 0.6, d), rusty(), tilt=0.15 if z > 0.5 else 0)  # pillars
truck.box((0, 2.04, 0.4), (1.75, 0.08, 1.05), rusty())  # cab roof
truck.box((0, 1.72, 0.97), (1.6, 0.5, 0.03), lambda: col('glass', 0.05), tilt=0.15)  # cracked windscreen
truck.box((0, 1.75, -0.03), (1.6, 0.45, 0.03), lambda: col('glass', 0.05))
truck.box((-0.88, 1.12, 0.45), (0.05, 0.62, 0.92), rusty())  # driver's door (shut)
# The bed: floor and low sides, the tailgate hanging down.
truck.box((0, 0.82, -1.35), (1.75, 0.08, 2.2), lambda: col('rust_dark', 0.08))
for sx in (-1, 1):
    truck.box((sx * 0.85, 1.05, -1.35), (0.06, 0.45, 2.2), rusty())
truck.box((0, 1.05, -0.27), (1.75, 0.45, 0.06), rusty())
truck.box((0, 0.6, -2.5), (1.7, 0.45, 0.05), rusty(), tilt=1.2)
truck.pole((0.3, 0.98, -1.6), (-0.4, 0.98, -1.1), 0.12, lambda: col('rust', 0.08), n=8)  # an old drum in the back
# Wheels: tyres with hubs, the front left one flat.
for (x, z) in ((-0.9, 1.6), (0.9, 1.6), (-0.9, -1.55), (0.9, -1.55)):
    flat = x < 0 and z > 0
    r = 0.36 if not flat else 0.3
    truck.pole((x - 0.13, r, z), (x + 0.13, r, z), r, lambda: col('tyre', 0.05), n=10)
    truck.pole((x + math.copysign(0.14, x), r, z), (x + math.copysign(0.15, x), r, z), 0.17, lambda: col('rust', 0.06), n=8)
# The passenger door, swung open.
hinge = Vector((0.9, 0, 0.9))
door_m = Matrix.Rotation(-1.1, 3, 'Y')
for (px, py, pz, sx_, sy_, sz_) in ((0, 1.12, -0.46, 0.05, 0.62, 0.92), (0, 1.7, -0.46, 0.04, 0.5, 0.05), (0, 1.7, -0.04, 0.04, 0.5, 0.05)):
    p = hinge + door_m @ Vector((px, py, pz))
    truck.box(tuple(p), (sx_, sy_, sz_), rusty(), turn=-1.1)
# A faded door badge.
p = hinge + door_m @ Vector((0.03, 1.15, -0.46))
truck.box(tuple(p), (0.02, 0.22, 0.3), lambda: col('bone', 0.05), turn=-1.1)
export([build('truck', truck, METAL)], 'truck.glb')

# =========================================================================================
# FALLEN LOG  (1 m long along x, 1 m thick, lying on the ground: scaled per copy in the game)
random.seed(66)
log = Builder()
N = 8
rings = []
for i, t in enumerate((-0.5, -0.3, 0, 0.3, 0.5)):
    r = 0.5 * (1.04 - abs(t) * 0.12) * random.uniform(0.96, 1.04)
    rings.append([(t, 0.5 + math.sin(math.tau * k / N) * r, math.cos(math.tau * k / N) * r * random.uniform(0.95, 1.05)) for k in range(N)])
verts = [g(*p) for ring_ in rings for p in ring_]
faces = [(i * N + j, i * N + (j + 1) % N, (i + 1) * N + (j + 1) % N, (i + 1) * N + j) for i in range(len(rings) - 1) for j in range(N)]


def bark_col():
    return col(random.choice(('wood', 'wood', 'wood_dark', 'driftwood')), 0.08)


log.add(verts, faces, bark_col)
# Broken ends: jagged, pale wood.
for end, ring_ in ((-0.5, rings[0]), (0.5, rings[-1])):
    tip = (end + math.copysign(0.12, end), 0.55, 0.05)
    vs = [g(*p) for p in ring_] + [g(*tip)]
    fs = [((j + 1) % N, j, N) if end > 0 else (j, (j + 1) % N, N) for j in range(N)]
    log.add(vs, fs, lambda: col('end_grain', 0.08))
for (x, a) in ((-0.15, 0.7), (0.22, -0.9)):  # branch stubs
    log.pole((x, 0.5 + math.sin(a) * 0.45, math.cos(a) * 0.45), (x + 0.05, 0.5 + math.sin(a) * 0.85, math.cos(a) * 0.85), 0.07, lambda: col('wood_dark'), n=5, taper=0.6, cap=lambda: col('cut'))
# Moss over the top.
for i in range(4):
    log.stone((random.uniform(-0.35, 0.35), 0.98, random.uniform(-0.2, 0.2)), (0.16, 0.05, 0.14), lambda: col(random.choice(('moss', 'moss_dark')), 0.06), points=7)
export([build('fallen-log', log, WOOD)], 'fallen-log.glb')

# =========================================================================================
# FENCE  (one 2.5 m length from x = 0 to 2.5: two posts, two split rails; and a broken one)
for broken, name, seed in ((False, 'fence', 77), (True, 'fence-broken', 78)):
    random.seed(seed)
    f = Builder()
    L = 2.5
    grey = lambda: col(random.choice(('weathered', 'driftwood', 'driftwood')), 0.08)
    f.pole((0, -0.25, 0), (0, 1.18, 0), 0.07, grey, n=5, cap=lambda: col('lichen'))
    end = (L + 0.32, 1.02, 0.18) if broken else (L, 1.18, 0)
    f.pole((L, -0.25, 0), end, 0.07, grey, n=5, cap=lambda: col('lichen'))
    # Split rails: 4-sided, a little bowed.
    f.pole((-0.1, 0.98, 0.06), (L + 0.1, 0.95, 0.06), 0.06, grey, n=4)
    if broken:
        f.pole((-0.1, 0.52, 0.06), (L * 0.8, 0.06, 0.32), 0.055, grey, n=4)
    else:
        f.pole((-0.1, 0.52, 0.06), (L + 0.1, 0.5, 0.06), 0.055, grey, n=4)
    for x in (0, L):  # lashings
        f.box((x, 0.98, 0.04), (0.16, 0.05, 0.16), lambda: col('wood_dark'))
    export([build(name, f, WOOD)], f'{name}.glb')

print('@@ done')
