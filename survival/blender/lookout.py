# Generates lookout.glb (survival/public/models/): the fire lookout tower.
# Run: blender -b --python lookout.py
#
# Its stairs, landings and floors must sit exactly where the game lets you walk: the layout
# is TOWER in src/lookout.js (copied below). Parts that fade when they're between the
# camera and the player are separate objects named with "stair", "floor", "wall", "window"
# or "roof" (see src/cutaway.js). The frame and the balcony railing never fade.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from kit import PAL, Builder, build, col, export, g, material, reset

T = dict(storey=3, flights=4, stairEnd=1.8, lane=0.9, laneHalf=0.5, landing=2.5, landingHalf=1.4,
         cab=3, balcony=4.5, door=0.6, cabFloor=12, legSpread=3)
PAL.update(timber=0x5e4632, timber_dark=0x46342a, stair=0x6b5440, tread=0x7d6650, deck=0x7a6450,
           siding=0x6f6a58, siding_dark=0x5a5648, trim=0xd8d2c0, roof_metal=0x5a6460, roof_dark=0x46504c,
           concrete=0x8a8a84, sign=0x3d5a3a)

reset()
random.seed(9)
WOOD = material('wood', 0.92)
METAL = material('metal', 0.75)


def glass_material():
    m = bpy.data.materials.new('glass')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.08, 0.12, 0.15, 1)
    b.inputs['Roughness'].default_value = 0.15
    b.inputs['Alpha'].default_value = 0.45
    m.surface_render_method = 'BLENDED'
    return m


GLASS = glass_material()
CF, CAB, BAL, DOOR = T['cabFloor'], T['cab'], T['balcony'], T['door']


def spread(y):
    return T['legSpread'] - (y / CF) * 0.6


corners = [(1, 1), (1, -1), (-1, -1), (-1, 1)]

# ---- The frame: four leaning legs on concrete footings, crossbars and X-braces each storey.
frame = Builder()
for sx, sz in corners:
    frame.box((sx * T['legSpread'], 0.0, sz * T['legSpread']), (0.7, 0.6, 0.7), lambda: col('concrete', 0.05))
    frame.pole((sx * (T['legSpread'] + 0.07), -1.5, sz * (T['legSpread'] + 0.07)), (sx * spread(CF), CF, sz * spread(CF)), 0.17, lambda: col('timber', 0.06), n=4)
for i in range(T['flights']):
    y0, y1 = i * T['storey'], (i + 1) * T['storey']
    for k, (ax, az) in enumerate(corners):
        bx, bz = corners[(k + 1) % 4]
        s0, s1 = spread(y0), spread(y1)
        frame.pole((ax * s1, y1, az * s1), (bx * s1, y1, bz * s1), 0.08, lambda: col('timber', 0.06), n=4)
        frame.pole((ax * s0, y0 + 0.2, az * s0), (bx * s1, y1, bz * s1), 0.05, lambda: col('timber_dark', 0.06), n=4)
        frame.pole((bx * s0, y0 + 0.2, bz * s0), (ax * s1, y1, az * s1), 0.05, lambda: col('timber_dark', 0.06), n=4)
for sx, sz in corners:  # braces under the balcony
    frame.pole((sx * spread(CF - 2.5), CF - 2.5, sz * spread(CF - 2.5)), (sx * (BAL - 0.2), CF - 0.12, sz * (BAL - 0.2)), 0.07, lambda: col('timber_dark'), n=4)
for s in (-1, 1):  # joists under the balcony and cab
    for t in range(-4, 5):
        frame.box((t * 1.0, CF - 0.17, 0), (0.1, 0.12, 2 * BAL), lambda: col('timber_dark', 0.05))

# ---- The flights of stairs: stringers, treads and a handrail; landings between them.
stairs = []
landings = []
for i in range(T['flights']):
    y0 = i * T['storey']
    z = T['lane'] if i % 2 else -T['lane']
    a, c = (T['stairEnd'], -T['stairEnd']) if i % 2 else (-T['stairEnd'], T['stairEnd'])
    run = c - a
    b = Builder()
    for side in (-1, 1):
        sz = z + side * T['laneHalf']
        b.pole((a, y0 - 0.12, sz), (c, y0 + T['storey'] - 0.12, sz), 0.06, lambda: col('stair', 0.05), n=4)
    for k in range(12):
        t = (k + 0.5) / 12
        b.box((a + run * t, y0 + T['storey'] * t - 0.02, z), (0.26, 0.05, T['laneHalf'] * 2), lambda: col('tread', 0.07))
    rail = z + math.copysign(T['laneHalf'], z)
    b.pole((a, y0 + 0.92, rail), (c, y0 + T['storey'] + 0.92, rail), 0.035, lambda: col('timber'), n=4)
    for t in (0.0, 0.5, 1.0):
        b.pole((a + run * t, y0 + T['storey'] * t, rail), (a + run * t, y0 + T['storey'] * t + 0.92, rail), 0.03, lambda: col('timber'), n=4)
    stairs.append(build(f'lookout-stair-{i + 1}', b, WOOD))
    if i < T['flights'] - 1:
        side = 1 if c > 0 else -1
        lb = Builder()
        x0, x1 = sorted((side * T['stairEnd'], side * T['landing']))
        x = x0
        while x < x1 - 0.01:
            w = min(0.24, x1 - x)
            lb.box((x + w / 2, y0 + T['storey'] - 0.05, 0), (w - 0.015, 0.09, T['landingHalf'] * 2), lambda: col('deck', 0.08))
            x += w
        landings.append(build(f'lookout-floor-landing-{i + 1}', lb, WOOD))

# ---- The cab floor (with a hatch where the last flight comes up) and the balcony round it.
top = T['lane'] if (T['flights'] - 1) % 2 else -T['lane']
cab_floor = Builder()
balcony = Builder()
x = -BAL
while x < BAL - 0.01:
    w = min(0.22, BAL - x)
    xc = x + w / 2
    for z0, z1 in ((-BAL, top - T['laneHalf']), (top + T['laneHalf'], BAL)):
        cab_floor.box((xc, CF - 0.05, (z0 + z1) / 2), (w - 0.015, 0.1, z1 - z0), lambda: col('deck', 0.08))
    if not (-T['stairEnd'] < xc < T['stairEnd']):  # (the hatch)
        cab_floor.box((xc, CF - 0.05, top), (w - 0.015, 0.1, T['laneHalf'] * 2), lambda: col('deck', 0.08))
    x += w
# The railing round the balcony (never fades).
rail = Builder()
for k, (ax, az) in enumerate(corners):
    bx, bz = corners[(k + 1) % 4]
    p0 = Vector((ax * BAL, CF, az * BAL))
    p1 = Vector((bx * BAL, CF, bz * BAL))
    rail.pole(tuple(p0 + Vector((0, 1.0, 0))), tuple(p1 + Vector((0, 1.0, 0))), 0.05, lambda: col('timber', 0.05), n=4)
    rail.pole(tuple(p0 + Vector((0, 0.5, 0))), tuple(p1 + Vector((0, 0.5, 0))), 0.035, lambda: col('timber', 0.05), n=4)
    for t in range(5):
        p = p0.lerp(p1, t / 4)
        rail.box((p.x, CF + 0.52, p.z), (0.09, 1.05, 0.09), lambda: col('timber_dark', 0.05))
rail.box((BAL + 0.04, CF + 0.75, -2.0), (0.03, 0.35, 1.2), lambda: col('sign', 0.05))  # a forest service sign
rail.box((BAL + 0.06, CF + 0.75, -2.0), (0.01, 0.06, 0.9), lambda: col('ochre', 0.05))

# ---- The cab: board walls to waist height, windows all round, a doorway onto the balcony
# in the +x wall. One object per side, so each fades on its own.
def cab_side(name, along, edge_axis, edge, gap=None):
    """A wall along `along` ('x' or 'z') at `edge_axis` = edge, from -CAB to CAB."""
    w = Builder()
    glass = Builder()
    def at(t, y):
        return (t, y, edge) if along == 'x' else (edge, y, t)
    def size(length, h, thick=0.08):
        return (length, h, thick) if along == 'x' else (thick, h, length)
    spans = [(-CAB, CAB)] if gap is None else [(-CAB, -gap), (gap, CAB)]
    for s0, s1 in spans:
        mid, length = (s0 + s1) / 2, s1 - s0
        for k in range(4):  # horizontal siding boards
            w.box(at(mid, CF + 0.12 + k * 0.23), size(length, 0.22), lambda: col(random.choice(('siding', 'siding', 'siding_dark')), 0.05))
        w.box(at(mid, CF + 1.0), size(length + 0.04, 0.07, 0.16), lambda: col('trim', 0.04))  # sill
        glass.box(at(mid, CF + 1.6), size(length, 1.15, 0.03), (0.08, 0.12, 0.15, 1))
        n = max(1, round(length / 0.75))
        for k in range(n + 1):  # mullions
            w.box(at(s0 + length * k / n, CF + 1.6), size(0.06, 1.2, 0.1), lambda: col('trim', 0.04))
    w.box(at(0, CF + 2.28), size(2 * CAB + 0.1, 0.16, 0.16), lambda: col('timber', 0.05))  # header
    if gap is not None:
        for s in (-1, 1):
            w.box(at(s * gap, CF + 1.1), size(0.12, 2.2, 0.14), lambda: col('trim', 0.04))  # door frame
    return build(f'lookout-wall-{name}', w, WOOD), build(f'lookout-window-{name}', glass, GLASS)


walls = []
walls += cab_side('south', 'x', 'z', CAB)
walls += cab_side('north', 'x', 'z', -CAB)
walls += cab_side('west', 'z', 'x', -CAB)
walls += cab_side('east', 'z', 'x', CAB, gap=DOOR)
posts = Builder()
for sx, sz in corners:
    posts.box((sx * CAB, CF + 1.15, sz * CAB), (0.16, 2.3, 0.16), lambda: col('timber', 0.05))
walls.append(build('lookout-wall-posts', posts, WOOD))

# ---- The roof: a low hipped roof of standing-seam metal, short eaves, a lightning rod.
roof = Builder()
R = CAB + 0.6
apex = Vector((0, CF + 3.3, 0))
for k, (ax, az) in enumerate(corners):
    bx, bz = corners[(k + 1) % 4]
    p0 = Vector((ax * R, CF + 2.35, az * R))
    p1 = Vector((bx * R, CF + 2.35, bz * R))
    roof.add([g(*p0), g(*p1), g(*apex)], [(0, 1, 2)], lambda: col('roof_metal', 0.04))
    roof.add([g(*p0), g(*p1), g(*apex)], [(2, 1, 0)], lambda: col('roof_dark', 0.04))  # (the underside)
    for t in (0.2, 0.4, 0.6, 0.8):  # seams
        a = p0.lerp(p1, t)
        roof.pole(tuple(a + Vector((0, 0.03, 0))), tuple(apex.lerp(a, 0.05) + Vector((0, 0.03, 0))), 0.02, lambda: col('roof_dark'), n=3)
    roof.pole(tuple(p0), tuple(p1), 0.05, lambda: col('roof_dark'), n=4)  # the eave
roof.pole(tuple(apex), tuple(apex + Vector((0, 1.0, 0))), 0.02, lambda: col('iron'), n=4)
roof.add([g(*apex), g(*(apex + Vector((0.3, -0.25, 0)))), g(*(apex + Vector((-0.3, -0.25, 0))))], [(0, 1, 2)], lambda: col('roof_dark'))

objects = [build('lookout-frame', frame, WOOD), *stairs, *landings, build('lookout-floor-cab', cab_floor, WOOD),
           build('lookout-rail', rail, WOOD), *walls, build('lookout-roof', roof, METAL)]
export(objects, 'lookout.glb')
print('@@ done')
