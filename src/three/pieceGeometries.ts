import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
import type { PieceType } from '../types';
import { assetUrl } from '../utils/assetUrl';

/**
 * Procedural 3D geometries for luxury Staunton chess pieces matching the orthographic reference image:
 * - Shared architectural pedestal: flat bottom foot -> recessed notch -> large smooth torus bead -> deep concave scotia flare -> collar step
 * - Pawn: Slender concave stem, prominent saucer collar ring, and smooth spherical head
 * - Rook: Solid column, waist collar bead, conical turret with 4 deep rectangular merlons and recessed deck
 * - Knight: Sculpted horse head with arched neck, segmented comb mane ridges along the crest, pointed ears, eye contour, nostrils, and parted mouth slit
 * - Bishop: Slender stem, pronounced rounded torus waist ring, acorn miter head with deep diagonal cleft, and apex finial ball
 * - Queen: Tall hourglass stem, double waist collar, flared chalice coronet with pearl-tipped scalloped petals and central pearl finial
 * - King: Tallest stately piece, double collar gallery, flared dish bowl with domed inner cap, and Cross Pattée finial
 */

// Cached geometries to maximize rendering performance
const geometryCache: Map<PieceType, THREE.BufferGeometry> = new Map();

// Listeners for when the asynchronous Knight GLTF model completes loading
const knightLoadedCallbacks: Array<(geom: THREE.BufferGeometry) => void> = [];
let isKnightGLTFLoading = false;
let isKnightGLTFLoaded = false;

// Listeners for when the asynchronous Rook GLTF model completes loading
const rookLoadedCallbacks: Array<(geom: THREE.BufferGeometry) => void> = [];
let isRookGLTFLoading = false;
let isRookGLTFLoaded = false;

/**
 * Loads the dedicated, optimized GLTF asset for the Rook piece (/models/rook.glb)
 * and notifies listeners to hot-swap active board piece geometries.
 */
export function loadRookGLTFGeometry(callback?: (geom: THREE.BufferGeometry) => void): void {
  if (callback) {
    if (isRookGLTFLoaded && geometryCache.has('r')) {
      callback(geometryCache.get('r')!);
      return;
    }
    rookLoadedCallbacks.push(callback);
  }

  if (isRookGLTFLoading) return;
  isRookGLTFLoading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetUrl('models/rook.glb'),
    (gltf) => {
      let gltfGeom: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !gltfGeom) {
          gltfGeom = (child as THREE.Mesh).geometry;
        }
      });

      if (gltfGeom) {
        gltfGeom.computeVertexNormals();
        isRookGLTFLoaded = true;
        geometryCache.set('r', gltfGeom);
        rookLoadedCallbacks.forEach((cb) => cb(gltfGeom!));
        rookLoadedCallbacks.length = 0;
      }
    },
    undefined,
    (err) => {
      console.warn('Note: GLTF rook asset loading fallback to procedural geometry:', err);
    }
  );
}

// Listeners for when the asynchronous Bishop GLTF model completes loading
const bishopLoadedCallbacks: Array<(geom: THREE.BufferGeometry) => void> = [];
let isBishopGLTFLoading = false;
let isBishopGLTFLoaded = false;

/**
 * Loads the dedicated, optimized GLTF asset for the Bishop piece (/models/bishop.glb)
 * and notifies listeners to hot-swap active board piece geometries.
 */
export function loadBishopGLTFGeometry(callback?: (geom: THREE.BufferGeometry) => void): void {
  if (callback) {
    if (isBishopGLTFLoaded && geometryCache.has('b')) {
      callback(geometryCache.get('b')!);
      return;
    }
    bishopLoadedCallbacks.push(callback);
  }

  if (isBishopGLTFLoading) return;
  isBishopGLTFLoading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetUrl('models/bishop.glb'),
    (gltf) => {
      let gltfGeom: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !gltfGeom) {
          gltfGeom = (child as THREE.Mesh).geometry;
        }
      });

      if (gltfGeom) {
        gltfGeom.computeVertexNormals();
        isBishopGLTFLoaded = true;
        geometryCache.set('b', gltfGeom);
        bishopLoadedCallbacks.forEach((cb) => cb(gltfGeom!));
        bishopLoadedCallbacks.length = 0;
      }
    },
    undefined,
    (err) => {
      console.warn('Note: GLTF bishop asset loading fallback to procedural geometry:', err);
    }
  );
}

// Listeners for when the asynchronous Queen GLTF model completes loading
const queenLoadedCallbacks: Array<(geom: THREE.BufferGeometry) => void> = [];
let isQueenGLTFLoading = false;
let isQueenGLTFLoaded = false;

/**
 * Loads the dedicated, optimized GLTF asset for the Queen piece (/models/queen.glb)
 * and notifies listeners to hot-swap active board piece geometries.
 */
export function loadQueenGLTFGeometry(callback?: (geom: THREE.BufferGeometry) => void): void {
  if (callback) {
    if (isQueenGLTFLoaded && geometryCache.has('q')) {
      callback(geometryCache.get('q')!);
      return;
    }
    queenLoadedCallbacks.push(callback);
  }

  if (isQueenGLTFLoading) return;
  isQueenGLTFLoading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetUrl('models/queen.glb'),
    (gltf) => {
      let gltfGeom: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !gltfGeom) {
          gltfGeom = (child as THREE.Mesh).geometry;
        }
      });

      if (gltfGeom) {
        gltfGeom.computeVertexNormals();
        isQueenGLTFLoaded = true;
        geometryCache.set('q', gltfGeom);
        queenLoadedCallbacks.forEach((cb) => cb(gltfGeom!));
        queenLoadedCallbacks.length = 0;
      }
    },
    undefined,
    (err) => {
      console.warn('Note: GLTF queen asset loading fallback to procedural geometry:', err);
    }
  );
}

// Listeners for when the asynchronous King GLTF model completes loading
const kingLoadedCallbacks: Array<(geom: THREE.BufferGeometry) => void> = [];
let isKingGLTFLoading = false;
let isKingGLTFLoaded = false;

/**
 * Loads the dedicated, optimized GLTF asset for the King piece (/models/king.glb)
 * and notifies listeners to hot-swap active board piece geometries.
 */
export function loadKingGLTFGeometry(callback?: (geom: THREE.BufferGeometry) => void): void {
  if (callback) {
    if (isKingGLTFLoaded && geometryCache.has('k')) {
      callback(geometryCache.get('k')!);
      return;
    }
    kingLoadedCallbacks.push(callback);
  }

  if (isKingGLTFLoading) return;
  isKingGLTFLoading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetUrl('models/king.glb'),
    (gltf) => {
      let gltfGeom: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !gltfGeom) {
          gltfGeom = (child as THREE.Mesh).geometry;
        }
      });

      if (gltfGeom) {
        gltfGeom.computeVertexNormals();
        isKingGLTFLoaded = true;
        geometryCache.set('k', gltfGeom);
        kingLoadedCallbacks.forEach((cb) => cb(gltfGeom!));
        kingLoadedCallbacks.length = 0;
      }
    },
    undefined,
    (err) => {
      console.warn('Note: GLTF king asset loading fallback to procedural geometry:', err);
    }
  );
}

/**
 * Loads the dedicated, optimized GLTF asset for the Knight piece (/models/knight.glb)
 * and notifies listeners to hot-swap active board piece geometries.
 */
export function loadKnightGLTFGeometry(callback?: (geom: THREE.BufferGeometry) => void): void {
  if (callback) {
    if (isKnightGLTFLoaded && geometryCache.has('n')) {
      callback(geometryCache.get('n')!);
      return;
    }
    knightLoadedCallbacks.push(callback);
  }

  if (isKnightGLTFLoading) return;
  isKnightGLTFLoading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetUrl('models/knight.glb'),
    (gltf) => {
      let gltfGeom: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !gltfGeom) {
          gltfGeom = (child as THREE.Mesh).geometry;
        }
      });

      if (gltfGeom) {
        gltfGeom.computeVertexNormals();
        isKnightGLTFLoaded = true;
        geometryCache.set('n', gltfGeom);
        knightLoadedCallbacks.forEach((cb) => cb(gltfGeom!));
        knightLoadedCallbacks.length = 0;
      }
    },
    undefined,
    (err) => {
      console.warn('Note: GLTF knight asset loading fallback to procedural geometry:', err);
    }
  );
}

/**
 * Lathe generator with smooth normals and high radial resolution
 */
function createLathePiece(points: THREE.Vector2[], segments = 64): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

export function getPieceGeometry(type: PieceType): THREE.BufferGeometry {
  if (geometryCache.has(type)) {
    return geometryCache.get(type)!;
  }

  let geom: THREE.BufferGeometry;

  switch (type) {
    case 'p':
      geom = createPawnGeometry();
      break;
    case 'r':
      geom = createRookGeometry();
      break;
    case 'n':
      geom = createKnightGeometry();
      break;
    case 'b':
      geom = createBishopGeometry();
      break;
    case 'q':
      geom = createQueenGeometry();
      break;
    case 'k':
      geom = createKingGeometry();
      break;
    default:
      geom = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 32);
  }

  geometryCache.set(type, geom);
  return geom;
}

/**
 * Generates the clean, architectural pedestal profile matching the reference image:
 * Flat base -> Beveled foot -> Recessed step -> Large rounded Torus bead -> Deep concave scotia flare -> Collar ring
 */
function getBaseProfile(baseRadius = 0.44, waistRadius = 0.22, height = 0.38): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];

  // 1. Bottom face & vertical foot
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(baseRadius * 0.95, 0));
  points.push(new THREE.Vector2(baseRadius, 0.02)); // Rounded bottom corner
  points.push(new THREE.Vector2(baseRadius, 0.045)); // Vertical foot rim

  // 2. Recessed step
  points.push(new THREE.Vector2(baseRadius * 0.935, 0.055));
  points.push(new THREE.Vector2(baseRadius * 0.940, 0.075));

  // 3. Large, smooth Torus Bead Ring (convex circular profile)
  const torusCenterY = 0.135;
  const torusR = 0.055;
  const torusBaseline = baseRadius * 0.93;
  const torusSteps = 16;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseline + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * torusR;
    points.push(new THREE.Vector2(r, y));
  }

  // 4. Deep Concave Throat Flare (Scotia curve)
  points.push(new THREE.Vector2(baseRadius * 0.85, 0.205));
  points.push(new THREE.Vector2(baseRadius * 0.77, 0.240));
  points.push(new THREE.Vector2(baseRadius * 0.69, 0.280));
  points.push(new THREE.Vector2(baseRadius * 0.63, 0.315));
  points.push(new THREE.Vector2(baseRadius * 0.60, 0.340));

  // 5. Collar Ring
  points.push(new THREE.Vector2(baseRadius * 0.66, 0.355));
  points.push(new THREE.Vector2(baseRadius * 0.67, 0.365));
  points.push(new THREE.Vector2(baseRadius * 0.63, 0.372)); // Step

  // 6. Transition step to column waist
  points.push(new THREE.Vector2(waistRadius, height));

  return points;
}

/**
 * 1. PAWN: Slender concave stem, prominent saucer collar ring, and smooth spherical head
 */
function createPawnGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = getBaseProfile(0.40, 0.19, 0.38);

  // Slender concave stem narrowing at waist then gently flaring up
  points.push(new THREE.Vector2(0.170, 0.48));
  points.push(new THREE.Vector2(0.145, 0.62));
  points.push(new THREE.Vector2(0.138, 0.72));
  points.push(new THREE.Vector2(0.155, 0.81));

  // Distinct saucer collar disc matching reference image
  points.push(new THREE.Vector2(0.245, 0.835));
  points.push(new THREE.Vector2(0.255, 0.855));
  points.push(new THREE.Vector2(0.245, 0.875));
  points.push(new THREE.Vector2(0.180, 0.895));

  // Small neck cylinder beneath head
  points.push(new THREE.Vector2(0.135, 0.915));
  points.push(new THREE.Vector2(0.130, 0.950));

  // Smooth spherical head (radius 0.22, center y = 1.14)
  const headCenterY = 1.14;
  const headRadius = 0.22;
  const numSteps = 26;
  for (let i = 0; i <= numSteps; i++) {
    const angle = -Math.PI / 2 + (i / numSteps) * Math.PI;
    const px = Math.cos(angle) * headRadius;
    const py = headCenterY + Math.sin(angle) * headRadius;
    if (px >= 0 && py >= 0.95) {
      points.push(new THREE.Vector2(px, py));
    }
  }
  points.push(new THREE.Vector2(0, headCenterY + headRadius));

  return createLathePiece(points, 64);
}

/**
 * 2. ROOK: Castle turret matching user reference image:
 * - Broad, plump rounded cushion base with a fine horizontal groove indent
 * - Smooth unadorned concave tapering tower trunk (no extra mid-stem collar beads)
 * - Under-turret collar bead and undercut chamfer
 * - Sturdy cylindrical castle turret / parapet with deep inner floor basin
 * - 4 clean rectangular embrasures (crenels) cut into the battlements via CSG
 */
function createRookGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];

  // 1. Base underside
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(0.40, 0));
  points.push(new THREE.Vector2(0.425, 0.015));

  // Tier 1: Plump lower rounded torus cushion (y: 0.015 to 0.125)
  const torusSteps = 16;
  const torusCenterY = 0.075;
  const torusR = 0.052;
  const torusBaseX = 0.395;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseX + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * 0.055;
    points.push(new THREE.Vector2(r, y));
  }

  // Tier 2: Fine horizontal recessed groove line (y: 0.130 to 0.150)
  points.push(new THREE.Vector2(0.405, 0.132));
  points.push(new THREE.Vector2(0.388, 0.140)); // Groove valley
  points.push(new THREE.Vector2(0.400, 0.148));

  // Tier 3: Conical base bell flare rising into the trunk
  points.push(new THREE.Vector2(0.385, 0.170));
  points.push(new THREE.Vector2(0.345, 0.220));
  points.push(new THREE.Vector2(0.300, 0.270));
  points.push(new THREE.Vector2(0.265, 0.320));
  points.push(new THREE.Vector2(0.240, 0.360));

  // 2. Continuous, elegant concave tapering tower trunk (clean and unadorned)
  points.push(new THREE.Vector2(0.222, 0.420));
  points.push(new THREE.Vector2(0.198, 0.520));
  points.push(new THREE.Vector2(0.180, 0.630)); // Gentle waist
  points.push(new THREE.Vector2(0.184, 0.730));
  points.push(new THREE.Vector2(0.200, 0.810));
  points.push(new THREE.Vector2(0.222, 0.880));

  // 3. Collar bead directly under the turret
  points.push(new THREE.Vector2(0.242, 0.910));
  points.push(new THREE.Vector2(0.252, 0.928)); // Rounded collar ring
  points.push(new THREE.Vector2(0.238, 0.942)); // Undercut notch

  // 4. Turret outer rim & rampart
  points.push(new THREE.Vector2(0.282, 0.952)); // Chamfer out
  points.push(new THREE.Vector2(0.292, 0.975)); // Lower corner of turret
  points.push(new THREE.Vector2(0.296, 1.080));
  points.push(new THREE.Vector2(0.294, 1.205)); // Top outer rim of merlon
  points.push(new THREE.Vector2(0.286, 1.220)); // Rounded outer crown chamfer
  points.push(new THREE.Vector2(0.245, 1.220)); // Merlon top crest landing
  points.push(new THREE.Vector2(0.232, 1.205)); // Rounded inner crown chamfer

  // 5. Sunken inner parapet floor basin
  points.push(new THREE.Vector2(0.228, 1.115)); // Inner vertical wall
  points.push(new THREE.Vector2(0.218, 1.100)); // Inner floor fillet
  points.push(new THREE.Vector2(0, 1.100));     // Center of sunken floor

  const lathe = createLathePiece(points, 64);

  // 6. Perform CSG Boolean Subtraction for the 4 symmetrical crenel embrasures
  const crenelWidth = 0.072;
  const crenelHeight = 0.140;
  const cutterLength = 0.680;

  const cutterX = new THREE.BoxGeometry(cutterLength, crenelHeight, crenelWidth);
  cutterX.translate(0, 1.170, 0);

  const cutterZ = new THREE.BoxGeometry(crenelWidth, crenelHeight, cutterLength);
  cutterZ.translate(0, 1.170, 0);

  const cuttersMerged = BufferGeometryUtils.mergeGeometries([cutterX, cutterZ]);

  try {
    const latheMesh = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial());
    const cutterMesh = new THREE.Mesh(cuttersMerged, new THREE.MeshStandardMaterial());

    const bodyBrush = new Brush(latheMesh.geometry);
    bodyBrush.updateMatrixWorld();

    const cutBrush = new Brush(cutterMesh.geometry);
    cutBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    const resultBrush = evaluator.evaluate(bodyBrush, cutBrush, SUBTRACTION);

    let resultGeom = resultBrush.geometry;
    resultGeom = BufferGeometryUtils.mergeVertices(resultGeom, 0.0005);
    resultGeom.computeVertexNormals();
    return resultGeom;
  } catch (err) {
    console.warn('CSG subtraction fallback for Rook crenels:', err);
    return lathe;
  }
}

/**
 * 3. BISHOP: Authentic Staunton Bishop matching user reference image:
 * - Broad plump cushion base with concave scotia taper
 * - Slender concave waist stem
 * - Multi-tier collar: wide saucer platter disc + dual rounded convex collar rings
 * - Bulbous teardrop / acorn mitre head
 * - Real, deep diagonal cleft incision cut through the mitre head via CSG
 * - Spherical finial ball pommel resting on pinched pedestal neck
 */
function createBishopGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];

  // Base underside
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(0.40, 0));
  points.push(new THREE.Vector2(0.425, 0.015));

  // Tier 1: Main lower torus cushion
  const torusSteps = 16;
  const torusCenterY = 0.080;
  const torusR = 0.055;
  const torusBaseX = 0.395;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseX + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * 0.060;
    points.push(new THREE.Vector2(r, y));
  }

  // Recessed groove & scotia transition to stem
  points.push(new THREE.Vector2(0.390, 0.145));
  points.push(new THREE.Vector2(0.370, 0.155));
  points.push(new THREE.Vector2(0.380, 0.168));
  points.push(new THREE.Vector2(0.340, 0.210));
  points.push(new THREE.Vector2(0.280, 0.260));
  points.push(new THREE.Vector2(0.225, 0.300));
  points.push(new THREE.Vector2(0.235, 0.320));
  points.push(new THREE.Vector2(0.210, 0.335));

  // Slender concave stem
  points.push(new THREE.Vector2(0.180, 0.360));
  points.push(new THREE.Vector2(0.145, 0.440));
  points.push(new THREE.Vector2(0.120, 0.540));
  points.push(new THREE.Vector2(0.115, 0.620)); // Narrowest waist
  points.push(new THREE.Vector2(0.125, 0.690));
  points.push(new THREE.Vector2(0.145, 0.730));

  // Wide saucer platter disc (distinctive in reference image)
  points.push(new THREE.Vector2(0.210, 0.765));
  points.push(new THREE.Vector2(0.275, 0.790)); // Widest edge of saucer
  points.push(new THREE.Vector2(0.280, 0.805)); // Rounded edge
  points.push(new THREE.Vector2(0.260, 0.820)); // Top edge of saucer
  points.push(new THREE.Vector2(0.190, 0.830)); // Top landing

  // Recessed groove & collar bead 2
  points.push(new THREE.Vector2(0.170, 0.840));
  points.push(new THREE.Vector2(0.210, 0.865));
  points.push(new THREE.Vector2(0.225, 0.885)); // Convex collar ring
  points.push(new THREE.Vector2(0.210, 0.905));

  // Recessed groove & collar bead 3 (top ring directly under mitre)
  points.push(new THREE.Vector2(0.185, 0.918));
  points.push(new THREE.Vector2(0.215, 0.940));
  points.push(new THREE.Vector2(0.218, 0.955));
  points.push(new THREE.Vector2(0.185, 0.975));

  // Mitre head (bulbous teardrop onion shape)
  points.push(new THREE.Vector2(0.200, 0.990));
  points.push(new THREE.Vector2(0.250, 1.040));
  points.push(new THREE.Vector2(0.295, 1.120));
  points.push(new THREE.Vector2(0.318, 1.200)); // Equatorial widest belly
  points.push(new THREE.Vector2(0.308, 1.280));
  points.push(new THREE.Vector2(0.265, 1.365));
  points.push(new THREE.Vector2(0.205, 1.445));
  points.push(new THREE.Vector2(0.140, 1.515));
  points.push(new THREE.Vector2(0.080, 1.570));
  points.push(new THREE.Vector2(0.052, 1.605)); // Pinched neck below ball

  // Finial ball (pommel) at the apex
  points.push(new THREE.Vector2(0.048, 1.620));
  points.push(new THREE.Vector2(0.072, 1.645));
  points.push(new THREE.Vector2(0.082, 1.680));
  points.push(new THREE.Vector2(0.068, 1.720));
  points.push(new THREE.Vector2(0.032, 1.745));
  points.push(new THREE.Vector2(0.000, 1.755));

  const lathe = createLathePiece(points, 64);

  // Diagonal miter slit cut through the mitre head via CSG
  const cutterShape = new THREE.Shape();
  cutterShape.moveTo(-0.024, -0.22);
  cutterShape.lineTo(0.024, -0.22);
  cutterShape.lineTo(0.024, 0.22);
  cutterShape.lineTo(-0.024, 0.22);
  cutterShape.closePath();

  const cutterExtrude = new THREE.ExtrudeGeometry(cutterShape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  cutterExtrude.center();
  cutterExtrude.rotateZ(-0.66);
  cutterExtrude.rotateY(0.26);
  cutterExtrude.translate(0.14, 1.42, 0.04);

  try {
    const latheMesh = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial());
    const cutterMesh = new THREE.Mesh(cutterExtrude, new THREE.MeshStandardMaterial());

    const bodyBrush = new Brush(latheMesh.geometry);
    bodyBrush.updateMatrixWorld();

    const cutBrush = new Brush(cutterMesh.geometry);
    cutBrush.position.copy(cutterMesh.position);
    cutBrush.rotation.copy(cutterMesh.rotation);
    cutBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    const resultBrush = evaluator.evaluate(bodyBrush, cutBrush, SUBTRACTION);

    let resultGeom = resultBrush.geometry;
    resultGeom = BufferGeometryUtils.mergeVertices(resultGeom, 0.0005);
    resultGeom.computeVertexNormals();
    return resultGeom;
  } catch (err) {
    console.warn('CSG subtraction fallback for Bishop slit:', err);
    return lathe;
  }
}

/**
 * 4. KNIGHT: Authentic Staunton Knight sculpture matching user reference image:
 * - Turned pedestal base with sharp bottom platter rim, deep horizontal groove, plump torus cushion,
 *   concave bell scotia, and a prominent double collar at the base of the neck
 * - Proud arched neck with majestic forward posture
 * - Sweeping carved mane locks with 9 fluted waves and curved lateral ribs cascading down the crest
 * - Classical equestrian forehead browband / halter strap across the brow beneath the ears
 * - Alert upright pointed ears with sculpted concha hollows
 * - Sculpted almond eye sockets with defined eyelids and arched supraorbital brow ridges
 * - Broad masseter cheek muscle bulges and deep throat latch undercut
 * - Tapered muzzle with realistic flared nostril cavities, parted mouth slit, and fleshy chin boss
 */
function createKnightGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Turned pedestal base with authentic double collar
  const basePoints: THREE.Vector2[] = [];
  basePoints.push(new THREE.Vector2(0, 0));
  basePoints.push(new THREE.Vector2(0.400, 0));
  basePoints.push(new THREE.Vector2(0.425, 0.015));

  // Tier 1: Sharp vertical platter rim
  basePoints.push(new THREE.Vector2(0.435, 0.030));
  basePoints.push(new THREE.Vector2(0.430, 0.050));

  // Tier 2: Deep recessed horizontal groove
  basePoints.push(new THREE.Vector2(0.402, 0.060));
  basePoints.push(new THREE.Vector2(0.395, 0.070));
  basePoints.push(new THREE.Vector2(0.405, 0.080));

  // Tier 3: Plump lower torus cushion ring (y: 0.080 to 0.185)
  const torusSteps = 16;
  const torusCenterY = 0.132;
  const torusR = 0.055;
  const torusBaseX = 0.400;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseX + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * 0.052;
    basePoints.push(new THREE.Vector2(r, y));
  }

  // Tier 4: Concave bell / scotia flare rising to neck collar
  basePoints.push(new THREE.Vector2(0.380, 0.200));
  basePoints.push(new THREE.Vector2(0.335, 0.245));
  basePoints.push(new THREE.Vector2(0.295, 0.290));
  basePoints.push(new THREE.Vector2(0.265, 0.330));

  // Tier 5: Lower rounded torus collar ring
  basePoints.push(new THREE.Vector2(0.265, 0.340));
  basePoints.push(new THREE.Vector2(0.298, 0.360));
  basePoints.push(new THREE.Vector2(0.300, 0.375));
  basePoints.push(new THREE.Vector2(0.280, 0.390));

  // Tier 6: Recessed undercut notch & upper collar bead ring
  basePoints.push(new THREE.Vector2(0.252, 0.398));
  basePoints.push(new THREE.Vector2(0.272, 0.412));
  basePoints.push(new THREE.Vector2(0.270, 0.426));
  basePoints.push(new THREE.Vector2(0.240, 0.440));
  basePoints.push(new THREE.Vector2(0, 0.440));

  const baseGeom = createLathePiece(basePoints, 64);
  parts.push(baseGeom);

  // 2. Main Equine Body & Head Silhouette (XY Plane Profile)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.205, 0.440);

  // Dorsal arch of neck rising up to poll behind ear
  bodyShape.bezierCurveTo(-0.245, 0.68, -0.275, 0.98, -0.240, 1.25);
  bodyShape.bezierCurveTo(-0.215, 1.42, -0.145, 1.55, -0.065, 1.63);

  // Poll over crown to brow
  bodyShape.lineTo(-0.020, 1.62);
  bodyShape.lineTo(0.015, 1.58);

  // Forehead sloping gracefully forward
  bodyShape.bezierCurveTo(0.075, 1.52, 0.145, 1.44, 0.195, 1.35);

  // Bridge of nose with gentle classic equine convexity
  bodyShape.bezierCurveTo(0.245, 1.27, 0.285, 1.21, 0.315, 1.15);

  // Rounded tip of muzzle / upper lip
  bodyShape.bezierCurveTo(0.340, 1.11, 0.335, 1.06, 0.305, 1.04);

  // Parted mouth smile slit
  bodyShape.lineTo(0.245, 1.05);
  bodyShape.lineTo(0.265, 1.02);

  // Rounded lower chin pad
  bodyShape.bezierCurveTo(0.250, 0.98, 0.215, 0.97, 0.185, 0.98);

  // Lower jawline to mandible angle
  bodyShape.bezierCurveTo(0.135, 0.98, 0.085, 1.00, 0.045, 1.03);

  // Deep crescent throat latch undercut separating jaw and throat
  bodyShape.bezierCurveTo(0.005, 1.04, -0.015, 0.98, 0.015, 0.91);

  // Graceful S-curve throat arch
  bodyShape.bezierCurveTo(0.055, 0.81, 0.105, 0.70, 0.155, 0.58);

  // Muscular forward swell of lower chest entering the collar
  bodyShape.bezierCurveTo(0.205, 0.49, 0.200, 0.46, 0.175, 0.440);
  bodyShape.lineTo(0.175, 0.440);
  bodyShape.closePath();

  const bodyExtrude = new THREE.ExtrudeGeometry(bodyShape, {
    steps: 1,
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.068,
    bevelSize: 0.058,
    bevelSegments: 4,
  });
  bodyExtrude.center();
  bodyExtrude.translate(0.015, 1.065, 0);
  parts.push(bodyExtrude);

  // 3. Chest Muscular Fullness (Left and Right Pectoral Volumes)
  [-0.085, 0.085].forEach((zOffset) => {
    const chestBulge = new THREE.SphereGeometry(0.125, 16, 12);
    chestBulge.scale(1.25, 1.45, 0.85);
    chestBulge.rotateZ(0.28);
    chestBulge.translate(0.10, 0.65, zOffset);
    parts.push(chestBulge);
  });

  // 4. Sweeping Carved Mane Locks along the Dorsal Crest
  const numManeWaves = 9;
  for (let i = 0; i < numManeWaves; i++) {
    const t = i / (numManeWaves - 1);
    const p0 = new THREE.Vector2(-0.19, 0.54);
    const p1 = new THREE.Vector2(-0.25, 0.92);
    const p2 = new THREE.Vector2(-0.26, 1.32);
    const p3 = new THREE.Vector2(-0.06, 1.62);

    const omt = 1 - t;
    const cx =
      omt * omt * omt * p0.x +
      3 * omt * omt * t * p1.x +
      3 * omt * t * t * p2.x +
      t * t * t * p3.x;
    const cy =
      omt * omt * omt * p0.y +
      3 * omt * omt * t * p1.y +
      3 * omt * t * t * p2.y +
      t * t * t * p3.y;

    const rot = 0.95 - t * 0.75;
    const waveDepth = 0.26 + Math.sin(t * Math.PI) * 0.05;

    const waveShape = new THREE.Shape();
    waveShape.moveTo(-0.032, 0);
    waveShape.bezierCurveTo(-0.045, 0.045, -0.020, 0.090, 0.015, 0.110);
    waveShape.bezierCurveTo(0.045, 0.080, 0.040, 0.035, 0.025, 0);
    waveShape.closePath();

    const waveExtrude = new THREE.ExtrudeGeometry(waveShape, {
      steps: 1,
      depth: waveDepth,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.016,
      bevelSegments: 3,
    });
    waveExtrude.center();
    waveExtrude.rotateZ(rot);
    waveExtrude.translate(cx - 0.012, cy, 0);
    parts.push(waveExtrude);

    [-1, 1].forEach((side) => {
      const lockRib = new THREE.TorusGeometry(0.12, 0.024, 8, 16, Math.PI * 0.55);
      lockRib.rotateZ(rot + 0.35 * side);
      lockRib.rotateY(side * 0.25);
      lockRib.scale(1.0, 1.2, 0.7);
      lockRib.translate(cx + 0.02, cy - 0.03, side * 0.125);
      parts.push(lockRib);
    });
  }

  // 5. Equestrian Forehead Browband / Strap
  const browbandTorus = new THREE.TorusGeometry(0.138, 0.018, 10, 24, Math.PI * 0.72);
  browbandTorus.rotateZ(-0.75);
  browbandTorus.rotateX(Math.PI / 2);
  browbandTorus.translate(0.025, 1.54, 0);
  parts.push(browbandTorus);

  [-0.014, 0.014].forEach((offsetY) => {
    const piping = new THREE.TorusGeometry(0.140, 0.008, 8, 20, Math.PI * 0.70);
    piping.rotateZ(-0.75);
    piping.rotateX(Math.PI / 2);
    piping.translate(0.025, 1.54 + offsetY, 0);
    parts.push(piping);
  });

  // 6. Alert Pricked Ears with Hollow Concha
  [-0.068, 0.068].forEach((zOffset) => {
    const earShape = new THREE.Shape();
    earShape.moveTo(-0.035, 0);
    earShape.bezierCurveTo(-0.045, 0.08, -0.030, 0.17, 0.010, 0.22);
    earShape.bezierCurveTo(0.025, 0.18, 0.015, 0.10, -0.010, 0.02);
    earShape.closePath();

    const earExtrude = new THREE.ExtrudeGeometry(earShape, {
      depth: 0.032,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.012,
      bevelSegments: 3,
    });
    earExtrude.center();
    earExtrude.rotateZ(0.24);
    earExtrude.rotateX(zOffset > 0 ? 0.22 : -0.22);
    earExtrude.rotateY(zOffset > 0 ? -0.14 : 0.14);
    earExtrude.translate(-0.035, 1.62, zOffset);
    parts.push(earExtrude);

    const innerEar = new THREE.ConeGeometry(0.022, 0.14, 12);
    innerEar.rotateZ(0.28);
    innerEar.rotateX(zOffset > 0 ? 0.20 : -0.20);
    innerEar.translate(-0.020, 1.62, zOffset * 0.90);
    parts.push(innerEar);
  });

  // 7. Sculpted Eye Sockets, Eyelids & Supraorbital Brow Ridges
  [-0.118, 0.118].forEach((zOffset) => {
    const eyeball = new THREE.SphereGeometry(0.038, 14, 10);
    eyeball.scale(1.5, 0.82, 0.7);
    eyeball.rotateZ(-0.25);
    eyeball.translate(0.145, 1.34, zOffset);
    parts.push(eyeball);

    const browArch = new THREE.TorusGeometry(0.045, 0.014, 8, 14, Math.PI * 0.85);
    browArch.rotateZ(1.18);
    browArch.rotateY(zOffset > 0 ? -0.14 : 0.14);
    browArch.translate(0.140, 1.365, zOffset);
    parts.push(browArch);

    const lowerLid = new THREE.TorusGeometry(0.038, 0.009, 6, 12, Math.PI * 0.70);
    lowerLid.rotateZ(-1.85);
    lowerLid.translate(0.142, 1.320, zOffset);
    parts.push(lowerLid);
  });

  // 8. Masseter Cheek / Mandible Muscle Plates
  [-0.112, 0.112].forEach((zOffset) => {
    const cheekGeom = new THREE.SphereGeometry(0.088, 18, 14);
    cheekGeom.scale(1.22, 1.05, 0.68);
    cheekGeom.translate(0.065, 1.16, zOffset);
    parts.push(cheekGeom);
  });

  // 9. Tapered Muzzle with Nostril Hollows & Chin Boss
  const snoutGeom = new THREE.CylinderGeometry(0.075, 0.115, 0.22, 18);
  snoutGeom.rotateZ(0.62);
  snoutGeom.scale(1.12, 0.85, 0.95);
  snoutGeom.translate(0.225, 1.17, 0);
  parts.push(snoutGeom);

  [-0.075, 0.075].forEach((zOffset) => {
    const nostrilRim = new THREE.TorusGeometry(0.026, 0.010, 8, 12, Math.PI * 1.2);
    nostrilRim.rotateZ(-0.65);
    nostrilRim.rotateY(zOffset > 0 ? 0.35 : -0.35);
    nostrilRim.translate(0.265, 1.12, zOffset);
    parts.push(nostrilRim);

    const nostrilCavity = new THREE.SphereGeometry(0.022, 10, 8);
    nostrilCavity.scale(1.4, 0.7, 0.7);
    nostrilCavity.rotateZ(-0.45);
    nostrilCavity.translate(0.260, 1.115, zOffset);
    parts.push(nostrilCavity);
  });

  const chinBoss = new THREE.SphereGeometry(0.040, 14, 10);
  chinBoss.scale(1.2, 0.78, 0.92);
  chinBoss.translate(0.205, 1.03, 0);
  parts.push(chinBoss);

  const rawMerged = mergeBufferGeometries(parts);
  const finalGeom = BufferGeometryUtils.mergeVertices(rawMerged, 0.0005);
  finalGeom.computeVertexNormals();
  return finalGeom;
}

/**
 * 5. QUEEN: Authentic Staunton Queen matching user reference image:
 * - Broad plump cushion base with lower torus, fine horizontal groove, and concave scotia
 * - Distinct convex collar/fillet bead step at the base of the column
 * - Tall, slender, elegant concave column trunk flaring gracefully toward the upper collar
 * - Prominent multi-tier collar: wide rounded saucer platter flange disc + upper rounded bead ring
 * - Graceful flaring trumpet chalice coronet
 * - 12 crisp scalloped/fluted crenellation crest points around the crown rim cut via CSG
 * - Sunken inner basin with an authentic rounded central finial pommel ball peaking at the apex
 */
function createQueenGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];

  // 1. Base Underside
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(0.41, 0));
  points.push(new THREE.Vector2(0.435, 0.015));

  // Tier 1: Plump lower torus cushion ring (y: 0.015 to 0.125)
  const torusSteps = 16;
  const torusCenterY = 0.075;
  const torusR = 0.052;
  const torusBaseX = 0.405;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseX + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * 0.055;
    points.push(new THREE.Vector2(r, y));
  }

  // Tier 2: Recessed horizontal groove ring indent (y: 0.130 to 0.150)
  points.push(new THREE.Vector2(0.415, 0.132));
  points.push(new THREE.Vector2(0.398, 0.140)); // Groove valley
  points.push(new THREE.Vector2(0.410, 0.148));

  // Tier 3: Concave bell / scotia curve rising up
  points.push(new THREE.Vector2(0.395, 0.170));
  points.push(new THREE.Vector2(0.355, 0.220));
  points.push(new THREE.Vector2(0.315, 0.275));
  points.push(new THREE.Vector2(0.285, 0.330));

  // Tier 4: Distinct convex fillet / collar bead ring at the base of the column (y: 0.350 to 0.430)
  points.push(new THREE.Vector2(0.275, 0.355));
  points.push(new THREE.Vector2(0.298, 0.385)); // Convex fillet crest
  points.push(new THREE.Vector2(0.300, 0.400));
  points.push(new THREE.Vector2(0.280, 0.420));
  points.push(new THREE.Vector2(0.245, 0.435)); // Step into column

  // 2. Tall, slender concave column stem (y: 0.440 to 1.280)
  points.push(new THREE.Vector2(0.220, 0.460));
  points.push(new THREE.Vector2(0.185, 0.560));
  points.push(new THREE.Vector2(0.160, 0.700));
  points.push(new THREE.Vector2(0.152, 0.850)); // Narrowest waist
  points.push(new THREE.Vector2(0.156, 0.980));
  points.push(new THREE.Vector2(0.172, 1.100));
  points.push(new THREE.Vector2(0.200, 1.200));
  points.push(new THREE.Vector2(0.235, 1.280)); // Flaring into collar

  // 3. Prominent Upper Collar Assembly
  // Platter disc: wide rounded saucer flange disc (y: 1.300 to 1.400)
  points.push(new THREE.Vector2(0.285, 1.310));
  points.push(new THREE.Vector2(0.342, 1.335)); // Outermost edge of saucer
  points.push(new THREE.Vector2(0.348, 1.355)); // Rounded convex edge
  points.push(new THREE.Vector2(0.335, 1.375)); // Top edge
  points.push(new THREE.Vector2(0.250, 1.395)); // Upper shelf landing

  // Recessed groove & upper rounded collar bead (y: 1.400 to 1.480)
  points.push(new THREE.Vector2(0.230, 1.410)); // Recessed notch
  points.push(new THREE.Vector2(0.262, 1.435)); // Upper collar bead ring
  points.push(new THREE.Vector2(0.260, 1.455));
  points.push(new THREE.Vector2(0.225, 1.475)); // Pinched neck below coronet

  // 4. Graceful Trumpet Coronet Chalice (y: 1.480 to 1.900)
  points.push(new THREE.Vector2(0.225, 1.490));
  points.push(new THREE.Vector2(0.255, 1.550));
  points.push(new THREE.Vector2(0.295, 1.630));
  points.push(new THREE.Vector2(0.335, 1.720));
  points.push(new THREE.Vector2(0.365, 1.810));
  points.push(new THREE.Vector2(0.380, 1.885)); // Top outer rim of crown crest
  points.push(new THREE.Vector2(0.368, 1.900)); // Rounded rim top
  points.push(new THREE.Vector2(0.342, 1.895)); // Inner rim chamfer

  // 5. Sunken Inner Basin Floor (y: 1.890 down to 1.660)
  points.push(new THREE.Vector2(0.305, 1.810)); // Inner bowl wall
  points.push(new THREE.Vector2(0.245, 1.730));
  points.push(new THREE.Vector2(0.180, 1.675));
  points.push(new THREE.Vector2(0.120, 1.655)); // Basin floor
  points.push(new THREE.Vector2(0.065, 1.650)); // Pedestal base of central finial

  // 6. Central Finial Ball / Pommel (y: 1.650 to 1.980)
  // Pinched neck
  points.push(new THREE.Vector2(0.055, 1.670));
  points.push(new THREE.Vector2(0.068, 1.710));
  // Teardrop / spherical finial ball
  points.push(new THREE.Vector2(0.095, 1.765));
  points.push(new THREE.Vector2(0.110, 1.830)); // Equator
  points.push(new THREE.Vector2(0.100, 1.890));
  points.push(new THREE.Vector2(0.075, 1.940));
  points.push(new THREE.Vector2(0.040, 1.970));
  points.push(new THREE.Vector2(0.000, 1.985)); // Apex tip

  const lathe = createLathePiece(points, 64);

  // 7. CSG Boolean Subtraction for the 12 Scalloped V-Notch Crenels of the Coronet
  const numCrenels = 12;
  const cutters: THREE.BufferGeometry[] = [];

  for (let i = 0; i < numCrenels; i++) {
    const angle = (i / numCrenels) * Math.PI * 2;

    const wedgeShape = new THREE.Shape();
    wedgeShape.moveTo(-0.048, 0.12);
    wedgeShape.lineTo(0.048, 0.12);
    wedgeShape.lineTo(0, -0.06);
    wedgeShape.closePath();

    const wedgeExtrude = new THREE.ExtrudeGeometry(wedgeShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.010,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    wedgeExtrude.center();

    wedgeExtrude.rotateZ(0.24);
    wedgeExtrude.rotateY(-angle);

    const radius = 0.365;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    wedgeExtrude.translate(cx, 1.865, cz);

    cutters.push(wedgeExtrude);
  }

  const mergedCutters = BufferGeometryUtils.mergeGeometries(cutters);

  try {
    const latheMesh = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial());
    const cutterMesh = new THREE.Mesh(mergedCutters, new THREE.MeshStandardMaterial());

    const bodyBrush = new Brush(latheMesh.geometry);
    bodyBrush.updateMatrixWorld();

    const cutBrush = new Brush(cutterMesh.geometry);
    cutBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    const resultBrush = evaluator.evaluate(bodyBrush, cutBrush, SUBTRACTION);

    let resultGeom = resultBrush.geometry;
    resultGeom = BufferGeometryUtils.mergeVertices(resultGeom, 0.0005);
    resultGeom.computeVertexNormals();
    return resultGeom;
  } catch (err) {
    console.warn('CSG subtraction fallback for Queen coronet crenels:', err);
    return lathe;
  }
}

/**
 * 6. KING: Authentic Staunton King matching user reference image:
 * - Broad, plump cushion base with bottom rim platter, deep horizontal groove, and massive rounded torus
 * - Graceful concave bell scotia rising to a distinct convex collar fillet ring
 * - Tall, slender, stately concave hourglass column trunk
 * - Prominent multi-tier imperial collar: thick rounded torus platter ring + secondary convex bead
 * - Flared conical chalice crown with soft rounded rim and convex domed ceiling
 * - Rounded pedestal bead at the dome apex
 * - Iconic Staunton Cross Pattée with four flaring arms and beveled facets
 * - Apex pearl ball sitting proudly atop the cross
 */
function createKingGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];

  // 1. Base Underside
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(0.420, 0));
  points.push(new THREE.Vector2(0.445, 0.015));

  // Tier 1: Lower platter rim
  points.push(new THREE.Vector2(0.455, 0.030));
  points.push(new THREE.Vector2(0.445, 0.045));

  // Tier 2: Deep recessed horizontal groove
  points.push(new THREE.Vector2(0.418, 0.055));
  points.push(new THREE.Vector2(0.412, 0.065));

  // Tier 3: Massive plump torus cushion ring (y: 0.065 to 0.185)
  const torusSteps = 18;
  const torusCenterY = 0.125;
  const torusR = 0.065;
  const torusBaseX = 0.415;
  for (let i = 0; i <= torusSteps; i++) {
    const angle = -Math.PI / 2 + (i / torusSteps) * Math.PI;
    const r = torusBaseX + Math.cos(angle) * torusR;
    const y = torusCenterY + Math.sin(angle) * 0.060;
    points.push(new THREE.Vector2(r, y));
  }

  // Tier 4: Concave bell / scotia taper
  points.push(new THREE.Vector2(0.395, 0.200));
  points.push(new THREE.Vector2(0.355, 0.250));
  points.push(new THREE.Vector2(0.315, 0.300));
  points.push(new THREE.Vector2(0.285, 0.345));

  // Tier 5: Distinct convex fillet / collar bead ring at the base of the column
  points.push(new THREE.Vector2(0.280, 0.365));
  points.push(new THREE.Vector2(0.308, 0.395)); // Convex fillet crest
  points.push(new THREE.Vector2(0.310, 0.415));
  points.push(new THREE.Vector2(0.288, 0.440));
  points.push(new THREE.Vector2(0.255, 0.455)); // Step into column stem

  // 2. Tall, Stately Concave Column Stem
  points.push(new THREE.Vector2(0.235, 0.485));
  points.push(new THREE.Vector2(0.198, 0.600));
  points.push(new THREE.Vector2(0.174, 0.740));
  points.push(new THREE.Vector2(0.165, 0.880)); // Slender waist
  points.push(new THREE.Vector2(0.170, 1.020));
  points.push(new THREE.Vector2(0.188, 1.150));
  points.push(new THREE.Vector2(0.218, 1.270));
  points.push(new THREE.Vector2(0.255, 1.360)); // Flaring into collar

  // 3. Double Imperial Collar Assembly
  // Tier 1: Very prominent, thick rounded torus platter ring
  points.push(new THREE.Vector2(0.298, 1.385));
  points.push(new THREE.Vector2(0.362, 1.415)); // Bulging outer edge
  points.push(new THREE.Vector2(0.368, 1.435));
  points.push(new THREE.Vector2(0.352, 1.460));
  points.push(new THREE.Vector2(0.280, 1.480)); // Upper ledge

  // Tier 2: Recessed notch & secondary convex collar bead
  points.push(new THREE.Vector2(0.252, 1.492)); // Undercut groove
  points.push(new THREE.Vector2(0.284, 1.512)); // Second convex bead
  points.push(new THREE.Vector2(0.286, 1.530));
  points.push(new THREE.Vector2(0.248, 1.548)); // Recessed groove beneath chalice

  // 4. Smooth Flared Chalice Crown with Convex Domed Ceiling
  points.push(new THREE.Vector2(0.254, 1.555));
  points.push(new THREE.Vector2(0.274, 1.615));
  points.push(new THREE.Vector2(0.304, 1.705));
  points.push(new THREE.Vector2(0.338, 1.800));
  points.push(new THREE.Vector2(0.360, 1.885)); // Crown outer rim
  points.push(new THREE.Vector2(0.354, 1.905)); // Rounded rim top
  points.push(new THREE.Vector2(0.315, 1.915)); // Inner rim chamfer

  // Convex domed roof
  points.push(new THREE.Vector2(0.255, 1.940));
  points.push(new THREE.Vector2(0.185, 1.965));
  points.push(new THREE.Vector2(0.105, 1.985));
  points.push(new THREE.Vector2(0.060, 1.995));

  // Pedestal bead directly under the cross finial
  points.push(new THREE.Vector2(0.052, 2.005));
  points.push(new THREE.Vector2(0.078, 2.025)); // Bead equator
  points.push(new THREE.Vector2(0.080, 2.040));
  points.push(new THREE.Vector2(0.052, 2.060));
  points.push(new THREE.Vector2(0.030, 2.070));
  points.push(new THREE.Vector2(0.000, 2.070));

  const lathe = createLathePiece(points, 64);

  // 5. Authentic Staunton Cross Pattée with Top Pearl
  const crossShape = new THREE.Shape();
  const armInner = 0.038;
  const armOuter = 0.092;
  const armLen = 0.118;

  crossShape.moveTo(armInner, armInner);
  crossShape.lineTo(armOuter, armLen);
  crossShape.lineTo(-armOuter, armLen);
  crossShape.lineTo(-armInner, armInner);

  crossShape.lineTo(-armLen, armOuter);
  crossShape.lineTo(-armLen, -armOuter);
  crossShape.lineTo(-armInner, -armInner);

  crossShape.lineTo(-armOuter, -armLen);
  crossShape.lineTo(armOuter, -armLen);
  crossShape.lineTo(armInner, -armInner);

  crossShape.lineTo(armLen, -armOuter);
  crossShape.lineTo(armLen, armOuter);
  crossShape.closePath();

  const crossExtrude = new THREE.ExtrudeGeometry(crossShape, {
    depth: 0.048,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.010,
    bevelSegments: 3,
  });
  crossExtrude.center();
  const crossCenterY = 2.070 + armLen + 0.010;
  crossExtrude.translate(0, crossCenterY, 0);

  const stemCylinder = new THREE.CylinderGeometry(0.032, 0.032, 0.035, 24);
  stemCylinder.translate(0, 2.075, 0);

  const topPearl = new THREE.SphereGeometry(0.035, 32, 24);
  topPearl.translate(0, crossCenterY + armLen + 0.030, 0);

  return mergeBufferGeometries([lathe, crossExtrude, stemCylinder, topPearl]);
}

/**
 * Utility to merge multiple BufferGeometries into a single BufferGeometry
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  const posArrays: number[] = [];
  const normArrays: number[] = [];
  const uvArrays: number[] = [];

  for (const geom of geometries) {
    const nonIndexed = geom.toNonIndexed();
    const pos = nonIndexed.getAttribute('position');
    const norm = nonIndexed.getAttribute('normal');
    const uv = nonIndexed.getAttribute('uv');

    if (pos) {
      for (let i = 0; i < pos.count * 3; i++) {
        posArrays.push(pos.array[i]);
      }
    }
    if (norm) {
      for (let i = 0; i < norm.count * 3; i++) {
        normArrays.push(norm.array[i]);
      }
    }
    if (uv) {
      for (let i = 0; i < uv.count * 2; i++) {
        uvArrays.push(uv.array[i]);
      }
    }
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(posArrays, 3));
  if (normArrays.length > 0) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normArrays, 3));
  } else {
    merged.computeVertexNormals();
  }
  if (uvArrays.length > 0) {
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvArrays, 2));
  }

  return merged;
}
