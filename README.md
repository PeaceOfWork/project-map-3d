# Project Map 3D

Interactive 3D tree visualization for project management and planning.

## Features

- **3D Tree Layout** — Strict hierarchy with radial positioning
- **Interactive Camera** — Rotate, zoom, pan with mouse/touchpad
- **Click-to-Focus** — Click any node to zoom in and focus on that branch
- **Smart Filtering** — Filter by status, phase, stream, priority
- **Collapsible Branches** — Collapse completed sections
- **Real-time Stats** — Progress tracking and milestone overview

## Tech Stack

- Three.js for 3D rendering
- Vite for development
- ES Modules for clean architecture
- CSS2DRenderer for HTML labels

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Architecture

```
src/
├── app.js              # Main application
├── tree-layout.js      # Radial tree layout algorithm
├── interaction.js      # Camera controls and focus
├── filtering.js        # Filter and collapse logic
── scene.js            # Three.js scene setup
├── nodes.js            # Node rendering
├── edges.js            # Edge rendering
└── data/
    └── project-map-data.json  # Project data
```

## Controls

- **Right-drag** — Rotate camera
- **Scroll / 2-finger pinch** — Zoom
- **Left-click node** — Focus on branch
- **Left-click empty** — Return to overview
- **Double-click** — Reset view

## License

MIT
