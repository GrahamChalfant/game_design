# The player's animations, authored here pose by pose (survivor.py calls `animate` on the rig
# it builds the body round, so they're made fresh with the model every time):
#   idle   breathing, a slow shift of weight, a look about
#   walk   a brisk walk (the game's walking pace, 3.4 m/s): one foot always down, heel then toe,
#          the arms swinging easily against the legs, the hips rising over the standing leg
#   run    a hard run (5.2 m/s, holding Shift): leaning into it, driving the knees up, the back heel
#          folding high, a moment in the air each step, the arms pumping loosely: each joint
#          flowing round its own loop (not posed key to key), two strides that vary a little
#   sneak  crouched low, long careful steps, arms held in
#   crouch squatting down (searching low, butchering; and crouched still)
#   jump   push off, tuck in the air, reach for the ground
#   chop   the axe swung overhead and down (the blow lands 45% through, as actions.js expects)
#   drink  down on one knee, scooping water up to the mouth
#   swim   breaststroke, the body nearly flat, the head up
#   die    the knees go, falling back onto the ground
# Also adds foot bones (the feet roll heel to toe), which survivor.py weights the boots to.
#
# A pose is joint angles in degrees, each bone turned relative to its parent in the body's own
# axes: (pitch, yaw, roll) where pitch swings a limb forward (or leans the spine/head forward),
# yaw turns toward the body's left, roll swings a limb out to the left. Knees bend with a
# negative shin pitch, elbows with a positive forearm pitch. 'hips_at' moves the hips
# (x left, y up, z forward, meters).
import math
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

FPS = 24
RIGHT_HAND_TURN = 2 * math.asin(0.5851)  # (the right hand's grip: see survivor.py)
ORDER = ['hips', 'spine', 'head', 'upperarm_L', 'lowerarm_L', 'hand_L', 'upperarm_R', 'lowerarm_R', 'hand_R',
         'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']
UP_BONES = {'hips', 'spine', 'head'}
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # (the game's axes into Blender's)


def add_feet(arm):
    """Foot bones at the ankles (once), children of the shins."""
    if 'foot_L' in arm.data.bones:
        return
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for side in ('L', 'R'):
        shin = arm.data.edit_bones[f'shin_{side}']
        foot = arm.data.edit_bones.new(f'foot_{side}')
        foot.head = Vector((shin.head.x, shin.head.y, 0.1))
        foot.tail = Vector((shin.head.x, shin.head.y, 0.3))  # (pointing up like the rest, so every bone's axes match)
        foot.roll = shin.roll
        foot.parent = shin
        foot.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')


def turn(bone, pitch=0.0, yaw=0.0, roll=0.0):
    """A turn in the body's axes, as a Blender (armature space) rotation matrix."""
    p = math.radians(pitch) * (1 if bone in UP_BONES else -1)
    r = Matrix.Rotation(math.radians(yaw), 3, 'Y') @ Matrix.Rotation(p, 3, 'X') @ Matrix.Rotation(math.radians(roll), 3, 'Z')
    return C @ r @ C.transposed()


def pose_matrices(arm, pose):
    """Each bone's posed matrix (armature space) for `pose`."""
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    world = {}
    posed = {}
    for name in ORDER:
        if name not in rest:
            continue
        b = arm.data.bones[name]
        local = turn(name, *pose.get(name, (0, 0, 0)))
        if name == 'hand_R':
            local = local @ (C @ Matrix.Rotation(RIGHT_HAND_TURN, 3, 'X') @ C.transposed())
        parent = b.parent.name if b.parent else None
        if name.startswith('foot'):
            # (Feet are posed by their angle to the ground, not to the shin: positive points the
            # toes down. They turn with the body's heading, from the hips.)
            pitch, yaw, roll = pose.get(name, (0, 0, 0))
            heading = turn('hips', 0, pose.get('hips', (0, 0, 0))[1], 0)
            local = None
            world[name] = heading @ turn(name, -pitch, yaw, roll)
        else:
            world[name] = (world[parent] @ local) if parent else local
        if parent:
            head = posed[parent] @ rest[parent].inverted() @ rest[name].translation
        else:
            head = rest[name].translation + C @ Vector(pose.get('hips_at', (0, 0, 0)))
        m = (world[name] @ rest[name].to_3x3()).to_4x4()
        m.translation = head
        posed[name] = m
    return posed, rest


def key(arm, pose, frame, last):
    posed, rest = pose_matrices(arm, pose)
    for name, m in posed.items():
        b = arm.data.bones[name]
        pb = arm.pose.bones[name]
        if b.parent:
            base = posed[b.parent.name] @ rest[b.parent.name].inverted() @ rest[name]
        else:
            base = rest[name]
        basis = base.inverted() @ m
        loc, rot, _ = basis.decompose()
        if name in last and last[name].dot(rot) < 0:
            rot = -rot  # (keep the quaternions continuous, so nothing spins the long way round)
        last[name] = rot
        pb.rotation_mode = 'QUATERNION'
        pb.location = loc if name == 'hips' else Vector()
        pb.rotation_quaternion = rot
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('rotation_quaternion', frame=frame)


def clip(arm, name, keys, length):
    """An action `name` from keys [(time in seconds, pose)], `length` seconds long."""
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    last = {}
    for t, pose in keys:
        key(arm, pose, 1 + t * FPS, last)
    act.frame_range = (1, 1 + length * FPS)
    act.use_frame_range = True
    return act


def mirror(pose):
    """The same pose with left and right swapped (for the second half of a stride)."""
    out = {}
    for k, v in pose.items():
        if k.endswith('_L'):
            k2 = k[:-2] + '_R'
        elif k.endswith('_R'):
            k2 = k[:-2] + '_L'
        else:
            k2 = k
        if k == 'hips_at':
            out[k2] = (-v[0], v[1], v[2])
        else:
            out[k2] = (v[0], -v[1], -v[2])
    return out


def blend(a, b, t):
    keys = set(a) | set(b)
    out = {}
    for k in keys:
        va, vb = a.get(k, (0, 0, 0)), b.get(k, (0, 0, 0))
        out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
    return out


# ---- the poses ----
STAND = {
    'spine': (2, 0, 0), 'head': (-2, 0, 0),
    'upperarm_L': (3, 0, 5), 'lowerarm_L': (10, 0, 0), 'hand_L': (4, 0, -3),
    'upperarm_R': (3, 0, -5), 'lowerarm_R': (10, 0, 0), 'hand_R': (4, 0, 3),
    'thigh_L': (0, 0, 1), 'shin_L': (-2, 0, 0), 'foot_L': (2, 0, 0),
    'thigh_R': (0, 0, -1), 'shin_R': (-2, 0, 0), 'foot_R': (2, 0, 0),
}


def idle():
    a = dict(STAND)
    b = dict(STAND, spine=(3.5, 0, 0), head=(-3, 6, 1), hips_at=(0.012, -0.004, 0), upperarm_L=(4, 0, 6), upperarm_R=(2, 0, -4),
             thigh_L=(1, 0, 2), thigh_R=(-1, 0, -2), shin_L=(-4, 0, 0))
    c = dict(STAND, spine=(2.5, 0, 0), head=(-1, -5, -1), hips_at=(-0.008, -0.002, 0), upperarm_L=(2, 0, 4), upperarm_R=(4, 0, -6),
             shin_R=(-4, 0, 0))
    return [(0, a), (0.75, b), (1.5, a), (2.25, c), (3.0, a)]


def walk():
    """A walk: the front heel comes down, the weight goes onto it, the back leg swings through
    past it, and the standing heel lifts as the other leg reaches out; then the other side.
    Authored for 3.4 m/s (about a metre a step; 15 frames for the pair, so it loops exactly)."""
    length = 15 / FPS
    upright = {'head': (-3, 0, 0)}
    contact = dict(upright, hips_at=(0, -0.022, 0), hips=(0, -5, 0), spine=(4, 6, 0),
                   thigh_L=(27, 0, 0), shin_L=(-4, 0, 0), foot_L=(-18, 0, 0),
                   thigh_R=(-19, 0, 0), shin_R=(-14, 0, 0), foot_R=(26, 0, 0),
                   upperarm_R=(24, 0, -7), lowerarm_R=(30, 0, 0), hand_R=(4, 0, 0),
                   upperarm_L=(-24, 0, 7), lowerarm_L=(14, 0, 0), hand_L=(4, 0, 0))
    down = dict(upright, hips_at=(0.01, -0.036, 0), hips=(0, -2, 1.5), spine=(5, 2, 0),
                thigh_L=(15, 0, 0), shin_L=(-18, 0, 0), foot_L=(0, 0, 0),
                thigh_R=(-9, 0, 0), shin_R=(-46, 0, 0), foot_R=(46, 0, 0),
                upperarm_R=(13, 0, -7), lowerarm_R=(26, 0, 0),
                upperarm_L=(-13, 0, 7), lowerarm_L=(18, 0, 0))
    passing = dict(upright, hips_at=(0.012, 0.006, 0), hips=(0, 0, 2.5), spine=(4, 0, 0),
                   thigh_L=(0, 0, 0), shin_L=(-3, 0, 0), foot_L=(2, 0, 0),
                   thigh_R=(23, 0, 0), shin_R=(-64, 0, 0), foot_R=(22, 0, 0),
                   upperarm_R=(2, 0, -7), lowerarm_R=(20, 0, 0),
                   upperarm_L=(-2, 0, 7), lowerarm_L=(20, 0, 0))
    up = dict(upright, hips_at=(0.006, 0.0, 0), hips=(0, 3, 1), spine=(4, -3, 0),
              thigh_L=(-14, 0, 0), shin_L=(-6, 0, 0), foot_L=(14, 0, 0),
              thigh_R=(31, 0, 0), shin_R=(-20, 0, 0), foot_R=(-10, 0, 0),
              upperarm_R=(-14, 0, -7), lowerarm_R=(16, 0, 0),
              upperarm_L=(14, 0, 7), lowerarm_L=(27, 0, 0))
    half = length / 2
    steps = [(0.0, contact), (0.22, down), (0.5, passing), (0.78, up)]
    keys = [(half * f, p) for f, p in steps] + [(half + half * f, mirror(p)) for f, p in steps] + [(length, contact)]
    return keys, length


def cyclic(table, u):
    """A smooth loop through `table` [(u, value)] (u in 0..1, rising, wrapping round): the curve
    passes through each value without stopping there (Hermite, its slopes from either side), so
    a movement flows on through its key poses instead of easing in and out of each one."""
    n = len(table)
    u %= 1.0
    i = max(j for j in range(n) if table[j][0] <= u) if u >= table[0][0] else n - 1
    at = lambda j: (table[j % n][0] + (j // n) * 1.0, table[j % n][1])
    x0, y0 = at(i - 1) if i > 0 else (table[-1][0] - 1.0, table[-1][1])
    x1, y1 = at(i)
    x2, y2 = at(i + 1)
    x3, y3 = at(i + 2)
    if u < x1:
        u += 1.0
    slope = lambda xa, ya, xb, yb: (yb - ya) / (xb - xa)
    m1, m2 = slope(x0, y0, x2, y2), slope(x1, y1, x3, y3)
    h = x2 - x1
    t = (u - x1) / h
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * h * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * h * m2


# The run's legs through one stride (the left leg; the right is half a stride on), as phases of
# the stride: the foot lands under the body (0), the knee gives as the body sinks over it (0.1),
# it drives off, the leg long behind (0.25), folds tight, heel up under the seat, as it comes
# through (0.38-0.6), and the knee drives up and forward (0.75), the shin reaching out to land.
RUN_THIGH = [(0.0, 34), (0.1, 14), (0.25, -28), (0.375, -26), (0.5, -16), (0.6, 18), (0.75, 62), (0.875, 50)]
RUN_SHIN = [(0.0, -20), (0.1, -36), (0.25, -12), (0.375, -92), (0.5, -96), (0.6, -114), (0.75, -84), (0.875, -36)]
RUN_FOOT = [(0.0, -6), (0.1, 4), (0.25, 44), (0.375, 52), (0.5, 50), (0.6, 36), (0.75, 10), (0.875, -6)]
# The arms against the legs (the right arm with the left leg), swinging from the shoulder;
# the elbows bent, more on the way forward.
# (The hand comes up to the chest, not out in front: the elbow closes as the arm comes forward.)
RUN_ARM = [(0.0, 34), (0.1, 18), (0.25, -30), (0.375, -42), (0.5, -40), (0.6, -20), (0.75, 28), (0.875, 37)]
RUN_ELBOW = [(0.0, 106), (0.1, 98), (0.25, 82), (0.375, 80), (0.5, 84), (0.6, 92), (0.75, 106), (0.875, 110)]
# Each step (half a stride): the body sinks as the foot takes it, then rises off it and flies.
RUN_BOB = [(0.0, -0.03), (0.2, -0.066), (0.5, 0.0), (0.75, 0.042)]
# The hips turn with the leg swinging through; the shoulders the other way.
RUN_HIPS_YAW = [(0.0, -7), (0.1, -3), (0.25, 5), (0.375, 7), (0.5, 7), (0.6, 3), (0.75, -5), (0.875, -7)]
RUN_SPINE_YAW = [(0.0, 11), (0.1, 5), (0.25, -7), (0.375, -11), (0.5, -11), (0.6, -5), (0.75, 7), (0.875, 11)]


def run():
    """A hard run, authored for 5.2 m/s at a runner's cadence (180 steps a minute, about 1.75 m a
    step): two strides (four steps, 32 frames), so it doesn't repeat every step. Not posed key to
    key: each joint flows round its own loop through the stride (cyclic), sampled every frame, and
    the body moves as a loose, connected whole: the arms trail the legs a little and the hands
    trail the arms (follow-through), the shoulders counter the hips a beat late, the head steadies
    itself, nodding a beat behind the body's bob. From stride to stride the lean, the head's nod,
    the arms' swing and the bob vary a little, as a runner's do."""
    frames = 32
    length = frames / FPS
    keys = []
    for f in range(frames + 1):
        t = f / frames  # (through the clip: two strides)
        u = (2 * t) % 1.0  # (through this stride: the left foot lands at 0, the right at 0.5)
        h = (4 * t) % 1.0  # (through this step)
        vary = 0.5 - 0.5 * math.cos(math.tau * t)  # (0 at the clip's start, 1 halfway: one stride, then the other)
        swing = 1 + 0.07 * (vary - 0.5)
        bob = cyclic(RUN_BOB, h) * (1 + 0.12 * (vary - 0.5))
        hips_yaw = cyclic(RUN_HIPS_YAW, u) * (1 + 0.1 * (vary - 0.5))
        spine_yaw = cyclic(RUN_SPINE_YAW, u - 0.04)  # (the shoulders follow a beat late)
        lean = 14 + 2.5 * cyclic([(0.0, 0.2), (0.2, 1.0), (0.5, 0.0), (0.75, -0.4)], h) + 1.6 * vary
        nod = 2.6 * math.sin(math.tau * (h - 0.18)) * (0.85 + 0.3 * vary)  # (behind the bob)
        pose = {
            'hips_at': (0.009 * math.cos(math.tau * (u - 0.12)), bob, 0.02),
            'hips': (4 + 1.2 * math.sin(math.tau * h), hips_yaw, 2.5 * math.sin(math.tau * (u - 0.05))),
            'spine': (lean, spine_yaw, -1.5 * math.sin(math.tau * (u - 0.1))),
            # (The head stays nearly level and facing ahead: it takes back most of the lean and turn.)
            'head': (-13 - 0.8 * (lean - 14) + nod, -0.75 * (hips_yaw + spine_yaw), 1.0 * math.sin(math.tau * (u - 0.2))),
        }
        for side, offset, sign in (('L', 0.0, 1), ('R', 0.5, -1)):
            leg = u + offset
            pose[f'thigh_{side}'] = (cyclic(RUN_THIGH, leg), 0, sign * 1.5)
            pose[f'shin_{side}'] = (cyclic(RUN_SHIN, leg), 0, 0)
            pose[f'foot_{side}'] = (cyclic(RUN_FOOT, leg), 0, 0)
            # (This arm swings with the other leg, a little behind it; the forearm behind the
            # upper arm, the hand behind the forearm: loose, not locked to the legs.)
            arm = leg + 0.5 - 0.045
            pose[f'upperarm_{side}'] = (cyclic(RUN_ARM, arm) * swing, 0, sign * (13 - 4 * math.cos(math.tau * (arm - 0.875))))
            pose[f'lowerarm_{side}'] = (cyclic(RUN_ELBOW, arm - 0.04), 0, 0)
            pose[f'hand_{side}'] = (6 + 9 * math.sin(math.tau * (arm - 0.12)), 0, sign * -2)
        keys.append((t * length, pose))
    return keys, length


def sneak():
    length = 29 / FPS
    low = {'spine': (24, 0, 0), 'head': (-20, 0, 0),
           'upperarm_L': (22, 0, 12), 'lowerarm_L': (70, 0, 0), 'hand_L': (10, 0, 0),
           'upperarm_R': (22, 0, -12), 'lowerarm_R': (70, 0, 0), 'hand_R': (10, 0, 0)}
    contact = dict(low, hips_at=(0, -0.2, -0.02), thigh_L=(48, 0, 0), shin_L=(-40, 0, 0), foot_L=(-10, 0, 0),
                   thigh_R=(-6, 0, 0), shin_R=(-62, 0, 0), foot_R=(35, 0, 0),
                   upperarm_L=(14, 0, 12), upperarm_R=(30, 0, -12))
    passing = dict(low, hips_at=(0.015, -0.17, -0.02), thigh_L=(22, 0, 0), shin_L=(-48, 0, 0), foot_L=(0, 0, 0),
                   thigh_R=(52, 0, 0), shin_R=(-100, 0, 0), foot_R=(25, 0, 0),
                   upperarm_L=(22, 0, 12), upperarm_R=(22, 0, -12))
    half = length / 2
    keys = [(0, contact), (half * 0.5, passing), (half, mirror(contact)), (half * 1.5, mirror(passing)), (length, contact)]
    return keys, length


CROUCH = {'hips_at': (0, -0.36, -0.12), 'hips': (8, 0, 0), 'spine': (30, 0, 0), 'head': (-24, 0, 0),
          'thigh_L': (96, 0, 10), 'shin_L': (-118, 0, 0), 'foot_L': (12, 0, 0),
          'thigh_R': (90, 0, -10), 'shin_R': (-112, 0, 0), 'foot_R': (12, 0, 0),
          'upperarm_L': (30, 0, 14), 'lowerarm_L': (40, 0, 0), 'hand_L': (6, 0, 0),
          'upperarm_R': (30, 0, -14), 'lowerarm_R': (40, 0, 0), 'hand_R': (6, 0, 0)}


def crouch():
    b = dict(CROUCH, spine=(32, 3, 0), head=(-22, -6, 0), hips_at=(0.006, -0.37, -0.12))
    return [(0, CROUCH), (1.0, b), (2.04, CROUCH)], 2.042


def jump():
    up = dict(STAND, hips_at=(0, 0.02, 0), spine=(4, 0, 0), thigh_L=(-6, 0, 0), shin_L=(-4, 0, 0), foot_L=(45, 0, 0),
              thigh_R=(10, 0, 0), shin_R=(-20, 0, 0), foot_R=(35, 0, 0),
              upperarm_L=(35, 0, 30), lowerarm_L=(35, 0, 0), upperarm_R=(35, 0, -30), lowerarm_R=(35, 0, 0))
    tuck = dict(STAND, hips_at=(0, 0.04, 0), spine=(10, 0, 0), head=(-8, 0, 0), thigh_L=(52, 0, 4), shin_L=(-70, 0, 0), foot_L=(15, 0, 0),
                thigh_R=(38, 0, -4), shin_R=(-80, 0, 0), foot_R=(20, 0, 0),
                upperarm_L=(20, 0, 45), lowerarm_L=(40, 0, 0), upperarm_R=(20, 0, -45), lowerarm_R=(40, 0, 0))
    reach = dict(STAND, hips_at=(0, 0.0, 0), spine=(8, 0, 0), thigh_L=(22, 0, 3), shin_L=(-20, 0, 0), foot_L=(-5, 0, 0),
                 thigh_R=(14, 0, -3), shin_R=(-26, 0, 0), foot_R=(-5, 0, 0),
                 upperarm_L=(15, 0, 38), lowerarm_L=(30, 0, 0), upperarm_R=(15, 0, -38), lowerarm_R=(30, 0, 0))
    return [(0, up), (0.25, tuck), (0.5, reach), (0.625, reach)], 0.625


def chop():
    """Feet planted apart; the axe (in the right hand) back over the head, swung down to land
    45% of the way through, followed through, and back up."""
    length = 0.833
    stance = {'thigh_L': (14, 0, 6), 'shin_L': (-14, 0, 0), 'foot_L': (2, 0, 0), 'thigh_R': (-10, 0, -6), 'shin_R': (-10, 0, 0), 'foot_R': (12, 0, 0)}
    raised = dict(stance, hips_at=(0, -0.02, 0), hips=(0, 10, 0), spine=(-8, 16, 0), head=(-4, -12, 0),
                  upperarm_R=(150, -10, -30), lowerarm_R=(105, 0, 0), hand_R=(-45, 0, 0),
                  upperarm_L=(125, -20, -20), lowerarm_L=(100, 0, 0), hand_L=(-20, 0, 0))
    strike = dict(stance, hips_at=(0, -0.06, 0.02), hips=(4, -4, 0), spine=(24, -8, 0), head=(-16, 6, 0),
                  upperarm_R=(42, 0, 4), lowerarm_R=(12, 0, 0), hand_R=(15, 0, 0),
                  upperarm_L=(46, 0, -14), lowerarm_L=(18, 0, 0), hand_L=(10, 0, 0))
    follow = dict(stance, hips_at=(0, -0.07, 0.02), hips=(6, -6, 0), spine=(30, -10, 0), head=(-20, 8, 0),
                  upperarm_R=(24, 0, 6), lowerarm_R=(10, 0, 0), hand_R=(25, 0, 0),
                  upperarm_L=(28, 0, -12), lowerarm_L=(16, 0, 0))
    lift = dict(stance, hips_at=(0, -0.04, 0.01), hips=(2, 4, 0), spine=(10, 6, 0), head=(-8, -4, 0),
                upperarm_R=(105, -5, -20), lowerarm_R=(80, 0, 0), hand_R=(-20, 0, 0),
                upperarm_L=(95, -10, -14), lowerarm_L=(80, 0, 0))
    return [(0, raised), (0.3, blend(raised, strike, 0.6)), (0.375, strike), (0.48, follow), (0.66, lift), (length, raised)], length


KNEEL = {'hips_at': (0, -0.42, -0.1), 'hips': (6, 0, 0), 'spine': (34, 0, 0), 'head': (-14, 0, 0),
         'thigh_L': (86, 0, 6), 'shin_L': (-92, 0, 0), 'foot_L': (0, 0, 0),
         'thigh_R': (-4, 0, -6), 'shin_R': (-118, 0, 0), 'foot_R': (95, 0, 0)}


def drink():
    length = 1.792
    reach = dict(KNEEL, spine=(48, 0, 0), head=(-26, 0, 0),
                 upperarm_L=(62, 0, 4), lowerarm_L=(10, 0, 0), hand_L=(10, 0, -10),
                 upperarm_R=(62, 0, -4), lowerarm_R=(10, 0, 0), hand_R=(10, 0, 10))
    sip = dict(KNEEL, spine=(22, 0, 0), head=(4, 0, 0),
               upperarm_L=(40, 0, -6), lowerarm_L=(118, 0, 0), hand_L=(20, 0, -18),
               upperarm_R=(40, 0, 6), lowerarm_R=(118, 0, 0), hand_R=(20, 0, 18))
    return [(0, reach), (0.45, reach), (0.85, sip), (1.3, sip), (length, reach)], length


def swim():
    """Breaststroke: arms out front, sweep round and in to the chest, push out again; the
    legs draw up and kick back together."""
    length = 1.542
    flat = {'hips': (68, 0, 0), 'hips_at': (0, -0.15, 0), 'spine': (4, 0, 0), 'head': (-58, 0, 0)}
    glide = dict(flat, upperarm_L=(172, 0, 8), lowerarm_L=(4, 0, 0), upperarm_R=(172, 0, -8), lowerarm_R=(4, 0, 0),
                 thigh_L=(-4, 0, 6), shin_L=(-6, 0, 0), foot_L=(150, 0, 0), thigh_R=(-4, 0, -6), shin_R=(-6, 0, 0), foot_R=(150, 0, 0))
    sweep = dict(flat, spine=(-6, 0, 0), head=(-50, 0, 0), upperarm_L=(120, 0, 55), lowerarm_L=(30, 0, 0), upperarm_R=(120, 0, -55), lowerarm_R=(30, 0, 0),
                 thigh_L=(-2, 0, 8), shin_L=(-20, 0, 0), foot_L=(140, 0, 0), thigh_R=(-2, 0, -8), shin_R=(-20, 0, 0), foot_R=(140, 0, 0))
    gather = dict(flat, spine=(-10, 0, 0), head=(-44, 0, 0), upperarm_L=(70, 0, 30), lowerarm_L=(110, 0, 0), upperarm_R=(70, 0, -30), lowerarm_R=(110, 0, 0),
                  thigh_L=(40, 0, 25), shin_L=(-110, 0, 0), foot_L=(60, 0, 0), thigh_R=(40, 0, -25), shin_R=(-110, 0, 0), foot_R=(60, 0, 0))
    kick = dict(flat, upperarm_L=(150, 0, 10), lowerarm_L=(30, 0, 0), upperarm_R=(150, 0, -10), lowerarm_R=(30, 0, 0),
                thigh_L=(10, 0, 30), shin_L=(-40, 0, 0), foot_L=(120, 0, 0), thigh_R=(10, 0, -30), shin_R=(-40, 0, 0), foot_R=(120, 0, 0))
    return [(0, glide), (0.45, sweep), (0.75, gather), (1.05, kick), (length, glide)], length


def die():
    length = 1.292
    buckle = dict(STAND, hips_at=(0, -0.25, -0.04), hips=(-6, 0, 4), spine=(18, 0, 0), head=(14, 0, 0),
                  thigh_L=(40, 0, 6), shin_L=(-70, 0, 0), thigh_R=(30, 0, -6), shin_R=(-60, 0, 0),
                  upperarm_L=(20, 0, 20), upperarm_R=(10, 0, -16))
    falling = dict(STAND, hips_at=(0, -0.55, -0.25), hips=(-55, 0, 6), spine=(10, 0, 0), head=(16, 0, 0),
                   thigh_L=(60, 0, 8), shin_L=(-50, 0, 0), thigh_R=(45, 0, -8), shin_R=(-40, 0, 0),
                   upperarm_L=(40, 0, 50), lowerarm_L=(30, 0, 0), upperarm_R=(30, 0, -45), lowerarm_R=(20, 0, 0))
    down = dict(STAND, hips_at=(0, -0.76, -0.42), hips=(-88, 0, 4), spine=(-4, 0, 0), head=(10, 20, 0),
                thigh_L=(10, 0, 12), shin_L=(-14, 0, 0), foot_L=(-75, 0, 0), thigh_R=(18, 0, -6), shin_R=(-30, 0, 0), foot_R=(-70, 0, 0),
                upperarm_L=(10, 0, 70), lowerarm_L=(20, 0, 0), upperarm_R=(30, 0, -40), lowerarm_R=(40, 0, 0))
    return [(0, STAND), (0.3, buckle), (0.75, falling), (1.1, down), (length, down)], length


def animate(arm, old_actions):
    """Replaces the rig's animations with these. `old_actions`: the ones to remove."""
    add_feet(arm)
    for act in old_actions:
        bpy.data.actions.remove(act)
    made = []
    for name, make in (('idle', idle), ('crouch', crouch), ('jump', jump), ('drink', drink), ('swim', swim), ('die', die)):
        keys, length = make() if name != 'idle' else (make(), 3.0)
        made.append(clip(arm, name, keys, length))
    for name, make in (('walk', walk), ('run', run), ('sneak', sneak), ('chop', chop)):
        keys, length = make()
        made.append(clip(arm, name, keys, length))
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location = Vector()
        pb.rotation_quaternion = Quaternion()
    return made
