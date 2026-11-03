# Art Style Guide: Northern Survival

**The setting:** a small bush plane has crashed in an inland northern valley (think northern
Canada in a short summer). Golden-green meadows, dark spruce forest, grey boulders, a lake
and a winding river, a little lingering snow. No coast, no sea.

**The palette:** muted and cool, after an autumn morning in the Rockies: deep blue-green
spruce, rusty-orange and ochre shrubs, cool grey stone, a grey-blue sky with a warm glow low
down, and pale teal glacial water. Saturated greens and yellows are out.

**The look:** painterly low-poly, in the spirit of the farmland in *Vinland Saga* season 2
and the hand-painted valley reference: soft, natural, a little nostalgic. Warm low sunlight
and long shadows, bluish haze in the distance, muted colour with a few warm accents. The
game draws everything through a painterly (Kuwahara) filter, so models should rely on big
flat colour areas and clear shapes; fine detail is lost.

**The camera:** a top-down, three-quarter view. Most things are seen from **above and
slightly in front**, so silhouettes and colours must read from that angle (tops of trees,
the backs of animals, the roof of the shelter). The mouse is reserved for aiming, so the
camera never rotates: models are always seen from the same side.

## 1. Palette

Use these as base colours. Vary each one by ±5–8% value/hue per face or part to get the
painted look; never use pure black (#000) or pure white (#fff) in albedo.

| Family | Swatch | Hex | Use |
| --- | --- | --- | --- |
| Meadow (the ground the game paints) | sage | `#7D8F5E` | grass, the main field colour |
| | olive | `#948F58` | drier grass |
| | ochre | `#AE8D58` | dry patches, sunlit edges, straw |
| | rust | `#A0643A` | autumn shrubs (willow, dwarf birch) in the open |
| | moss | `#5E7444` | dark grass blotches, moss on wood |
| | forest floor | `#435440` | under trees, bough beds |
| Birch | bark | `#D9D4C6` | birch trunks (with `#3A3632` marks) |
| | leaves | `#8E9452` / `#B39A52` | muted olive and autumn gold |
| Spruce | needles-dark | `#1F3A2A` | inside of spruce tiers |
| | needles | `#2E5E38` | conifer needles, bough highlights |
| | needle-tip | `#46684A` | tier edges, sunlit tips |
| Stone | stone | `#8A8C8E` | boulders, scree, the ground's rocky patches (cool grey) |
| | stone-dark | `#58585A` | shadowed faces, flint, wet rock |
| | lichen | `#949266` | tops of rocks and old wood |
| Wood | wood-dark | `#54392A` | end grain, lashings, bark in shade |
| | wood | `#6B4A32` | poles, handles, trunks, logs |
| | driftwood | `#7A7067` | dead trees, dry snags |
| | cut wood | `#D9B98A` | fresh cut ends, stumps |
| Hide and bone | hide-dark | `#7A5C40` | hide panels, boar back |
| | hide | `#8A6A4A` | shelter hide, grips, rabbit |
| | hide-red | `#8C5B3F` | deer coat |
| | bone | `#D8C49A` | stitching, cord, rope, tusks, bone tools |
| Snow and water | snow | `#EEF2F4` | the odd lingering snow patch |
| | water | `#5B8A8E` | lake and river (pale glacial teal-grey) |
| Warm accents | wreck yellow | `#D9A52B` | the plane |
| | rust red | `#A83A2A` | plane stripes, the player's coat, danger |
| | ember | `#FF7A2A` | fire (with `#FFD36A` cores); the only emissive colour |

Rule of thumb: ≥80% of any scene is meadow, spruce, stone and wood; hide and bone are
accents; yellow, red and fire are reserved for the wreck, the player, fires and things the
player must notice. Keep colours muted: the lighting (golden sun, blue night) adds the mood.

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
- Avoid thin parts that vanish from above (e.g. a snare's noose seen edge-on): make the
  shape that matters face up, or thicken it.

## 3. Silhouette

- Read from the game camera (above and in front, ~20 m away) and at thumbnail size: one
  primary mass, one or two secondary shapes. Check the top view, not just the front view.
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
- Apply all transforms before export (scale 1, rotation 0), **and keep each exported object
  at the world origin in its .blend**: a stray location becomes a stray offset in the GLB
  (this is what put the axe a metre from the hand, #65, and the wing off its collider, #66).
- Export: glTF 2.0, **GLB**, `use_selection=True`, `export_apply=True`, +Y up (default),
  include vertex colours, no images, animations only for rigged assets.
- **Delete helper/default objects** (the default `Cube`, `Camera`, `Light` still sit in several .blend files) before export,
  or export with selection only.
- Shared helpers (palette, `Builder`, `build`, `build_hinged`, `export`) are in `blender/kit.py`;
  `props.py`, `places.py` and `lookout.py` use them. Parts that open in the game (lids, doors)
  are separate objects named `<model>-lid`, `<model>-door…`, with their origin on the hinge.
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
- Panels/backgrounds use dark slate `rgb(20 30 40)` at 55–85% opacity, as the HUD does; text in white or bone `#D8C49A`.
- Item rarity/state uses value, not neon colour: rust red for danger/broken, sage green for edible/ready.
- One idea per icon; no text inside icons.

## 8. Checklist before committing an asset

- [ ] Triangles within budget; no stray helper meshes
- [ ] Colours from the palette, ±8% variation, grass in greys
- [ ] Flat shaded, roughness ≥ 0.7, no texture maps
- [ ] Correct scale, origin at base centre, faces -Y
- [ ] Name follows conventions; preview rendered next to existing assets
