# Renders the inventory icons: one 256 × 256 picture per item, with a see-through background,
# into survival/public/icons/<item>.png. Run: blender -b --python icons.py [-- item item ...]
#
# Items that already have a model in public/models use it (the axe, bow, knife, arrows, torch,
# logs, trap, campfire, stone, berries, shelter and backpack); the rest are modelled here in
# the same flat-coloured, low-poly style. Each is lit like a little product shot (a warm key
# light, a cool fill and a rim light from behind) and framed to fill the picture.
# src/itemIcons.js loads these, and falls back to drawing the item in code if one is missing.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Matrix, Vector
from kit import PAL, Builder, build, col, g, material, reset

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'public', 'models')
ICONS = os.path.join(HERE, '..', 'public', 'icons')
SIZE = 256

PAL.update(
    moss=0x5e7444, red=0xb0392b, red_dark=0x8a3324, steel=0x9aa3ab, steel_dark=0x5d646b, white=0xf1ece2, cloth_grey=0xb9b0a0,
    paper=0xe6d8b4, paper_fold=0xcdbd94, map_lake=0x4a7d9c, map_hill=0x86877f, map_route=0xa83a2a, map_wood=0x6f7d58,
    brass=0xc9a24a, brass_dark=0x9a7a34, flare_cap=0x2f2a28, flare_tip=0x6a5240, hemp=0xc7a46a, hemp_dark=0xa8864e,
    burnt=0x3a2a22, burnt_dark=0x1f1814, meat=0xb8474a, meat_dark=0x93343a, fat=0xf0d6c6, cooked=0x8a4a24, cooked_dark=0x6a3418, fur=0x9a7a58,
    fur_dark=0x7c6046, skin=0xcfae86, gut=0xc98a8a, gut_dark=0xb07272, cord=0xe8dcc0, leather=0x7a5236,
    leather_dark=0x5e3e28, cork=0xc9a46a, shirt=0x8d9aa6, shirt_dark=0x6f7c88, button=0xe0e0d8,
    matchbox=0x3d6a8a, matchbox_dark=0x2e5470, match_tray=0xd9c49a, match_wood=0xe2c690, match_head=0xb83224,
    jacket=0xb5432f, jacket_dark=0x8a3324, zip=0x3a2a20, flame=0xff7a2a, flame_core=0xffd36a,
)

# The game's axes to Blender's (see kit.g), for turning whole models.
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def turn(*steps):
    """A rotation in the game's axes from steps like ('z', -0.7), applied in order (like
    three.js's rotateX/Y/Z on a group), as a Blender matrix."""
    m = Matrix.Identity(3)
    for axis, angle in steps:
        m = m @ Matrix.Rotation(angle, 3, axis.upper())
    return (C @ m @ C.transposed()).to_4x4()


# ---- Shapes the kit doesn't have.

def ball(b, center, size, c, subdivisions=1):
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=1)
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*(Vector(center) + Vector((v.co.x * size[0], v.co.z * size[1], v.co.y * size[2])))) for v in tmp.verts]
    b.add(verts, [tuple(index[v] for v in f.verts) for f in tmp.faces], c)
    tmp.free()


def ring(b, center, radius, thick, c, rot=Matrix.Identity(3), segments=18, sides=6, arc=math.tau):
    """A torus lying flat (in the game's x-z plane) round `center`, turned by `rot`."""
    closed = arc >= math.tau - 1e-6
    count = segments if closed else segments + 1
    verts = []
    for i in range(count):
        a = arc * i / segments
        out = Vector((math.cos(a), 0, math.sin(a)))
        for j in range(sides):
            s = math.tau * j / sides
            p = out * (radius + thick * math.cos(s)) + Vector((0, thick * math.sin(s), 0))
            verts.append(g(*(Vector(center) + rot @ p)))
    faces = []
    for i in range(segments if closed else segments):
        i2 = (i + 1) % count
        for j in range(sides):
            j2 = (j + 1) % sides
            faces.append((i * sides + j, i * sides + j2, i2 * sides + j2, i2 * sides + j))
    b.add(verts, faces, c)


def cone(b, base, tip, radius, c, n=6):
    base, tip = Vector(base), Vector(tip)
    d = (tip - base).normalized()
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
    v = d.cross(u)
    ring_ = [base + (u * math.cos(math.tau * k / n) + v * math.sin(math.tau * k / n)) * radius for k in range(n)]
    verts = [g(*p) for p in ring_] + [g(*tip)]
    b.add(verts, [(k, (k + 1) % n, n) for k in range(n)] + [tuple(range(n))[::-1]], c)


def flame(at, scale=1.0):
    """A two-layer flame (glowing), base at `at`, as its own object."""
    b = Builder()
    x, y, z = at
    for k in range(3):
        a = k * math.tau / 3
        cone(b, (x + math.cos(a) * 0.06 * scale, y, z + math.sin(a) * 0.06 * scale),
             (x + math.cos(a) * 0.03 * scale, y + 0.42 * scale, z + math.sin(a) * 0.03 * scale), 0.15 * scale, col('flame', 0.05), 5)
    cone(b, (x, y - 0.02 * scale, z), (x, y + 0.66 * scale, z), 0.2 * scale, col('flame', 0.03), 6)
    cone(b, (x, y, z + 0.04 * scale), (x, y + 0.4 * scale, z + 0.04 * scale), 0.11 * scale, col('flame_core', 0.03), 5)
    return build('flame', b, glow_material())


_glow = None


def glow_material():
    global _glow
    if _glow is None:
        m = material('glow', 0.9)
        nt = m.node_tree
        p = nt.nodes['Principled BSDF']
        v = [n for n in nt.nodes if n.type == 'VERTEX_COLOR'][0]
        nt.links.new(v.outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = 2.5
        _glow = m
    return _glow


_flat = None


def flat():
    global _flat
    if _flat is None:
        _flat = material('item', 0.8)
    return _flat


def made(name, b):
    return [build(name, b, flat())]


def model(name, offset=(0, 0, 0)):
    """Imports public/models/<name>.glb; returns its objects (offset in game axes)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f'{name}.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location += g(*offset)
    return new


# ---- The items. Each returns its objects, built in the game's axes (y up, z toward you).

def lighter():
    b = Builder()
    b.box((0, 0.35, 0), (0.42, 0.7, 0.2), col('red', 0.03))
    b.box((0, 0.36, 0.101), (0.3, 0.5, 0.01), col('red_dark', 0.03))
    b.box((0, 0.81, 0), (0.42, 0.22, 0.2), col('steel', 0.03))
    for x in (-0.12, 0, 0.12):  # holes in the chimney
        b.box((x, 0.83, 0.101), (0.05, 0.05, 0.01), col('steel_dark', 0.02))
    b.pole((-0.1, 0.95, -0.07), (-0.1, 0.95, 0.07), 0.07, col('steel_dark', 0.02), n=8)
    return made('lighter', b) + [flame((0.08, 0.92, 0), 0.7)]


def matches():
    # A box of matches, its tray pushed half out, a row of red heads showing.
    b = Builder()
    b.box((-0.12, 0.11, 0), (0.75, 0.22, 0.5), col('matchbox', 0.03))
    b.box((-0.12, 0.221, 0), (0.42, 0.01, 0.32), col('white', 0.02))
    b.box((-0.12, 0.226, 0), (0.18, 0.01, 0.12), col('red', 0.02))
    b.box((-0.495, 0.11, 0), (0.01, 0.16, 0.42), col('matchbox_dark', 0.04))  # the striking strip
    b.box((0.36, 0.09, 0), (0.5, 0.18, 0.46), col('match_tray', 0.03))
    for k, z in enumerate((-0.16, -0.08, 0, 0.08, 0.16)):
        b.box((0.36, 0.2, z), (0.44, 0.035, 0.035), col('match_wood', 0.03))
        ball(b, (0.6, 0.2, z), (0.045, 0.04, 0.035), col('match_head', 0.03))
    return made('matches', b)


def map_():
    b = Builder()
    for i in (-1, 0, 1):
        b.box((i * 0.42, abs(i) * 0.05, 0), (0.42, 0.02, 0.9), col('paper' if i else 'paper_fold', 0.02), roll=-i * 0.13)
    for k in range(6):  # woods
        random.seed(k)
        b.box((-0.1 + random.uniform(-0.25, 0.3), 0.04 + 0.03, random.uniform(-0.35, 0.3)), (0.1, 0.012, 0.1), col('map_wood', 0.05), turn=random.uniform(0, 3))
    ball(b, (-0.42, 0.09, 0.18), (0.16, 0.01, 0.12), col('map_lake', 0.02))
    cone(b, (0.42, 0.08, -0.22), (0.42, 0.2, -0.22), 0.13, col('map_hill', 0.03), 5)
    for k in range(5):  # the route, in dashes
        t = k / 4
        b.box((-0.5 + t * 0.95, 0.09 + abs(t - 0.5) * 0.04, 0.3 - t * 0.55), (0.12, 0.015, 0.035), col('map_route', 0.02), turn=0.55)
    b.box((0.45, 0.1, 0.25), (0.08, 0.015, 0.02), col('map_route', 0.02), turn=0.8)  # an X
    b.box((0.45, 0.1, 0.25), (0.08, 0.015, 0.02), col('map_route', 0.02), turn=-0.8)
    return made('map', b)


def compass():
    b = Builder()
    b.pole((0, 0, 0), (0, 0.14, 0), 0.5, col('brass', 0.02), n=20)
    b.pole((0, 0.14, 0), (0, 0.16, 0), 0.44, col('white', 0.01), n=20)
    for k in range(4):  # cardinal ticks
        a = k * math.pi / 2
        b.box((math.sin(a) * 0.36, 0.165, -math.cos(a) * 0.36), (0.03, 0.01, 0.08), col('steel_dark', 0.02), turn=a)
    cone(b, (0, 0.18, 0), (0, 0.18, -0.36), 0.07, col('red', 0.02), 4)
    cone(b, (0, 0.18, 0), (0, 0.18, 0.36), 0.07, col('steel_dark', 0.02), 4)
    b.pole((0, 0.15, 0), (0, 0.22, 0), 0.04, col('brass_dark', 0.02), n=8)
    ring(b, (0, 0.07, -0.58), 0.1, 0.03, col('brass', 0.02), rot=Matrix.Rotation(math.pi / 2, 3, 'X'))
    # The lid, open and leaning back.
    lid = Matrix.Rotation(1.15, 3, 'X')
    pivot = Vector((0, 0.14, -0.5))
    tmp = Builder()
    tmp.pole((0, 0, 0), (0, 0.04, 0), 0.5, col('brass_dark', 0.02), n=20)
    for v in tmp.bm.verts:
        p = Vector((v.co.x, v.co.z, -v.co.y)) + Vector((0, 0, -0.5))  # (back to game axes, hinge at the origin)
        v.co = g(*(pivot + lid @ p))
    tmp_obj = build('compass-lid', tmp, flat())
    return made('compass', b) + [tmp_obj]


def flare():
    b = Builder()
    b.pole((0, -0.6, 0), (0, 0.6, 0), 0.13, col('red', 0.02), n=10)
    b.pole((0, 0.17, 0), (0, 0.33, 0), 0.135, col('white', 0.01), n=10)
    b.pole((0, 0.57, 0), (0, 0.8, 0), 0.15, col('flare_cap', 0.02), n=10)
    b.pole((0, -0.72, 0), (0, -0.6, 0), 0.07, col('flare_tip', 0.02), n=8, taper=1.4)
    b.box((0, -0.1, 0.13), (0.12, 0.3, 0.01), col('white', 0.01))  # label
    return made('flare', b)


def bandage():
    b = Builder()
    b.pole((0, 0, 0), (0, 0.36, 0), 0.42, col('white', 0.01), n=16)
    b.pole((0, 0, 0), (0, 0.365, 0), 0.14, col('cloth_grey', 0.01), n=10)
    for k in range(3):  # the layers showing on top
        ring(b, (0, 0.362, 0), 0.2 + k * 0.07, 0.006, col('cloth_grey', 0.01), segments=20, sides=3)
    b.sheet(lambda u, v: (0.35 + u * 0.75, 0.02 + (1 - u) * 0.0 + math.sin(u * 3) * 0.02, -0.17 + v * 0.34), 6, 1, col('white', 0.01))
    b.box((0.8, 0.05, 0.0), (0.2, 0.012, 0.06), col('red', 0.01))
    b.box((0.8, 0.05, 0.0), (0.06, 0.012, 0.2), col('red', 0.01))
    return made('bandage', b)


def rope():
    b = Builder()
    for i in range(3):
        ring(b, (0, 0.07 + i * 0.1, 0), 0.45 - i * 0.04, 0.07, col('hemp' if i % 2 == 0 else 'hemp_dark', 0.03),
             rot=Matrix.Rotation(0.12 * (i - 1), 3, 'X'), segments=20, sides=6)
    b.pole((0.4, 0.08, 0.2), (0.85, 0.05, 0.45), 0.07, col('hemp', 0.03), n=6)
    b.pole((0.85, 0.05, 0.45), (0.93, 0.05, 0.5), 0.085, col('hemp_dark', 0.03), n=6)  # frayed end
    return made('rope', b)


def raw_meat():
    b = Builder()
    random.seed(3)
    ball(b, (0, 0.15, 0), (0.62, 0.15, 0.44), col('fat', 0.02))
    ball(b, (0, 0.19, 0), (0.58, 0.16, 0.4), col('meat', 0.06))
    for k in range(4):  # marbling
        b.box((-0.3 + k * 0.2, 0.355, random.uniform(-0.15, 0.15)), (0.16, 0.01, 0.03), col('fat', 0.02), turn=random.uniform(-0.6, 0.6))
    b.pole((0.15, 0.2, -0.25), (0.15, 0.2, 0.3), 0.08, col('white', 0.02), n=8)
    return made('rawMeat', b)


def cooked_meat():
    b = Builder()
    ball(b, (0, 0, -0.2), (0.48, 0.42, 0.62), col('cooked', 0.08), subdivisions=1)
    for k in range(5):  # grill marks
        b.box((0.0, 0.0, -0.55 + k * 0.17), (0.5, 0.44, 0.04), col('cooked_dark', 0.03))
    b.pole((0, 0, 0.3), (0, 0, 0.72), 0.07, col('white', 0.02), n=8, taper=0.85)
    ball(b, (-0.08, 0, 0.75), (0.1, 0.1, 0.1), col('white', 0.02), subdivisions=0)
    ball(b, (0.08, 0, 0.75), (0.1, 0.1, 0.1), col('white', 0.02), subdivisions=0)
    return made('cookedMeat', b)


def burnt_meat():
    b = Builder()
    random.seed(5)
    ball(b, (0, 0, -0.2), (0.46, 0.4, 0.6), col('burnt', 0.1), subdivisions=1)
    for k in range(7):  # charred, cracked crust
        b.box((random.uniform(-0.25, 0.25), random.uniform(0.2, 0.35), -0.55 + k * 0.12), (0.18, 0.06, 0.05), col('burnt_dark', 0.05), turn=random.uniform(-0.5, 0.5))
    b.pole((0, 0, 0.3), (0, 0, 0.72), 0.07, col('cloth_grey', 0.04), n=8, taper=0.85)
    ball(b, (-0.08, 0, 0.75), (0.1, 0.1, 0.1), col('cloth_grey', 0.04), subdivisions=0)
    ball(b, (0.08, 0, 0.75), (0.1, 0.1, 0.1), col('cloth_grey', 0.04), subdivisions=0)
    return made('burntMeat', b)


def spit():
    # The spit's sticks, without the meat.
    objects = model('spit')
    for o in [o for o in objects if o.name.startswith('spit-meat')]:
        objects.remove(o)
        bpy.data.objects.remove(o)
    return objects


def hide():
    b = Builder()
    def at(u, v):
        x = (u - 0.5) * 1.2
        z = (v - 0.5) * 0.85 * (1 + 0.12 * math.sin(x * 9))
        return (x, 0.12 - x * x * 0.12 + math.sin(x * 7 + z * 5) * 0.02, z)
    b.sheet(at, 8, 4, lambda: col('fur', 0.07))
    for x, z in ((-0.62, -0.32), (-0.62, 0.32), (0.62, -0.3), (0.62, 0.3)):
        b.box((x, 0.08, z), (0.26, 0.04, 0.13), col('fur_dark', 0.04), turn=0.5 if x * z > 0 else -0.5)
    b.box((0.06, 0.05, 0.08), (1.0, 0.04, 0.62), col('skin', 0.03), turn=0.15)
    return made('hide', b)


def gut():
    b = Builder()
    for i in range(3):
        ring(b, (0.04 * i, 0.08 + i * 0.12, 0), 0.34 - i * 0.09, 0.085, col('gut' if i % 2 == 0 else 'gut_dark', 0.03),
             rot=Matrix.Rotation(i * 0.6, 3, 'Y'), segments=14, sides=6)
    b.pole((0.3, 0.07, 0.12), (0.72, 0.05, 0.32), 0.08, col('gut_dark', 0.03), n=6, taper=0.7)
    return made('gut', b)


def bowstring():
    b = Builder()
    for i in range(3):
        ring(b, (0, 0.05 + i * 0.05, 0), 0.34, 0.025, col('cord', 0.02), rot=Matrix.Rotation(0.15 * (i - 1), 3, 'Z'), segments=22, sides=4)
    b.pole((0.32, 0.06, 0.05), (0.7, 0.03, 0.3), 0.025, col('cord', 0.02), n=4)
    ring(b, (0.74, 0.03, 0.33), 0.06, 0.02, col('cord', 0.02), segments=8, sides=4)  # its loop
    return made('bowstring', b)


def flask():
    b = Builder()
    ball(b, (0, 0.45, 0), (0.42, 0.48, 0.24), col('leather', 0.04), subdivisions=1)
    b.pole((0, 0.88, 0), (0, 1.06, 0), 0.13, col('leather_dark', 0.02), n=8, taper=0.75)
    b.pole((0, 1.04, 0), (0, 1.18, 0), 0.09, col('cork', 0.03), n=8)
    ring(b, (0, 0.6, 0), 0.47, 0.022, col('hemp', 0.02), rot=Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation(0.6, 3, 'Y'), segments=18, sides=4, arc=math.pi * 1.25)
    return made('flask', b)


def garment(name, body, dark, trim, collar=None, hood=None, zip_=None, pockets=None, toggles=None, buttons=None):
    """A coat or shirt laid flat: a body, two sleeves and its details."""
    b = Builder()
    w, h, d = body
    b.box((0, h / 2, 0), (w, h, d), col(name, 0.03))
    b.box((0, h * 0.97, 0), (w * 0.62, h * 0.08, d * 1.02), col(dark, 0.03))  # shoulders
    for s in (-1, 1):
        b.pole((s * w * 0.48, h * 0.92, 0), (s * w * 0.72, h * 0.12, 0), d * 0.34, col(dark, 0.03), n=6, taper=0.85)
        if trim:
            b.pole((s * w * 0.705, h * 0.17, 0), (s * w * 0.725, h * 0.08, 0), d * 0.34, col(trim, 0.03), n=6)
    if trim:
        b.box((0, 0.04, 0), (w * 1.03, 0.1, d * 1.05), col(trim, 0.04))
    if hood:
        ball(b, (0, h * 1.05, -d * 0.1), (w * 0.34, h * 0.13, d * 0.6), col(hood, 0.04), subdivisions=1)
    if collar:
        b.box((-0.08, h * 0.96, d * 0.5), (0.16, 0.12, 0.02), col(collar, 0.02), roll=0.5)
        b.box((0.08, h * 0.96, d * 0.5), (0.16, 0.12, 0.02), col(collar, 0.02), roll=-0.5)
    if zip_:
        b.box((0, h * 0.48, d / 2 + 0.005), (0.04, h * 0.88, 0.015), col(zip_, 0.02))
    for x, y in pockets or ():
        b.box((x, y, d / 2 + 0.008), (w * 0.27, h * 0.16, 0.02), col(dark, 0.03))
    for y in toggles or ():
        b.box((0.06, y, d / 2 + 0.02), (0.12, 0.04, 0.04), col('wood_dark', 0.02))
    for y in buttons or ():
        b.box((0, y, d / 2 + 0.006), (0.05, 0.05, 0.015), col('button', 0.02))
    return made(name, b)


def shirt():
    return garment('shirt', (0.72, 0.85, 0.3), 'shirt_dark', None, collar='shirt_dark', buttons=(0.22, 0.42, 0.62))


def jacket():
    return garment('jacket', (0.8, 1.0, 0.38), 'jacket_dark', None, hood='wood', zip_='zip', pockets=((-0.2, 0.28), (0.2, 0.28)))


def parka():
    return garment('hide', (0.85, 1.05, 0.42), 'leather', 'bone', hood='bone', zip_='bone', toggles=(0.3, 0.55, 0.8))


def axe():
    return model('axe')


def wood():
    return model('logs')


def trap():
    return model('trap')


def campfire():
    return model('campfire') + [flame((0, 0.12, 0), 0.75)]


def torch():
    return model('torch')


def lit_torch():
    return model('torch') + [flame((0, 0.5, 0), 0.4)]


def stone():
    return model('stone')


def bow():
    return model('bow')


def knife():
    return model('knife')


def berries():
    b = Builder()
    for p in ((0, 0.1, 0), (0.19, 0.1, 0.05), (-0.16, 0.1, 0.08), (0.05, 0.1, -0.18), (0.04, 0.27, 0.02), (-0.11, 0.25, -0.09), (0.17, 0.24, -0.07)):
        ball(b, p, (0.12, 0.12, 0.12), col('red', 0.12), subdivisions=1)
        b.box((p[0], p[1] + 0.115, p[2]), (0.03, 0.02, 0.03), col('wood_dark', 0.05))  # (the little dry tip)
    b.sheet(lambda u, v: (0.12 + u * 0.4, 0.32 + u * 0.08 - (v - 0.5) ** 2 * 0.1, -0.05 + (v - 0.5) * 0.24 * math.sin(u * math.pi)), 4, 2, col('moss', 0.04))
    b.pole((0.05, 0.3, -0.03), (0.14, 0.33, -0.05), 0.012, col('wood_dark', 0.03), n=4)
    return made('berries', b)


def arrows():
    out = []
    for x in (-0.06, 0, 0.06):
        out += model('arrow', (x, 0, 0))
    return out


def shelter():
    return model('shelter')


def backpack():
    return model('backpack')


# item: (what to build, how to turn it to face the camera)
ITEMS = {
    'axe': (axe, [('z', -0.75)]),
    'wood': (wood, [('y', -0.7)]),
    'trap': (trap, [('y', 0.4)]),
    'campfire': (campfire, []),
    'lighter': (lighter, [('z', -0.2)]),
    'matches': (matches, [('x', 0.5), ('y', -0.4)]),
    'map': (map_, [('x', 0.5)]),
    'compass': (compass, [('x', 0.6)]),
    'torch': (torch, [('z', -0.6)]),
    'litTorch': (lit_torch, [('z', -0.6)]),
    'flare': (flare, [('z', -0.8)]),
    'bandage': (bandage, [('y', 0.3)]),
    'rope': (rope, []),
    'rawMeat': (raw_meat, [('y', 0.3)]),
    'cookedMeat': (cooked_meat, [('y', 0.9), ('x', -0.3)]),
    'burntMeat': (burnt_meat, [('y', 0.9), ('x', -0.3)]),
    'spit': (spit, [('y', 0.6), ('x', 0.45)]),
    'hide': (hide, [('y', 0.2)]),
    'gut': (gut, []),
    'stone': (stone, [('y', 0.5)]),
    'bowstring': (bowstring, []),
    'bow': (bow, [('z', -0.7)]),
    'knife': (knife, [('z', -0.8)]),
    'berries': (berries, []),
    'arrow': (arrows, [('y', math.pi / 4), ('x', -0.4)]),
    'flask': (flask, [('y', 0.3)]),
    'shelter': (shelter, [('y', 0.5)]),
    'shirt': (shirt, []),
    'jacket': (jacket, []),
    'parka': (parka, []),
    'backpack': (backpack, [('y', -0.4)]),
}


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('icon-sky')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.62, 0.68, 0.78, 1)
    bg.inputs['Strength'].default_value = 0.75
    sc.world = world

    def sun(name, direction, strength, colour, angle=0.2):
        light = bpy.data.lights.new(name, 'SUN')
        light.energy = strength
        light.color = colour
        light.angle = angle
        o = bpy.data.objects.new(name, light)
        o.rotation_euler = (-g(*direction)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(o)
        return o

    sun('key', (-2, 4, 3), 3.4, (1.0, 0.95, 0.88), 0.35)  # warm, from the top left like the game's sun
    sun('rim', (1.5, 1.2, -3), 2.2, (0.85, 0.92, 1.0), 0.15)  # a cool edge from behind
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens_unit = 'FOV'
    cam.data.angle = math.radians(28)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def frame(cam, objects):
    """Points the camera at the objects from in front, a little above and to the right, and
    fits them snugly in the picture (an orthographic camera, so nothing is distorted)."""
    bpy.context.view_layer.update()
    points = []
    for o in objects:
        if o.type == 'MESH':
            points += [o.matrix_world @ v.co for v in o.data.vertices]
    view = g(0.35, 0.75, 1).normalized()
    rot = (-view).to_track_quat('-Z', 'Y')
    inv = rot.to_matrix().transposed()
    local = [inv @ p for p in points]
    lo = Vector([min(p[i] for p in local) for i in range(3)])
    hi = Vector([max(p[i] for p in local) for i in range(3)])
    middle = rot.to_matrix() @ ((lo + hi) / 2)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(hi.x - lo.x, hi.y - lo.y) * 1.12
    depth = hi.z - lo.z
    cam.location = middle + view * (depth + 1)
    cam.rotation_euler = rot.to_euler()
    cam.data.clip_start = 0.01
    cam.data.clip_end = depth * 2 + 2


def outline(path, width=3, colour=(0x2D / 255, 0x28 / 255, 0x24 / 255)):
    """Puts a dark umber outline round the picture's shape (see STYLE_GUIDE.md, UI icons),
    so the icon reads on any panel."""
    import numpy as np
    image = bpy.data.images.load(path)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    alpha = px[:, :, 3]
    grown = alpha.copy()
    for dy in range(-width, width + 1):
        for dx in range(-width, width + 1):
            if dx * dx + dy * dy > width * width + 1:
                continue
            grown = np.maximum(grown, np.roll(np.roll(alpha, dy, 0), dx, 1))
    out = np.empty_like(px)
    # The picture over the outline (straight alpha).
    a = alpha[:, :, None]
    out[:, :, :3] = px[:, :, :3] * a + np.array(colour) * (1 - a)
    out[:, :, 3] = np.maximum(alpha, grown * 0.9)
    out[:, :, :3] = np.where(out[:, :, 3:] > 0, out[:, :, :3], 0)
    image.pixels.foreach_set(out.ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def main():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(ITEMS)
    os.makedirs(ICONS, exist_ok=True)
    for item in wanted:
        reset()
        global _glow, _flat
        _glow = _flat = None
        random.seed(item)
        cam = setup_scene()
        make, steps = ITEMS[item]
        objects = make()
        holder = bpy.data.objects.new('holder', None)
        bpy.context.scene.collection.objects.link(holder)
        for o in objects:
            if o.parent is None:
                o.parent = holder
        holder.matrix_world = turn(*steps)
        frame(cam, [o for o in bpy.context.scene.objects if o.type == 'MESH'])
        bpy.context.scene.render.filepath = os.path.join(ICONS, f'{item}.png')
        bpy.ops.render.render(write_still=True)
        outline(bpy.context.scene.render.filepath)
        print(f'@@ {item}.png')


main()
