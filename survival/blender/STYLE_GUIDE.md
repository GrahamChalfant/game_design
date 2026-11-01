# Art Style Guide: Survival (Shipwreck)

Painterly low-poly with a cold northern coast feel, in the spirit of Vinland Saga:
muted, overcast, wind-worn. Big, readable shapes, flat facets, and colour that does
the job of texture. Nothing glossy or saturated except rare signal colours.

## 1. Palette

Use these as base colours. Vary each one by ±5–8% value/hue per face or part to get the
"painted" look; never use pure black (#000) or pure white (#fff) in albedo.

| Family | Swatch | Hex | Use |
| --- | --- | --- | --- |
| Weathered wood | wood-dark | `#54392A` | lashings, end grain, shadowed logs |
| | wood | `#6B4A32` | poles, handles, trunks (`#5B4130` in trees) |
| | driftwood | `#7A7067` | dead trees, sea-bleached planks |
| Sea / slate | slate-dark | `#3E4A52` | wet rock, deep water, iron |
| | slate | `#626260` | rocks (existing rock range `#5B5B5B`–`#6C6C68`) |
| | sea-grey | `#6F8790` | shallows, foam shadow, cold metal |
| Moss / foliage | moss-dark | `#3D5739` | conifer needles, boughs (`#3F5C34`) |
| | moss | `#56743F` | broadleaf, bough highlights |
| | lichen | `#738D4E` | tips, sunlit edges, moss on rock (`#848266`) |
| Bone | bone | `#D8C49A` | stitching, antler, bone tools |
| | snow | `#E3E9EA` | snow caps (the one near-white allowed) |
| Hide | hide-dark | `#7A5C40` | hide panels, rabbit shadow |
| | hide | `#8A6A4A` | shelter hide, axe grip, rabbit `#8A7A67` |
| | hide-red | `#8C5B3F` | deer coat |
| Rust / signal | rust | `#A4442F` | player coat, wreck paint, danger |
| | ochre | `#B88A2E` | wreck livery (plane) |
| Overcast sky | sky | `#AEB6B8` | sky dome, fog colour, UI background tint |
| | sky-low | `#8E989C` | horizon, distant haze |

Rule of thumb: ≥80% of any scene is wood/slate/moss/sky; hide and bone are accents;
rust/ochre is reserved for the player, the wreck, and things the player must notice.

## 2. Materials

- **Default: vertex colour.** One material per asset class (`tree`, `rock`, `grass`,
  `animal`, `player`, `plane`…) with Base Color driven by a Color Attribute. Paint flat
  colour per face/part; no gradients inside a face except deliberate AO darkening at bases.
- **Allowed alternative: flat material colour** (as in `shelter.glb`) for scripted props,
  but keep to ≤ 6 materials per asset; prefer converting to vertex colour before shipping.
- Principled BSDF only. Roughness 0.9–0.95 for organics, 0.7–0.8 for metal/plastic/leather.
  Metallic 0. No emission except fire/embers.
- **No PBR texture maps** (normal, roughness, albedo images). None of the current assets
  use them. A small gradient/noise atlas is the only acceptable future exception.
- Flat shading (`use_smooth = False`) everywhere; the facets are the brushwork.
- Colours are authored in sRGB hex and converted to linear (`x ** 2.2`) in scripts.
- Grass tufts are painted in **greys only**; the game tints them from the ground.

## 3. Silhouette

- Read at 30 m and at thumbnail size: one primary mass, one or two secondary shapes.
- Exaggerate key features ~10–20%: antlers, ears, axe head, shelter A-frame, pack.
- Slight asymmetry and lean (2–6°) on natural and hand-built things; nothing perfectly
  straight except wreck metal.
- Taper and chunk: tiered pine skirts, faceted rocks with 1–2 big planes, logs with 5–6 sides.
- Avoid thin, noisy detail that aliases (single-poly strands, tiny spikes) except grass.
- Base sits on the ground plane; add a flared base or root bulge rather than floating edges.

## 4. Poly budgets (triangles, exported GLB)

| Class | Target | Hard cap | Current examples |
| --- | --- | --- | --- |
| Grass/ground-cover tufts | 10–40 | 50 | grass-* 9–45 |
| Small props (tools, items) | 50–300 | 600 | axe 56 |
| Large props (crates, cases) | 300–800 | 1,000 | suitcase 356 |
| Rocks / terrain pieces | 40–200 | 400 | rocks 44–140 |
| Trees | 150–700 | 1,200 | pines 188–1,124 |
| Shelter / buildings | 800–1,500 | 2,500 | shelter 1,076 |
| Wreck / vehicles | 400–1,500 | 3,000 | plane 448 |
| Small animals | 200–400 | 600 | rabbit 272 |
| Large animals | 400–900 | 1,500 | deer 536 |
| Characters (player/NPC) | 700–1,500 | 2,500 | player 740 |

## 5. Scale, units, export

- 1 Blender unit = 1 m. Model base centred at the origin, Z-up in Blender.
- Front of the model faces Blender **-Y** (Front view) → +Z in three.js.
- Reference sizes: player ~1.8 m, deer ~1.8 m at shoulder/head, rabbit ~0.5 m,
  shelter 3.2 × 2.8 × 2.3 m, pine ~9 m. See `survival/README.md` for the full table.
- Apply all transforms before export (scale 1, rotation 0).
- Export: glTF 2.0, **GLB**, `use_selection=True`, `export_apply=True`, +Y up (default),
  include vertex colours, no images, animations only for rigged assets.
- **Delete helper/default objects** (the default `Cube`, `Camera`, `Light` still sit in several .blend files) before export,
  or export with selection only.
- Prefer a script in `survival/blender/<asset>.py` that rebuilds the GLB headlessly
  (`blender -b --python <asset>.py`), as `shelter.py` does. Seed randomness.

## 6. Naming

- Files: lowercase kebab-case, `family-variant.glb` (`pine-small-snow.glb`, `rock-flat.glb`).
  Source: `family.blend` / `family.py` in `survival/blender/`.
- Objects/meshes: same as the file stem (`deer`), parts as `stem-part` (`player-pack`).
- Rigs: `stem-rig`; bones snake_case with `_L`/`_R` suffix (`hand_R`).
- Materials: class name (`tree`, `rock`) or `family_variant` (`wood_dark`, `hide_1`).
- Animation clips: lowercase verbs (`idle`, `walk`, `chop`, `die`).

## 7. UI icons

- Render from the in-game GLB (same palette), 3/4 view from upper left, warm key light
  from the upper left, soft fill, no hard drop shadow.
- 128 × 128 PNG master (export 64 and 32), transparent background, object fills ~80%.
- Add a 2 px outline in `#2D2824` (dark umber, not black) for readability on any panel.
- Panels/backgrounds use sky `#AEB6B8` / slate-dark `#3E4A52` at 85% opacity; text in bone `#D8C49A`.
- Item rarity/state uses value, not neon colour: rust for danger/broken, lichen for edible/ready.
- One idea per icon; no text inside icons.

## 8. Checklist before committing an asset

- [ ] Triangles within budget; no stray helper meshes
- [ ] Colours from the palette, ±8% variation, grass in greys
- [ ] Flat shaded, roughness ≥ 0.7, no texture maps
- [ ] Correct scale, origin at base centre, faces -Y
- [ ] Name follows conventions; preview rendered next to existing assets
