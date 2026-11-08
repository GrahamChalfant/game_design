# Building blocks for the smooth-shaded models (plane.py, props_smooth.py): a mesh whose faces
# carry a colour per corner (so colour can blend across a surface instead of jumping face to
# face), shaded smooth or flat face by face, with a material slot each; and some shapes.
# Points are in the game's axes (y up, z forward); `place` (if set) moves each first.
import math
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Vector, noise
from kit import PAL, g, material


def tone(name, var=0.0, shade=1.0):
    import random
    h = PAL[name]
    k = (1 + random.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


def shared(name, rough, tag='smoothkit'):
    """One material per name, made here and reused run after run; one of the same name from
    elsewhere (an imported model's, say) is renamed out of the way."""
    m = bpy.data.materials.get(name)
    if m and m.get(tag):
        return m
    if m:
        m.name = f'{name}-other'
    m = material(name, rough)
    m[tag] = True
    return m


class Mesh:
    """Faces with a colour per corner, smooth or flat, and a material slot each."""
    def __init__(self, place=None):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.flat = self.bm.faces.layers.int.new('flat')
        self.verts = {}
        self.place = place or (lambda p: p)

    def new_vert(self, p):
        return self.bm.verts.new(g(*self.place(Vector(p))))

    def vert(self, key, p):
        """A shared vertex (so smooth faces shade across), made once per key."""
        if key not in self.verts:
            self.verts[key] = self.new_vert(p)
        return self.verts[key]

    def face(self, verts, colour, smooth=True, slot=0):
        """colour: one colour, a list (one per corner), or colour(point) per corner."""
        pts = [None if isinstance(v, bmesh.types.BMVert) else Vector(v) for v in verts]
        verts = [v if isinstance(v, bmesh.types.BMVert) else self.new_vert(v) for v in verts]
        try:
            f = self.bm.faces.new(verts)
        except ValueError:  # (already there)
            return None
        f.material_index = slot
        f[self.flat] = 0 if smooth else 1
        for i, loop in enumerate(f.loops):
            if isinstance(colour, list):
                loop[self.col] = colour[i]
            elif callable(colour):
                loop[self.col] = colour(pts[i] if pts[i] is not None else loop.vert.co)
            else:
                loop[self.col] = colour
        return f

    def grid(self, rows, colour, smooth=True, slot=0, close=True, outward=None):
        """Skins rows of points (each the same count), sharing their corners; colour(i, k, point)
        per corner; turned to face away from `outward`'s point if given (else as wound)."""
        n = len(rows[0])
        vs = [[self.new_vert(p) for p in r] for r in rows]
        for i in range(len(rows) - 1):
            for k in range(n if close else n - 1):
                k1 = (k + 1) % n
                idx = [(i, k), (i, k1), (i + 1, k1), (i + 1, k)]
                if outward is not None:
                    quad = [rows[a][b] for a, b in idx]
                    c = sum(quad, Vector()) / 4
                    if (quad[1] - quad[0]).cross(quad[3] - quad[0]).dot(c - outward(i, k)) < 0:
                        idx = idx[::-1]
                self.face([vs[a][b] for a, b in idx], [colour(a, b, rows[a][b]) for a, b in idx], smooth, slot)
        return vs

    def cap(self, ring, colour, outward, slot=0, smooth=False):
        c = sum(ring, Vector()) / len(ring)
        for k in range(len(ring)):
            tri = [c, ring[k], ring[(k + 1) % len(ring)]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(outward) < 0:
                tri = tri[::-1]
            self.face(tri, colour, smooth, slot)

    def blob(self, centre, radii, colour, detail=3, lumps=0.0, seed=0, flatten_below=None, slot=0):
        """A smooth lump: an icosphere `radii` across, pushed in and out by noise (lumps)."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=detail + 1, radius=1.0)  # (Blender counts the plain icosahedron as 1)
        off = Vector((seed * 7.1, seed * 3.3, seed * 5.7))
        index = {}
        for v in tmp.verts:
            d = Vector((v.co.x, v.co.z, v.co.y))  # (Blender's z up: game y up)
            k = 1 + lumps * noise.noise(d * 1.6 + off) + lumps * 0.5 * noise.noise(d * 3.7 + off)
            p = Vector(centre) + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * k
            if flatten_below is not None and p.y < flatten_below:
                p.y = flatten_below + (p.y - flatten_below) * 0.15
            index[v] = (p, d)
        for f in tmp.faces:
            pts = [index[v][0] for v in f.verts]
            ds = [index[v][1] for v in f.verts]
            # (Wound to face out: the icosphere's own winding, its axes swapped, is inside out.)
            self.face(self.share(pts)[::-1], [colour(p, d) for p, d in zip(pts, ds)][::-1], True, slot)
        tmp.free()

    def share(self, pts):
        return [self.vert(('p', round(p.x, 6), round(p.y, 6), round(p.z, 6)), p) for p in pts]

    def build(self, name, materials):
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        flat = me.attributes['flat'].data
        for p in me.polygons:
            p.use_smooth = not flat[p.index].value
        me.attributes.remove(me.attributes['flat'])
        for m in materials:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def frame(d):
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
    return u, d.cross(u).normalized()


def tube(m, a, z, radii, colour, sides=12, flat=1.0, turn=0.0, caps=True):
    """A smooth tube from a to z through rings of radii (each r or (w, d)); colour(point,
    normal-ish) per corner."""
    a, z = Vector(a), Vector(z)
    u, v = frame((z - a).normalized())
    cu, su = math.cos(turn), math.sin(turn)
    u, v = u * cu + v * su, v * cu - u * su
    rings = []
    for i, r in enumerate(radii):
        w, d = r if isinstance(r, tuple) else (r, r * flat)
        p = a.lerp(z, i / (len(radii) - 1))
        rings.append([p + u * math.cos(math.tau * k / sides) * w + v * math.sin(math.tau * k / sides) * d for k in range(sides)])
    axis = lambda i, k: a.lerp(z, i / (len(radii) - 1))
    m.grid(rings, lambda i, k, p: colour(p, (p - axis(i, k)).normalized()), outward=lambda i, k: axis(i, k))
    if caps:
        m.cap(rings[0], colour(rings[0][0], a - z), a - z)
        m.cap(rings[-1], colour(rings[-1][0], z - a), z - a)
    return rings


def box(m, lo, hi, colour, bevel=0.01, tilt=0.0, segments=2, smooth=False):
    """A box from lo to hi with its edges rounded, tilted `tilt` about x."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1)
    lo, hi = Vector(lo), Vector(hi)
    size, mid = hi - lo, (hi + lo) / 2
    c, s = math.cos(tilt), math.sin(tilt)
    for v in tmp.verts:
        p = Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
        v.co = Vector((p.x, p.y * c - p.z * s, p.z * c + p.y * s)) + mid
    r = min(bevel, min(size) * 0.4)
    if r > 0:
        bmesh.ops.bevel(tmp, geom=tmp.edges[:] + tmp.verts[:], offset=r, segments=segments, profile=0.5, affect='EDGES')
    for f in tmp.faces:
        pts = [v.co.copy() for v in f.verts]
        m.face(pts, colour if not callable(colour) else [colour(p) for p in pts], smooth)
    tmp.free()
