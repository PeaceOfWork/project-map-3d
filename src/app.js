import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import data from './data/project-map-data.json';

// ── Configuration ──
const CONFIG = {
  colors: {
    done: 0x4caf50,
    'in-progress': 0xff9800,
    blocked: 0xf44336,
    'not-started': 0x5a6475,
    accent: 0xff7b54,
    edge: 0x4a5568,
    background: 0x0f1419
  },
  layout: {
    rootRadius: 0,
    phaseRadius: 40,
    taskRadius: 20,
    subtaskRadius: 12,
    layerHeight: 8
  },
  nodeSizes: {
    root: 3.0,
    phase: 2.2,
    task: 1.2,
    'task-p0': 1.4,
    decision: 1.5
  }
};

// ── State ──
const state = {
  filters: { status: new Set(), phase: new Set(), stream: new Set(), priority: new Set() },
  collapseDone: false,
  focusedNode: null,
  nodes: new Map(),
  edges: []
};

// ── Scene Setup ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 60, 100);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
renderer.setSize(window.innerWidth - 320, window.innerHeight - 200);
renderer.setPixelRatio(window.devicePixelRatio);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth - 320, window.innerHeight - 200);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '200px';
labelRenderer.domElement.style.left = '0';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// Grid
const gridHelper = new THREE.GridHelper(200, 20, 0x2d3643, 0x1a1f26);
gridHelper.position.y = -20;
scene.add(gridHelper);

// ── Data Processing ──
const nodeById = new Map(data.nodes.map(n => [n.id, n]));
const childrenMap = new Map();

data.nodes.forEach(node => {
  if (node.parent) {
    if (!childrenMap.has(node.parent)) childrenMap.set(node.parent, []);
    childrenMap.get(node.parent).push(node.id);
  }
});

function getDepth(nodeId) {
  let depth = 0;
  let current = nodeById.get(nodeId);
  while (current?.parent) {
    depth++;
    current = nodeById.get(current.parent);
  }
  return depth;
}

function getSubtreeIds(nodeId) {
  const ids = [nodeId];
  const children = childrenMap.get(nodeId) || [];
  for (const childId of children) {
    ids.push(...getSubtreeIds(childId));
  }
  return ids;
}

// ─ Layout Algorithm ──
function computeLayout(visibleNodeIds) {
  const positions = new Map();
  
  // Group nodes by depth
  const depthGroups = new Map();
  visibleNodeIds.forEach(id => {
    const depth = getDepth(id);
    if (!depthGroups.has(depth)) depthGroups.set(depth, []);
    depthGroups.get(depth).push(id);
  });

  // Place root at origin
  const rootId = data.nodes.find(n => n.type === 'root').id;
  positions.set(rootId, new THREE.Vector3(0, 0, 0));

  // Place each depth level
  for (const [depth, nodeIds] of depthGroups) {
    if (depth === 0) continue; // root already placed

    const radius = depth === 1 ? CONFIG.layout.phaseRadius 
                   : depth === 2 ? CONFIG.layout.taskRadius 
                   : CONFIG.layout.subtaskRadius;
    
    const angleStep = (Math.PI * 2) / nodeIds.length;
    
    nodeIds.forEach((nodeId, index) => {
      const node = nodeById.get(nodeId);
      const parentId = node.parent;
      const parentPos = positions.get(parentId);
      
      if (!parentPos) return;

      // Calculate angle based on sibling index
      const siblings = nodeIds.filter(id => nodeById.get(id).parent === parentId);
      const siblingIndex = siblings.indexOf(nodeId);
      const siblingAngleStep = (Math.PI * 2) / siblings.length;
      const angle = siblingIndex * siblingAngleStep;

      // Position in a circle around parent
      const x = parentPos.x + Math.cos(angle) * radius;
      const z = parentPos.z + Math.sin(angle) * radius;
      const y = parentPos.y - depth * CONFIG.layout.layerHeight;

      positions.set(nodeId, new THREE.Vector3(x, y, z));
    });
  }

  return positions;
}

// ── Node Rendering ──
function createNodeMesh(node) {
  const size = CONFIG.nodeSizes[node.type] || CONFIG.nodeSizes.task;
  const color = CONFIG.colors[node.status] || CONFIG.colors['not-started'];
  
  let geometry;
  if (node.type === 'root') {
    geometry = new THREE.IcosahedronGeometry(size, 1);
  } else if (node.type === 'phase') {
    geometry = new THREE.CylinderGeometry(size, size, size * 0.6, 6);
  } else if (node.type === 'decision') {
    geometry = new THREE.OctahedronGeometry(size);
  } else {
    geometry = new THREE.SphereGeometry(size, 16, 16);
  }

  const material = new THREE.MeshStandardMaterial({ 
    color, 
    emissive: color, 
    emissiveIntensity: 0.2,
    roughness: 0.3,
    metalness: 0.7
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.nodeId = node.id;
  
  // Add priority ring for P0
  if (node.priority === 'p0' && node.type === 'task') {
    const ringGeo = new THREE.TorusGeometry(size * 1.2, 0.08, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    mesh.add(ring);
  }

  return mesh;
}

function createLabel(node) {
  const div = document.createElement('div');
  div.className = 'node-label';
  div.textContent = node.label;
  div.style.color = '#e6e6e6';
  div.style.fontSize = '12px';
  div.style.fontWeight = '600';
  div.style.textShadow = '0 0 4px rgba(0,0,0,0.8)';
  div.style.pointerEvents = 'none';
  
  const label = new CSS2DObject(div);
  label.position.set(0, 2.5, 0);
  return label;
}

// ── Edge Rendering ──
function createEdge(fromPos, toPos) {
  const points = [fromPos, toPos];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ 
    color: CONFIG.colors.edge, 
    opacity: 0.6, 
    transparent: true 
  });
  return new THREE.Line(geometry, material);
}

// ── Scene Update ──
function updateScene() {
  // Clear existing
  state.nodes.forEach(mesh => scene.remove(mesh));
  state.nodes.clear();
  
  state.edges.forEach(edge => scene.remove(edge));
  state.edges = [];

  // Filter nodes
  const visibleIds = new Set();
  data.nodes.forEach(node => {
    let visible = true;
    
    // Apply filters
    for (const [cat, set] of Object.entries(state.filters)) {
      if (set.size === 0) continue;
      if (!set.has(node[cat])) { visible = false; break; }
    }
    
    if (visible) visibleIds.add(node.id);
  });

  // Include ancestors
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  for (const id of [...visibleIds]) {
    let cur = byId.get(id);
    while (cur?.parent) {
      visibleIds.add(cur.parent);
      cur = byId.get(cur.parent);
    }
  }

  // Compute layout
  const positions = computeLayout(visibleIds);

  // Create nodes
  visibleIds.forEach(id => {
    const node = byId.get(id);
    const pos = positions.get(id);
    if (!pos) return;

    const mesh = createNodeMesh(node);
    mesh.position.copy(pos);
    
    const label = createLabel(node);
    mesh.add(label);
    
    scene.add(mesh);
    state.nodes.set(id, mesh);
  });

  // Create edges
  data.edges.forEach(edge => {
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return;
    
    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);
    if (!fromPos || !toPos) return;

    const line = createEdge(fromPos, toPos);
    scene.add(line);
    state.edges.push(line);
  });

  updateStats();
}

// ── Interaction ──
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(Array.from(state.nodes.values()));

  if (intersects.length > 0) {
    const nodeId = intersects[0].object.userData.nodeId;
    focusOnNode(nodeId);
  } else {
    unfocus();
  }
});

function focusOnNode(nodeId) {
  const mesh = state.nodes.get(nodeId);
  if (!mesh) return;

  state.focusedNode = nodeId;
  
  // Animate camera to focus
  const targetPos = mesh.position.clone();
  const offset = new THREE.Vector3(20, 15, 20);
  const cameraTarget = targetPos.clone().add(offset);
  
  // Simple tween (could use GSAP for smoother)
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const duration = 600;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

    camera.position.lerpVectors(startPos, cameraTarget, eased);
    controls.target.lerpVectors(startTarget, targetPos, eased);
    controls.update();

    if (progress < 1) requestAnimationFrame(animate);
  }
  
  animate();
  showNodeDetail(nodeId);
}

function unfocus() {
  state.focusedNode = null;
  document.getElementById('node-detail').style.display = 'none';
  document.getElementById('node-detail-placeholder').style.display = 'block';
}

function showNodeDetail(nodeId) {
  const node = nodeById.get(nodeId);
  if (!node) return;

  const detail = document.getElementById('node-detail');
  const placeholder = document.getElementById('node-detail-placeholder');
  
  placeholder.style.display = 'none';
  detail.style.display = 'block';

  const statusColors = {
    done: '#4caf50',
    'in-progress': '#ff9800',
    blocked: '#f44336',
    'not-started': '#5a6475'
  };

  let html = `<h3>${node.label}</h3>`;
  html += `<div style="margin: 10px 0;">`;
  html += `<span class="badge" style="background:${statusColors[node.status]}">${node.status}</span>`;
  
  const phase = data.filterCategories.phase.options.find(p => p.id === node.phase);
  if (phase) html += `<span class="badge" style="background:${phase.color}">${phase.label}</span>`;
  
  const stream = data.filterCategories.stream.options.find(s => s.id === node.stream);
  if (stream) html += `<span class="badge" style="background:${stream.color}">${stream.label}</span>`;
  
  html += `</div>`;
  
  if (node.description) html += `<p>${node.description}</p>`;
  
  if (node.files?.length) {
    html += `<p><b>Files:</b></p>`;
    node.files.forEach(f => html += `<code>${f}</code>`);
  }
  
  detail.innerHTML = html;
}

// ── Stats ──
function updateStats() {
  const counts = { done: 0, 'in-progress': 0, blocked: 0, 'not-started': 0, total: 0 };
  state.nodes.forEach((_, id) => {
    const node = nodeById.get(id);
    if (node) {
      counts[node.status]++;
      counts.total++;
    }
  });

  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  
  document.getElementById('stats-bar').innerHTML = `
    <div class="stat"><span class="count">${pct}%</span> complete</div>
    <div class="stat"><span class="dot" style="background:var(--done)"></span><span class="count">${counts.done}</span> done</div>
    <div class="stat"><span class="dot" style="background:var(--in-progress)"></span><span class="count">${counts['in-progress']}</span> in progress</div>
    <div class="stat"><span class="dot" style="background:var(--blocked)"></span><span class="count">${counts.blocked}</span> blocked</div>
    <div class="stat"><span class="dot" style="background:var(--not-started)"></span><span class="count">${counts['not-started']}</span> not started</div>
    <div class="stat" style="margin-left:auto"><span class="count">${counts.total}</span> visible nodes</div>
  `;
}

// ── Filter UI ─
function buildFilterUI() {
  for (const [catKey, cat] of Object.entries(data.filterCategories)) {
    const container = document.getElementById(`filter-${catKey}`);
    
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.textContent = 'All';
    allBtn.onclick = () => {
      state.filters[catKey].clear();
      syncFilterButtons(catKey);
      updateScene();
    };
    container.appendChild(allBtn);

    cat.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.innerHTML = `<span class="swatch" style="background:${opt.color}"></span>${opt.label}`;
      btn.onclick = () => {
        if (state.filters[catKey].has(opt.id)) {
          state.filters[catKey].delete(opt.id);
        } else {
          state.filters[catKey].add(opt.id);
        }
        syncFilterButtons(catKey);
        updateScene();
      };
      container.appendChild(btn);
    });
  }

  document.getElementById('btn-collapse').onclick = () => {
    state.collapseDone = !state.collapseDone;
    document.getElementById('btn-collapse').classList.toggle('active', state.collapseDone);
    updateScene();
  };

  document.getElementById('btn-reset').onclick = () => {
    for (const key of Object.keys(state.filters)) state.filters[key].clear();
    state.collapseDone = false;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === 'All');
    });
    document.getElementById('btn-collapse').classList.remove('active');
    updateScene();
  };
}

function syncFilterButtons(catKey) {
  const container = document.getElementById(`filter-${catKey}`);
  const set = state.filters[catKey];
  const buttons = container.querySelectorAll('.filter-btn');
  
  buttons.forEach((btn, idx) => {
    if (idx === 0) { // All button
      btn.classList.toggle('active', set.size === 0);
    } else {
      const opt = data.filterCategories[catKey].options[idx - 1];
      btn.classList.toggle('active', set.has(opt.id));
    }
  });
}

// ── Milestones ──
function renderMilestones() {
  const container = document.getElementById('milestones');
  const today = new Date('2026-10-22');
  
  data.milestones.forEach(m => {
    const target = new Date(m.targetDate);
    const overdue = target < today && m.status !== 'done';
    
    const div = document.createElement('div');
    div.className = `milestone ${m.status}`;
    div.innerHTML = `
      <div class="milestone-header">
        <div class="milestone-title">${m.label}</div>
        <div class="milestone-date ${overdue ? 'overdue' : ''}">${m.targetDate}${overdue ? ' ' : ''}</div>
      </div>
      <ul>${m.deliverables.map(d => `<li>${d}</li>`).join('')}</ul>
    `;
    container.appendChild(div);
  });
}

// ── Init ──
document.getElementById('project-name').textContent = `${data.metadata.project} v${data.metadata.version}`;
document.getElementById('last-updated').textContent = data.metadata.lastUpdated;

buildFilterUI();
renderMilestones();
updateScene();

// ── Animation Loop ──
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

// ── Resize ─
window.addEventListener('resize', () => {
  camera.aspect = (window.innerWidth - 320) / (window.innerHeight - 200);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth - 320, window.innerHeight - 200);
  labelRenderer.setSize(window.innerWidth - 320, window.innerHeight - 200);
});
