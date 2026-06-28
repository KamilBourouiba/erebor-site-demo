import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_OPTIONS = {
  globeRadius: 1,
  nodeCount: 72,
  linkCount: 120,
  autoRotate: true,
  autoRotateSpeed: 0.22,
  minDistance: 1.8,
  maxDistance: 5.5,
  backgroundAlpha: 0,
  atmosphereColor: 0x63d6ff,
  nodeColor: 0x8fe7ff,
  nodeActiveColor: 0xffffff,
  linkColor: 0x4fc3ff,
  glowColor: 0x63d6ff,
  surfaceColor: 0x0b1220,
  wireColor: 0x1a2a3d,
  onSelect: null,
  onHover: null,
  onReady: null,
};

const TMP_VEC2 = new THREE.Vector2();
const TMP_VEC3 = new THREE.Vector3();
const TMP_VEC3_B = new THREE.Vector3();
const TMP_VEC3_C = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_COLOR = new THREE.Color();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function randomLatLon(rng = Math.random) {
  const u = rng() * 2 - 1;
  const lon = rng() * 360 - 180;
  const lat = THREE.MathUtils.radToDeg(Math.asin(u));
  return { lat, lon };
}

function hashSeed(input) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function createDefaultNodes(count, radius) {
  const rng = hashSeed(`erebor-nodes-${count}-${radius}`);
  const regions = ['NA', 'EU', 'APAC', 'LATAM', 'MEA'];
  const types = ['repo', 'paper', 'place', 'person', 'org'];

  return Array.from({ length: count }, (_, index) => {
    const { lat, lon } = randomLatLon(rng);
    const weight = lerp(0.45, 1, rng());
    return {
      id: `node-${index + 1}`,
      label: `Entity ${String(index + 1).padStart(2, '0')}`,
      region: regions[index % regions.length],
      type: types[index % types.length],
      lat,
      lon,
      weight,
      intensity: lerp(0.55, 1, rng()),
      position: latLonToVector3(lat, lon, radius),
    };
  });
}

function createDefaultLinks(nodes, count) {
  const rng = hashSeed(`erebor-links-${nodes.length}-${count}`);
  const links = [];
  const used = new Set();

  let attempts = 0;
  while (links.length < count && attempts < count * 12) {
    attempts += 1;
    const a = Math.floor(rng() * nodes.length);
    const b = Math.floor(rng() * nodes.length);
    if (a === b) continue;

    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (used.has(key)) continue;
    used.add(key);

    const source = nodes[a];
    const target = nodes[b];
    const distance = source.position.distanceTo(target.position);

    links.push({
      id: `link-${links.length + 1}`,
      source: source.id,
      target: target.id,
      strength: clamp(1.35 - distance / 2.5, 0.25, 1),
      distance,
    });
  }

  return links;
}

function buildArcPoints(start, end, radius, segments = 48) {
  const points = [];
  const angle = start.angleTo(end);
  const normal = TMP_VEC3_C.copy(start).cross(end).normalize();

  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 1e-6) {
    normal.set(0, 1, 0);
  }

  const mid = TMP_VEC3_B.copy(start).add(end).normalize();
  const altitude = radius * lerp(0.12, 0.42, clamp(angle / Math.PI, 0, 1));
  const control = mid.multiplyScalar(radius + altitude);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const a = TMP_VEC3.clone ? null : null;
    const p0 = start;
    const p1 = control;
    const p2 = end;

    const oneMinusT = 1 - t;
    const point = new THREE.Vector3()
      .copy(p0)
      .multiplyScalar(oneMinusT * oneMinusT)
      .add(TMP_VEC3.set(0, 0, 0).copy(p1).multiplyScalar(2 * oneMinusT * t))
      .add(TMP_VEC3_B.set(0, 0, 0).copy(p2).multiplyScalar(t * t));

    points.push(point);
  }

  return points;
}

function createArcGeometry(start, end, radius) {
  const points = buildArcPoints(start, end, radius, 56);
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createEarthTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0f1a2a');
  gradient.addColorStop(0.5, '#0b1420');
  gradient.addColorStop(1, '#09111b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(99, 214, 255, 0.08)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 18; i += 1) {
    const y = (canvas.height / 18) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  for (let i = 0; i < 36; i += 1) {
    const x = (canvas.width / 36) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  const landColor = 'rgba(120, 180, 210, 0.08)';
  ctx.fillStyle = landColor;

  const blobs = [
    [0.18, 0.32, 0.12, 0.18],
    [0.28, 0.58, 0.1, 0.14],
    [0.48, 0.3, 0.16, 0.18],
    [0.52, 0.62, 0.08, 0.12],
    [0.72, 0.34, 0.18, 0.16],
    [0.82, 0.68, 0.08, 0.1],
  ];

  blobs.forEach(([x, y, w, h]) => {
    ctx.beginPath();
    ctx.ellipse(canvas.width * x, canvas.height * y, canvas.width * w, canvas.height * h, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createNodeSpriteTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(190,240,255,0.98)');
  gradient.addColorStop(0.42, 'rgba(99,214,255,0.5)');
  gradient.addColorStop(0.72, 'rgba(99,214,255,0.12)');
  gradient.addColorStop(1, 'rgba(99,214,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNodeMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHover: { value: -1 },
    },
    vertexShader: `
      attribute float aScale;
      attribute float aIntensity;
      attribute vec3 aColor;
      attribute float aIndex;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vIntensity;
      varying float vIndex;
      uniform float uTime;

      void main() {
        vUv = uv;
        vColor = aColor;
        vIntensity = aIntensity;
        vIndex = aIndex;

        vec3 transformed = position;
        float pulse = 1.0 + sin(uTime * 1.4 + aIndex * 0.37) * 0.08 * aIntensity;
        transformed.xy *= aScale * pulse;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uSelected;
      uniform float uHover;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vIntensity;
      varying float vIndex;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.02) discard;

        float selected = step(abs(vIndex - uSelected), 0.1);
        float hovered = step(abs(vIndex - uHover), 0.1);
        float emphasis = max(selected, hovered);
        vec3 color = mix(vColor, vec3(1.0), selected * 0.85 + hovered * 0.35);
        float alpha = tex.a * (0.42 + vIntensity * 0.58 + emphasis * 0.35);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createGlowMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: 2.8 },
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
      uniform vec3 uColor;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float intensity = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), uPower);
        gl_FragColor = vec4(uColor, intensity * 0.34);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export class GlobeScene {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('GlobeScene requires a container element.');
    }

    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(2, 2);

    this.renderer = null;
    this.camera = null;
    this.controls = null;

    this.root = new THREE.Group();
    this.globeGroup = new THREE.Group();
    this.nodeGroup = new THREE.Group();
    this.linkGroup = new THREE.Group();

    this.scene.add(this.root);
    this.root.add(this.globeGroup, this.linkGroup, this.nodeGroup);

    this.nodes = [];
    this.links = [];
    this.nodeIndexById = new Map();
    this.linkObjects = [];
    this.nodeMesh = null;
    this.nodeHitMesh = null;

    this.hoveredNodeIndex = -1;
    this.selectedNodeIndex = -1;
    this.isDisposed = false;
    this.animationFrame = 0;

    this._boundAnimate = this.animate.bind(this);
    this._boundResize = this.handleResize.bind(this);
    this._boundPointerMove = this.handlePointerMove.bind(this);
    this._boundPointerLeave = this.handlePointerLeave.bind(this);
    this._boundPointerDown = this.handlePointerDown.bind(this);
    this._boundClick = this.handleClick.bind(this);

    this.init();
  }

  init() {
    this.createRenderer();
    this.createCamera();
    this.createControls();
    this.createLights();
    this.createGlobe();
    this.setData(this.options.nodes, this.options.links);
    this.attachEvents();
    this.handleResize();
    this.animate();

    if (typeof this.options.onReady === 'function') {
      this.options.onReady(this);
    }
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: this.options.backgroundAlpha === 0,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, this.options.backgroundAlpha);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.container.appendChild(this.renderer.domElement);
  }

  createCamera() {
    const aspect = Math.max((this.container.clientWidth || 1) / Math.max(this.container.clientHeight || 1, 1), 1);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.01, 100);
    this.camera.position.set(0, 0.35, 3.15);
  }

  createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = this.options.minDistance;
    this.controls.maxDistance = this.options.maxDistance;
    this.controls.autoRotate = this.options.autoRotate;
    this.controls.autoRotateSpeed = this.options.autoRotateSpeed;
    this.controls.target.set(0, 0, 0);
  }

  createLights() {
    const ambient = new THREE.AmbientLight(0x9bb8d1, 0.55);
    const key = new THREE.DirectionalLight(0x9fd8ff, 1.35);
    key.position.set(3.5, 2.2, 4.5);

    const rim = new THREE.DirectionalLight(0x2f7dff, 0.55);
    rim.position.set(-4, -1.5, -3);

    this.scene.add(ambient, key, rim);
  }

  createGlobe() {
    const radius = this.options.globeRadius;
    const earthTexture = createEarthTexture();

    const globeGeometry = new THREE.SphereGeometry(radius, 96, 96);
    const globeMaterial = new THREE.MeshStandardMaterial({
      color: this.options.surfaceColor,
      map: earthTexture,
      roughness: 0.92,
      metalness: 0.08,
      emissive: new THREE.Color(0x0d1b2d),
      emissiveIntensity: 0.55,
    });

    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    this.globeGroup.add(globe);
    this.globeMesh = globe;

    const wireGeometry = new THREE.SphereGeometry(radius * 1.002, 48, 48);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: this.options.wireColor,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const wire = new THREE.Mesh(wireGeometry, wireMaterial);
    this.globeGroup.add(wire);
    this.globeWire = wire;