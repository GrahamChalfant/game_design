# Game Design

A small 3D platformer built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).
Run around, jump between platforms and collect every coin.

## Getting started

You need [Node.js](https://nodejs.org/) (version 20 or newer).

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). The page reloads
automatically whenever you save a file.

### Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Space | Jump |
| Click and drag | Rotate the camera |

## Project layout

```
index.html          Page shell and HUD (score, messages)
src/main.js         Renderer, lights, camera and the main game loop
src/player.js       Player movement, jumping, gravity and collisions
src/level.js        Platforms and coin positions (edit these to change the level)
src/input.js        Keyboard and mouse handling
src/style.css       HUD styling
public/models/      3D models exported from Blender (.glb)
```

## Adding models from Blender

1. Model your object in Blender, with 1 Blender unit = 1 meter.
2. Go to **File → Export → glTF 2.0**, and choose the **glTF Binary (.glb)** format.
3. Save the file into `public/models/`.
4. Load it in code with `GLTFLoader`. For an example, see `loadModel()` in `src/player.js`.

If you save a model as `public/models/player.glb`, it automatically replaces the blue capsule.

## Sharing the game

```bash
npm run build
```

This creates a `dist/` folder. You can upload it to [itch.io](https://itch.io) (as a zipped HTML
game), GitHub Pages, Netlify or any other static host.
