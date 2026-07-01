import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DEFAULT_OPTIONS = {
  globeRadius: 1.18,
  nodeCount: 180,
  linkCount: 120,
  autoRotate: true,
  autoRotateSpeed: 0.22,
  minDistance: 2.1,
  maxDistance: 5.2,
  backgroundAlpha: 0,
};

const NODE_COLORS = {
  default: new THREE.Color("#7db9ff"),
  active: new THREE.Color("#ffffff"),
  selected: new THREE.Color("#9fd0ff"),
  dim: new THREE.Color("#4f6b8f"),
};

const LINK_COLORS = {
  default: new THREE.Color("#5ea8ff"),
  selected: new THREE.Color("#cfe6ff"),
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

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function randomLatLon() {
  const u = Math.random();
  const v = Math.random();
  const lat = THREE.MathUtils.radToDeg(Math.asin(2 * u - 1));
  const lon = 360 * v - 180;
  return { lat, lon };
}

function createNodeDataset(count, radius) {
  const nodes = [];
  const labels = [
    "Maintainer",
    "Repository",
    "Author",
    "Institution",
    "Signal",
    "Issue",
    "Paper",
    "Location",
    "Package",
    "Identity",
  ];

  for (let i = 0; i < count; i += 1) {
    const { lat, lon } = randomLatLon();
    const position = latLonToVector3(lat, lon, radius);
    const weight = Math.random();
    const size = lerp(0.018, 0.05, Math.pow(weight, 1.4));
    const pulse = lerp(0.6, 1.8, Math.random());
    const hueShift = lerp(-0.03, 0.05, Math.random());

    nodes.push({
      id: `node-${i + 1}`,
      index: i,
      label: `${labels[i % labels.length]} ${String(i + 1).padStart(3, "0")}`,
      lat,
      lon,
      position,
      size,
      weight,
      pulse,
      hueShift,
      links: [],
    });
  }

  return nodes;
}

function createLinkDataset(nodes, count, radius) {
  const links = [];
  const used = new Set();
  const maxAttempts = count * 12;
  let attempts = 0;

  while (links.length < count && attempts < maxAttempts) {
    attempts += 1;
    const a = Math.floor(Math.random() * nodes.length);
    const b = Math.floor(Math.random() * nodes.length);

    if (a === b) continue;

    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (used.has(key)) continue;

    const source = nodes[a];
    const target = nodes[b];
    const distance = source.position.distanceTo(target.position);
    if (distance < radius * 0.35 || distance > radius * 1.95) continue;

    used.add(key);

    const strength = Math.random();
    const altitude = lerp(radius * 0.08, radius * 0.34, strength);
    const width = lerp(0.0025, 0.008, Math.pow(strength, 1.2));

    const link = {
      id: `link-${links.length + 1}`,
      index: links.length,
      sourceIndex: a,
      targetIndex: b,
      source,
      target,
      strength,
      altitude,
      width,
      progress: Math.random(),
      speed: lerp(0.12, 0.42, Math.random()),
    };

    source.links.push(link.index);
    target.links.push(link.index);
    links.push(link);
  }

  return links;
}

function buildArcPoints(start, end, radius, altitude, segments = 48) {
  const points = [];
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const midDir = mid.clone().normalize().multiplyScalar(radius + altitude);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const a = start.clone().lerp(midDir, t);
    const b = midDir.clone().lerp(end, t);
    const point = a.lerp(b, t);
    points.push(point);
  }

  return points;
}

function createAtmosphere(radius) {
  const geometry = new THREE.SphereGeometry(radius * 1.065, 48, 48);
  const material = new THREE.MeshBasicMaterial({
    color: "#5ea8ff",
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

function createGlobe(radius) {
  const group = new THREE.Group();

  const globeGeometry = new THREE.SphereGeometry(radius, 96, 96);
  const globeMaterial = new THREE.MeshPhysicalMaterial({
    color: "#0b1119",
    metalness: 0.18,
    roughness: 0.72,
    clearcoat: 0.18,
    clearcoatRoughness: 0.58,
    emissive: "#07111d",
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.98,
  });

  const globe = new THREE.Mesh(globeGeometry, globeMaterial);
  globe.name = "globe-core";
  group.add(globe);

  const wireGeometry = new THREE.SphereGeometry(radius * 1.002, 36, 36);
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: "#27415f",
    wireframe: true,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const wire = new THREE.Mesh(wireGeometry, wireMaterial);
  wire.name = "globe-wire";
  group.add(wire);

  const atmosphere = createAtmosphere(radius);
  atmosphere.name = "globe-atmosphere";
  group.add(atmosphere);

  return { group, globe, wire, atmosphere };
}

function createNodeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHover: { value: -1 },
    },
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceSize;
      attribute float instancePulse;
      attribute float instanceIndex;
      varying vec3 vColor;
      varying float vPulse;
      varying float vIndex;
      varying float vSelected;
      varying float vHover;

      uniform float uTime;
      uniform float uSelected;
      uniform float uHover;

      void main() {
        vColor = instanceColor;
        vPulse = instancePulse;
        vIndex = instanceIndex;
        vSelected = step(abs(instanceIndex - uSelected), 0.1);
        vHover = step(abs(instanceIndex - uHover), 0.1);

        vec3 transformed = position * instanceSize;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);

        float pulse = 1.0 + sin(uTime * (1.2 + instancePulse) + instanceIndex * 0.37) * 0.18;
        float emphasis = 1.0 + vSelected * 0.55 + vHover * 0.28;
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = 0.0;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPulse;
      varying float vSelected;
      varying float vHover;

      void main() {
        vec2 uv = gl_PointCoord.xy - 0.5;
        float dist = length(uv);
        float alpha = smoothstep(0.5, 0.0, dist);
        vec3 color = vColor;
        float glow = 1.0 + vSelected * 0.85 + vHover * 0.35;
        gl_FragColor = vec4(color * glow, alpha);
      }
    `,
  });
}

function createNodeMesh(nodes) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshBasicMaterial({
    color: "#7db9ff",
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, nodes.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = "globe-nodes";

  const colorArray = new Float32Array(nodes.length * 3);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    dummy.position.copy(node.position);
    dummy.scale.setScalar(node.size);
    dummy.lookAt(node.position.clone().multiplyScalar(2));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const color = NODE_COLORS.default.clone().offsetHSL(node.hueShift, 0, lerp(-0.08, 0.12, node.weight));
    node.baseColor = color;
    color.toArray(colorArray, i * 3);
    mesh.setColorAt(i, color);
  }

  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
  mesh.geometry.setAttribute("instanceColor", mesh.instanceColor);

  return mesh;
}

function createNodeHaloMesh(nodes) {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHover: { value: -1 },
    },
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceSize;
      attribute float instancePulse;
      attribute float instanceIndex;

      varying vec3 vColor;
      varying float vPulse;
      varying float vSelected;
      varying float vHover;

      uniform float uTime;
      uniform float uSelected;
      uniform float uHover;

      void main() {
        vColor = instanceColor;
        vPulse = instancePulse;
        vSelected = step(abs(instanceIndex - uSelected), 0.1);
        vHover = step(abs(instanceIndex - uHover), 0.1);

        vec3 billboardRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
        vec3 billboardUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);

        vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 mvCenter = viewMatrix * worldCenter;

        float pulse = 1.0 + sin(uTime * (1.4 + instancePulse) + instanceIndex * 0.41) * 0.16;
        float emphasis = 1.0 + vSelected * 0.9 + vHover * 0.45;
        float scale = instanceSize * 7.5 * pulse * emphasis;

        vec3 offset = (position.x * billboardRight + position.y * billboardUp) * scale;
        vec4 mvPosition = mvCenter + vec4(offset, 0.0);

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSelected;
      varying float vHover;

      void main() {
        vec2 uv = position.xy;
        float dist = length(uv);
        float core = smoothstep(0.28, 0.0, dist);
        float halo = smoothstep(0.9, 0.18, dist);
        float alpha = halo * 0.22 + core * 0.55;
        vec3 color = vColor * (1.0 + vSelected * 0.8 + vHover * 0.35);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, nodes.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = "globe-node-halos";

  const colorArray = new Float32Array(nodes.length * 3);
  const sizeArray = new Float32Array(nodes.length);
  const pulseArray = new Float32Array(nodes.length);
  const indexArray = new Float32Array(nodes.length);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    dummy.position.copy(node.position);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    node.baseColor.toArray(colorArray, i * 3);
    sizeArray[i] = node.size;
    pulseArray[i] = node.pulse;
    indexArray[i] = i;
  }

  mesh.geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
  mesh.geometry.setAttribute("instanceSize", new THREE.InstancedBufferAttribute(sizeArray, 1));
  mesh.geometry.setAttribute("instancePulse", new THREE.InstancedBufferAttribute(pulseArray, 1));
  mesh.geometry.setAttribute("instanceIndex", new THREE.InstancedBufferAttribute(indexArray, 1));

  return mesh;
}

function createLinksGroup(links, radius) {
  const group = new THREE.Group();
  group.name = "globe-links";

  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const points = buildArcPoints(link.source.position, link.target.position, radius, link.altitude, 56);
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
    const tubeGeometry = new THREE.TubeGeometry(curve, 56, link.width, 6, false);
    const material = new THREE.MeshBasicMaterial({
      color: LINK_COLORS.default.clone().lerp(new THREE.Color("#9fd0ff"), link.strength * 0.35),
      transparent: true,
      opacity: lerp(0.18, 0.52, link.strength),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(tubeGeometry, material);
    mesh.renderOrder = 2;
    mesh.userData.linkIndex = i;
    mesh.userData.linkId = link.id;
    mesh.name = `arc-${i}`;
    group.add(mesh);

    const headGeometry = new THREE.SphereGeometry(link.width * 2.8, 10, 10);
    const headMaterial = new THREE.MeshBasicMaterial({
      color: "#d8ebff",
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.copy(curve.getPointAt(link.progress));
    head.renderOrder = 3;
    head.userData.linkIndex = i;
    head.name = `arc-head-${i}`;
    group.add(head);

    link.curve = curve;
    link.mesh = mesh;
    link.head = head;
    link.baseOpacity = material.opacity;
    link.baseColor = material.color.clone();
  }

  return group;
}

function createStars(count = 1200, radius = 18) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color("#8fbfff");
  const colorB = new THREE.Color("#ffffff");

  for (let i = 0; i < count; i += 1) {
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(lerp(radius * 0.72, radius, Math.random()));
    positions[i * 3 + 0] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;

    colorA.clone().lerp(colorB, Math.random()).toArray(colors, i * 3);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const stars = new THREE.Points(geometry, material);
  stars.name = "background-stars";
  return stars;
}

export class EreborGlobeScene {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("EreborGlobeScene requires a container element.");
    }

    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.camera = new THREE.PerspectiveCamera(42,