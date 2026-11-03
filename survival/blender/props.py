# Generates the smaller models that were still drawn with code stand-ins (in
# survival/public/models/): the birch tree, things lying about (logs, axe-ground, clod,
# debris, landing-wheel), the torch, the containers you search (barrel, ammo-box,
# weathered-pack, cupboard, chest, locker, supply-crate), the lookout's furniture (cot,
# fire-finder, binoculars), the fire road's gate and signpost, and the cave props
# (crystals, stalagmite, bones, fire-ring, bedroll, glow-fungus).
# Run: blender -b --python props.py
#
# Parts that open are separate objects whose origin is their hinge, named
# `<model>-lid`, `<model>-door`… : the game swings them open (see swappable in models.js).
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Matrix, Vector
from kit import PAL, Builder, build, build_hinged, col, export, g, material, reset

PAL.update(
    birch_bark=0xd9d4c6, birch_mark=0x3a3632, birch_base=0x5a524a,
    leaf_olive=0x8e9452, leaf_gold=0xb39a52, leaf_dark=0x6f7a46, leaf_rust=0xa0703e,
    olive_paint=0x4f5b3a, olive_dark=0x3a4530, steel=0x5a6a5a, steel_dark=0x46543f, brass=0xb8963e,
    chart=0xe0d4b0, crystal=0x8fd0e8, crystal_deep=0x4a90b8, fungus=0xc8e0a0, soil=0x5a4330, soil_dark=0x463428,
    wreck_yellow=0xd9a52b, rust_red=0xa83a2a, cave_stone=0x5e5a54, cave_dark=0x46423e, water=0x4a6a72,
)

reset()
WOOD = material('wood', 0.93)
METAL = material('metal', 0.72)
CLOTH = material('cloth', 0.95)
ROCK = material('rock', 0.95)
PLANT = material('tree', 0.95)


def icosphere(b, center, radius, squash, c, subdivisions=1, jitter=0.0):
    """A faceted ball (a leaf clump, a cap) at a game-space centre; squash = (sx, sy, sz)."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=radius)
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = []
    for v in tmp.verts:
        p = Vector((v.co.x * squash[0], v.co.z * squash[1], v.co.y * squash[2]))  # (Blender z is the game's y)
        p *= 1 + random.uniform(-jitter, jitter)
        verts.append(g(*(Vector(center) + p)))
    b.add(verts, [tuple(index[v] for v in f.verts) for f in tmp.faces], c)
    tmp.free()


def ring_stones(b, radius, count, size, c, y=0.06):
    for i in range(count):
        a = math.tau * i / count + random.uniform(-0.1, 0.1)
        b.stone((math.cos(a) * radius, y, math.sin(a) * radius), (size, size * 0.7, size * 0.85), c, points=8)


# =========================================================================================
# BIRCH: a slim white trunk with a slight lean, dark marks, and loose clumps of muted
# olive-gold leaves, mostly high up. ~8 m tall, base at the origin.
random.seed(101)
b = Builder()
segments = 11
height = 6.8
lean = Vector((random.uniform(-0.25, 0.25), 0, random.uniform(-0.25, 0.25)))
N = 7
rings = []
for i in range(segments + 1):
    t = i / segments
    y = t * height
    r = 0.17 * (1 - t) + 0.07 * t
    if i == 0:
        r *= 1.25  # a flared base
    centre = Vector((0, y, 0)) + lean * (t * t) + Vector((math.sin(t * 7) * 0.04, 0, math.cos(t * 5) * 0.04))
    rings.append([centre + Vector((math.cos(math.tau * k / N) * r, 0, math.sin(math.tau * k / N) * r)) for k in range(N)])
verts = [g(*p) for ring in rings for p in ring]
for i in range(segments):
    for j in range(N):
        t = i / segments
        # Dark horizontal marks in bands, a darker rough base, the rest chalky white.
        if i == 0:
            c = col('birch_base', 0.08)
        elif random.random() < 0.28 and t < 0.9:
            c = col('birch_mark', 0.1)
        else:
            c = col('birch_bark', 0.05)
        b.add(verts, [(i * N + j, i * N + (j + 1) % N, (i + 1) * N + (j + 1) % N, (i + 1) * N + j)], c)
b.add(verts, [tuple(range(segments * N, (segments + 1) * N))], col('birch_mark'))
top = (rings[-1][0] + rings[-1][3]) / 2
# Thin limbs reaching up and out into the crown.
limbs = []
for k in range(5):
    a = k * 1.3 + random.uniform(-0.3, 0.3)
    y0 = random.uniform(3.6, 5.6)
    t = y0 / height
    base = Vector((0, y0, 0)) + lean * (t * t)
    tip = base + Vector((math.cos(a) * 1.1, random.uniform(0.9, 1.4), math.sin(a) * 1.1))
    b.pole(tuple(base), tuple(tip), 0.045, lambda: col('birch_bark', 0.06), n=4, taper=0.5)
    limbs.append(tip)
# Leaf clumps: small, loose and many, round the limb tips and the top, a few lower down.
clumps = []
for tip in limbs:
    for _ in range(2):
        clumps.append((tip + Vector((random.uniform(-0.35, 0.35), random.uniform(-0.3, 0.3), random.uniform(-0.35, 0.35))), random.uniform(0.42, 0.62)))
for _ in range(5):
    clumps.append((top + Vector((random.uniform(-0.7, 0.7), random.uniform(-0.6, 0.7), random.uniform(-0.7, 0.7))), random.uniform(0.45, 0.65)))
for _ in range(3):
    clumps.append((Vector((random.uniform(-0.9, 0.9), random.uniform(4.3, 5.3), random.uniform(-0.9, 0.9))), random.uniform(0.35, 0.5)))
for centre, r in clumps:
    tone = random.choice(('leaf_olive', 'leaf_olive', 'leaf_gold', 'leaf_dark'))
    icosphere(b, tuple(centre), r, (1.0, 0.85, 1.0), lambda tone=tone: col(tone if random.random() < 0.8 else 'leaf_gold', 0.08), jitter=0.2)
export([build('birch', b, PLANT)], 'birch.glb')

# =========================================================================================
# LOGS: a little bundle of split firewood (the wood you've dropped), ~0.7 m long along z.
random.seed(102)
b = Builder()
for (x, y, turn) in ((-0.15, 0.09, 0.05), (0.14, 0.09, -0.08), (0.0, 0.25, 0.12), (0.3, 0.07, 0.4)):
    m = Matrix.Rotation(turn, 3, 'Y')
    a = Vector((x, y, 0)) + m @ Vector((0, 0, -0.35))
    c = Vector((x, y, 0)) + m @ Vector((0, 0, 0.35))
    b.pole(tuple(a), tuple(c), 0.09, lambda: col(random.choice(('wood', 'wood_dark', 'weathered')), 0.08), n=6, cap=lambda: col('cut', 0.06), wobble=0.08)
export([build('logs', b, WOOD)], 'logs.glb')

# =========================================================================================
# AXE-GROUND: the axe lying in the grass, handle angled, blade flat. Base at the origin.
random.seed(103)
b = Builder()
m = Matrix.Rotation(0.6, 3, 'Y')
end = m @ Vector((0, 0.04, -0.4))
head = m @ Vector((0, 0.04, 0.33))
b.pole(tuple(end), tuple(head), 0.028, lambda: col('wood', 0.05), n=6, cap=lambda: col('wood_dark'))
b.box(tuple(m @ Vector((0.0, 0.05, 0.33))), (0.06, 0.06, 0.16), lambda: col('iron', 0.05), turn=0.6)
b.box(tuple(m @ Vector((0.11, 0.045, 0.34))), (0.17, 0.045, 0.2), lambda: col('chrome', 0.06), turn=0.6)
b.box(tuple(m @ Vector((0.0, 0.045, -0.34))), (0.065, 0.06, 0.08), lambda: col('wood_dark'), turn=0.6)
export([build('axe-ground', b, METAL)], 'axe-ground.glb')

# =========================================================================================
# CLOD: a lump of torn-up soil (~0.32 m), with a tuft of turf still on it.
random.seed(104)
b = Builder()
b.stone((0, 0.08, 0), (0.17, 0.11, 0.15), lambda: col(random.choice(('soil', 'soil', 'soil_dark')), 0.08), points=12)
b.stone((0.04, 0.17, 0.02), (0.1, 0.03, 0.08), lambda: col('moss_dark', 0.08), points=7)
export([build('clod', b, ROCK)], 'clod.glb')

# =========================================================================================
# DEBRIS: a buckled panel of yellow plane skin with a red stripe and a row of rivets.
random.seed(105)
b = Builder()


def panel(u, v):
    x = (u - 0.5) * 0.95
    z = (v - 0.5) * 0.62
    return (x, 0.04 + math.sin(u * 3.1) * 0.06 + v * 0.05 + (0.05 if u > 0.8 else 0), z)


b.sheet(panel, 4, 2, lambda: col('wreck_yellow', 0.07))
b.box((0.0, 0.1, 0.18), (0.95, 0.012, 0.1), lambda: col('rust_red', 0.05), roll=0.04)
for i in range(5):
    b.box((-0.38 + i * 0.19, 0.11, -0.2), (0.025, 0.02, 0.025), lambda: col('chrome', 0.05))
export([build('debris', b, METAL)], 'debris.glb')

# =========================================================================================
# LANDING-WHEEL: a wheel torn off the plane, lying on its side with a bent yellow strut.
random.seed(106)
b = Builder()
b.pole((0, 0.0, 0), (0, 0.19, 0), 0.34, lambda: col('tyre', 0.05), n=12)
b.pole((0, 0.19, 0), (0, 0.21, 0), 0.15, lambda: col('chrome', 0.06), n=10)
b.pole((0, 0.21, 0), (0, 0.24, 0), 0.06, lambda: col('iron'), n=6)
b.pole((0.05, 0.25, 0.05), (0.25, 0.32, 0.55), 0.045, lambda: col('wreck_yellow', 0.06), n=5)
b.pole((0.25, 0.32, 0.55), (0.35, 0.26, 0.92), 0.04, lambda: col('wreck_yellow', 0.06), n=5)
export([build('landing-wheel', b, METAL)], 'landing-wheel.glb')

# =========================================================================================
# TORCH: a stick with a resin-soaked wrap at the top. Origin where the hand grips it; the
# flame sits at y = 0.52 (see placeholders.torch).
random.seed(107)
b = Builder()
b.pole((0, -0.15, 0), (0.01, 0.42, 0.005), 0.026, lambda: col('wood', 0.06), n=6, taper=0.85, cap=lambda: col('wood_dark'))
for i, y in enumerate((0.38, 0.42, 0.46)):
    b.pole((0, y, 0), (0, y + 0.045, 0), 0.05 - i * 0.003, lambda: col(random.choice(('char', 'wood_dark', 'canvas')), 0.08), n=7)
b.pole((0, 0.505, 0), (0, 0.53, 0), 0.04, lambda: col('char'), n=7)
export([build('torch', b, WOOD)], 'torch.glb')

# =========================================================================================
# BARREL: an old rain barrel of staves and iron hoops (r 0.3, 0.85 m tall).
random.seed(108)
b = Builder()
staves = 12
for k in range(staves):
    a0 = math.tau * k / staves
    a1 = math.tau * (k + 1) / staves
    verts = []
    for y, r in ((0, 0.27), (0.43, 0.31), (0.85, 0.27)):
        verts += [g(math.cos(a0) * r, y, math.sin(a0) * r), g(math.cos(a1) * r, y, math.sin(a1) * r)]
    b.add(verts, [(0, 2, 3, 1)[::-1], (2, 4, 5, 3)[::-1]], lambda: col(random.choice(('wood', 'wood_dark', 'weathered')), 0.06))
for y in (0.14, 0.71):
    b.pole((0, y, 0), (0, y + 0.05, 0), 0.305, lambda: col('rust_dark', 0.06), n=12)
b.pole((0, 0.78, 0), (0, 0.8, 0), 0.26, lambda: col('water', 0.05), n=12)  # rainwater inside
export([build('barrel', b, WOOD)], 'barrel.glb')

# =========================================================================================
# AMMO-BOX: a small olive steel box with a lid hinged along the back (y 0.28, z -0.15).
random.seed(109)
body = Builder()
body.box((0, 0.14, 0), (0.5, 0.28, 0.3), lambda: col('olive_paint', 0.05))
body.box((0, 0.27, 0), (0.46, 0.02, 0.26), lambda: col('olive_dark'))
body.box((0, 0.14, 0.153), (0.18, 0.08, 0.01), lambda: col('bone', 0.04))  # stencilled label
lid = Builder()
lid.box((0, 0.3, 0), (0.52, 0.045, 0.31), lambda: col('olive_paint', 0.05))
lid.box((0, 0.335, 0), (0.16, 0.025, 0.05), lambda: col('iron'))  # handle
lid.box((0.22, 0.27, 0.16), (0.04, 0.07, 0.02), lambda: col('iron'))  # latch
export([build('ammo-box', body, METAL), build_hinged('ammo-box-lid', lid, METAL, (0, 0.28, -0.15))], 'ammo-box.glb')

# =========================================================================================
# WEATHERED-PACK: an old canvas rucksack slumped on the ground; its flap hinges at the back.
random.seed(110)
body = Builder()
body.box((0, 0.21, 0), (0.52, 0.42, 0.32), lambda: col('canvas', 0.06), tilt=0.06)
body.box((0, 0.15, 0.18), (0.32, 0.18, 0.07), lambda: col('olive_dark', 0.05))  # front pocket
for x in (-0.18, 0.18):
    body.box((x, 0.22, -0.17), (0.05, 0.38, 0.02), lambda: col('wood_dark'))  # straps
body.pole((-0.32, 0.5, 0), (0.32, 0.5, 0), 0.085, lambda: col('wool', 0.06), n=7, cap=lambda: col('wool', 0.1))  # bedroll
for x in (-0.2, 0.2):
    body.pole((x, 0.42, -0.1), (x, 0.42, 0.1), 0.09, lambda: col('wood_dark'), n=4)
flap = Builder()
flap.box((0, 0.44, 0.0), (0.54, 0.05, 0.36), lambda: col('olive_dark', 0.05))
flap.box((0, 0.42, 0.18), (0.08, 0.06, 0.02), lambda: col('iron'))
export([build('weathered-pack', body, CLOTH), build_hinged('weathered-pack-flap', flap, CLOTH, (0, 0.45, -0.17))], 'weathered-pack.glb')

# =========================================================================================
# CUPBOARD: a tall plank cupboard (0.8 × 1.7 × 0.45), two doors hinged at its sides; inside,
# shelves with old jars and tins.
random.seed(111)
body = Builder()
body.box((0, 0.85, -0.2), (0.8, 1.7, 0.05), lambda: col('wood_dark', 0.05))
for x in (-0.38, 0.38):
    body.box((x, 0.85, 0), (0.04, 1.7, 0.45), lambda: col('wood', 0.06))
for y in (0.02, 0.6, 1.15, 1.68):
    body.box((0, y, 0), (0.8, 0.04, 0.45), lambda: col('wood', 0.06))
body.box((0, 1.75, 0), (0.88, 0.06, 0.5), lambda: col('wood_dark'))
for y in (0.62, 1.17):
    for i in range(3):
        body.pole((-0.22 + i * 0.22, y + 0.02, 0), (-0.22 + i * 0.22, y + random.uniform(0.14, 0.22), 0), 0.05, lambda: col(random.choice(('glass', 'rust', 'bone', 'chrome')), 0.06), n=6)
doors = []
for side, name in ((-1, 'left'), (1, 'right')):
    d = Builder()
    for k in range(2):
        d.box((side * (0.4 - 0.1 - k * 0.19), 0.85, 0.23), (0.18, 1.6, 0.035), lambda: col('plank', 0.08))
    for y in (0.35, 1.35):
        d.box((side * 0.2, y, 0.25), (0.36, 0.08, 0.02), lambda: col('wood_dark'))
    d.box((side * 0.04, 0.9, 0.26), (0.03, 0.12, 0.03), lambda: col('iron'))
    doors.append(build_hinged(f'cupboard-door-{name}', d, WOOD, (side * 0.4, 0, 0.23)))
export([build('cupboard', body, WOOD), *doors], 'cupboard.glb')

# =========================================================================================
# CHEST: an old plank chest with iron bands (0.9 × 0.45 × 0.55); the lid hinges at the back.
random.seed(112)
body = Builder()
for k in range(3):
    body.box((0, 0.075 + k * 0.15, 0), (0.9, 0.14, 0.55), lambda: col('plank', 0.08))
for x in (-0.32, 0.32):
    body.box((x, 0.225, 0), (0.06, 0.46, 0.57), lambda: col('iron', 0.05))
body.box((0, 0.36, 0.28), (0.1, 0.12, 0.02), lambda: col('brass', 0.06))  # lock plate
lid = Builder()
lid.box((0, 0.5, 0), (0.92, 0.1, 0.57), lambda: col('wood_dark', 0.06))
lid.box((0, 0.57, 0), (0.86, 0.05, 0.5), lambda: col('wood', 0.06))
for x in (-0.32, 0.32):
    lid.box((x, 0.53, 0), (0.06, 0.13, 0.58), lambda: col('iron', 0.05))
export([build('chest', body, WOOD), build_hinged('chest-lid', lid, WOOD, (0, 0.45, -0.275))], 'chest.glb')

# =========================================================================================
# LOCKER: a tall green steel ranger's locker; the door hinges on its left (x -0.35, z 0.26).
# Inside, a coat on a hook and a pair of boots.
random.seed(113)
body = Builder()
body.box((0, 0.9, -0.23), (0.7, 1.8, 0.04), lambda: col('steel_dark', 0.04))
for x in (-0.33, 0.33):
    body.box((x, 0.9, 0), (0.04, 1.8, 0.5), lambda: col('steel', 0.04))
for y in (0.02, 1.4, 1.78):
    body.box((0, y, 0), (0.7, 0.04, 0.5), lambda: col('steel', 0.04))
body.box((0, 1.05, -0.1), (0.4, 0.65, 0.12), lambda: col('wool', 0.06))  # the coat
for x in (-0.1, 0.1):
    body.box((x, 0.1, 0.05), (0.1, 0.16, 0.24), lambda: col('wood_dark'))  # boots
door = Builder()
door.box((0.34, 0.9, 0.0), (0.68, 1.74, 0.03), lambda: col('steel', 0.05))
for y in (1.45, 1.55, 1.65):
    door.box((0.34, y, 0.02), (0.4, 0.025, 0.01), lambda: col('steel_dark'))
door.box((0.6, 0.95, 0.03), (0.03, 0.18, 0.04), lambda: col('iron'))
export([build('locker', body, METAL), build_hinged('locker-door', door, METAL, (-0.35, 0, 0.26))], 'locker.glb')

# =========================================================================================
# SUPPLY-CRATE: an olive wooden crate with straps and a red cross; the lid hinges at the back.
random.seed(114)
body = Builder()
for k in range(3):
    body.box((0, 0.09 + k * 0.18, 0), (0.95, 0.17, 0.6), lambda: col('olive_paint', 0.07))
for x in (-0.35, 0.35):
    body.box((x, 0.275, 0), (0.08, 0.57, 0.62), lambda: col('olive_dark'))
lid = Builder()
lid.box((0, 0.59, 0), (0.97, 0.08, 0.62), lambda: col('olive_paint', 0.06))
lid.box((0, 0.635, 0), (0.3, 0.01, 0.08), lambda: col('rust_red'))
lid.box((0, 0.635, 0), (0.08, 0.01, 0.3), lambda: col('rust_red'))
export([build('supply-crate', body, WOOD), build_hinged('supply-crate-lid', lid, WOOD, (0, 0.55, -0.3))], 'supply-crate.glb')

# =========================================================================================
# COT: a canvas camp cot (2 m along x) on crossed legs, with a blanket and a rolled pillow.
random.seed(115)
b = Builder()
for z in (-0.36, 0.36):
    b.pole((-1.0, 0.42, z), (1.0, 0.42, z), 0.025, lambda: col('wood', 0.05), n=5)
b.box((0, 0.44, 0), (1.95, 0.03, 0.7), lambda: col('olive_paint', 0.05))
for x in (-0.8, 0.8):
    b.pole((x - 0.1, 0, -0.36), (x + 0.1, 0.42, 0.36), 0.022, lambda: col('wood_dark'), n=4)
    b.pole((x - 0.1, 0, 0.36), (x + 0.1, 0.42, -0.36), 0.022, lambda: col('wood_dark'), n=4)
b.box((0.3, 0.48, 0), (1.3, 0.06, 0.72), lambda: col('wool', 0.06), roll=0.01)
b.pole((-0.85, 0.55, -0.32), (-0.85, 0.55, 0.32), 0.11, lambda: col('bone', 0.05), n=7)
export([build('cot', b, CLOTH)], 'cot.glb')

# =========================================================================================
# FIRE-FINDER: the lookout's round map table on a post, with a brass sighting ring.
random.seed(116)
b = Builder()
b.pole((0, 0, 0), (0, 0.95, 0), 0.1, lambda: col('wood', 0.05), n=8, taper=0.75)
for a in (0, 2.1, 4.2):
    b.pole((0, 0.02, 0), (math.cos(a) * 0.35, 0.02, math.sin(a) * 0.35), 0.035, lambda: col('wood_dark'), n=4)
b.pole((0, 0.95, 0), (0, 1.01, 0), 0.56, lambda: col('wood_dark', 0.05), n=16)
b.pole((0, 1.01, 0), (0, 1.03, 0), 0.47, lambda: col('chart', 0.04), n=16)
for k in range(16):
    a0 = math.tau * k / 16
    a1 = math.tau * (k + 1) / 16
    b.pole((math.cos(a0) * 0.49, 1.045, math.sin(a0) * 0.49), (math.cos(a1) * 0.49, 1.045, math.sin(a1) * 0.49), 0.02, lambda: col('brass', 0.05), n=4)
for s in (-1, 1):
    b.box((s * 0.49, 1.13, 0), (0.03, 0.17, 0.06), lambda: col('brass', 0.05))
b.box((0.1, 1.04, 0.1), (0.3, 0.005, 0.2), lambda: col('moss', 0.06))  # forest marked on the chart
export([build('fire-finder', b, WOOD)], 'fire-finder.glb')

# =========================================================================================
# BINOCULARS: big mounted binoculars on a post, looking out along +x.
random.seed(117)
b = Builder()
b.pole((0, 0, 0), (0, 1.27, 0), 0.045, lambda: col('iron', 0.05), n=8)
b.pole((0, 0.02, 0), (0, 0.06, 0), 0.14, lambda: col('iron'), n=8)
b.box((0, 1.31, 0), (0.08, 0.1, 0.28), lambda: col('steel_dark'))
for z in (-0.075, 0.075):
    b.pole((-0.14, 1.4, z), (0.2, 1.4, z), 0.055, lambda: col('steel_dark', 0.05), n=10, taper=1.15)
    b.pole((0.2, 1.4, z), (0.215, 1.4, z), 0.06, lambda: col('glass', 0.05), n=10)
    b.pole((-0.2, 1.4, z), (-0.14, 1.4, z), 0.03, lambda: col('iron'), n=8)
b.box((0.02, 1.4, 0), (0.12, 0.05, 0.1), lambda: col('iron'))
export([build('binoculars', b, METAL)], 'binoculars.glb')

# =========================================================================================
# FIRE-GATE: the fire road's rusted pipe gate between two posts (the road runs along z);
# the gate itself hinges on the left post (x -2.3).
random.seed(118)
HALF = 2.3
posts = Builder()
for s in (-1, 1):
    posts.pole((s * HALF, -0.3, 0), (s * HALF, 1.25, 0), 0.1, lambda: col('rust', 0.07), n=8, cap=lambda: col('rust_dark'))
    posts.pole((s * HALF, 1.25, 0), (s * HALF, 1.32, 0), 0.12, lambda: col('rust_dark'), n=8)
gate = Builder()
L = 4.0
for y in (1.0, 0.55):
    gate.pole((-HALF, y, 0), (-HALF + L, y, 0), 0.045, lambda: col('rust', 0.08), n=6)
gate.pole((-HALF + 0.1, 0.55, 0), (-HALF + L * 0.6, 1.0, 0), 0.035, lambda: col('rust_dark'), n=5)
gate.pole((-HALF + L, 0.5, 0), (-HALF + L, 1.05, 0), 0.04, lambda: col('rust'), n=5)
gate.box((-HALF + L * 0.5, 0.8, 0.05), (0.8, 0.38, 0.02), lambda: col('ochre', 0.05))  # a faded sign
gate.box((-HALF + L * 0.5, 0.8, 0.065), (0.5, 0.06, 0.005), lambda: col('wood_dark'))
export([build('fire-gate', posts, METAL), build_hinged('fire-gate-gate', gate, METAL, (-HALF, 0, 0))], 'fire-gate.glb')

# =========================================================================================
# SIGNPOST: a rotting wooden post with a board nailed across it.
random.seed(119)
b = Builder()
b.box((0, 0.85, 0), (0.12, 1.85, 0.12), lambda: col('weathered', 0.06), roll=0.06)
b.box((0.32, 1.5, 0.08), (0.95, 0.26, 0.05), lambda: col('plank', 0.06), roll=-0.12)
b.box((0.68, 1.47, 0.1), (0.14, 0.14, 0.04), lambda: col('plank', 0.06), roll=0.65)  # the arrow's point
b.box((0.3, 1.5, 0.11), (0.6, 0.04, 0.01), lambda: col('wood_dark'), roll=-0.12)  # carved letters, worn
b.stone((0, 0.05, 0), (0.18, 0.1, 0.18), lambda: col('stone', 0.06), points=8)
export([build('signpost', b, WOOD)], 'signpost.glb')

# =========================================================================================
# Cave props.
# CRYSTALS: a cluster of six-sided crystals with pointed tips (they glow: see caves.js).
random.seed(120)
b = Builder()
for k in range(7):
    a = random.uniform(0, math.tau)
    r = random.uniform(0, 0.18)
    base = Vector((math.cos(a) * r, 0, math.sin(a) * r))
    tilt = Vector((math.cos(a) * 0.4, 1, math.sin(a) * 0.4)).normalized()
    length = random.uniform(0.25, 0.6)
    w = random.uniform(0.04, 0.08)
    tip = base + tilt * length
    b.pole(tuple(base), tuple(base + tilt * (length * 0.8)), w, lambda: col(random.choice(('crystal', 'crystal_deep')), 0.08), n=6)
    b.pole(tuple(base + tilt * (length * 0.8)), tuple(tip), w, lambda: col('crystal', 0.06), n=6, taper=0.05)
b.stone((0, 0.02, 0), (0.22, 0.06, 0.2), lambda: col('cave_dark', 0.05), points=8)
export([build('crystals', b, ROCK)], 'crystals.glb')

# STALAGMITE: a knobbly rock spire, 1 m tall (scaled in the game), base at the origin.
random.seed(121)
b = Builder()
prev = None
levels = [(0, 0.34), (0.2, 0.28), (0.45, 0.2), (0.7, 0.12), (0.9, 0.06), (1.0, 0.0)]
for i in range(len(levels) - 1):
    (y0, r0), (y1, r1) = levels[i], levels[i + 1]
    b.pole((random.uniform(-0.02, 0.02), y0, 0), (random.uniform(-0.03, 0.03), y1, random.uniform(-0.02, 0.02)), r0, lambda: col(random.choice(('cave_stone', 'cave_dark', 'stone')), 0.06), n=7, taper=max(0.02, r1 / r0), wobble=0.1)
export([build('stalagmite', b, ROCK)], 'stalagmite.glb')

# BONES: an animal's old bones: a skull, a long bone and ribs.
random.seed(122)
b = Builder()
icosphere(b, (0.35, 0.09, 0.05), 0.12, (1.3, 0.8, 1), lambda: col('bone', 0.05), jitter=0.08)
b.pole((-0.35, 0.04, -0.05), (0.15, 0.04, 0.12), 0.035, lambda: col('bone', 0.05), n=5)
for k in range(4):
    x = -0.2 + k * 0.1
    b.pole((x, 0.02, -0.22), (x + 0.05, 0.1, -0.08), 0.015, lambda: col('bone', 0.06), n=4)
    b.pole((x + 0.05, 0.1, -0.08), (x + 0.02, 0.02, 0.04), 0.015, lambda: col('bone', 0.06), n=4)
export([build('bones', b, ROCK)], 'bones.glb')

# FIRE-RING: a cold, long-dead fire: a ring of stones, charred ends and ash.
random.seed(123)
b = Builder()
ring_stones(b, 0.48, 9, 0.13, lambda: col(random.choice(('cave_stone', 'stone_dark')), 0.06))
b.pole((0, 0.0, 0), (0, 0.015, 0), 0.38, lambda: col('ash', 0.05), n=9)
for a in (0.3, 1.5, 2.8):
    d = Vector((math.cos(a), 0, math.sin(a)))
    b.pole(tuple(d * -0.28 + Vector((0, 0.05, 0))), tuple(d * 0.3 + Vector((0, 0.04, 0))), 0.045, lambda: col('char', 0.06), n=5)
export([build('fire-ring', b, ROCK)], 'fire-ring.glb')

# BEDROLL: an old blanket roll tied with cord, ~1 m long along x.
random.seed(124)
b = Builder()
b.pole((-0.5, 0.11, 0), (0.5, 0.11, 0), 0.11, lambda: col(random.choice(('moss_dark', 'canvas')), 0.06), n=8, cap=lambda: col('wool', 0.06))
for x in (-0.3, 0.3):
    b.pole((x, 0.11, 0), (x + 0.03, 0.11, 0), 0.115, lambda: col('wood_dark'), n=8)
export([build('bedroll', b, CLOTH)], 'bedroll.glb')

# GLOW-FUNGUS: a few small pale caps on short stems (they glow faintly: see caves.js).
random.seed(125)
b = Builder()
for k in range(4):
    x, z = random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12)
    h = random.uniform(0.04, 0.1)
    b.pole((x, 0, z), (x, h, z), 0.012, lambda: col('bone', 0.05), n=4)
    icosphere(b, (x, h + 0.01, z), random.uniform(0.03, 0.06), (1.2, 0.5, 1.2), lambda: col('fungus', 0.06))
export([build('glow-fungus', b, PLANT)], 'glow-fungus.glb')

print('@@ done')
