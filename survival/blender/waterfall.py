# The waterfall (src/layout.js FALLS, src/landmarks.js): waterfall.glb, made for a 9 m drop
# (the game stretches it to the real one). Origin at the middle of the cliff's foot, at the
# pool's surface; the water falls toward +z from the lip 9 m up.
#   waterfall-cliff       the rock faces either side of the water: buttresses and pillars of
#                         split granite standing along the land's rock step (which bows forward
#                         at its ends: FACE below follows terrain.js's fallsAt), mossy on top,
#                         dark and wet by the water, with the wall the water falls in front of;
#   waterfall-rocks       the stones in the lip that part the water, the blocks fallen at the
#                         cliff's foot and the boulders round the pool;
#   waterfall-water       the falling sheet (uv: u across it, v from 0 at the foot to 1 at the lip);
#   waterfall-water-front a second, narrower one in front of it, for depth;
#   waterfall-water-top   the stream over the shelf above (v from 1 at the back to 1.6 at the lip);
#   waterfall-foam        the foam on the pool where it lands (v from 0 in the middle to 1 at its rim).
# The game gives the water and foam their moving materials (fallingWater in src/landmarks.js).
# Authored in the game's axes (x right, y up, z toward the front). Run in an open Blender
# (Blender MCP or the Text Editor), or: blender -b --python waterfall.py
# (It doesn't clear the scene: it removes what it makes once it's exported.)
import math, os, random, runpy, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, noise
from kit import PAL, Builder, build, col, export, g, material

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
stone_into_ground, shared, tone = R['stone_into'], R['shared'], R['tone']
ROCK = shared('rock', 0.95)

DROP = 9.0
LAND_DROP = 8.63  # the land's own step, which the heights below were measured on
UP = DROP / LAND_DROP


def stone_into(b, size, seed, at=(0, 0, 0), **options):
    """remake.py's stone, but up off the ground too: it shades a stone by its height above y = 0,
    so build it there, then lift it."""
    b.bm.verts.ensure_lookup_table()
    first = len(b.bm.verts)
    stone_into_ground(b, size, seed, at=(at[0], 0, at[2]), **options)
    b.bm.verts.ensure_lookup_table()
    for v in b.bm.verts[first:]:
        v.co.z += at[1]


# ---- the land the cliff stands on (measured in the game: meters above the pool) ----
def face(x):
    """How far out (+z) the land's cliff face is, x meters along it: it bows forward at its ends."""
    return 0.012 * x * x - 0.2


LAND_TOP = [(-27, 5.7), (-24, 6.8), (-21, 7.7), (-18, 8.4), (-15, 8.63), (15, 8.63), (18, 8.2), (21, 6.9), (24, 5.2), (27, 3.2)]


def land_top(x):
    """The height of the shelf's edge above the pool, x meters along the cliff."""
    for (x0, h0), (x1, h1) in zip(LAND_TOP, LAND_TOP[1:]):
        if x <= x1:
            return (h0 + (h1 - h0) * max(0, x - x0) / (x1 - x0)) * UP
    return LAND_TOP[-1][1] * UP


# ---- a rock face: one buttress of the cliff ----
def crag_into(b, x, z, half_w, half_d, y0, y1, seed, wet=0.0, lean=0.3):
    """A buttress of split rock standing from y0 to y1, its middle at (x, z), facing +z. Tall flat
    faces meeting at sharp edges (the cleavage planes face mostly forward), leaning back by `lean`
    of its depth toward the top, with a ledge or two; mossy on top and on its ledges, banded in
    greys down its face, dark and green at the waterline. `wet`: 0 dry to 1 running with spray
    (dark all the way up)."""
    random.seed(seed)
    off = Vector((random.uniform(0, 50), random.uniform(0, 50), random.uniform(0, 50)))
    planes = []
    for _ in range(5):  # the faces: forward, turned a way to one side or the other
        n = Vector((random.uniform(-0.9, 0.9), random.uniform(-0.12, 0.22), random.uniform(0.45, 1))).normalized()
        planes.append((n, random.uniform(0.5, 0.9)))
    for s in (-1, 1):  # its sides
        planes.append((Vector((s, random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.5))).normalized(), random.uniform(0.7, 0.95)))
    for _ in range(2):  # and the top, broken
        planes.append((Vector((random.uniform(-0.5, 0.5), 1, random.uniform(-0.2, 0.6))).normalized(), random.uniform(0.72, 0.95)))
    ledges = [random.uniform(0.25, 0.5), random.uniform(0.55, 0.85)]
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=3, radius=1)
    for v in tmp.verts:
        d = v.co.normalized()  # (worked in game axes, y up: g() turns them into Blender's)
        block = d / max(abs(d.x), abs(d.y), abs(d.z))  # (a block more than a ball)
        p = d.lerp(block, 0.7) * (1 + 0.1 * noise.noise(d * 1.9 + off))
        for n, offset in planes:
            over = p.dot(n) - offset
            if over > 0:
                p -= n * over * 0.92
        t = min(1, max(0, p.y * 0.5 + 0.5))  # 0 at its foot, 1 at its top
        back = lean * t
        if p.z > 0:
            back += sum(0.1 for ledge in ledges if t > ledge)  # (stepped back above each ledge)
        v.co = Vector((x + p.x * half_w, y0 + t * (y1 - y0), z + (p.z - back) * half_d))
    tmp.normal_update()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        c = f.calc_center_median()
        n = f.normal
        band = noise.noise(Vector((c.x * 0.08, c.y * 0.3, 0)) + off)  # the rock's beds, lying level
        if n.y > 0.5:
            # Tops and ledges: moss, lichen, or bare pale stone.
            pick = noise.noise(c * 0.7 + off * 2)
            colour = tone(random.choice(('moss_rock', 'moss_rock_dark')), 0.08) if pick > -0.1 else tone(random.choice(('lichen_pale', 'granite')), 0.06)
        elif c.y < 0.5 + 0.4 * wet:
            # The waterline: dark, wet, green in places.
            colour = tone('moss_rock_dark', 0.08, 0.9) if random.random() < 0.3 else tone('granite_deep', 0.05, 1.1)
        elif n.y < -0.25:
            colour = tone('granite_deep', 0.05)  # (under an overhang)
        elif wet * (1.15 - 0.5 * (c.y - y0) / (y1 - y0)) + 0.35 * noise.noise(c * 0.25 + off) > 0.45:
            colour = tone('granite_dark', 0.04, 0.92)  # (wet with spray: more so lower down)
        elif n.y > 0.15 and random.random() < 0.18:
            colour = tone(random.choice(('lichen_pale', 'lichen_gold')), 0.06)
        else:
            name = 'granite_dark' if band < -0.2 else 'granite_warm' if band > 0.3 else 'granite'
            colour = tone(name, 0.035, 0.84 + 0.2 * (c.y - y0) / (y1 - y0))
        b.add(verts, [tuple(index[v] for v in f.verts)], colour)
    tmp.free()


random.seed(37)
cliff = Builder()
# The wall the water falls in front of: set back, wet and dark, its top just under the stream.
crag_into(cliff, 0.2, -1.0, 3.6, 2.4, -3.0, DROP - 0.1, 700, wet=1.0, lean=0.08)
# Two pillars standing proud either side of it: the notch the water pours through.
crag_into(cliff, -3.9, 0.9, 1.9, 2.6, -3.0, DROP + 1.5, 701, wet=0.7, lean=0.14)
crag_into(cliff, 4.2, 0.7, 2.1, 2.7, -3.0, DROP + 1.1, 702, wet=0.7, lean=0.16)
# Then buttress after buttress out along the step each way: some standing forward, some set
# back in gullies between them; shorter as the step ramps down at its ends.
for side in (-1, 1):
    x = side * 6.6
    k = 0
    while abs(x) < 26.5:
        half_w = random.uniform(2.1, 3.1)
        forward = random.choice((-0.7, -0.3, 0.1, 0.5, 0.9))  # (in a gully, or standing proud)
        top = land_top(x) + random.uniform(0.25, 1.3) * (1 if abs(x) < 19 else 0.5)
        wet = max(0, 0.45 - 0.07 * (abs(x) - 6))
        crag_into(cliff, x, face(x) + 0.7 + forward * 0.8, half_w, random.uniform(2.2, 2.8), -3.0, top, 710 + k + (side + 1) * 20,
                  wet=wet, lean=random.uniform(0.1, 0.26))
        x += side * half_w * random.uniform(1.25, 1.5)
        k += 1
cliff_object = build('waterfall-cliff', cliff, ROCK)

rocks = Builder()
# Stones standing in the lip: the water parts round them and falls in separate strands.
stone_into(rocks, (0.42, 0.5, 0.5), 530, at=(-0.55, DROP - 0.2, 0.35), turn=0.4, mossy=False, subdivisions=2)
stone_into(rocks, (0.3, 0.38, 0.4), 531, at=(0.85, DROP - 0.15, 0.45), turn=1.3, mossy=False, subdivisions=2)
# A few along the stream's edges up on the shelf.
for s in (-1, 1):
    for k in range(3):
        stone_into(rocks, (random.uniform(0.5, 0.9), random.uniform(0.3, 0.5), random.uniform(0.5, 0.8)), 534 + k + (s + 1) * 5,
                   at=(s * (1.7 + random.uniform(0, 0.5)), DROP - 0.1, -1.6 - k * 1.9), turn=random.uniform(0, 3), mossy=True, subdivisions=2)
# Blocks fallen at the cliff's foot either side of the water, biggest nearest it.
for s in (-1, 1):
    for k in range(5):
        x = s * (3.0 + k * 2.1 + random.uniform(-0.3, 0.3))
        size = (random.uniform(0.8, 1.5), random.uniform(0.6, 1.2), random.uniform(0.7, 1.1))
        ground = 0.0 if s > 0 or k < 2 else min(2.6, (k - 1) * 0.9)  # (the bank rises on that side)
        stone_into(rocks, size, 540 + k + (s + 1) * 20, at=(x, ground, face(x) + 3.3 + random.uniform(-0.2, 0.6)), turn=random.uniform(0, 3), mossy=True)
# Boulders round the pool's edge.
for k in range(8):
    a = math.pi * (0.1 + 0.8 * k / 7)
    stone_into(rocks, (random.uniform(0.5, 1.0), random.uniform(0.4, 0.7), random.uniform(0.5, 0.9)), 580 + k,
               at=(math.cos(a) * 7.5, 0.1, 6.0 - math.sin(a) * 0.5 + (k % 2) * 0.8), turn=random.uniform(0, 3), mossy=True, subdivisions=2)
rock_object = build('waterfall-rocks', rocks, ROCK)


def uv_mesh(name, verts, faces, uvs, colour):
    me = bpy.data.meshes.new(name)
    me.from_pydata([g(*v) for v in verts], [], faces)
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in a.data:
        d.color = colour
    me.materials.append(WATER)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def falling_sheet(name, half_top, spread, out, flip=False):
    """A sheet of falling water from the lip (a short run across the top, then over), bowing out
    from the face as it falls and spreading. `flip` turns its u round (so two sheets' strands
    don't line up)."""
    nu, nv = 6, 14
    verts, uvs = [], []
    for j in range(nv + 1):
        t = j / nv  # 0 at the foot, 1 over the lip
        z = out + 0.7 * (1 - t) ** 1.5 - 0.6 * t
        half = half_top + spread * (1 - t)
        for i in range(nu + 1):
            u = i / nu
            verts.append(((u * 2 - 1) * half, DROP * t + 0.05, z))
            uvs.append((1 - u if flip else u, t))
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i) for j in range(nv) for i in range(nu)]
    return uv_mesh(name, verts, faces, uvs, white)


WATER = material('water', 0.3)
white = col('bone', 0)
sheet = falling_sheet('waterfall-water', 1.5, 0.7, 0.9)
front = falling_sheet('waterfall-water-front', 1.0, 0.9, 1.25, flip=True)
# The stream over the shelf above, running to the lip.
verts, uvs = [], []
for j in range(7):
    t = j / 6
    z = -7 + 6.8 * t
    for i in range(3):
        u = i / 2
        verts.append(((u * 2 - 1) * (1.0 + 0.4 * t), DROP + 0.12 - 0.1 * t, z))
        uvs.append((u, 1 + t * 0.6))
faces = [(j * 3 + i, j * 3 + i + 1, (j + 1) * 3 + i + 1, (j + 1) * 3 + i) for j in range(6) for i in range(2)]
top = uv_mesh('waterfall-water-top', verts, faces, uvs, white)
# The foam where it lands: out across the pool, further forward than to the sides (v: 0 in the
# middle to 1 at its rim).
rings, sides = 5, 20
verts, uvs = [(0, 0.06, 1.8)], [(0.5, 0)]
for r in range(1, rings + 1):
    for k in range(sides):
        a = math.tau * k / sides
        rr = 5.0 * r / rings
        forward = math.sin(a)
        verts.append((math.cos(a) * rr, 0.06, 1.8 + forward * rr * (1.0 if forward > 0 else 0.35)))
        uvs.append((k / sides, r / rings))
faces = [(0, 1 + (k + 1) % sides, 1 + k) for k in range(sides)]
for r in range(rings - 1):
    for k in range(sides):
        a0, a1 = 1 + r * sides + k, 1 + r * sides + (k + 1) % sides
        faces.append((a0, a1, a1 + sides, a0 + sides))
foam = uv_mesh('waterfall-foam', verts, faces, uvs, white)
# (Set KEEP before running it to look at the model in Blender instead of exporting it.)
if not globals().get('KEEP'):
    export([cliff_object, rock_object, sheet, front, top, foam], 'waterfall.glb')
