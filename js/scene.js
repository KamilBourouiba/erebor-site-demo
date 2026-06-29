import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_OPTIONS = {
  radius: 1,
  nodeCount: 180,
  linkCount: 120,
  autoRotate: true,
  autoRotateSpeed: 0.22,
  minDistance: 1.8,
  maxDistance: 5.5,
  initialDistance: 2.85,
  backgroundAlpha: 0,
  onSelect: null,
  onHover: null,
  onReady: null,
};

const NODE_COLORS = {
  neutral: new THREE.Color('#6f829d'),
  cyan: new THREE.Color('#4fc0de'),
  amber: new THREE.Color('#c9871d'),
  red: new THREE.Color('#d96c6c'),
};

const ARC_VERTEX_SHADER = `
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vAlpha = alpha;
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const ARC_FRAGMENT_SHADER = `
varying float vAlpha;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
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

function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function vector3ToLatLon(vector) {
  const normalized = vector.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(clamp(normalized.y, -1, 1)));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, -normalized.x)) - 180;
  return {
    lat,
    lon: ((lon + 540) % 360) - 180,
  };
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createEarthTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#0f1822');
  ocean.addColorStop(0.5, '#0b1118');
  ocean.addColorStop(1, '#070b10');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 14; i += 1) {
    const x = (i / 14) * width;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(79,192,222,0.08)' : 'rgba(201,135,29,0.05)';
    ctx.fillRect(x, 0, width / 28, height);
  }
  ctx.globalAlpha = 1;

  const drawBlob = (points, fill, stroke) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0] * width, points[0][1] * height);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0] * width, points[i][1] * height);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const landFill = '#18232f';
  const landStroke = 'rgba(111,130,157,0.18)';

  drawBlob([
    [0.08, 0.22], [0.14, 0.16], [0.22, 0.18], [0.28, 0.24], [0.29, 0.34], [0.24, 0.42],
    [0.18, 0.44], [0.12, 0.38], [0.09, 0.3],
  ], landFill, landStroke);

  drawBlob([
    [0.18, 0.48], [0.24, 0.46], [0.28, 0.52], [0.26, 0.66], [0.22, 0.8], [0.16, 0.72], [0.14, 0.58],
  ], landFill, landStroke);

  drawBlob([
    [0.42, 0.18], [0.52, 0.16], [0.62, 0.2], [0.68, 0.28], [0.66, 0.36], [0.58, 0.38],
    [0.52, 0.34], [0.46, 0.28],
  ], landFill, landStroke);

  drawBlob([
    [0.48, 0.4], [0.56, 0.42], [0.62, 0.5], [0.6, 0.62], [0.54, 0.68], [0.46, 0.62], [0.44, 0.5],
  ], landFill, landStroke);

  drawBlob([
    [0.72, 0.22], [0.8, 0.18], [0.9, 0.24], [0.92, 0.34], [0.86, 0.42], [0.76, 0.4], [0.7, 0.3],
  ], landFill, landStroke);

  drawBlob([
    [0.82, 0.58], [0.88, 0.56], [0.92, 0.64], [0.9, 0.78], [0.84, 0.84], [0.8, 0.72],
  ], landFill, landStroke);

  ctx.strokeStyle = 'rgba(79,192,222,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i += 1) {
    const y = (i / 12) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let i = 1; i < 24; i += 1) {
    const x = (i / 24) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      glowColor: { value: new THREE.Color('#4fc0de') },
      intensity: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), 2.4);
        float alpha = fresnel * intensity;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
  });
}

function createArcPoints(start, end, radius, segments = 44) {
  const startNorm = start.clone().normalize();
  const endNorm = end.clone().normalize();
  const angle = startNorm.angleTo(endNorm);
  const distance = start.distanceTo(end);
  const altitude = radius * lerp(0.08, 0.34, clamp(distance / (radius * 2), 0, 1));
  const points = [];
  const midpoint = start.clone().add(end).normalize().multiplyScalar(radius + altitude);

  const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const lift = Math.sin(Math.PI * t) * altitude * 0.18;
    point.normalize().multiplyScalar(point.length() + lift);
    points.push(point);
  }

  return points;
}

function buildArcGeometry(links, radius) {
  const positions = [];
  const colors = [];
  const alphas = [];
  const meta = [];

  links.forEach((link, linkIndex) => {
    const points = createArcPoints(link.source.position, link.target.position, radius, 48);
    const color = link.color || NODE_COLORS.cyan;
    const alphaBase = link.strength ?? 0.42;

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const t = i / (points.length - 1);
      const fade = Math.sin(Math.PI * t);
      const alpha = alphaBase * easeOutQuad(fade);

      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);

      for (let j = 0; j < 2; j += 1) {
        colors.push(color.r, color.g, color.b);
        alphas.push(alpha);
      }

      meta.push({
        linkIndex,
        segmentIndex: i,
        start: a.clone(),
        end: b.clone(),
      });
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  return { geometry, meta };
}

function createNodeMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
  });
}

function createNodePickMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
}

function createNodeGeometry() {
  return new THREE.PlaneGeometry(1, 1, 1, 1);
}

function createNodeData(count, radius, seed = 'erebor-globe') {
  const random = mulberry32(hashString(seed));
  const anchors = [
    { id: 'nyc', label: 'New York', lat: 40.7128, lon: -74.006, tier: 'hub', weight: 1 },
    { id: 'london', label: 'London', lat: 51.5072, lon: -0.1276, tier: 'hub', weight: 1 },
    { id: 'singapore', label: 'Singapore', lat: 1.3521, lon: 103.8198, tier: 'hub', weight: 1 },
    { id: 'tokyo', label: 'Tokyo', lat: 35.6762, lon: 139.6503, tier: 'hub', weight: 1 },
    { id: 'sydney', label: 'Sydney', lat: -33.8688, lon: 151.2093, tier: 'hub', weight: 1 },
    { id: 'berlin', label: 'Berlin', lat: 52.52, lon: 13.405, tier: 'relay', weight: 0.8 },
    { id: 'nairobi', label: 'Nairobi', lat: -1.2864, lon: 36.8172, tier: 'relay', weight: 0.72 },
    { id: 'sao-paulo', label: 'São Paulo', lat: -23.5505, lon: -46.6333, tier: 'relay', weight: 0.76 },
    { id: 'dubai', label: 'Dubai', lat: 25.2048, lon: 55.2708, tier: 'relay', weight: 0.7 },
    { id: 'delhi', label: 'Delhi', lat: 28.6139, lon: 77.209, tier: 'relay', weight: 0.74 },
  ];

  const nodes = anchors.map((anchor, index) => {
    const position = latLonToVector3(anchor.lat, anchor.lon, radius * 1.008);
    return {
      ...anchor,
      index,
      position,
      color: anchor.tier === 'hub' ? NODE_COLORS.amber.clone() : NODE_COLORS.cyan.clone(),
      size: anchor.tier === 'hub' ? 0.05 : 0.036,
      pulse: random(),
      intensity: anchor.tier === 'hub' ? 1 : 0.72,
      source: 'anchor',
    };
  });

  while (nodes.length < count) {
    const u = random();
    const v = random();
    const lat = THREE.MathUtils.radToDeg(Math.asin(2 * u - 1));
    const lon = v * 360 - 180;
    const position = latLonToVector3(lat, lon, radius * lerp(1.004, 1.018, random()));
    const tierRoll = random();
    const tier = tierRoll > 0.92 ? 'hotspot' : tierRoll > 0.68 ? 'relay' : 'edge';

    nodes.push({
      id: `node-${nodes.length}`,
      label: tier === 'hotspot' ? 'Priority Signal' : tier === 'relay' ? 'Relay Node' : 'Observed Entity',
      lat,
      lon,
      tier,
      index: nodes.length,
      position,
      color:
        tier === 'hotspot'
          ? NODE_COLORS.amber.clone()
          : tier === 'relay'
            ? NODE_COLORS.cyan.clone()
            : NODE_COLORS.neutral.clone().lerp(NODE_COLORS.cyan, 0.18),
      size: tier === 'hotspot' ? 0.042 : tier === 'relay' ? 0.03 : 0.022,
      pulse: random(),
      intensity: tier === 'hotspot' ? 0.9 : tier === 'relay' ? 0.68 : 0.42,
      source: 'generated',
    });
  }

  return nodes;
}

function createLinkData(nodes, count, seed = 'erebor-links') {
  const random = mulberry32(hashString(seed));
  const links = [];
  const hubs = nodes.filter((node) => node.tier === 'hub');
  const relays = nodes.filter((node) => node.tier === 'relay' || node.tier === 'hotspot');
  const all = [...nodes];

  const used = new Set();

  const addLink = (source, target, strength, color) => {
    if (!source || !target || source.index === target.index) return;
    const key = source.index < target.index ? `${source.index}:${target.index}` : `${target.index}:${source.index}`;
    if (used.has(key)) return;
    used.add(key);
    links.push({
      id: `link-${links.length}`,
      source,
      target,
      strength,
      color,
    });
  };

  for (let i =