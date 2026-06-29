import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_OPTIONS = {
  globeRadius: 1,
  atmosphereRadius: 1.045,
  nodeCount: 180,
  linkCount: 120,
  autoRotate: true,
  autoRotateSpeed: 0.22,
  minDistance: 1.8,
  maxDistance: 5.5,
  initialDistance: 2.85,
  backgroundAlpha: 0,
  enablePan: false,
  mobileBreakpoint: 768
};

const PALETTE = {
  bg: new THREE.Color(0x070b10),
  globeBase: new THREE.Color(0x0d141c),
  globeEmissive: new THREE.Color(0x12303a),
  globeRim: new THREE.Color(0x2f6f7f),
  atmosphere: new THREE.Color(0x7fd0e6),
  node: new THREE.Color(0x8fd6e6),
  nodeHot: new THREE.Color(0xc8f6ff),
  nodeDim: new THREE.Color(0x4f7f8a),
  link: new THREE.Color(0x6dc7da),
  linkHot: new THREE.Color(0xbef4ff),
  glow: new THREE.Color(0x1b96b5)
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRandom(seedValue = 'erebor') {
  return mulberry32(typeof seedValue === 'number' ? seedValue : hashString(String(seedValue)));
}

function sampleSpherePoints(count, random) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const y = 1 - t * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i + random() * 0.35;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    const vector = new THREE.Vector3(x, y, z).normalize();
    const lat = 90 - Math.acos(vector.y) * (180 / Math.PI);
    const lon = Math.atan2(vector.z, vector.x) * (180 / Math.PI);

    points.push({
      id: `node-${i}`,
      label: `Entity ${String(i + 1).padStart(3, '0')}`,
      lat,
      lon,
      vector,
      weight: 0.35 + random() * 0.65,
      pulseOffset: random() * Math.PI * 2,
      colorMix: random()
    });
  }

  return points;
}

function buildDefaultDataset(options = {}) {
  const random = createSeededRandom(options.seed ?? 'erebor-globe');
  const nodes = sampleSpherePoints(options.nodeCount ?? DEFAULT_OPTIONS.nodeCount, random);

  const links = [];
  const linkCount = options.linkCount ?? DEFAULT_OPTIONS.linkCount;
  const used = new Set();

  for (let i = 0; i < linkCount; i += 1) {
    let sourceIndex = Math.floor(random() * nodes.length);
    let targetIndex = Math.floor(random() * nodes.length);
    let guard = 0;

    while ((targetIndex === sourceIndex || used.has(`${sourceIndex}:${targetIndex}`) || used.has(`${targetIndex}:${sourceIndex}`)) && guard < 24) {
      targetIndex = Math.floor(random() * nodes.length);
      guard += 1;
    }

    if (sourceIndex === targetIndex) continue;

    const source = nodes[sourceIndex];
    const target = nodes[targetIndex];
    const distance = source.vector.distanceTo(target.vector);

    if (distance < 0.45) continue;

    used.add(`${sourceIndex}:${targetIndex}`);

    links.push({
      id: `link-${links.length}`,
      source: source.id,
      target: target.id,
      intensity: 0.4 + random() * 0.6,
      traffic: Math.floor(20 + random() * 980)
    });
  }

  return { nodes, links };
}

function normalizeNode(node, index) {
  if (typeof node.lat === 'number' && typeof node.lon === 'number') {
    const vector = latLonToVector3(node.lat, node.lon, 1).normalize();
    return {
      id: node.id ?? `node-${index}`,
      label: node.label ?? node.name ?? `Entity ${index + 1}`,
      lat: node.lat,
      lon: node.lon,
      vector,
      weight: clamp(node.weight ?? node.score ?? 0.6, 0.1, 1),
      pulseOffset: node.pulseOffset ?? (index * 0.37),
      colorMix: clamp(node.colorMix ?? 0.5, 0, 1),
      ...node
    };
  }

  if (Array.isArray(node.position) && node.position.length >= 3) {
    const vector = new THREE.Vector3(node.position[0], node.position[1], node.position[2]).normalize();
    const lat = 90 - Math.acos(vector.y) * (180 / Math.PI);
    const lon = Math.atan2(vector.z, vector.x) * (180 / Math.PI);
    return {
      id: node.id ?? `node-${index}`,
      label: node.label ?? node.name ?? `Entity ${index + 1}`,
      lat,
      lon,
      vector,
      weight: clamp(node.weight ?? node.score ?? 0.6, 0.1, 1),
      pulseOffset: node.pulseOffset ?? (index * 0.37),
      colorMix: clamp(node.colorMix ?? 0.5, 0, 1),
      ...node
    };
  }

  return normalizeNode(
    {
      ...node,
      lat: lerp(-70, 70, (index % 17) / 16),
      lon: ((index * 137.5) % 360) - 180
    },
    index
  );
}

function normalizeDataset(dataset = {}, options = {}) {
  if (!dataset.nodes?.length) {
    return buildDefaultDataset(options);
  }

  const nodes = dataset.nodes.map(normalizeNode);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const links = (dataset.links ?? [])
    .map((link, index) => ({
      id: link.id ?? `link-${index}`,
      source: typeof link.source === 'object' ? link.source.id : link.source,
      target: typeof link.target === 'object' ? link.target.id : link.target,
      intensity: clamp(link.intensity ?? link.weight ?? 0.6, 0.1, 1),
      traffic: link.traffic ?? link.value ?? null,
      ...link
    }))
    .filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target) && link.source !== link.target);

  return { nodes, links };
}

function createArcCurve(start, end, altitude = 0.22) {
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize();
  const distance = start.distanceTo(end);
  const lift = 1 + altitude + distance * 0.18;
  const control = mid.multiplyScalar(lift);
  return new THREE.QuadraticBezierCurve3(start, control, end);
}

function createArcGeometry(start, end, intensity = 0.6) {
  const distance = start.distanceTo(end);
  const altitude = clamp(0.08 + distance * 0.22 + intensity * 0.08, 0.12, 0.5);
  const curve = createArcCurve(start, end, altitude);
  const segments = Math.max(24, Math.floor(36 + distance * 18));
  return new THREE.TubeGeometry(curve, segments, 0.0035 + intensity * 0.0025, 6, false);
}

function createEarthTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#101922');
  gradient.addColorStop(0.5, '#0b1219');
  gradient.addColorStop(1, '#081016');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 18; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 80 + Math.random() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(127, 208, 230, 0.22)');
    g.addColorStop(1, 'rgba(127, 208, 230, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(143, 214, 230, 0.14)';
  ctx.lineWidth = 1;

  const continents = [
    [[0.18, 0.24], [0.24, 0.18], [0.31, 0.2], [0.34, 0.28], [0.3, 0.38], [0.24, 0.42], [0.19, 0.35]],
    [[0.42, 0.2], [0.49, 0.16], [0.57, 0.19], [0.61, 0.28], [0.58, 0.36], [0.5, 0.39], [0.44, 0.31]],
    [[0.68, 0.24], [0.75, 0.2], [0.82, 0.24], [0.84, 0.33], [0.79, 0.41], [0.71, 0.39], [0.66, 0.31]],
    [[0.54, 0.56], [0.59, 0.5], [0.66, 0.52], [0.69, 0.61], [0.64, 0.72], [0.56, 0.7], [0.51, 0.62]],
    [[0.28, 0.58], [0.34, 0.54], [0.39, 0.58], [0.38, 0.66], [0.32, 0.72], [0.26, 0.67]]
  ];

  continents.forEach((shape, index) => {
    ctx.beginPath();
    shape.forEach(([px, py], pointIndex) => {
      const x = px * canvas.width + Math.sin(index + pointIndex) * 8;
      const y = py * canvas.height + Math.cos(index * 1.7 + pointIndex) * 6;
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = index % 2 === 0 ? 'rgba(28, 54, 64, 0.92)' : 'rgba(20, 44, 52, 0.88)';
    ctx.fill();
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(143, 214, 230, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i += 1) {
    const y = (i / 12) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let i = 1; i < 24; i += 1) {
    const x = (i / 24) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createNodeSpriteTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  const outer = ctx.createRadialGradient(center, center, 0, center, center, center);
  outer.addColorStop(0, 'rgba(200, 246, 255, 1)');
  outer.addColorStop(0.18, 'rgba(143, 214, 230, 0.95)');
  outer.addColorStop(0.42, 'rgba(109, 199, 218, 0.42)');
  outer.addColorStop(0.72, 'rgba(109, 199, 218, 0.12)');
  outer.addColorStop(1, 'rgba(109, 199, 218, 0)');

  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(center, center, center, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarfield(count = 1800, radius = 18) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color(0x8aa8b5);
  const colorB = new THREE.Color(0x8fd6e6);
  const temp = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const r = radius * (0.72 + Math.random() * 0.28);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    temp.copy(colorA).lerp(colorB, Math.random() * 0.5);
    colors[i * 3] = temp.r;
    colors[i * 3 + 1] = temp.g;
    colors[i * 3 + 2] = temp.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.028,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });

  return new THREE.Points(geometry, material);
}

function createAtmosphere(radius) {
  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      glowColor: { value: PALETTE.atmosphere },
      viewVector: { value: new THREE.Vector3(0, 0, 1) },
      intensity: { value: 0.9 }
    },
    vertexShader: `
      varying float vIntensity;
      uniform vec3 viewVector;
      uniform float intensity;
      void main() {
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vNormel = normalize(normalMatrix * viewVector);
        vIntensity = pow(intensity - dot(vNormal, vNormel), 3.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying float vIntensity;
      void main() {
        vec3 color = glowColor * vIntensity;
        gl_FragColor = vec4(color, vIntensity * 0.55);
      }
    `
  });

  return new THREE.Mesh(geometry, material);
}

function createNodeInstances(nodes, radius) {
  const geometry = new THREE.IcosahedronGeometry(0.015, 1);
  const material = new THREE