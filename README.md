# Game Design

A small 3D platformer built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).
Run around, jump between platforms and collect every coin.

## Getting started

There are two ways to run the game. Both run the same game.

### Option A: No install needed (Python)

This uses Python, which is already on most Macs, and downloads Three.js from a CDN.
You don't need Node.js or npm.

From inside the project folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. After you edit a file, refresh the browser to see the change.
To stop the server, press **Ctrl+C** in the terminal.

> You can't just double-click `index.html`. Browsers block this kind of code when it's
> opened as a local file, so it has to be served by a web server like the one above.

### Option B: With Node.js and npm

You need [Node.js](https://nodejs.org/) 20.19 or newer.

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

## Updating Three.js

The Three.js version is listed in two places. If you change one, change both:
`"three"` in `package.json` (Option B) and the import map in `index.html` (Option A).

## Sharing the game

You need Option B (npm) for this:

```bash
npm run build
```

This creates a `dist/` folder. You can upload it to [itch.io](https://itch.io) (as a zipped HTML
game), GitHub Pages, Netlify or any other static host.
