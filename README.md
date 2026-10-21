# Ammar Khan — 3D Motion Portfolio

A futuristic, dark-theme developer portfolio with an Apple-style silver palette, built with **Three.js + Vite**. Scrolling (smoothed with Lenis) flies the camera through deep space — a shader nebula, stars and a ringed planet — inside a glowing double-helix orbit that spirals around the path, with light pulses flowing along it and a continuous stream of real 3D dev icons (from simple-icons, in their brand colours) riding it, following a small "request" craft. A pinned **Core stack** section walks through React, Next.js, Three.js, NestJS, Node.js, Redis, MongoDB and MySQL, each with its own animated 3D emblem and 3D name, and an **Architecture** section shows how they fit together in an animated diagram.

## Requirements
- Node.js 20+ recommended
- npm

## Run locally
1. Extract the ZIP.
2. Open the project folder in VS Code.
3. Open a terminal in that folder and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL Vite prints (usually `http://localhost:5173`).

## Production build
```bash
npm run build
npm run preview
```
The production website is generated in `dist/`.

## Customize before publishing
- **Contact:** GitHub (github.com/Ammarcodex), email (ammarcodex@gmail.com), WhatsApp and phone (+92 312 1118181) live in the header and the `#contact` section of `index.html`.
- **Projects:** the CPaaS Intelligence, Stranger, and Karigar cards are portfolio snapshots. Update their descriptions, links, and visuals to match what you want to show publicly.
- **Skills:** edit the skill pills in the `#stack` section.
- **Core stack copy:** each tech is an `article.core-panel` inside `#core` in `index.html` (description, tags, code snippet). Keep the eight panels in the same order as `TECH` in `src/world.js`.
- **3D name:** the hero name is real extruded 3D type (`buildName` in `src/world.js`) fitted into the `.hero-name` box. It rises in letter by letter while each letter scrambles through random characters, and the header name (`data-scramble`) does the same. Headings with the `t3d` class get a CSS depth extrusion that tilts with scroll and the pointer.
- **3D scene:** `src/world.js` holds the flight path, obstacles, gates, craft and tech emblems (`buildReact`, `buildNext`, `buildThree`, `buildNest`, `buildNode`, `buildRedis`, `buildMongo`, `buildMySQL`). `DEPTH` sets how far the camera travels over the full page scroll.
- **Space + icons:** `src/space.js` builds the nebula sky, planet and the extruded dev icons (`DEV_ICONS`). Add or remove icons there; `src/world.js` spaces them along the helix strands (`makeStrand`, `riderCount`).
- **Interactions:** `src/ui.js` handles scroll state, the pinned stack section, card tilt, magnetic buttons, code highlighting and the HUD.
- **Colors/layout:** edit `src/style.css`. The silver gradients are the `--silver-*` tokens at the top.

## Notes
- Google Fonts are loaded from Google Fonts; the browser needs internet access for those fonts. The site still falls back to sans-serif fonts.
- The 3D canvas is decorative and pointer-events are disabled so page links remain clickable.
- Project cards currently link to the contact section; replace them with deployed project URLs when ready.
# Myportfolio
