# Small things you hold in the first-person view (hand-props.glb; see src/handView.js):
#   prop-lighter   a disposable lighter: red plastic body, steel hood, spark wheel and button
#   prop-matchbox  a box of matches: kraft card, a red label, a dark striker down each side
#   prop-match     one match: a pale wooden stick with a red head
#   prop-flask     a water flask: a flat round body in an olive canvas cover, a steel neck and cap
#   prop-steak     a steak: a thick, uneven slab of meat with a rim of fat down one side and a little
#                  marbling; pale, so the game can tint it raw, cooked or burnt (stands on its edge,
#                  the hand gripping its lower edge)
# Each is built round where the hand grips it, standing up along +y (like axe.glb and the
# knife), front toward +z. The lighter's flame comes out at y = 0.05; the match's at its head,
# y = 0.036.
# The steak's shape is shared with the spit (spit.py builds the meat on it from steak_shape), so
# what you hold and what cooks on the skewer are the same cut.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python hand_props.py
import math, os, random, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared, tone, blend, PAL = R['Builder'], R['build'], R['export'], R['shared'], R['tone'], R['blend'], R['PAL']
tube, rounded_box, loft, section = R['tube'], R['rounded_box'], R['loft'], R['section']

PAL.update(
    lighter_red=0xb3362c, lighter_red_dark=0x8a2a24, steel=0xa4a6a8, steel_dark=0x6c6e70, flint=0x3a3836,
    kraft=0xc9a56c, kraft_dark=0xa98a58, label_red=0xa23a2c, label_cream=0xe6dcc2, striker=0x4a3a30,
    match_wood=0xd8c08e, match_head=0xa8322a, match_tip=0xe0d2b0,
    canvas=0x5c603c, canvas_dark=0x474a2f, canvas_seam=0x3c3e28,
    steak_lean=0xcfc6be, steak_lean_dark=0xa89e96, steak_fat=0xfff6e6, steak_marble=0xfbf6ef,
)


def flat(name, var=0.02):
    """A colour callback for rounded_box/loft (centre, normal) -> one palette colour, a little varied."""
    return lambda c, n: tone(name, var)


def lighter():
    b = Builder()
    # The body: a flattened, rounded bar, darker toward the bottom.
    rounded_box(b, (-0.0125, -0.03, -0.0072), (0.0125, 0.034, 0.0072), 0.005,
                lambda c, n: tone('lighter_red_dark' if c.y < -0.022 else 'lighter_red', 0.03))
    # The steel hood over the top, with the spark wheel and the gas button under the thumb.
    rounded_box(b, (-0.0112, 0.034, -0.0066), (0.0112, 0.047, 0.0066), 0.0015, flat('steel', 0.04))
    tube(b, [(Vector((-0.0055, 0.0445, 0.0042)), 0.0042), (Vector((0.0055, 0.0445, 0.0042)), 0.0042)], 10,
         lambda t, a, n: tone('steel_dark' if int(a * 10 / math.tau) % 2 else 'flint', 0.0), rough=0.0)
    rounded_box(b, (-0.006, 0.0335, -0.006), (0.006, 0.039, 0.0048), 0.0012, flat('flint', 0.02))
    return build('prop-lighter', b, shared('hand-prop', 0.6))


def matchbox():
    b = Builder()
    # Held flat in the palm: wide across (x), deep (z), thin (y).
    W, T, D = 0.026, 0.0075, 0.018
    def sleeve(c, n):
        if abs(n.x) > 0.7:
            return tone('striker', 0.05)  # the strikers down the long sides
        if n.y > 0.7:
            return tone('label_cream' if abs(c.x) < W * 0.55 and abs(c.z) < D * 0.5 else 'label_red', 0.02)
        return tone('kraft', 0.03)
    rounded_box(b, (-W, -T, -D), (W, T, D), 0.0015, sleeve)
    # The drawer, pushed out a little at one end, with a few match heads showing.
    rounded_box(b, (W - 0.002, -T + 0.001, -D + 0.0015), (W + 0.012, T - 0.0015, D - 0.0015), 0.001, flat('kraft_dark', 0.03))
    for k in range(4):
        z = -D + 0.005 + k * 0.0075
        tube(b, [(Vector((W + 0.004, T - 0.004, z)), 0.0022), (Vector((W + 0.0095, T - 0.004, z)), 0.0024)], 6,
             lambda t, a, n: tone('match_head', 0.04), rough=0.08, seed=k)
    return build('prop-matchbox', b, shared('hand-prop', 0.85))


def match():
    b = Builder()
    rounded_box(b, (-0.0018, -0.02, -0.0018), (0.0018, 0.031, 0.0018), 0.0004, flat('match_wood', 0.03))
    # The head: a bead swelling out of the top of the stick, paler at its very tip.
    tube(b, [(Vector((0, 0.029, 0)), 0.0021), (Vector((0, 0.032, 0)), 0.0034), (Vector((0, 0.0355, 0)), 0.0031), (Vector((0, 0.038, 0)), 0.0012)], 8,
         lambda t, a, n: tone('match_tip' if t > 0.8 else 'match_head', 0.03), rough=0.06, seed=3)
    return build('prop-match', b, shared('hand-prop', 0.85))


def flask():
    b = Builder()
    # A flat round body (a short, wide, rounded loft across its depth), in a canvas cover with a
    # seam round its rim.
    rings = []
    stations = [(-0.03, 0.62), (-0.026, 0.9), (-0.018, 1.0), (0.018, 1.0), (0.026, 0.9), (0.03, 0.62)]
    for z, k in stations:
        ring = []
        for i in range(20):
            a = math.tau * i / 20
            ring.append(Vector((math.cos(a) * 0.072 * k, math.sin(a) * 0.072 * k, z)))
        rings.append(ring)
    loft(b, rings, lambda c, n: tone('canvas_seam' if abs(c.z) > 0.022 and abs(n.z) < 0.6 else ('canvas_dark' if c.y < -0.03 else 'canvas'), 0.03))
    # The steel neck and screw cap at the top.
    tube(b, [(Vector((0, 0.068, 0)), 0.014), (Vector((0, 0.084, 0)), 0.012), (Vector((0, 0.088, 0)), 0.0105)], 12,
         lambda t, a, n: tone('steel', 0.03), rough=0.0)
    tube(b, [(Vector((0, 0.087, 0)), 0.0138), (Vector((0, 0.103, 0)), 0.0138), (Vector((0, 0.105, 0)), 0.011)], 12,
         lambda t, a, n: tone('steel_dark' if int(a * 12 / math.tau) % 2 else 'steel', 0.02), rough=0.0)
    return build('prop-flask', b, shared('hand-prop', 0.8))


def steak_shape(at=Vector((0, 0, 0)), size=1.0):
    """The steak's mesh (a Builder), `size` times as big round its middle and moved by `at` (game
    space): as built, it stands on its edge across x, its lower edge at about y = 0, its middle at
    y = 0.045."""
    mid = Vector((0, 0.045, 0))
    b = Builder()
    random.seed(17)
    # The outline: a lopsided oval, wider at the top, a few gentle dents in its edge.
    n = 22
    outline = []
    for i in range(n):
        a = math.tau * i / n
        r = 1 + 0.06 * math.sin(a * 3 + 0.7) + 0.04 * math.sin(a * 5 + 1.9) + random.uniform(-0.025, 0.025)
        x = math.cos(a) * 0.068 * r
        y = math.sin(a) * 0.047 * r + 0.012 * (math.sin(a) > 0) * math.sin(a)
        outline.append((x, y + 0.045, a))  # (its lower edge at about y = 0: where the hand holds it)
    def fat(a):
        # The rim of fat runs round the top left.
        return 0.0 < ((a - 1.9) % math.tau) < 1.6
    rings = []
    # Thick in the middle, thinner at the edge: a slab with rounded sides, a little uneven.
    # (Ring by ring from the middle of one cut face, out over the edge and back in over the other,
    # so both faces are made of small faces that can be marbled.)
    for k, z in ((0.04, -0.0142), (0.35, -0.014), (0.65, -0.0132), (0.86, -0.012), (0.97, -0.009), (1.0, -0.003),
                 (1.0, 0.003), (0.97, 0.009), (0.86, 0.012), (0.65, 0.0132), (0.35, 0.014), (0.04, 0.0142)):
        rings.append([(Vector((x * k, 0.045 + (y - 0.045) * k, z * (1 + 0.15 * math.sin(a * 2 + 1)))) - mid) * size + mid + at for x, y, a in outline])
    angle = {i: outline[i][2] for i in range(n)}
    def colour(c, normal):
        c = (c - at - mid) / size + mid
        a = math.atan2((c.y - 0.045) / 0.047, c.x / 0.068)
        if fat(a) and (abs(normal.z) < 0.85 or math.hypot(c.x / 0.068, (c.y - 0.045) / 0.047) > 0.8):
            return tone('steak_fat', 0.03)
        if abs(normal.z) > 0.85:
            # The cut faces: lean, with streaks of marbling across it.
            streak = math.sin(c.x * 160 + c.y * 90) + math.sin(c.x * 70 - c.y * 210)
            return tone('steak_marble' if streak > 1.25 else ('steak_lean_dark' if streak < -1.1 else 'steak_lean'), 0.04)
        return tone('steak_lean_dark', 0.04)
    loft(b, rings, colour)
    return b


def steak():
    return build('prop-steak', steak_shape(), shared('hand-prop-meat', 0.7))


if not globals().get('DEFS_ONLY'):
    export([lighter(), matchbox(), match(), flask(), steak()], 'hand-props.glb')
    print('@@ hand props done')
