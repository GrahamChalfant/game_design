# The hunter's stand (hunting-stand.glb), built from scratch at the size the game expects
# (src/poiModels.js STAND: the deck's top 3 m up and 2.2 m square, the ladder at the front
# reaching the ground at z = 2.6, 0.84 m wide; an ammo box sits at x -0.6, z -0.55).
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python stand.py
#
# A stand someone built out of what they had: four peeled spruce poles for legs, splayed and
# a little bowed, still barked at the foot; split-pole braces; rough-sawn joists; a deck of
# grey, weathered planks with gaps between them; a skirt of boards round the back and sides
# with a few gone; a ladder of split rails and nailed rungs; a plank bench; and (the part
# named "-roof", which the game shows only on some stands) a sloped sheet of rusting
# corrugated tin on four posts. Uses remake.py's shapes (bark, end grain, rounded boards).
import math, os, random, runpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared, tone, blend, PAL = R['Builder'], R['build'], R['export'], R['shared'], R['tone'], R['blend'], R['PAL']
tube, end_grain, rounded_box, bark_colour, g = R['tube'], R['end_grain'], R['rounded_box'], R['bark_colour'], R['g']

PAL.update(
    plank_grey=0x8a8174, plank_pale=0x9d958a, plank_dark=0x655c52, plank_brown=0x7a6a58,
    joist=0x5e5246, tin=0x8e9497, tin_pale=0xa3a8aa, tin_dark=0x666c70, rust=0x8a4f2e, rust_dark=0x5e3622,
    nail=0x3a3634,
)

P, H, FOOT, LH = 3.0, 1.1, 2.6, 0.42  # deck top, half its width, the ladder's foot, half the ladder's width
random.seed(22)


def weathered(seed, base=('plank_grey', 'plank_pale'), dark='plank_dark', scale=2.2):
    """Grey weathered wood: long streaks of grain along the board, darker toward the ends and
    where it stays damp (underneath)."""
    def colour(c, n):
        q = Vector((c.x * scale, c.y * 9.0 + seed, c.z * scale))
        streak = 0.5 + 0.5 * noise.noise(q)
        t = streak * 0.8 + random.uniform(0, 0.2)
        col = blend(base[0], base[1], t, 0.03)
        if n.y < -0.5:
            col = blend(dark, base[0], 0.3, 0.03)
        return col
    return colour


def board(lo, hi, seed, radius=0.008, base=('plank_grey', 'plank_pale')):
    k = random.uniform(0.92, 1.06)
    paint = weathered(seed, base)
    rounded_box(b, lo, hi, radius, lambda c, n: tuple(min(1, x * k) for x in paint(c, n)[:3]) + (1.0,))


def pole(a, z, r0, r1, seed, bark=0.0, sides=8, bow=0.0, caps=True):
    """A peeled pole from a to z: weathered silver, with bark left on toward its foot (bark: how
    far up, 0-1), a little bowed."""
    a, z = Vector(a), Vector(z)
    d = (z - a)
    side = d.cross(Vector((0, 1, 0)) if abs(d.normalized().y) < 0.9 else Vector((1, 0, 0))).normalized()
    path = []
    for t in (0, 0.25, 0.5, 0.75, 1):
        c = a.lerp(z, t) + side * bow * math.sin(t * math.pi)
        path.append((c, (r0 + (r1 - r0) * t) * random.uniform(0.96, 1.04)))
    barky = bark_colour(seed, peel=0.1)
    def colour(t, ang, n):
        if t < bark and noise.noise(Vector((t * 4, math.cos(ang), seed))) > (t / max(bark, 1e-3)) * 0.9 - 0.45:
            return barky(t, ang, n)
        q = Vector((t * 6, math.cos(ang) * 1.5, math.sin(ang) * 1.5 + seed))
        return blend('plank_brown', 'silver', 0.35 + 0.45 * noise.noise(q), 0.03)  # (old peeled wood: grey going brown)
    rings = tube(b, path, sides, colour, rough=0.05, seed=seed)
    if caps:
        end_grain(b, rings[0], path[0][0], (path[0][0] - path[1][0]).normalized())
        end_grain(b, rings[-1], path[-1][0], (path[-1][0] - path[-2][0]).normalized())
    return path


# ---- the frame ----
b = Builder()
# Legs: splayed out at the foot, sunk a little into the ground, standing a metre over the deck
# (the rail and the roof posts hang off them).
legs = {}
for i, (sx, sz) in enumerate(((1, 1), (1, -1), (-1, -1), (-1, 1))):
    foot = (sx * (H + 0.32), -0.4, sz * (H + 0.32))
    top = (sx * (H - 0.04), P + 1.0, sz * (H - 0.04))
    pole(foot, top, 0.095, 0.072, 10 + i, bark=0.35, sides=10, bow=random.uniform(-0.04, 0.04))
    legs[(sx, sz)] = (Vector(foot), Vector(top))


def leg_at(sx, sz, y):
    foot, top = legs[(sx, sz)]
    return foot.lerp(top, (y - foot.y) / (top.y - foot.y))


# Braces: an X of split poles on the back and each side, and a girt round those three sides.
for (s0, s1) in ((((-1, -1), (1, -1))), (((1, -1), (1, 1))), (((-1, -1), (-1, 1)))):
    for lo_leg, hi_leg in ((s0, s1), (s1, s0)):
        a = leg_at(*lo_leg, 0.35)
        z = leg_at(*hi_leg, P - 0.3)
        out = (a + z) / 2
        out = Vector((out.x, 0, out.z)).normalized() * 0.07  # (on the outside of the legs)
        pole(a + out, z + out, 0.04, 0.036, random.randint(0, 99), sides=6)
    a, z = leg_at(*s0, 1.25), leg_at(*s1, 1.25)
    out = (a + z) / 2
    out = Vector((out.x, 0, out.z)).normalized() * 0.08
    pole(a + out, z + out, 0.045, 0.042, random.randint(0, 99), sides=6)

# Joists under the deck: two rough-sawn beams side to side on the legs, three front to back on those.
for sz in (-1, 1):
    board((-H - 0.16, P - 0.27, sz * (H - 0.04) - 0.05), (H + 0.16, P - 0.11, sz * (H - 0.04) + 0.05), 70 + sz, base=('joist', 'plank_brown'))
for x in (-H + 0.12, 0.0, H - 0.12):
    board((x - 0.045, P - 0.11, -H - 0.06), (x + 0.045, P - 0.065, H + 0.06), 80 + x, base=('joist', 'plank_brown'))

# The deck: planks running front to back, uneven in width, a finger's gap between them, their
# ends ragged.
x = -H - 0.04
while x < H + 0.02:
    w = min(random.uniform(0.15, 0.23), H + 0.06 - x)
    if w > 0.06:
        z0, z1 = -H - random.uniform(0.0, 0.07), H + random.uniform(0.0, 0.08)
        board((x + 0.008, P - 0.065, z0), (x + w - 0.008, P - 0.01 + random.uniform(-0.006, 0.004), z1), random.uniform(0, 50))
    x += w

# The rail: a peeled pole round the back and sides at waist height, and short lengths either
# side of the ladder at the front.
RAIL = P + 0.92
for a, z in (((-H, RAIL, -H), (H, RAIL, -H)), ((-H, RAIL, -H), (-H, RAIL, H)), ((H, RAIL, -H), (H, RAIL, H))):
    pole(a, z, 0.042, 0.04, random.randint(0, 99), sides=7)
for sx in (-1, 1):
    pole((sx * H, RAIL, H), (sx * (LH + 0.06), RAIL - 0.04, H), 0.038, 0.036, random.randint(0, 99), sides=7)

# A skirt of boards nailed upright round the back and sides, up to just under the rail, with a
# few missing, a few short (broken), on a nailer half way up.
for side in ('back', 'left', 'right'):
    i = 0
    u = -H + 0.04
    while u < H - 0.04:
        w = random.uniform(0.14, 0.2)
        i += 1
        if random.random() < 0.12:  # (one gone)
            u += w
            continue
        top = RAIL - 0.08 - (random.uniform(0.15, 0.4) if random.random() < 0.1 else random.uniform(0, 0.03))
        lo_u, hi_u = u + 0.006, min(u + w, H - 0.04) - 0.006
        if hi_u - lo_u < 0.05:
            break
        if side == 'back':
            board((lo_u, P - 0.12, -H - 0.1), (hi_u, top, -H - 0.07), random.uniform(0, 50))
        else:
            s = -1 if side == 'left' else 1
            board((s * H + s * 0.07 - 0.015, P - 0.12, lo_u), (s * H + s * 0.07 + 0.015, top, hi_u), random.uniform(0, 50))
        u += w
for s in (-1, 1):  # nailers behind the side boards
    board((s * H + s * 0.04 - 0.02, P + 0.4, -H), (s * H + s * 0.04 + 0.02, P + 0.46, H), 90 + s, base=('joist', 'plank_brown'))
board((-H, P + 0.4, -H - 0.06), (H, P + 0.46, -H - 0.02), 95, base=('joist', 'plank_brown'))

# The ladder: two split rails leaning from the ground up to the front of the deck, with round
# rungs nailed across (where the old one had them, so it climbs the same).
for sx in (-1, 1):
    pole((sx * LH, -0.1, FOOT + 0.1), (sx * LH, P + 0.45, H - 0.05), 0.05, 0.046, 40 + sx, bark=0.15, sides=7)
rungs = 9
for i in range(rungs):
    t = (i + 0.6) / (rungs + 0.4)
    yy, zz = t * P, FOOT - (FOOT - H) * t
    pole((-LH - 0.06, yy + random.uniform(-0.015, 0.015), zz + 0.02), (LH + 0.06, yy + random.uniform(-0.015, 0.015), zz + 0.02), 0.03, 0.028, 50 + i, sides=6)

# A plank bench at the back, on two stubs of log.
board((-0.22, P + 0.43, -H + 0.1), (0.74, P + 0.48, -H + 0.42), 60)
for x in (-0.12, 0.64):
    pole((x, P - 0.01, -H + 0.26), (x, P + 0.43, -H + 0.26), 0.07, 0.068, 61 + int(x * 10), bark=1.0, sides=8)
# A gun rest across the right-hand rail, worn pale.
board((H - 0.05, RAIL + 0.03, 0.0), (H + 0.04, RAIL + 0.07, 0.45), 62, base=('plank_pale', 'plank_pale'))
frame = build('hunting-stand', b, shared('stand-wood', 0.93))

# ---- the roof: posts up from the rail corners, and a sloped sheet of corrugated tin ----
b = Builder()
ROOF_BACK, ROOF_FRONT = P + 2.12, P + 1.82  # (sloping down to the front, over the ladder)


def roof_y(z):
    return ROOF_BACK + (ROOF_FRONT - ROOF_BACK) * (z + H + 0.3) / (2 * H + 0.75)


for sx, sz in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
    top = (sx * (H - 0.04), roof_y(sz * H) - 0.06, sz * (H - 0.04))
    pole((sx * (H - 0.04), P + 0.95, sz * (H - 0.04)), top, 0.04, 0.036, 30 + sx + 2 * sz, sides=6)
for sz in (-1, 1):  # purlins side to side under the tin
    y = roof_y(sz * H) - 0.03
    pole((-H - 0.12, y, sz * (H - 0.04)), (H + 0.12, y, sz * (H - 0.04)), 0.04, 0.038, 35 + sz, sides=6)

# The tin: two sheets, side by side and overlapping, ridged along the slope; galvanised grey
# going to rust in patches, and darker underneath.
def tin_colour(c, up):
    r = noise.noise(Vector((c.x * 1.6, c.z * 1.6, 7.0))) + 0.35 * noise.noise(Vector((c.x * 6, c.z * 6, 3.0)))
    edge = max(0.0, abs(c.z) - (H + 0.1)) * 3  # (the eaves rust first)
    if r + edge > 0.25:
        col = blend('rust_dark', 'rust', 0.5 + 0.5 * noise.noise(Vector((c.x * 9, c.z * 9, 1.0))), 0.04)
    else:
        col = blend('tin_dark', 'tin_pale', 0.5 + 0.5 * noise.noise(Vector((c.x * 3, c.z * 0.7, 5.0))), 0.03)
    if not up:
        col = tuple(x * 0.55 for x in col[:3]) + (1.0,)
    return col


for x0, x1 in ((-H - 0.26, 0.06), (-0.06, H + 0.26)):
    nu, nv = 28, 6
    z0, z1 = -H - 0.3, H + 0.45
    def at(i, j, x0=x0, x1=x1):
        x = x0 + (x1 - x0) * i / nu
        z = z0 + (z1 - z0) * j / nv
        ridge = 0.022 * math.sin(i / nu * (x1 - x0) / 0.076 * math.tau)
        sag = 0.015 * math.sin(math.pi * i / nu) * math.sin(math.pi * j / nv)
        return Vector((x, roof_y(z) + ridge - sag + (0.012 if x0 > -0.1 else 0), z))
    for i in range(nu):
        for j in range(nv):
            quad = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
            c = sum(quad, Vector()) / 4
            top = [g(*p) for p in quad]
            up = (quad[1] - quad[0]).cross(quad[3] - quad[0])
            if up.y < 0:
                top = top[::-1]
            b.add(top, [(0, 1, 2, 3)], tin_colour(c, True))
            under = [g(*(p - Vector((0, 0.004, 0)))) for p in quad]
            b.add(under if up.y < 0 else under[::-1], [(0, 1, 2, 3)], tin_colour(c, False))
# A few rocks on the tin to hold it down in the wind.
for x, z in ((-0.7, -0.2), (0.5, 0.6)):
    b.stone((x, roof_y(z) + 0.06, z), (0.11, 0.07, 0.09), lambda: tone(random.choice(('granite', 'granite_dark')), 0.06), points=10)
roof = build('hunting-stand-roof', b, shared('stand-tin', 0.7))

export([frame, roof], 'hunting-stand.glb')
print('@@ stand done')
