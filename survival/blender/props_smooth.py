# Smooth-shaded remakes of the small props that were still faceted low poly: the soil clods
# thrown up along the crash, the throwing stone, a sprig of berries, the plane's landing wheel,
# the cave's stalagmite, the fallen log and the backpack (also worn: survivor.py puts the same
# mesh on the player's back); and the snapped trunks and root plates along the plane's way
# in. Colours blend across each surface (smoothkit.py) instead of changing face by face.
# Each keeps the size, origin and facing its old version had.
# Run in an open Blender (Blender MCP or the Text Editor); it doesn't reset the scene.
import math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Matrix, Vector, noise
from kit import PAL, export
from smoothkit import Mesh, box, frame, mix, shared, tone, tube

NAMES = globals().get('NAMES')  # (just these, if given)
PAL.update(
    soil=0x4a3a2a, soil_dark=0x33281e, soil_wet=0x3e3024, turf=0x56603a, turf_dry=0x7a7448, root=0x6e5a40,
    granite=0x7e7d76, granite_dark=0x5c5b56, granite_warm=0x8a8274, berry=0xa8202a, berry_dark=0x6a1018, berry_hi=0xd85a50,
    leaf=0x3a5a2a, leaf_dark=0x2a4220, stem=0x5a4a2a, tyre=0x22201e, tyre_worn=0x3a3632, rim=0x8a8e90, rim_dark=0x5a5e60,
    strut=0x6e7276, rust=0x7a4a2a, lime=0xa8a090, lime_dark=0x6e685e, lime_wet=0x8a8274, lime_tip=0xc8c0ae,
    bark=0x5e4a3a, bark_dark=0x42352a, bark_grey=0x847a6c, moss=0x4e6236, moss_dark=0x34442a, heart=0x8a6440, sapwood=0xc4a479,
    ring=0x7a5636, canvas=0x4f6b45, canvas_dark=0x3a5032, canvas_light=0x5e7a52, webbing=0x2f3a28, buckle=0x3a3a38,
    bedroll=0x8a3a2a, bedroll_dark=0x6a2a20, paint_y=0xd9a52b,
)


def fbm(p, seed=0.0):
    p = Vector(p) + Vector((seed, seed * 1.7, seed * 0.6))
    return noise.noise(p) * 0.6 + noise.noise(p * 2.3) * 0.3 + noise.noise(p * 5.1) * 0.1


# ---- the soil clod ----
def clod():
    """A clod of soil and turf thrown up by the plane, about 0.3 m across, base at the origin."""
    random.seed(11)
    m = Mesh()
    def colour(p, d):
        top = max(0.0, d.y - 0.25) / 0.75
        n = fbm(p * 14, 3)
        c = mix(tone('soil'), tone('soil_dark'), 0.5 + n)
        c = mix(c, tone('soil_wet'), max(0.0, -d.y))
        return mix(c, mix(tone('turf'), tone('turf_dry'), 0.5 + fbm(p * 20, 8)), top * 1.6 - 0.2 + n * 0.6)
    m.blob((0, 0.075, 0), (0.15, 0.1, 0.13), colour, detail=3, lumps=0.28, seed=2, flatten_below=0.0)
    m.blob((0.09, 0.05, -0.06), (0.06, 0.05, 0.055), colour, detail=2, lumps=0.3, seed=5, flatten_below=0.0)
    # Grass still growing out of the turf on top, and a root or two hanging out of the side.
    for i in range(26):
        a = random.uniform(0, math.tau)
        r = random.uniform(0, 0.09)
        base = Vector((math.cos(a) * r, 0.16 - r * 0.6, math.sin(a) * r * 0.9))
        lean = Vector((random.uniform(-0.35, 0.35), 1, random.uniform(-0.35, 0.35))).normalized()
        h = random.uniform(0.05, 0.11)
        side = lean.cross(Vector((0, 0, 1))).normalized() * 0.004
        tip = base + lean * h + Vector((0, -h * 0.25, 0)) * random.random()
        shade = random.uniform(0.85, 1.15)
        m.face([base - side, base + side, tip], [tone('turf', 0, 0.8 * shade), tone('turf', 0, 0.8 * shade), tone('turf_dry', 0, shade)], smooth=False)
        m.face([base + side, base - side, tip], [tone('turf', 0, 0.8 * shade), tone('turf', 0, 0.8 * shade), tone('turf_dry', 0, shade)], smooth=False)
    for a in (0.6, 2.9):
        d = Vector((math.cos(a), 0, math.sin(a)))
        tube(m, d * 0.12 + Vector((0, 0.07, 0)), d * 0.22 + Vector((0, 0.01, 0)), [0.008, 0.006, 0.003], lambda p, n: tone('root'), sides=5)
    return m.build('clod', [shared('clod', 0.95)])


# ---- the throwing stone ----
def stone():
    """A smooth, fist-sized stone (~9 cm), base at the origin."""
    m = Mesh()
    def colour(p, d):
        c = mix(tone('granite', 0, 0.7), tone('granite_dark', 0, 0.75), 0.5 + fbm(p * 60, 2))
        c = mix(c, tone('granite_warm'), max(0.0, fbm(p * 25, 9)) * 1.5)
        return c
    m.blob((0, 0.031, 0), (0.046, 0.032, 0.036), colour, detail=3, lumps=0.12, seed=4, flatten_below=0.002)
    # (Its own material, 'pebble': the game's rock paint would cover one this small in lichen.)
    return m.build('stone', [shared('pebble', 0.8)])


# ---- berries ----
def berry():
    """A sprig of three berries with two small leaves (life size, ~4.5 cm; the game scales it)."""
    random.seed(21)
    m = Mesh()
    for c, r in (((0.0, 0.012, 0.0), 0.0105), ((0.016, 0.011, 0.006), 0.0095), ((0.006, 0.026, 0.011), 0.009)):
        c = Vector(c)
        light = Vector((0.5, 0.8, 0.4)).normalized()
        def colour(p, d, c=c):
            hi = max(0.0, d.dot(light)) ** 6
            base = mix(tone('berry'), tone('berry_dark'), 0.3 - d.y * 0.5 + fbm(p * 300) * 0.3)
            return mix(base, tone('berry_hi'), hi)
        m.blob(c, (r, r * 0.95, r), colour, detail=2, lumps=0.03, seed=int(c.x * 1000))
        # (the dark dimple where the flower was, under each)
        m.blob(c + Vector((0, -r * 0.92, 0)), (r * 0.25, r * 0.12, r * 0.25), lambda p, d: tone('berry_dark', 0, 0.6), detail=1)
    stem_top = Vector((0.004, 0.046, 0.002))
    for c in ((0.0, 0.022, 0.0), (0.016, 0.02, 0.006), (0.006, 0.035, 0.011)):
        tube(m, Vector(c), stem_top, [0.0015, 0.0012], lambda p, n: tone('stem'), sides=5)
    for side in (1, -1):
        base = stem_top
        tip = stem_top + Vector((side * 0.022, -0.004, -0.008))
        mid = base.lerp(tip, 0.5) + Vector((0, 0.004, 0))
        w = Vector((0, 0.0, 1)).cross(tip - base).normalized() * 0.006
        pts = [base, mid + w, tip, mid - w]
        m.face(pts, [tone('leaf'), tone('leaf', 0, 1.15), tone('leaf_dark'), tone('leaf')], smooth=False)
        m.face(pts[::-1], [tone('leaf_dark')] * 4, smooth=False)
    return m.build('berry', [shared('berry', 0.45)])


# ---- the plane's landing wheel ----
def landing_wheel():
    """The wheel that tore off the plane: a fat tyre on its hub, with the bent leg it was on,
    lying tilted on the ground (about 0.68 m across), base at the origin."""
    random.seed(31)
    m = Mesh()
    tilt = math.radians(72)  # (lying mostly on its side, propped on its leg)
    axis = Vector((math.cos(tilt), math.sin(tilt), 0)).normalized()
    centre = Vector((0, 0.24, 0))
    u, v = frame(axis)
    R, r = 0.235, 0.1
    rings = []
    for i in range(40):  # round the tyre's cross-section
        t = math.tau * i / 40
        ring = []
        for k in range(48):  # round the wheel
            a = math.tau * k / 48
            radial = u * math.cos(a) + v * math.sin(a)
            tread = 0.006 * (1 if (k % 2) and abs(math.cos(t)) > 0.6 else 0) if math.cos(t) > 0.3 else 0.0
            ring.append(centre + radial * (R + (r + tread) * math.cos(t) * 1.0) + axis * (r * 0.85 * math.sin(t)))
        rings.append(ring)
    rings.append(rings[0])
    def tyre(i, k, p):
        t = math.tau * i / 40
        worn = max(0.0, math.cos(t)) ** 2
        return mix(tone('tyre'), tone('tyre_worn'), worn * 0.8 + fbm(p * 30) * 0.2)
    m.grid(rings, tyre, close=True)
    # The hub: a dished rim either side, and the axle boss.
    for s in (1, -1):
        face_c = centre + axis * (s * 0.06)
        rim = [face_c + (u * math.cos(a) + v * math.sin(a)) * R * 0.95 for a in (math.tau * k / 32 for k in range(32))]
        boss = [face_c + axis * (s * 0.025) + (u * math.cos(a) + v * math.sin(a)) * 0.06 for a in (math.tau * k / 32 for k in range(32))]
        m.grid([rim, boss], lambda i, k, p: mix(tone('rim'), tone('rust'), max(0.0, fbm(p * 18)) * 1.2), outward=lambda i, k, fc=face_c: fc - axis * s * 0.2)
        m.cap(boss, tone('rim_dark'), axis * s)
    # The leg: a bent, flat steel bar from the axle out and up, snapped at its end.
    a0 = centre + axis * 0.09
    knee = a0 + axis * 0.18 + Vector((0, 0, -0.35))
    end = knee + Vector((0.05, 0.02, -0.38))
    for p0, p1 in ((a0, knee), (knee, end)):
        tube(m, p0, p1, [(0.045, 0.014), (0.04, 0.013)], lambda p, n: mix(tone('strut'), tone('rust'), max(0.0, fbm(p * 9)) * 1.3), sides=10)
    o = m.build('landing-wheel', [shared('landing-wheel', 0.7)])
    lowest = min(v.co.z for v in o.data.vertices)
    o.data.transform(Matrix.Translation((0, 0, -lowest)))
    return o


# ---- the stalagmite ----
def stalagmite():
    """A cave stalagmite about 1 m tall, its base a little below the floor: wet limestone,
    ringed where it grew in spurts, lighter toward the tip."""
    random.seed(41)
    m = Mesh()
    rows = []
    for i in range(29):
        t = i / 28
        y = -0.07 + 1.08 * t
        r = 0.32 * (1 - t) ** 1.25 + 0.012
        r *= 1 + 0.06 * math.sin(t * 38) * (1 - t)  # (growth rings)
        lean = Vector((0.06 * t * t, 0, 0.03 * t))
        ring = []
        for k in range(28):
            a = math.tau * k / 28
            d = Vector((math.cos(a), 0, math.sin(a)))
            flute = 1 + 0.08 * math.sin(a * 5 + t * 3) * (1 - t) + 0.12 * fbm(d * 2 + Vector((0, t * 4, 0)), 7)
            ring.append(Vector((0, y, 0)) + lean + d * r * flute)
        rows.append(ring)
    def colour(i, k, p):
        t = i / 28
        c = mix(tone('lime_dark'), tone('lime'), t * 1.4 + fbm(p * 6, 3) * 0.4)
        c = mix(c, tone('lime_tip'), (t - 0.7) * 3)
        return mix(c, tone('lime_wet'), max(0.0, math.sin(t * 38)) * 0.3)
    m.grid(rows, colour, outward=lambda i, k: Vector((0, -0.07 + 1.08 * i / 28, 0)))
    m.cap(rows[-1], tone('lime_tip'), Vector((0, 1, 0)), smooth=True)
    return m.build('stalagmite', [shared('stalagmite', 0.35)])


# ---- the fallen log ----
def fallen_log():
    """1 m long along x, 1 m thick, lying on the ground (the game stretches each copy): furrowed
    bark, moss creeping over the top, the broken ends showing their growth rings."""
    random.seed(66)
    m = Mesh()
    rows, sides = [], 40
    xs = [-0.5 + i / 24 for i in range(25)]
    for x in xs:
        r = 0.5 * (1.02 - abs(x) * 0.1)
        sag = math.sin((x + 0.5) * math.pi) * 0.03
        ring = []
        for k in range(sides):
            a = math.tau * k / sides
            furrow = 0.025 * abs(math.sin(a * 9 + fbm(Vector((x * 3, a, 0)), 4) * 2.5))
            rr = r * (1 - furrow + 0.03 * fbm(Vector((x * 2, math.cos(a), math.sin(a))), 2))
            ring.append(Vector((x, 0.5 + sag + math.sin(a) * rr, math.cos(a) * rr)))
        rows.append(ring)
    def colour(i, k, p):
        a = math.tau * k / sides
        furrow = abs(math.sin(a * 9 + fbm(Vector((xs[i] * 3, a, 0)), 4) * 2.5))
        c = mix(tone('bark_dark'), tone('bark'), 0.35 + 0.65 * furrow)
        c = mix(c, tone('bark_grey'), max(0.0, fbm(p * 3, 5)) * 1.4)
        moss = math.sin(a) * 1.4 - 0.25 + fbm(p * 2.5, 11) * 1.2  # (over the top, in patches)
        return mix(c, mix(tone('moss'), tone('moss_dark'), 0.5 + fbm(p * 9, 2)), moss)
    m.grid(rows, colour, outward=lambda i, k: Vector((xs[i], 0.5, 0)))
    for ring, x, out in ((rows[0], -0.5, Vector((-1, 0, 0))), (rows[-1], 0.5, Vector((1, 0, 0)))):
        centre = Vector((x, 0.5, 0))
        inner = [centre.lerp(p, 0.92) + out * 0.01 for p in ring]
        def grain(p, centre=centre):
            d = (p - centre).length / 0.5
            return mix(mix(tone('heart'), tone('ring'), 0.5 + 0.5 * math.sin(d * 40)), tone('sapwood'), d - 0.5)
        m.grid([ring, inner], lambda i, k, p: tone('bark_dark') if i == 0 else grain(p), outward=lambda i, k, c=centre: c - out)
        m.cap(inner, grain, out, smooth=False)
    for x, a, length in ((-0.18, 0.5, 0.22), (0.24, 2.6, 0.18)):  # branch stubs, short
        base = Vector((x, 0.5 + math.sin(a) * 0.42, math.cos(a) * 0.42))
        tip = Vector((x + 0.04, 0.5 + math.sin(a) * (0.5 + length), math.cos(a) * (0.5 + length)))
        tube(m, base, tip, [0.07, 0.055, 0.04], lambda p, n: mix(tone('bark_grey'), tone('bark'), 0.5 + fbm(p * 8)), sides=10)
    return m.build('fallen-log', [shared('wood', 0.9)])


# ---- the plane's way in: snapped trunks and torn-up roots ----
def trunk_snapped():
    """A spruce trunk the plane snapped off, base at the origin: 0.3 m in radius, the bark torn
    up into a few ragged points from 2.2 m, and the pale wood inside splintered into spears up
    to about 2.9 m. The game stretches each copy to the height it broke at."""
    random.seed(71)
    m = Mesh()
    sides, BREAK = 28, 2.2
    # How far above BREAK the bark reaches at each angle round the trunk: a few torn points,
    # the tallest on the side the top fell away from.
    peaks = ((0.0, 0.55), (1.9, 0.28), (3.5, 0.4), (4.9, 0.16))
    def torn(a):
        h = 0.04
        for pa, ph in peaks:
            d = abs((a - pa + math.pi) % math.tau - math.pi)
            h = max(h, ph * max(0.0, 1 - d / 0.6) ** 1.5)
        return h + 0.03 * fbm(Vector((math.cos(a) * 3, 0, math.sin(a) * 3)), 7)
    def furrow(a, y):
        return 0.04 * abs(math.sin(a * 8 + fbm(Vector((y * 2, a, 0)), 4) * 2.5))
    def radius(a, y):
        flare = max(0.0, 1 - y / 0.45) ** 2 * (0.1 + 0.08 * max(0.0, math.cos(a * 5)))  # (root flares)
        return (0.3 * (1 - 0.06 * y / BREAK) + flare) * (1 - furrow(a, y))
    ys = [0.0, 0.05, 0.13, 0.26, 0.45, 0.8, 1.2, 1.6, 1.95]
    angles = [math.tau * k / sides for k in range(sides)]
    rows = [[Vector((math.cos(a) * radius(a, y), y, math.sin(a) * radius(a, y))) for a in angles] for y in ys]
    rows.append([Vector((math.cos(a) * radius(a, BREAK) * 0.98, BREAK + torn(a), math.sin(a) * radius(a, BREAK) * 0.98)) for a in angles])
    def bark(i, k, p):
        c = mix(tone('bark_dark'), tone('bark'), 0.3 + 0.7 * furrow(angles[k], p.y) / 0.04)
        c = mix(c, tone('bark_grey'), max(0.0, fbm(p * 3, 5)) * 1.3)
        return mix(c, tone('moss'), max(0.0, 0.5 - p.y) * 1.2 + fbm(p * 6, 9) * 0.4 - 0.2)  # (moss at the foot)
    m.grid(rows, bark, outward=lambda i, k: Vector((0, rows[i][k].y, 0)))
    # The torn edge of the bark, then the wood inside it: pale fresh wood, splintered.
    def wood(p):
        d = math.hypot(p.x, p.z) / 0.3
        c = mix(tone('heart'), tone('sapwood'), d * 1.4 - 0.2)
        return mix(c, tone('cut'), max(0.0, fbm(Vector((p.x * 30, p.y, p.z * 30)), 3)) * 1.2)  # (streaks along the grain)
    rim = [Vector((p.x * 0.88, p.y - 0.02, p.z * 0.88)) for p in rows[-1]]
    m.grid([rows[-1], rim], lambda i, k, p: tone('bark_dark') if i == 0 else wood(p), smooth=False, outward=lambda i, k: Vector((0, BREAK - 1, 0)))
    centre = Vector((0.02, BREAK + 0.12, -0.01))
    inner = [rim]
    for f in (0.66, 0.33):
        ring = []
        for k, a in enumerate(angles):
            spike = 0.16 * abs(math.sin(a * 7 + f * 9)) * random.uniform(0.4, 1.3)  # (fibres torn to different lengths)
            p = centre.lerp(rim[k], f)
            ring.append(Vector((p.x, BREAK + torn(a) * (0.35 + 0.5 * f) + spike, p.z)))
        inner.append(ring)
    m.grid(inner, lambda i, k, p: wood(p), smooth=False, outward=lambda i, k: Vector((0, BREAK - 1, 0)))
    m.cap(inner[-1], wood, Vector((0, 1, 0)))
    # Long splinters standing up out of the break, leaning out a little.
    for a, r, h in ((0.15, 0.2, 0.75), (-0.35, 0.12, 0.5), (0.6, 0.06, 0.42), (3.4, 0.2, 0.45), (1.9, 0.16, 0.32), (2.6, 0.05, 0.25)):
        base = Vector((math.cos(a) * r, BREAK + torn(a) * 0.5, math.sin(a) * r))
        tip = base + Vector((math.cos(a) * 0.06, h, math.sin(a) * 0.06))
        tube(m, base, tip, [(0.05, 0.025), (0.035, 0.018), (0.004, 0.004)], lambda p, n: wood(p), sides=4, turn=a)
    return m.build('trunk-snapped', [shared('wood', 0.9)])


def root_plate():
    """The plate of roots and soil a spruce tears out of the ground as it goes over, stood up on
    edge: about 2 m across and 0.45 m thick, centred 0.8 m up on the origin, its old surface
    (moss and turf) facing +x, where the trunk lies, and the earth and roots it was in facing
    -x, with the loose soil it tore up heaped behind it. Its bottom sinks a little into the
    ground. The game sizes it to its tree."""
    random.seed(83)
    m = Mesh()
    def plate(p, d):
        earth = mix(tone('root'), tone('soil'), 0.45 + fbm(p * 5, 3))  # (fresh, dry-ish earth: brown, not black)
        earth = mix(earth, tone('ochre', 0, 0.8), max(0.0, fbm(p * 7, 6)) * 0.7)  # (sandy streaks)
        turf = mix(tone('moss'), tone('turf_dry'), 0.5 + fbm(p * 4, 12))
        return mix(earth, turf, d.x * 2.5 - 0.6)
    m.blob((0, 0.8, 0), (0.22, 0.88, 1.0), plate, detail=3, lumps=0.22, seed=4)
    # Roots torn out with it, each crooked and drooping as it thins: round the rim, and out of
    # the earthy side.
    root = lambda p, n: mix(tone('root'), tone('bark_dark'), 0.2 + fbm(p * 12) * 0.5)
    for i in range(26):
        a = math.tau * i / 26 + random.uniform(-0.12, 0.12)
        out = Vector((0, math.sin(a), math.cos(a)))
        rim = i % 2 == 0
        base = Vector((-0.06, 0.8, 0)) + out * (0.82 if rim else random.uniform(0.2, 0.6))
        if not rim:
            base.x = -0.17
        thick = random.uniform(0.02, 0.045)
        point = base
        for seg in range(3):
            step = out * random.uniform(0.12, 0.22) + Vector((-random.uniform(0.02, 0.1), -0.06 * seg - random.uniform(0, 0.05), random.uniform(-0.06, 0.06)))
            nxt = point + step
            tube(m, point, nxt, [thick * (1 - seg / 3), thick * (1 - (seg + 1) / 3) + 0.004], root, sides=5)
            point = nxt
    # The churned-up soil and the hollow the roots came out of, behind it.
    m.blob((-0.55, -0.02, 0), (0.55, 0.14, 0.95), lambda p, d: mix(tone('soil_dark'), tone('soil_wet'), 0.5 + fbm(p * 6, 21)), detail=2, lumps=0.3, seed=9, flatten_below=-0.02)
    return m.build('root-plate', [shared('wood', 0.9)])


# ---- debris ----
def debris():
    """Torn sheet metal off the plane, about 0.9 x 0.6 m: three bent panels with ragged edges,
    painted on the outside (scraped through to bare aluminium in places), bare inside, a row
    of rivets along one edge."""
    random.seed(402)
    m = Mesh()
    T = 0.006  # (the sheet's thickness)
    for (x, z, turn, w, d, bend, painted, seed) in ((-0.15, 0.0, 0.3, 0.55, 0.42, 0.12, True, 1), (0.22, 0.08, -0.5, 0.45, 0.3, -0.07, False, 2),
                                                   (0.05, -0.13, 1.4, 0.36, 0.26, 0.15, True, 3)):
        cs, sn = math.cos(turn), math.sin(turn)
        nu, nv = 14, 10
        def at(i, j, lift=0.0):
            t, s_ = i / nu, j / nv
            rag = 0.0
            if i in (0, nu) or j in (0, nv):
                rag = fbm(Vector((t * 9, s_ * 9, seed)), seed) * 0.06  # (torn edges)
            px = (t - 0.5) * (w + rag)
            pz = (s_ - 0.5) * (d + rag)
            py = 0.03 + bend * math.sin(t * math.pi) + 0.03 * fbm(Vector((t * 3, s_ * 3, seed)), seed + 4) + 0.02 * s_ * s_ + lift
            return Vector((px * cs - pz * sn + x, py, px * sn + pz * cs + z))
        top = [[at(i, j, T) for j in range(nv + 1)] for i in range(nu + 1)]
        under = [[at(i, j) for j in range(nv + 1)] for i in range(nu + 1)]
        def paint(i, j, p):
            if not painted:
                return mix(tone('rim'), tone('rim_dark'), 0.5 + fbm(p * 8, seed))
            scrape = fbm(p * 6, seed + 9) + (0.35 if i in (0, nu) or j in (0, nv) else 0.0)
            c = mix(tone('paint_y'), tone('paint_y', 0, 0.82), 0.5 + fbm(p * 4, seed))
            return mix(c, tone('rim'), (scrape - 0.15) * 3)
        bare = lambda i, j, p: mix(tone('rim'), tone('rim_dark'), 0.4 + fbm(p * 10, seed + 2) * 0.8)
        m.grid(top, paint, close=False, outward=lambda i, j: Vector((x, -5, z)))
        m.grid([r[::-1] for r in under], lambda i, j, p: bare(i, j, p), close=False, outward=lambda i, j: Vector((x, 5, z)))
        # (The torn edges, joining top and underside.)
        edge = [(i, 0) for i in range(nu + 1)] + [(nu, j) for j in range(1, nv + 1)] + [(i, nv) for i in range(nu - 1, -1, -1)] + [(0, j) for j in range(nv - 1, 0, -1)]
        for (i0, j0), (i1, j1) in zip(edge, edge[1:] + edge[:1]):
            m.face([top[i0][j0], top[i1][j1], under[i1][j1], under[i0][j0]], tone('rim_dark'), smooth=False)
            m.face([under[i0][j0], under[i1][j1], top[i1][j1], top[i0][j0]], tone('rim_dark'), smooth=False)
        if painted:  # (rivets along the panel's seam)
            for i in range(1, nu, 2):
                p = top[i][1]
                m.blob(p + Vector((0, 0.002, 0)), (0.006, 0.003, 0.006), lambda q, n: tone('rim'), detail=0)
    return m.build('debris', [shared('metal', 0.6)])


# ---- the backpack ----
def backpack():
    """A canvas rucksack, upright, base at the origin: its back panel and shoulder straps toward
    +z, the front pocket toward -z, a lid over the top and a rolled bedroll strapped on it."""
    random.seed(71)
    m = Mesh()
    canvas = lambda p: mix(mix(tone('canvas'), tone('canvas_dark'), 0.45 + fbm(p * 7, 1) * 0.6), tone('canvas_light'), max(0.0, fbm(p * 3, 6)) * 0.8)
    # The body: a soft, rounded sack, a little wider at the bottom and bulging at the front.
    rows = []
    for i in range(14):
        t = i / 13
        y = 0.02 + 0.5 * t
        w = 0.205 - 0.03 * t + 0.01 * math.sin(t * math.pi)
        front = 0.14 + 0.03 * math.sin(t * math.pi)
        back = 0.09
        ring = []
        for k in range(32):
            a = math.tau * k / 32
            s, c = math.sin(a), math.cos(a)
            x = math.copysign(abs(s) ** (2 / 3.0), s) * w
            z = math.copysign(abs(c) ** (2 / 3.0), c) * (back if c > 0 else front)
            ring.append(Vector((x, y if t > 0 else 0.02, z + 0.02)))
        rows.append(ring)
    m.grid(rows, lambda i, k, p: mix(canvas(p), tone('canvas_dark'), 0.4 if i in (0, 13) else 0.0), outward=lambda i, k: Vector((0, 0.02 + 0.5 * i / 13, 0.0)))
    m.cap(rows[0], tone('canvas_dark'), Vector((0, -1, 0)), smooth=False)
    m.cap(rows[-1], tone('canvas_dark'), Vector((0, 1, 0)), smooth=False)
    # The lid, draped over the top and down the front.
    lid = []
    for i in range(9):
        t = i / 8
        ang = t * math.pi * 0.62
        ring = []
        for k in range(17):
            x = -0.2 + 0.4 * k / 16
            sag = 0.012 * (1 - (2 * k / 16 - 1) ** 2)
            ring.append(Vector((x * (1 - 0.06 * t), 0.505 + 0.035 * math.cos(ang) + sag, 0.02 + 0.12 * -math.sin(ang) + 0.06 * (1 - t) - 0.06)))
        lid.append(ring)
    m.grid(lid, lambda i, k, p: mix(canvas(p), tone('canvas_dark'), 0.5 if i == 8 else 0.1), close=False, outward=lambda i, k: Vector((0, 0.42, 0.02)))
    m.grid([r[::-1] for r in lid], lambda i, k, p: tone('canvas_dark', 0, 0.8), close=False, outward=lambda i, k: Vector((0, 0.9, 0.3)))  # (its underside)
    # The front pocket, and its flap.
    box(m, (-0.13, 0.08, -0.205), (0.13, 0.3, -0.13), lambda p: canvas(p), bevel=0.03, smooth=True)
    box(m, (-0.135, 0.255, -0.212), (0.135, 0.31, -0.135), lambda p: mix(canvas(p), tone('canvas_dark'), 0.4), bevel=0.012, smooth=True)
    # Side pockets.
    for s in (1, -1):
        box(m, (s * 0.2 - 0.045, 0.06, -0.08), (s * 0.2 + 0.045, 0.27, 0.06), lambda p: canvas(p), bevel=0.03, smooth=True)
    # Webbing: two straps down the lid and front, with buckles.
    for x in (-0.08, 0.08):
        box(m, (x - 0.014, 0.18, -0.218), (x + 0.014, 0.53, -0.2), tone('webbing'), bevel=0.002)
        box(m, (x - 0.02, 0.22, -0.226), (x + 0.02, 0.245, -0.214), tone('buckle'), bevel=0.003)
    # Shoulder straps on the back, padded, curving from the top down to the bottom corners.
    for s in (1, -1):
        path = [Vector((s * 0.07, 0.47, 0.115)), Vector((s * 0.09, 0.4, 0.15)), Vector((s * 0.11, 0.25, 0.155)), Vector((s * 0.14, 0.1, 0.135)), Vector((s * 0.16, 0.04, 0.11))]
        for p0, p1 in zip(path, path[1:]):
            tube(m, p0, p1, [(0.03, 0.012), (0.03, 0.012)], lambda p, n: tone('webbing', 0, 1.1), sides=8, turn=math.pi / 2)
    # The bedroll, strapped across the top.
    roll = tube(m, (-0.24, 0.6, 0.0), (0.24, 0.6, 0.0), [0.075] * 6, lambda p, n: mix(tone('bedroll'), tone('bedroll_dark'), 0.4 + fbm(p * 10) * 0.6), sides=20, caps=False)
    for end, out in ((roll[0], Vector((-1, 0, 0))), (roll[-1], Vector((1, 0, 0)))):
        c = sum(end, Vector()) / len(end)
        spiral = lambda p, c=c: mix(tone('bedroll'), tone('bedroll_dark'), 0.5 + 0.5 * math.sin((p - c).length * 220))
        m.cap(end, spiral, out, smooth=False)
    for x in (-0.14, 0.14):
        tube(m, (x - 0.013, 0.6, 0.0), (x + 0.013, 0.6, 0.0), [0.079, 0.079], lambda p, n: tone('webbing'), sides=20)
    return m.build('backpack', [shared('backpack', 0.95)])


for name, make in (('clod', clod), ('stone', stone), ('berry', berry), ('landing-wheel', landing_wheel),
                   ('stalagmite', stalagmite), ('fallen-log', fallen_log), ('backpack', backpack), ('debris', debris),
                   ('trunk-snapped', trunk_snapped), ('root-plate', root_plate)):
    if NAMES and name not in NAMES:
        continue
    export([make()], f'{name}.glb')
print('@@ props done')
