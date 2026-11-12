# The berry bush (issue #74), survival/public/models/: berry-bush.glb (woody stems and leaves)
# and berry-bush-berries.glb (the ripe berries, hidden once the bush is picked; the game draws
# both, one copy per bush, see bushes.js).
# Run: blender -b --python berry_bush.py
# (or from the Blender MCP / Text Editor in an open Blender: then the bush is also left in a
# "Berry bush" collection to look at; your scene is otherwise left alone)
#
# Made the way the spruce are (conifers.py): the leaves are cards the game paints with a
# see-through leaf texture (look.js leafTexture: sprigs of a few alternate leaves on a twig), so
# its outline is ragged leaves, not facets. A low, rounded shrub of the northern woods, knee to
# hip high: a handful of woody stems rising from one crown, grey-brown and bare at the foot,
# leaning out and forking into reddish young twigs; on every twig tip and along the stems'
# upper halves, a cluster of leafy sprigs fanning out and up, darker inside and underneath,
# lighter where the sun gets at it, the odd one already turned rust or gold. Bunches of red
# berries hang just proud of the leaves on short stalks, round the sides and over the top (the
# camera mostly looks down), so a bush in fruit reads from across a clearing; the stalks stay on
# a picked bush, bare.
# Origin: base centre, the ground (the stems start a little below it, so it never floats on a
# slope). About 0.9 m tall and 1.1 m across, inside the game's 0.45 m collision radius but for
# the outermost leaves.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from kit import OUT, PAL, Builder, build, export, g, material

PAL.update(
    bark=0x5a4838, bark_grey=0x6e6456, twig=0x7a4a34, twig_red=0x86452f, stalk=0x6e3a2a,
    leaf_deep=0x2c3824, leaf_dark=0x3a482b, leaf=0x4e5c36, leaf_mid=0x606c3c, leaf_light=0x76804a, leaf_sun=0x8a9152,
    leaf_rust=0xa0643a, leaf_gold=0xb39a52, leaf_red=0x8c3e2c,
    berry=0xa8202a, berry_dark=0x701420, berry_hi=0xc8404a, calyx=0x3a2420,
)
HEIGHT = 0.95  # the crown's top
RADIUS = 0.6  # its widest
SINK = 0.08  # the stems start this far below the ground
UP = Vector((0, 1, 0))
TAU = math.tau
rand = random.Random()


def colour(name, var=0.06, shade=1.0):
    h = PAL[name]
    k = (1 + rand.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def shared(name, rough):
    return bpy.data.materials.get(name) or material(name, rough)


def mound(a):
    """The crown's outline: its radius at angle a, lumpy, so it isn't a dome."""
    return RADIUS * (0.86 + 0.09 * math.sin(3 * a + 0.7) + 0.06 * math.sin(5 * a + 2.1))


def stem(b, points, r0, r1, colour_at, sides=5):
    """A tapering woody stem through `points` (game space), r0 thick at the foot, r1 at the tip."""
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        d = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        u = d.cross(UP if abs(d.y) < 0.95 else Vector((1, 0, 0))).normalized()
        v = d.cross(u)
        r = r0 + (r1 - r0) * i / (n - 1)
        turn = i * 0.4
        rings.append([p + (u * math.cos(turn + TAU * k / sides) + v * math.sin(turn + TAU * k / sides)) * r for k in range(sides)])
    for i in range(n - 1):
        verts = [g(*q) for q in rings[i] + rings[i + 1]]
        c = colour_at(i / (n - 1))
        b.add(verts, [(j, (j + 1) % sides, (j + 1) % sides + sides, j + sides) for j in range(sides)], c)
    b.add([g(*q) for q in rings[-1]], [tuple(range(sides))], colour_at(1))


def bark(t):
    """Grey-brown old wood at the foot, reddish young twig at the tips."""
    if t < 0.45:
        return lambda: colour(rand.choice(('bark', 'bark', 'bark_grey')), 0.07)
    return lambda: colour(rand.choice(('twig', 'twig_red', 'bark')), 0.07)


def curve(a, c, z, steps):
    """Points along a quadratic curve a → (towards c) → z."""
    return [a * (1 - t) ** 2 + c * 2 * t * (1 - t) + z * t * t for t in (i / steps for i in range(steps + 1))]


def leaf_colour(p, inner=False):
    """Darker deep inside and low down, lighter out at the top where the sun gets at it; now
    and then a sprig turned for autumn."""
    if not inner and rand.random() < 0.1:
        return colour(rand.choice(('leaf_rust', 'leaf_gold', 'leaf_red', 'leaf_rust')), 0.08)
    out = min(1, Vector((p.x, 0, p.z)).length / RADIUS)
    up = max(0, min(1, p.y / HEIGHT))
    names = ('leaf_deep', 'leaf_dark', 'leaf', 'leaf_mid', 'leaf_light', 'leaf_sun')
    x = (0.2 if inner else 0.8) + out * 1.6 + up * 2.6 + rand.uniform(-0.8, 0.8)
    return colour(names[max(0, min(len(names) - 1, int(x)))], 0.07)


def card(cards, base, along, face_to, length, c):
    """A leafy sprig: a card from `base` reaching `length` along `along`, its face turned toward
    `face_to`, folded along the twig (the middle raised) so it isn't a flat sheet, and the tip
    drooping a little. Which half of the texture (two sprigs) is picked at random."""
    d = along.normalized()
    s = d.cross(face_to)
    if s.length < 1e-3:
        s = d.cross(Vector((1, 0, 0)))
    s.normalize()
    n = s.cross(d)
    if n.dot(face_to) < 0:
        s, n = -s, -n
    w = length * 0.62
    tip = base + d * length - UP * length * rand.uniform(0.05, 0.2)
    lift = n * w * 0.18
    corners = [base - s * w * 0.5, base + lift, base + s * w * 0.5, tip + s * w * 0.5, tip + lift, tip - s * w * 0.5]
    u0 = rand.choice((0.0, 0.5))
    uv = [(u0, 0), (u0 + 0.25, 0), (u0 + 0.5, 0), (u0 + 0.5, 1), (u0 + 0.25, 1), (u0, 1)]
    vs = [cards.bm.verts.new(g(*p)) for p in corners]
    for quad in ((0, 1, 4, 5), (1, 2, 3, 4)):
        f = cards.bm.faces.new([vs[i] for i in quad])
        f[cards.lay] = len(cards.cols)
        cards.cols.append(c)
        for loop, i in zip(f.loops, quad):
            loop[cards.uv].uv = uv[i]


def cluster(cards, at, out, count, size):
    """A clump of sprigs fanning out and up from `at`, mostly away from the bush's middle."""
    for _ in range(count):
        jitter = Vector((rand.uniform(-1, 1), rand.uniform(-0.6, 1), rand.uniform(-1, 1)))
        along = (out * 0.9 + jitter * 0.75 + UP * 0.35).normalized()
        base = at + Vector([rand.uniform(-0.025, 0.025) for _ in range(3)])
        face = (out * 0.5 + UP * 0.9 + jitter * 0.3).normalized()
        card(cards, base, along, face, size * rand.uniform(0.8, 1.2), leaf_colour(base + along * size * 0.5))


def sphere(b, centre, r, top, body, bottom):
    """A small round berry: 24 triangles, smooth shaded once built."""
    lat = 0.62
    rings = [[centre + Vector((math.cos(TAU * k / 6 + o) * math.cos(lat) * r, y * r, math.sin(TAU * k / 6 + o) * math.cos(lat) * r)) for k in range(6)]
             for y, o in ((math.sin(lat), 0), (-math.sin(lat), 0.5))]
    vs = [b.bm.verts.new(g(*p)) for p in [centre + UP * r] + rings[0] + rings[1] + [centre - UP * r * 0.92]]
    faces = [((0, 1 + k, 1 + (k + 1) % 6), top) for k in range(6)]
    faces += [(q, body) for k in range(6) for q in ((1 + k, 7 + k, 7 + (k + 1) % 6), (1 + k, 7 + (k + 1) % 6, 1 + (k + 1) % 6))]
    faces += [((13, 7 + (k + 1) % 6, 7 + k), bottom) for k in range(6)]
    for f, c in faces:  # (one set of corners for all of it, so it shades smooth)
        face = b.bm.faces.new([vs[i] for i in f])
        face[b.lay] = len(b.cols)
        b.cols.append(c)
    return vs


def twig(wood, p, d, length):
    """A young twig from p along d, kept inside the crown's outline; returns where it ends."""
    end = p + d * length
    flat = Vector((end.x, 0, end.z))
    limit = mound(math.atan2(flat.z, flat.x)) * 0.92
    if flat.length > limit:
        end = Vector((flat.x * limit / flat.length, end.y, flat.z * limit / flat.length))
    end.y = min(end.y, HEIGHT * 0.95)
    stem(wood, curve(p, p.lerp(end, 0.5) + UP * 0.03, end, 2), 0.0065, 0.003, lambda t: bark(0.6 + t)(), sides=4)
    return end


def berry_bush(seed=74):
    rand.seed(seed)
    wood, berries, cards = Builder(), Builder(), Builder()
    cards.uv = cards.bm.loops.layers.uv.new('UVMap')
    tips = []  # (point, outward) for every twig tip: where leaves cluster and berries hang
    stems = 12
    for k in range(stems):
        a = TAU * k / stems + rand.uniform(-0.2, 0.2)
        out = Vector((math.cos(a), 0, math.sin(a)))
        inner = k % 4 == 0  # a few stand up the middle, the rest arch out round them
        reach = mound(a) * (rand.uniform(0.2, 0.35) if inner else rand.uniform(0.6, 0.8))
        rise = HEIGHT * (rand.uniform(0.8, 0.9) if inner else rand.uniform(0.42, 0.66))
        foot = out * rand.uniform(0.02, 0.07) - UP * SINK
        top = out * reach + UP * rise
        bend = out * reach * (0.2 if inner else 0.45) + UP * rise * 0.75
        path = curve(foot, bend, top, 6)
        stem(wood, path, 0.014, 0.0045, lambda t: bark(t)(), sides=5)
        tips.append((top, (out + UP * 0.6).normalized()))
        # Forks: twigs off the upper part of the stem, out and up, some forking again.
        for f in rand.sample((2, 3, 4, 5), 3):
            p = path[f]
            side = Vector((-out.z, 0, out.x)) * rand.choice((-1, 1))
            d = (out * 0.8 + side * rand.uniform(0.3, 0.9) + UP * rand.uniform(0.3, 0.8)).normalized()
            twig_end = twig(wood, p, d, rand.uniform(0.16, 0.28))
            tips.append((twig_end, (Vector((twig_end.x, 0, twig_end.z)).normalized() + UP * 0.8).normalized()))
            if rand.random() < 0.5:
                q = p.lerp(twig_end, 0.6)
                e = twig(wood, q, (d + side * 0.8 + UP * 0.3).normalized(), rand.uniform(0.1, 0.16))
                tips.append((e, (Vector((e.x, 0, e.z)).normalized() + UP * 0.8).normalized()))
        # Leaves along the stem's upper half, too.
        for f in (3, 4, 5):
            cluster(cards, path[f], (out + UP * 0.3).normalized(), 3, 0.17)
    for p, o in tips:
        cluster(cards, p, o, rand.randint(6, 8), 0.2)
    # Fill deep inside, darker, so there's no daylight through the middle of the bush.
    for _ in range(36):
        a = rand.uniform(0, TAU)
        r = mound(a) * rand.uniform(0.15, 0.7)
        p = Vector((math.cos(a) * r, rand.uniform(0.2, 0.68) * HEIGHT, math.sin(a) * r))
        o = (Vector((math.cos(a), 0, math.sin(a))) + UP * 0.5).normalized()
        card(cards, p, (o + Vector([rand.uniform(-0.6, 0.6) for _ in range(3)])).normalized(), UP, rand.uniform(0.18, 0.24), leaf_colour(p, inner=True))
    # Berry bunches: on the outer twig tips, just proud of the leaves, round the sides and top.
    hanging = sorted(tips, key=lambda t: rand.random())[:15]
    for p, o in hanging:
        start = p + o * 0.15  # (out past the ends of the twig's own leaves)
        knot = start + (o * 0.3 - UP).normalized() * 0.035  # where the bunch's stalks split
        stem(wood, [p + o * 0.06, start, knot], 0.0028, 0.0018, lambda t: lambda: colour('stalk', 0.06), sides=3)
        for _ in range(rand.randint(6, 9)):
            r = rand.uniform(0.0135, 0.0175)
            spread = Vector((rand.uniform(-1, 1), 0, rand.uniform(-1, 1)))
            centre = knot + spread * 0.032 + o * 0.012 - UP * rand.uniform(0.015, 0.05)
            stem(wood, [knot, centre + UP * r * 0.8], 0.0013, 0.0011, lambda t: lambda: colour('stalk', 0.06), sides=3)
            ripe = rand.random() < 0.85
            body = colour('berry' if ripe else 'berry_dark', 0.08)
            sphere(berries, centre, r, colour('berry_hi', 0.06) if ripe else body, body, colour('calyx', 0.05))
    for b in (wood, berries):  # (every face turned outward)
        bmesh.ops.recalc_face_normals(b.bm, faces=b.bm.faces[:])
    parts = [build('berry-bush', wood, shared('bush-wood', 0.9)), build('berry-bush-leaves', cards, shared('bush-leaves', 0.8))]
    fruit = build('berry-bush-berries', berries, shared('bush-berries', 0.38))
    for poly in fruit.data.polygons:
        poly.use_smooth = True
    return parts, [fruit]


if bpy.app.background:
    from kit import reset
    reset()
    bush, fruit = berry_bush()
    export(bush, 'berry-bush.glb')
    export(fruit, 'berry-bush-berries.glb')
else:
    shelf = bpy.data.collections.get('Berry bush') or bpy.data.collections.new('Berry bush')
    if shelf.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(shelf)
    for o in list(shelf.objects):
        bpy.data.objects.remove(o)
    bush, fruit = berry_bush()
    export(bush, 'berry-bush.glb')
    export(fruit, 'berry-bush-berries.glb')
    for o in sum(berry_bush(), []):
        bpy.context.scene.collection.objects.unlink(o)
        shelf.objects.link(o)
        o.location = (0, 40, 0)  # (clear of anything at the origin)
print('@@ done')
