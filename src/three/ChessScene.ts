import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Chess, Square } from 'chess.js';
import type { PieceColor, PieceType, CameraPreset } from '../types';
import {
  getPieceGeometry,
  loadKnightGLTFGeometry,
  loadBishopGLTFGeometry,
  loadRookGLTFGeometry,
  loadQueenGLTFGeometry,
  loadKingGLTFGeometry,
} from './pieceGeometries';
import { MaterialManager } from './materials';
import { soundEffects } from '../utils/audio';
import { lostPieces } from '../utils/captured';
import {
  createTournamentEquirectangularTexture,
  createTournamentTableGroup,
  createTournamentHallGroup,
} from './tournamentEnvironment';
import { createDeskLamp } from './deskLamp';
import { createStudyWorld, type StudySelection, type StudyProfileState, type StudyOrder } from './study/studyWorld';
import { isSceneRenderHeld } from './renderHold';
import { createOpponentFrame } from './opponentFrame';

export interface PieceMeshObject extends THREE.Group {
  userData: {
    pieceId: string;
    square: Square;
    type: PieceType;
    color: PieceColor;
    originalPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    isGrabbed: boolean;
    isAnimating: boolean;
    shadowPlane?: THREE.Mesh;
    trayDiscarded?: boolean;   // a captured piece whose tray was rebuilt while it was still flying there
  };
}

export class ChessSceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private opponentFrame = createOpponentFrame();
  private frameSize = '';
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private materials: MaterialManager;
  private animationFrameId: number | null = null;
  private raycaster: THREE.Raycaster;

  // Board constants
  private readonly BOARD_SIZE = 8;
  private readonly TILE_SIZE = 1.0;
  private readonly BOARD_OFFSET = 3.5; // (8 - 1) / 2
  private readonly PIECE_LIFT_HEIGHT = 1.8;
  private readonly HIDDEN_LAYER = 31;   // a layer the camera never draws

  // 3D Objects
  private boardGroup: THREE.Group;
  private piecesGroup: THREE.Group;
  private tournamentTableGroup: THREE.Group;
  private tournamentHallGroup: THREE.Group;
  private deskLampGroup?: THREE.Group;
  private deskLampSpotLight?: THREE.SpotLight;
  private candleLight: THREE.PointLight | null = null;
  // The study: room, lamp, rosewood board, lighting, book onboarding and post-processing
  private study: ReturnType<typeof createStudyWorld>;
  private studyReady = false;
  private studySide: PieceColor = 'w';
  private currentPreset: CameraPreset = 'white';
  private onStudyCompleteCallback?: (s: StudySelection) => void;
  private onStudyConfirmCallback?: (s: StudySelection) => void;
  private onProfileApplyCallback?: (s: StudySelection) => void;
  private onProfileClosedCallback?: (order: StudyOrder | null) => void;
  /** Desk surface around the board, where captured pieces stand. */
  private readonly deskY = 0.08 - 0.0225 / 0.055;
  private tileMeshes: Map<Square, THREE.Mesh> = new Map();
  private pieceObjects: Map<string, PieceMeshObject> = new Map();

  // 3D Table Graveyard for captured pieces (Left for Black, Right for White)
  private capturedPiecesGroup: THREE.Group;
  private capturedMeshes: {
    w: PieceMeshObject[]; // White pieces killed (on the right)
    b: PieceMeshObject[]; // Black pieces killed (on the left)
  } = { w: [], b: [] };

  // Interaction State
  private dragPlane: THREE.Plane;
  private grabbedPiece: PieceMeshObject | null = null;
  private hoveredTile: Square | null = null;
  private legalMovesForGrabbed: Set<Square> = new Set();
  private validMoveIndicators: THREE.Mesh[] = [];
  private hoverIndicatorMesh: THREE.Mesh | null = null;
  private selectedTileHighlight: THREE.Mesh | null = null;
  private lastMoveHighlights: THREE.Mesh[] = [];
  private checkHighlightMesh: THREE.Mesh | null = null;
  private coordinateMeshes: THREE.Mesh[] = [];

  // Interaction Debouncing & Proximity Pickup
  private lastDropTimestamp = 0;
  private readonly GRAB_COOLDOWN_MS = 180;

  // Camera animation
  private targetCameraPos = new THREE.Vector3(0, 10.6, 6.8);
  private targetCameraLookAt = new THREE.Vector3(0, 0, 0);
  private currentCameraLookAt = new THREE.Vector3(0, 0, 0);
  private isOrbitTransitioning = false;
  private orbitStartTime = 0;
  private orbitDuration = 820;
  private orbitStartAngle = 0;
  private orbitDeltaAngle = 0;
  private orbitStartRadius = 0;
  private orbitTargetRadius = 0;
  private orbitStartY = 0;
  private orbitTargetY = 0;
  private orbitStartLookAt = new THREE.Vector3();
  private orbitTargetLookAt = new THREE.Vector3();

  // Mouse / Touch fallback controls
  private isMouseDown = false;
  private mouseCoords = new THREE.Vector2();

  // Active animation cancellation & RAF session tracking
  private activeAnimationIds = new Set<number>();
  private activeCaptureAnimations = new Map<PieceMeshObject, { rafId: number; finalize: () => void }>();
  private animationSession = 0;
  private captureAnimationSession = 0;

  // Callbacks
  private onPieceDroppedCallback?: (from: Square, to: Square) => boolean;
  private onHoverChangeCallback?: (hover: { square: Square; isLegal: boolean } | null) => void;

  constructor(container: HTMLElement, options: { startInGame?: boolean } = {}) {
    this.container = container;
    this.materials = new MaterialManager();
    this.raycaster = new THREE.Raycaster();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8d8be);

    // Warm sepia-toned distance fog seamlessly fading far table edges into aging paper cream
    this.scene.fog = new THREE.Fog(0xe8d8be, 28, 70);

    // Camera
    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || window.innerHeight || 600;
    const aspect = width / Math.max(1, height);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.copy(this.targetCameraPos);
    this.camera.lookAt(this.targetCameraLookAt);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xe8d8be, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);

    // PBR Environment Reflection Mapping (high-key clean reflections on white marble and pieces)
    const envTexture = createTournamentEquirectangularTexture();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    this.scene.environment = pmremGenerator.fromEquirectangular(envTexture).texture;
    pmremGenerator.dispose();

    // Post-Processing: EffectComposer + RenderPass + UnrealBloomPass
    // Tuned specifically for candlelight flicker & specular marble glints without blowing out whites
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomResolution = new THREE.Vector2(width, height);
    this.bloomPass = new UnrealBloomPass(
      bloomResolution,
      0.08, // Subtle bloom for candle flame and piece specular glints
      0.28,
      1.02  // Preserves clear geometric piece edges and prevents white background blowout
    );
    this.composer.addPass(this.bloomPass);

    // Drag Plane at lift height
    // Squares are picked where the pointer meets the board, so the lifted piece hovers over the square under the cursor or fingertip
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);

    // Object Groups
    this.tournamentHallGroup = createTournamentHallGroup();
    this.tournamentTableGroup = createTournamentTableGroup();
    this.boardGroup = new THREE.Group();
    this.piecesGroup = new THREE.Group();
    this.capturedPiecesGroup = new THREE.Group();

    this.scene.add(this.tournamentHallGroup);
    this.scene.add(this.tournamentTableGroup);
    this.scene.add(this.boardGroup);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.capturedPiecesGroup);
    this.scene.add(this.opponentFrame.group);

    this.createBoard();
    this.createAffordanceMeshes();
    this.setupEventListeners();

    // The study draws the room, board and lighting. The old hall, table and board stay out of the render;
    // the tiles remain as invisible raycast targets for picking squares.
    this.tournamentHallGroup.visible = false;
    this.tournamentTableGroup.visible = false;
    this.boardGroup.children.forEach((c) => { c.visible = false; });
    this.scene.fog = null;
    this.study = createStudyWorld({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      startInGame: options.startInGame,
      getSide: () => this.studySide,
      hasOpponentFrame: () => this.opponentFrame.hasStream,
      onComplete: (sel) => this.onStudyCompleteCallback?.(sel),
      onConfirm: (sel) => this.onStudyConfirmCallback?.(sel),
      onProfileApply: (sel) => this.onProfileApplyCallback?.(sel),
      onProfileClosed: (order) => this.onProfileClosedCallback?.(order),
      onGameCamera: (pos, target) => {
        this.isOrbitTransitioning = false;
        this.targetCameraPos.copy(pos);
        this.targetCameraLookAt.copy(target);
        this.currentCameraLookAt.copy(target);
        this.camera.position.copy(pos);
        this.camera.lookAt(target);
      },
    });
    this.study.ready.then(() => {
      this.studyReady = true;
      this.composer = this.study.composer;
      this.pieceObjects.forEach((p) => this.applyStudyPiece(p));
      this.capturedMeshes.w.forEach((p) => this.applyStudyPiece(p));
      this.capturedMeshes.b.forEach((p) => this.applyStudyPiece(p));
    }).catch((err) => console.error('Study scene failed to load', err));

    this.animate();
  }

  /** Called when the player confirms the book (control style, army, format, depth). */
  public setOnStudyComplete(cb: (s: StudySelection) => void) {
    this.onStudyCompleteCallback = cb;
  }

  /** Called inside the book's Confirm click, while the browser still allows starting the mic or camera. */
  public setOnStudyConfirm(cb: (s: StudySelection) => void) {
    this.onStudyConfirmCallback = cb;
  }

  /** Open the book at the profile chapter during play. Returns false if the book cannot open right now. */
  public openStudyProfile(state: StudyProfileState): boolean {
    return this.study.openProfile(state);
  }

  /** Profile chapter: Apply was clicked (called inside the click), and the book has closed again. */
  public setOnProfileBook(onApply: (s: StudySelection) => void, onClosed: (order: StudyOrder | null) => void) {
    this.onProfileApplyCallback = onApply;
    this.onProfileClosedCallback = onClosed;
  }

  /** Back to the landing page (name card) in the study. */
  public showStudyLanding() {
    this.study.showLanding();
  }

  /** Straight to the board (skip, or joining from an invite link). */
  public enterStudyGame() {
    this.study.enterGame();
  }

  /** True while the landing page or the book is showing, so board input is ignored. */
  public isInStudyOnboarding(): boolean {
    return this.study.mode !== 'game';
  }

  /** Gives a piece the study's geometry, finish and scale. */
  private applyStudyPiece(piece: PieceMeshObject) {
    if (!this.studyReady) return;
    const { type, color } = piece.userData as { type: PieceType; color: PieceColor };
    const parts = this.study.pieceParts(type, color);
    const main = piece.children[0] as THREE.Mesh | undefined;
    if (!main || !main.isMesh || !parts.geometry) return;
    main.geometry = parts.geometry;
    main.material = parts.material;
    if (color === 'b') this.shadeDarkPiece(parts.material);
    main.scale.setScalar(parts.scale);
    const felt = piece.children[1] as THREE.Mesh | undefined;
    if (felt) felt.visible = false;   // the study piece has its own baize underneath
    if (piece.userData.square) {
      piece.rotation.y = this.getPieceDefaultRotationY(type, color, piece.userData.square as Square);
    }
  }

  /**
   * The study's black pieces are jet black, and from White's chair they read well: the lamp and the window light them
   * from behind. From Black's chair the player looks down on them close up with those lights at their back, and jet
   * black turns into flat silhouettes, so there they take a deep charcoal that shows their form.
   */
  private static readonly DARK_PIECE_FROM_BLACK = 0x26262a;

  private shadeDarkPiece(mat: THREE.Material) {
    const m = mat as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial) return;
    if (m.userData.studyColor === undefined) m.userData.studyColor = m.color.getHex();
    m.color.setHex(this.studySide === 'b' ? ChessSceneManager.DARK_PIECE_FROM_BLACK : m.userData.studyColor);
  }

  private shadeDarkPieces() {
    const update = (piece: PieceMeshObject) => {
      const main = piece.children[0] as THREE.Mesh | undefined;
      if (piece.userData.color === 'b' && main?.isMesh) this.shadeDarkPiece(main.material as THREE.Material);
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  /** The soft drop-shadow sprite is only a hint here: the study casts real shadows. */
  private softenShadowMaterial(mat: THREE.MeshBasicMaterial) {
    let o = mat.opacity;
    Object.defineProperty(mat, 'opacity', { get: () => o * 0.4, set: (v: number) => { o = v; }, configurable: true });
    return mat;
  }

  private updateKnightGeometries(gltfGeom: THREE.BufferGeometry) {
    const update = (piece: PieceMeshObject) => {
      if (piece.userData.type === 'n') {
        const mainMesh = piece.children[0] as THREE.Mesh | undefined;
        if (mainMesh && mainMesh.isMesh) {
          mainMesh.geometry = gltfGeom;
        }
      }
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  private updateBishopGeometries(gltfGeom: THREE.BufferGeometry) {
    const update = (piece: PieceMeshObject) => {
      if (piece.userData.type === 'b') {
        const mainMesh = piece.children[0] as THREE.Mesh | undefined;
        if (mainMesh && mainMesh.isMesh) {
          mainMesh.geometry = gltfGeom;
        }
      }
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  private updateRookGeometries(gltfGeom: THREE.BufferGeometry) {
    const update = (piece: PieceMeshObject) => {
      if (piece.userData.type === 'r') {
        const mainMesh = piece.children[0] as THREE.Mesh | undefined;
        if (mainMesh && mainMesh.isMesh) {
          mainMesh.geometry = gltfGeom;
        }
      }
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  private updateQueenGeometries(gltfGeom: THREE.BufferGeometry) {
    const update = (piece: PieceMeshObject) => {
      if (piece.userData.type === 'q') {
        const mainMesh = piece.children[0] as THREE.Mesh | undefined;
        if (mainMesh && mainMesh.isMesh) {
          mainMesh.geometry = gltfGeom;
        }
      }
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  private updateKingGeometries(gltfGeom: THREE.BufferGeometry) {
    const update = (piece: PieceMeshObject) => {
      if (piece.userData.type === 'k') {
        const mainMesh = piece.children[0] as THREE.Mesh | undefined;
        if (mainMesh && mainMesh.isMesh) {
          mainMesh.geometry = gltfGeom;
        }
      }
    };
    this.pieceObjects.forEach(update);
    this.capturedMeshes.w.forEach(update);
    this.capturedMeshes.b.forEach(update);
  }

  private setupLighting() {
    // 1. Subtle Sky/Ground Fill (Soft slate fill preserving shadow contrast, +10%)
    const hemiLight = new THREE.HemisphereLight(0x475569, 0x1e293b, 0.22);
    this.scene.add(hemiLight);

    // 2. Controlled Ambient Base (+10% for clear piece and shadow visibility)
    const ambientLight = new THREE.AmbientLight(0x1a212d, 0.15);
    this.scene.add(ambientLight);

    // 3. Primary Key Light (Soft cool slate-white directional light from front-right, +10%)
    const keyLight = new THREE.DirectionalLight(0xe8edf5, 0.54);
    keyLight.position.set(5.5, 13.5, 6.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 32;
    keyLight.shadow.camera.left = -5.8;
    keyLight.shadow.camera.right = 5.8;
    keyLight.shadow.camera.top = 5.8;
    keyLight.shadow.camera.bottom = -5.8;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.normalBias = 0.035;
    keyLight.shadow.radius = 2.2;
    this.scene.add(keyLight);

    // 4. Dedicated Top Contact Occlusion Shadow Light (+10%)
    const topContactLight = new THREE.DirectionalLight(0xffffff, 0.17);
    topContactLight.position.set(0, 15, 0.1);
    topContactLight.castShadow = true;
    topContactLight.shadow.mapSize.width = 2048;
    topContactLight.shadow.mapSize.height = 2048;
    topContactLight.shadow.camera.near = 2.0;
    topContactLight.shadow.camera.far = 24;
    topContactLight.shadow.camera.left = -5.0;
    topContactLight.shadow.camera.right = 5.0;
    topContactLight.shadow.camera.top = 5.0;
    topContactLight.shadow.camera.bottom = -5.0;
    topContactLight.shadow.bias = -0.0001;
    topContactLight.shadow.normalBias = 0.035;
    topContactLight.shadow.radius = 2.5;
    this.scene.add(topContactLight);

    // 5. Classic Articulated Desk Lamp with Dim Warm Yellow Bulb
    // Pointing gently towards the center of the chess board (dim, warm, non-harsh)
    const { lampGroup, spotLight, bulbPointLight, boardLightPool } = createDeskLamp(new THREE.Vector3(0, 0.1, 0));
    this.deskLampGroup = lampGroup;
    this.deskLampSpotLight = spotLight;
    this.scene.add(lampGroup);
    this.scene.add(spotLight);
    this.scene.add(spotLight.target);
    this.scene.add(bulbPointLight);
    if (boardLightPool) {
      this.scene.add(boardLightPool);
    }

    // 6. Subtle Cool Cyan Rim Light (+10% for crisp edge silhouette sheen on pieces)
    const cyanRimLight = new THREE.DirectionalLight(0x38bdf8, 0.24);
    cyanRimLight.position.set(6.5, 8.5, -7.5);
    this.scene.add(cyanRimLight);

    // 7. Secondary Cool Flank Light (+10% for sculptural piece definition)
    const flankCyanLight = new THREE.DirectionalLight(0x0ea5e9, 0.10);
    flankCyanLight.position.set(8.0, 5.0, 4.0);
    this.scene.add(flankCyanLight);
  }

  private createBoard() {
    // Outer wooden frame
    const frameWidth = 9.4;
    const frameHeight = 0.5;
    const frameGeom = new THREE.BoxGeometry(frameWidth, frameHeight, frameWidth);
    const frameMesh = new THREE.Mesh(frameGeom, this.materials.boardFrameMaterial);
    frameMesh.position.y = -frameHeight / 2;
    frameMesh.castShadow = true; // Casts grounding shadow on the white marble table
    frameMesh.receiveShadow = true;
    this.boardGroup.add(frameMesh);

    // Gold / Sapphire decorative border inlay
    const trimGeom = new THREE.BoxGeometry(8.16, 0.02, 8.16);
    const trimMesh = new THREE.Mesh(trimGeom, this.materials.goldTrimMaterial);
    trimMesh.position.y = 0.001;
    this.boardGroup.add(trimMesh);

    // 64 Individual tiles with bevel
    const tileGeom = new THREE.BoxGeometry(0.98, 0.08, 0.98);

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const square = `${files[f]}${ranks[r]}` as Square;
        const isLight = (r + f) % 2 !== 0;

        const tileMesh = new THREE.Mesh(
          tileGeom,
          isLight ? this.materials.lightTileMaterial : this.materials.darkTileMaterial
        );

        const x = f - this.BOARD_OFFSET;
        const z = this.BOARD_OFFSET - r; // Rank 1 is at +Z (White side), Rank 8 is at -Z (Black side)
        tileMesh.position.set(x, 0.04, z);
        tileMesh.receiveShadow = true;
        tileMesh.userData = { square, fileIndex: f, rankIndex: r };

        this.boardGroup.add(tileMesh);
        this.tileMeshes.set(square, tileMesh);
      }
    }

    // Add high-contrast Alphabet (A-H) and Number (1-8) coordinates to board borders
    this.createCoordinates();
  }

  private createCoordinateTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);

      // Deep solid black typography for coordinates
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 76px "Cinzel", "Times New Roman", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      ctx.fillText(text, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  private createCoordinates() {
    const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    const geom = new THREE.PlaneGeometry(0.48, 0.48);
    geom.rotateX(-Math.PI / 2);

    // 1. Files A to H on the front frame edge (White side, z = 4.32)
    for (let f = 0; f < 8; f++) {
      const tex = this.createCoordinateTexture(files[f]);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.98 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(f - this.BOARD_OFFSET, 0.012, 4.32);
      this.boardGroup.add(mesh);
      this.coordinateMeshes.push(mesh);
    }

    // 2. Files A to H on the rear frame edge (Black side, z = -4.32)
    for (let f = 0; f < 8; f++) {
      const tex = this.createCoordinateTexture(files[f]);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.98 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.y = Math.PI;
      mesh.position.set(f - this.BOARD_OFFSET, 0.012, -4.32);
      this.boardGroup.add(mesh);
      this.coordinateMeshes.push(mesh);
    }

    // 3. Ranks 1 to 8 on the left frame edge (x = -4.32)
    for (let r = 0; r < 8; r++) {
      const tex = this.createCoordinateTexture(ranks[r]);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.98 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(-4.32, 0.012, this.BOARD_OFFSET - r);
      this.boardGroup.add(mesh);
      this.coordinateMeshes.push(mesh);
    }

    // 4. Ranks 1 to 8 on the right frame edge (x = 4.32)
    for (let r = 0; r < 8; r++) {
      const tex = this.createCoordinateTexture(ranks[r]);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.98 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(4.32, 0.012, this.BOARD_OFFSET - r);
      this.boardGroup.add(mesh);
      this.coordinateMeshes.push(mesh);
    }
  }

  public setCoordinatesVisible(_visible: boolean) {
    this.coordinateMeshes.forEach(mesh => {
      mesh.visible = false;
    });
  }

  private createAffordanceMeshes() {
    // Dynamic Hover Indicator Tile
    const hoverGeom = new THREE.PlaneGeometry(0.98, 0.98);
    hoverGeom.rotateX(-Math.PI / 2);
    this.hoverIndicatorMesh = new THREE.Mesh(hoverGeom, this.materials.legalTileHoverMaterial);
    this.hoverIndicatorMesh.position.y = 0.082;
    this.hoverIndicatorMesh.visible = false;
    this.scene.add(this.hoverIndicatorMesh);

    // Selected Tile Halo
    this.selectedTileHighlight = new THREE.Mesh(hoverGeom.clone(), this.materials.selectedTileMaterial);
    this.selectedTileHighlight.position.y = 0.081;
    this.selectedTileHighlight.visible = false;
    this.scene.add(this.selectedTileHighlight);

    // Check Alert Highlight (pulsing red on king)
    this.checkHighlightMesh = new THREE.Mesh(hoverGeom.clone(), this.materials.checkAlertMaterial);
    this.checkHighlightMesh.position.y = 0.0815;
    this.checkHighlightMesh.visible = false;
    this.scene.add(this.checkHighlightMesh);
  }

  public squareToWorldPos(square: Square, yOffset = 0.08): THREE.Vector3 {
    const file = square.charCodeAt(0) - 97; // 0..7
    const rank = parseInt(square[1], 10) - 1; // 0..7
    const x = file - this.BOARD_OFFSET;
    const z = this.BOARD_OFFSET - rank;
    return new THREE.Vector3(x, yOffset, z);
  }

  public worldPosToSquare(pos: THREE.Vector3): Square | null {
    const file = Math.round(pos.x + this.BOARD_OFFSET);
    const rank = Math.round(this.BOARD_OFFSET - pos.z);

    if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
      return `${files[file]}${ranks[rank]}` as Square;
    }
    return null;
  }

  /**
   * Schedules an animation frame tracked in the active set for cancellation
   */
  private scheduleAnimFrame(fn: () => void): number {
    let animId = 0;
    animId = requestAnimationFrame(() => {
      this.activeAnimationIds.delete(animId);
      fn();
    });
    this.activeAnimationIds.add(animId);
    return animId;
  }

  /**
   * Schedules an animation frame specifically for captured pieces flying to the side trays.
   * Isolated from board move cancellations so captured pieces finish their arcs cleanly.
   */
  private scheduleCaptureAnimFrame(
    pieceObj: PieceMeshObject,
    fn: () => void,
    finalize: () => void
  ): number {
    const animId = requestAnimationFrame(() => {
      this.activeCaptureAnimations.delete(pieceObj);
      fn();
    });
    this.activeCaptureAnimations.set(pieceObj, { rafId: animId, finalize });
    return animId;
  }

  /**
   * Immediately aborts and cancels all active board animations (autonomous moves,
   * castling rooks, drop landings, snap-backs). When cancelCaptures is true,
   * also aborts in-flight capture arcs and instantly seats all captured pieces.
   */
  public cancelOngoingAnimations(cancelCaptures = false) {
    this.animationSession++;
    for (const id of this.activeAnimationIds) {
      cancelAnimationFrame(id);
    }
    this.activeAnimationIds.clear();

    if (cancelCaptures) {
      this.captureAnimationSession++;
      // Immediately finalize all in-flight captures safely into their side slots
      for (const [pieceObj, record] of Array.from(this.activeCaptureAnimations.entries())) {
        cancelAnimationFrame(record.rafId);
        record.finalize();
      }
      this.activeCaptureAnimations.clear();
    }

    if (this.grabbedPiece) {
      this.grabbedPiece.userData.isGrabbed = false;
      this.grabbedPiece.userData.isAnimating = false;
      this.grabbedPiece = null;
    }

    // Force-reset isAnimating and isGrabbed on active board pieces so none get locked
    for (const piece of this.pieceObjects.values()) {
      piece.userData.isAnimating = false;
      piece.userData.isGrabbed = false;
    }

    // Ensure all captured pieces are placed systematically upright in their table slots
    for (const color of ['b', 'w'] as const) {
      const list = this.capturedMeshes[color];
      for (let i = 0; i < list.length; i++) {
        const piece = list[i];
        // If piece is actively flying and captures are preserved, let it fly!
        if (!cancelCaptures && this.activeCaptureAnimations.has(piece)) {
          continue;
        }
        piece.visible = true;
        piece.userData.isAnimating = false;
        piece.userData.isGrabbed = false;
        piece.userData.square = null;
        if (piece.parent !== this.capturedPiecesGroup) {
          if (piece.parent) piece.parent.remove(piece);
          this.capturedPiecesGroup.add(piece);
        }
        const slotPos = this.getCapturedSlotPos(color, i);
        piece.position.copy(slotPos);
        piece.quaternion.identity();
        piece.rotation.set(0, color === 'b' ? Math.PI * 0.20 : -Math.PI * 0.20, 0);
        if (piece.userData.shadowPlane) {
          piece.userData.shadowPlane.position.set(slotPos.x, this.deskY, slotPos.z);
          piece.userData.shadowPlane.scale.set(1.0, 1.0, 1.0);
          (piece.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.55;
          piece.userData.shadowPlane.visible = true;
        }
      }
    }

    this.clearValidMoveDots();
  }

  /**
   * Cleans up and disposes a piece mesh completely from the 3D scene
   */
  private cleanlyRemovePiece(piece: PieceMeshObject, id: string) {
    this.piecesGroup.remove(piece);
    if (piece.userData.shadowPlane) {
      this.scene.remove(piece.userData.shadowPlane);
      try {
        piece.userData.shadowPlane.geometry.dispose();
        (piece.userData.shadowPlane.material as THREE.Material).dispose();
      } catch {}
    }
    // Cleanly dispose any custom cloned materials
    piece.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== piece.userData.shadowPlane) {
        if (
          child.material &&
          child.material !== this.materials.feltMaterial &&
          child.material !== this.materials.getPieceMaterial(piece.userData.color)
        ) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    this.pieceObjects.delete(id);
  }

  /**
   * Resets a piece mesh to a specific square, restoring standard upright
   * transform, original non-transparent material, and resting shadow.
   */
  private resetPieceToSquare(piece: PieceMeshObject, sq: Square) {
    if (piece === this.grabbedPiece) {
      piece.userData.square = sq;
      const worldPos = this.squareToWorldPos(sq);
      piece.userData.originalPos = worldPos.clone();
      return;
    }

    piece.userData.square = sq;
    piece.userData.isAnimating = false;
    piece.userData.isGrabbed = false;
    const worldPos = this.squareToWorldPos(sq);
    piece.position.copy(worldPos);
    piece.userData.originalPos = worldPos.clone();
    piece.userData.targetPos = worldPos.clone();

    // Ensure it is properly parented in piecesGroup
    if (piece.parent !== this.piecesGroup) {
      this.piecesGroup.add(piece);
    }

    // Upright rotation (knights angled towards center/opponent to show sculpted face and mane)
    piece.quaternion.identity();
    piece.rotation.set(0, this.getPieceDefaultRotationY(piece.userData.type, piece.userData.color, sq), 0);
    piece.scale.set(1, 1, 1);
    piece.visible = true;

    // Restore standard materials (in case any mesh had cloned transparent materials)
    const baseMat = this.materials.getPieceMaterial(piece.userData.color);
    piece.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== piece.userData.shadowPlane) {
        child.visible = true;
        if (child.geometry instanceof THREE.CircleGeometry) {
          child.material = this.materials.feltMaterial;
          child.visible = false;   // the study piece has its own baize underneath (see the piece setup)
        } else {
          if (child.material && child.material !== baseMat) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
          child.material = baseMat;
        }
      }
    });

    // Reset or re-create grounded drop shadow
    if (
      !piece.userData.shadowPlane ||
      !piece.userData.shadowPlane.parent ||
      !piece.userData.shadowPlane.geometry ||
      !piece.userData.shadowPlane.material
    ) {
      const shadowGeom = new THREE.PlaneGeometry(1.2, 1.2);
      shadowGeom.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: this.materials.softShadowTexture,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      });
      this.softenShadowMaterial(shadowMat);
      const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
      shadowPlane.position.set(worldPos.x, 0.082, worldPos.z);
      shadowPlane.scale.setScalar(0.95);
      shadowPlane.visible = true;
      shadowPlane.layers.set(this.HIDDEN_LAYER);
      this.scene.add(shadowPlane);
      piece.userData.shadowPlane = shadowPlane;
    } else {
      const shadow = piece.userData.shadowPlane;
      shadow.position.set(worldPos.x, 0.082, worldPos.z);
      shadow.scale.setScalar(1.02);
      const shadowMat = shadow.material as THREE.MeshBasicMaterial;
      shadowMat.opacity = 0.65;
      shadow.visible = true;
      if (shadow.parent !== this.scene) {
        this.scene.add(shadow);
      }
    }
  }

  /**
   * Perfectly synchronizes 3D piece meshes with chess.js board state.
   * Cancels in-flight animations, ensures every required piece is present,
   * reuses existing meshes, and restores any previously captured/undone pieces.
   */
  public syncWithChess(chess: Chess, preserveOngoingCaptures = true) {
    // 1. Cancel in-flight board animations (preserves ongoing capture flights if true)
    this.cancelOngoingAnimations(!preserveOngoingCaptures);

    // 2. Build target mapping from current chess.board()
    const currentBoard = chess.board();
    const targetSquares = new Map<Square, { type: PieceType; color: PieceColor }>();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = currentBoard[r][f];
        if (piece) {
          const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
          const sq = `${files[f]}${ranks[r]}` as Square;
          targetSquares.set(sq, { type: piece.type as PieceType, color: piece.color as PieceColor });
        }
      }
    }

    // 3. Match pieces:
    const matchedPieceIds = new Set<string>();
    const matchedSquares = new Set<Square>();

    // Pass A: Exact match on square with matching type and color
    for (const [id, piece] of this.pieceObjects.entries()) {
      const sq = piece.userData.square;
      if (matchedSquares.has(sq)) continue;
      const target = targetSquares.get(sq);
      if (target && target.type === piece.userData.type && target.color === piece.userData.color) {
        matchedPieceIds.add(id);
        matchedSquares.add(sq);
        this.resetPieceToSquare(piece, sq);
      }
    }

    // Pass B: For target squares that still need a piece, reuse an unmatched piece of identical type & color
    for (const [sq, target] of targetSquares.entries()) {
      if (matchedSquares.has(sq)) continue;

      let candidate: [string, PieceMeshObject] | null = null;
      for (const [id, piece] of this.pieceObjects.entries()) {
        if (!matchedPieceIds.has(id) && piece.userData.type === target.type && piece.userData.color === target.color) {
          candidate = [id, piece];
          break;
        }
      }

      if (candidate) {
        const [id, piece] = candidate;
        matchedPieceIds.add(id);
        matchedSquares.add(sq);
        this.resetPieceToSquare(piece, sq);
      }
    }

    // Pass C: For any remaining target squares (e.g. piece restored on undo), instantiate fresh mesh
    for (const [sq, target] of targetSquares.entries()) {
      if (matchedSquares.has(sq)) continue;

      const pieceId = `${target.color}_${target.type}_${sq}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newPiece = this.createPieceMesh(pieceId, target.type, target.color, sq);
      this.piecesGroup.add(newPiece);
      this.pieceObjects.set(pieceId, newPiece);
      matchedPieceIds.add(pieceId);
      matchedSquares.add(sq);
      this.resetPieceToSquare(newPiece, sq);
    }

    // Pass D: Remove any remaining unmatched piece objects (genuinely captured or extra)
    for (const [id, piece] of Array.from(this.pieceObjects.entries())) {
      if (!matchedPieceIds.has(id)) {
        this.cleanlyRemovePiece(piece, id);
      }
    }

    // Pass E (Fail-safe guarantee): Validate every target square has a valid, visible piece
    for (const [sq, target] of targetSquares.entries()) {
      let foundPiece: PieceMeshObject | null = null;
      for (const piece of this.pieceObjects.values()) {
        if (piece.userData.square === sq && piece.userData.type === target.type && piece.userData.color === target.color) {
          foundPiece = piece;
          break;
        }
      }
      if (!foundPiece) {
        const pieceId = `failsafe_${target.color}_${target.type}_${sq}_${Date.now()}`;
        const recoveredPiece = this.createPieceMesh(pieceId, target.type, target.color, sq);
        this.piecesGroup.add(recoveredPiece);
        this.pieceObjects.set(pieceId, recoveredPiece);
        this.resetPieceToSquare(recoveredPiece, sq);
      } else {
        if (foundPiece.parent !== this.piecesGroup) {
          this.piecesGroup.add(foundPiece);
        }
        foundPiece.visible = true;
      }
    }

    // 4. Update King in check highlight
    if (chess.inCheck()) {
      const turn = chess.turn();
      for (const piece of this.pieceObjects.values()) {
        if (piece.userData.type === 'k' && piece.userData.color === turn) {
          const pos = this.squareToWorldPos(piece.userData.square);
          if (this.checkHighlightMesh) {
            this.checkHighlightMesh.position.set(pos.x, 0.0815, pos.z);
            this.checkHighlightMesh.visible = true;
          }
          break;
        }
      }
    } else if (this.checkHighlightMesh) {
      this.checkHighlightMesh.visible = false;
    }

    // 5. Update last move highlight from history
    const history = chess.history({ verbose: true });
    if (history.length > 0) {
      const lastMove = history[history.length - 1];
      this.highlightLastMove(lastMove.from, lastMove.to);
    } else {
      this.clearLastMoveHighlights();
    }

    // 6. Synchronize 3D captured pieces on table flanks (left for black, right for white)
    // Counted from the board, so a position reloaded online (which clears the history) keeps its fallen pieces
    const lost = lostPieces(chess);
    const capturedBlack = lost.b;
    const capturedWhite = lost.w;
    this.syncCapturedPieces(capturedBlack, capturedWhite);
  }

  /**
   * Calculates the 3D table resting position for a captured piece.
   * - Black captured pieces systematically sit on the LEFT side of the board (x < -4.7).
   * - White captured pieces systematically sit on the RIGHT side of the board (x > +4.7).
   * Standing upright on the velvet felt tray surface at y = this.deskY.
   */
  public getCapturedSlotPos(color: PieceColor, index: number): THREE.Vector3 {
    const col = Math.floor(index / 8); // 0 or 1 (two systematic columns)
    const row = index % 8; // 0 to 7 (arranged along Z from front +2.90 to back -2.84)
    const z = 2.90 - row * 0.82;
    const y = this.deskY; // standing on the desk beside the board

    if (color === 'b') {
      // LEFT SIDE of the board for Black captured pieces
      const x = -5.35 - col * 0.85;
      return new THREE.Vector3(x, y, z);
    } else {
      // RIGHT SIDE of the board for White captured pieces
      const x = 5.35 + col * 0.85;
      return new THREE.Vector3(x, y, z);
    }
  }

  /**
   * Synchronizes 3D captured pieces standing on the marble table flanks.
   */
  public syncCapturedPieces(capturedBlack: PieceType[], capturedWhite: PieceType[]) {
    this.syncSideCaptured('b', capturedBlack);
    this.syncSideCaptured('w', capturedWhite);
    // Whatever happened in between, the trays show exactly one mesh per captured piece
    const listed = new Set<THREE.Object3D>([...this.capturedMeshes.w, ...this.capturedMeshes.b]);
    for (const child of [...this.capturedPiecesGroup.children]) {
      if (!listed.has(child)) {
        (child as PieceMeshObject).userData.trayDiscarded = true;
        this.capturedPiecesGroup.remove(child);
      }
    }
  }

  private syncSideCaptured(color: PieceColor, targetList: PieceType[]) {
    const currentList = this.capturedMeshes[color];

    // If counts match and piece types match, ensure positions and upright postures are correct
    let matches = currentList.length === targetList.length;
    if (matches) {
      for (let i = 0; i < targetList.length; i++) {
        if (currentList[i].userData.type !== targetList[i]) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      // Refresh positions in case anything moved or finished animating
      for (let i = 0; i < currentList.length; i++) {
        const piece = currentList[i];
        // If piece is actively flying in its parabolic capture arc, let it finish naturally
        if (this.activeCaptureAnimations.has(piece)) {
          continue;
        }
        piece.visible = true;
        piece.userData.isAnimating = false;
        piece.userData.isGrabbed = false;
        piece.userData.square = null;
        const slotPos = this.getCapturedSlotPos(color, i);
        piece.position.copy(slotPos);
        piece.quaternion.identity();
        piece.rotation.set(0, color === 'b' ? Math.PI * 0.20 : -Math.PI * 0.20, 0);
        if (piece.parent !== this.capturedPiecesGroup) {
          if (piece.parent) piece.parent.remove(piece);
          this.capturedPiecesGroup.add(piece);
        }
        if (piece.userData.shadowPlane) {
          piece.userData.shadowPlane.position.set(slotPos.x, this.deskY, slotPos.z);
          piece.userData.shadowPlane.scale.set(1.0, 1.0, 1.0);
          (piece.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.55;
          piece.userData.shadowPlane.visible = true;
        }
      }
      return;
    }

    // Reconcile: Clear existing captured meshes cleanly for this side
    for (const piece of currentList) {
      piece.userData.trayDiscarded = true;
      this.activeCaptureAnimations.delete(piece);
      if (piece.parent) {
        piece.parent.remove(piece);
      }
      if (piece.userData.shadowPlane) {
        this.scene.remove(piece.userData.shadowPlane);
        try {
          piece.userData.shadowPlane.geometry.dispose();
          (piece.userData.shadowPlane.material as THREE.Material).dispose();
        } catch {}
      }
      piece.traverse((child) => {
        if (child instanceof THREE.Mesh && child !== piece.userData.shadowPlane) {
          if (
            child.material &&
            child.material !== this.materials.feltMaterial &&
            child.material !== this.materials.getPieceMaterial(color)
          ) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    this.capturedMeshes[color] = [];

    // Recreate captured meshes systematically in their slots
    for (let i = 0; i < targetList.length; i++) {
      const type = targetList[i];
      const pieceId = `captured_${color}_${type}_${i}_${Date.now()}`;
      const slotPos = this.getCapturedSlotPos(color, i);
      const piece = this.createPieceMesh(pieceId, type, color, 'a1');
      piece.position.copy(slotPos);
      piece.rotation.set(0, color === 'b' ? Math.PI * 0.20 : -Math.PI * 0.20, 0);
      piece.userData.square = null;
      piece.userData.isAnimating = false;
      piece.userData.isGrabbed = false;

      // Position shadow plane onto velvet tray surface
      if (piece.userData.shadowPlane) {
        piece.userData.shadowPlane.position.set(slotPos.x, this.deskY, slotPos.z);
        piece.userData.shadowPlane.scale.set(1.0, 1.0, 1.0);
        (piece.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.55;
        piece.userData.shadowPlane.visible = true;
      }

      if (piece.parent) piece.parent.remove(piece);
      this.capturedPiecesGroup.add(piece);
      this.capturedMeshes[color].push(piece);
    }
  }

  /**
   * Smoothly animates an autonomous or AI move with parabolic 3D arc,
   * realistic tilt physics, ground shadow scaling, capture handling, and landing squash.
   */
  public animateAutonomousMove(
    from: Square,
    to: Square,
    promotionPiece = 'q',
    onComplete?: () => void
  ) {
    // 1. Find the moving piece mesh
    let movingPiece: PieceMeshObject | null = null;
    for (const piece of this.pieceObjects.values()) {
      if (piece.userData.square === from && !piece.userData.isGrabbed) {
        movingPiece = piece;
        break;
      }
    }

    if (!movingPiece) {
      // Fallback if piece mesh wasn't located
      this.highlightLastMove(from, to);
      if (onComplete) onComplete();
      return;
    }

    // 2. Identify target piece captures (regular square or En Passant)
    const capturedEntries: Array<{ id: string; piece: PieceMeshObject }> = [];
    for (const [id, piece] of this.pieceObjects.entries()) {
      if (piece.userData.square === to && piece !== movingPiece) {
        capturedEntries.push({ id, piece });
      }
    }

    if (movingPiece.userData.type === 'p' && from[0] !== to[0]) {
      const capturedPawnSq = `${to[0]}${from[1]}` as Square;
      for (const [id, piece] of this.pieceObjects.entries()) {
        if (piece.userData.square === capturedPawnSq && piece.userData.color !== movingPiece.userData.color) {
          capturedEntries.push({ id, piece });
        }
      }
    }

    // 3. Handle Castling (King moving 2 files)
    if (movingPiece.userData.type === 'k') {
      const fileFrom = from.charCodeAt(0);
      const fileTo = to.charCodeAt(0);
      const rank = from[1];

      // Kingside castle
      if (fileTo - fileFrom === 2) {
        const rookFrom = `h${rank}` as Square;
        const rookTo = `f${rank}` as Square;
        this.animateSecondaryRookCastle(rookFrom, rookTo);
      }
      // Queenside castle
      else if (fileFrom - fileTo === 2) {
        const rookFrom = `a${rank}` as Square;
        const rookTo = `d${rank}` as Square;
        this.animateSecondaryRookCastle(rookFrom, rookTo);
      }
    }

    // 5. Setup 3D Trajectory & Duration (Fluid, Smooth, Elegant Movement)
    movingPiece.userData.isAnimating = true;
    const startPos = this.squareToWorldPos(from);
    const endPos = this.squareToWorldPos(to);
    const distance = startPos.distanceTo(endPos);

    // Balanced smooth speed: crisp, elegant glide with zero jerk (380ms - 620ms)
    const duration = Math.max(380, Math.min(620, 320 + distance * 45));
    const arcHeight = 0.45 + Math.min(0.35, distance * 0.08);
    const startTime = performance.now();
    let captureTriggered = false;
    const triggerCaptures = () => {
      if (captureTriggered) return;
      captureTriggered = true;
      for (const entry of capturedEntries) {
        this.animateCaptureRemoval(entry.piece, entry.id, movingPiece!.position);
      }
    };

    // Show shadow during transit
    if (movingPiece.userData.shadowPlane) {
      movingPiece.userData.shadowPlane.visible = true;
    }

    const session = this.animationSession;
    const moveAnim = () => {
      if (this.animationSession !== session) return;

      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Perlin's C2-continuous Smootherstep curve for zero-jerk, buttery smooth glide
      // f(x) = 6x^5 - 15x^4 + 10x^3 (0 initial velocity, 0 final velocity, 0 acceleration jumps)
      const ease = progress * progress * progress * (progress * (progress * 6 - 15) + 10);

      // Horizontal translation with smootherstep
      const currX = startPos.x + (endPos.x - startPos.x) * ease;
      const currZ = startPos.z + (endPos.z - startPos.z) * ease;

      // Parabolic vertical arc (peaks at progress = 0.5) with soft sine envelope
      const verticalArcFactor = Math.pow(Math.sin(progress * Math.PI), 0.88);
      const currY = 0.08 + verticalArcFactor * arcHeight;

      movingPiece!.position.set(currX, currY, currZ);

      // Elegant dynamic banking / tilt along velocity that smoothly damps to 0 before touchdown
      const tiltEnvelope = Math.pow(Math.sin(progress * Math.PI), 2.0);
      const velocityX = (endPos.x - startPos.x) * tiltEnvelope * 0.08;
      const velocityZ = (endPos.z - startPos.z) * tiltEnvelope * 0.08;
      movingPiece!.rotation.z = -velocityX;
      movingPiece!.rotation.x = velocityZ;

      // Update soft drop shadow on board surface (tracks horizontally while scaling with elevation)
      if (movingPiece!.userData.shadowPlane) {
        const shadow = movingPiece!.userData.shadowPlane;
        shadow.position.set(currX, 0.082, currZ);
        const heightNorm = Math.max(0, (currY - 0.08) / arcHeight);
        shadow.scale.setScalar(0.95 + heightNorm * 1.35);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.18, 0.65 * (1.0 - heightNorm * 0.48));
        shadow.visible = true;
      }

      // Trigger natural capture impact reaction right as moving piece descends onto target square (~70% along arc)
      if (progress >= 0.70 && !captureTriggered && capturedEntries.length > 0) {
        triggerCaptures();
      }

      if (progress < 1) {
        this.scheduleAnimFrame(moveAnim);
      } else {
        if (this.animationSession !== session) return;
        triggerCaptures();
        // Land cleanly
        movingPiece!.position.copy(endPos);
        movingPiece!.rotation.x = 0;
        movingPiece!.rotation.z = 0;
        movingPiece!.userData.square = to;
        movingPiece!.userData.isAnimating = false;

        // Return shadow to crisp resting contact state
        if (movingPiece!.userData.shadowPlane) {
          movingPiece!.userData.shadowPlane.position.set(endPos.x, 0.082, endPos.z);
          movingPiece!.userData.shadowPlane.scale.setScalar(0.95);
          (movingPiece!.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.48;
          movingPiece!.userData.shadowPlane.visible = true;
        }

        // Highlight last move squares
        this.highlightLastMove(from, to);

        if (onComplete) {
          onComplete();
        }
      }
    };

    this.scheduleAnimFrame(moveAnim);
  }

  private animateSecondaryRookCastle(from: Square, to: Square) {
    let rookPiece: PieceMeshObject | null = null;
    for (const piece of this.pieceObjects.values()) {
      if (piece.userData.square === from) {
        rookPiece = piece;
        break;
      }
    }
    if (!rookPiece) return;

    rookPiece.userData.isAnimating = true;
    const startPos = this.squareToWorldPos(from);
    const endPos = this.squareToWorldPos(to);
    const duration = 380; // Crisp, smooth rook glide
    const startTime = performance.now();

    const session = this.animationSession;
    const rookAnim = () => {
      if (this.animationSession !== session) return;

      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smootherstep
      const ease = progress * progress * progress * (progress * (progress * 6 - 15) + 10);

      const currX = startPos.x + (endPos.x - startPos.x) * ease;
      const currZ = startPos.z + (endPos.z - startPos.z) * ease;
      const currY = 0.08 + Math.sin(progress * Math.PI) * 0.42;

      rookPiece!.position.set(currX, currY, currZ);

      if (rookPiece!.userData.shadowPlane) {
        const shadow = rookPiece!.userData.shadowPlane;
        shadow.position.set(currX, 0.082, currZ);
        const elev = (currY - 0.08) / 0.42;
        shadow.scale.setScalar(0.95 + elev * 0.85);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 0.55 * (1 - elev * 0.4));
        shadow.visible = true;
      }

      if (progress < 1) {
        this.scheduleAnimFrame(rookAnim);
      } else {
        if (this.animationSession !== session) return;
        rookPiece!.position.copy(endPos);
        rookPiece!.userData.square = to;
        rookPiece!.userData.isAnimating = false;
        if (rookPiece!.userData.shadowPlane) {
          rookPiece!.userData.shadowPlane.position.set(endPos.x, 0.082, endPos.z);
          rookPiece!.userData.shadowPlane.scale.setScalar(0.95);
          (rookPiece!.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.48;
          rookPiece!.userData.shadowPlane.visible = true;
        }
      }
    };
    this.scheduleAnimFrame(rookAnim);
  }

  private isRightMouseDown = false;
  private lastMouseScreenPos = new THREE.Vector2();

  private getPieceDefaultRotationY(type: PieceType, color: PieceColor, square: Square): number {
    if (this.studyReady) return this.study.pieceRotation(type, color, square[0]);
    if (type === 'n') {
      const isWhite = color === 'w';
      // Geometry snout is along +X, so +Math.PI/2 faces -Z (towards Black), -Math.PI/2 faces +Z (towards White)
      const baseRot = isWhite ? Math.PI / 2 : -Math.PI / 2;
      // Elegant 36-degree inward angle towards the center files to showcase the sculpted horse head profile, mane, eyes, and nostrils
      const file = square[0];
      const inward = file <= 'd' ? 0.62 : -0.62;
      return baseRot + (isWhite ? inward : -inward);
    }
    if (type === 'b') {
      const isWhite = color === 'w';
      // The bishop's diagonal miter slit cut is oriented along +X/+Z.
      // Angle the bishop so the deep diagonal cleft faces toward the player and board center
      const baseRot = isWhite ? 0.20 : Math.PI + 0.20;
      const file = square[0];
      const inward = file <= 'd' ? 0.22 : -0.22;
      return baseRot + (isWhite ? inward : -inward);
    }
    if (type === 'r') {
      // Rotated 45 degrees so the crenel cutouts and sculpted merlons are clearly visible from camera view
      return Math.PI / 4;
    }
    return 0;
  }

  private createPieceMesh(id: string, type: PieceType, color: PieceColor, square: Square): PieceMeshObject {
    const group = new THREE.Group() as PieceMeshObject;
    const geom = getPieceGeometry(type);
    const mat = this.materials.getPieceMaterial(color);

    const mainMesh = new THREE.Mesh(geom, mat);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    group.add(mainMesh);

    // Felt base
    const feltGeom = new THREE.CircleGeometry(0.35, 24);
    feltGeom.rotateX(-Math.PI / 2);
    const feltMesh = new THREE.Mesh(feltGeom, this.materials.feltMaterial);
    feltMesh.position.y = 0.005;
    group.add(feltMesh);

    // Dynamic Soft Contact & Elevation Drop Shadow Plane
    const shadowGeom = new THREE.PlaneGeometry(1.2, 1.2);
    shadowGeom.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.materials.softShadowTexture,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.softenShadowMaterial(shadowMat);
    const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
    const worldPos = this.squareToWorldPos(square);
    shadowPlane.position.set(worldPos.x, 0.082, worldPos.z);
    shadowPlane.scale.setScalar(1.02);
    shadowPlane.visible = true; // Grounding contact shadow visible at rest and elevated
    shadowPlane.layers.set(this.HIDDEN_LAYER);   // the study board's lighting shadows the pieces; these discs read as black circles
    this.scene.add(shadowPlane);

    group.position.copy(worldPos);

    // Face pieces / angle knights towards opponent
    group.rotation.y = this.getPieceDefaultRotationY(type, color, square);

    group.userData = {
      pieceId: id,
      square,
      type,
      color,
      originalPos: worldPos.clone(),
      targetPos: worldPos.clone(),
      isGrabbed: false,
      isAnimating: false,
      shadowPlane,
    };

    this.applyStudyPiece(group);
    return group;
  }

  /**
   * Animates a captured piece with realistic physical movement:
   * 1. Dynamic directional impulse from the attacking piece.
   * 2. Smooth parabolic arc gliding across the board boundary.
   * 3. Lands and settles upright onto its designated graveyard slot on the marble table:
   *    - Black pieces populate on the LEFT table flank (x < -4.7).
   *    - White pieces populate on the RIGHT table flank (x > +4.7).
   * 4. Soft grounding shadow tracks onto the marble table surface.
   */
  /**
   * Animates a captured piece with a realistic visual capture sequence:
   * 1. STAGE 1: Subtle slide & graceful fade-out on the battlefield tile:
   *    - Subtle kinetic recoil sliding away from the impact source (~0.45 units).
   *    - Physical tilt/wobble from the capture impulse.
   *    - Smooth opacity fade-out (1.0 -> 0.0) and contact shadow dissolution.
   * 2. STAGE 2: Seamless arrival into the captured pieces list on the table flank:
   *    - Moves to designated graveyard slot on the marble table flank.
   *    - Softly descends and fades in (0.0 -> 1.0) into its upright resting slot.
   */
  /**
   * Dev only, to study the capture break frame by frame:
   * window.__fxSlow = 20 plays it twenty times slower; window.__fxT = 0.3 holds it at 0.3 s (step it by changing the number).
   */
  private fxTarget(t: number, realDt: number): number {
    if (!(import.meta as any).env?.DEV) return t + realDt;
    const w = window as any;
    if (typeof w.__fxT === 'number') return w.__fxT;
    return t + realDt / (Number(w.__fxSlow) || 1);
  }

  /**
   * A captured piece breaks like carved stone. Its crown snaps off along a slanted line and topples away from the blow,
   * a wedge splits from the far side of the base, and the stump rocks and stays. Every break shows a solid, rough stone
   * face, not a hollow shell. Irregular shards scatter and settle on the squares, and a little dust puffs from the break.
   * Everything comes to rest, then fades; the whole piece reappears in the tray.
   */
  private spawnCaptureBreak(pieceObj: PieceMeshObject, color: PieceColor, awayDir: THREE.Vector3) {
    pieceObj.updateMatrixWorld(true);
    const sources: THREE.Mesh[] = [];
    const box = new THREE.Box3();
    pieceObj.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o === pieceObj.userData.shadowPlane || o.material === this.materials.feltMaterial) return;
      sources.push(o);
      box.expandByObject(o);
    });
    if (!sources.length || box.isEmpty()) return;
    this.renderer.localClippingEnabled = true;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const UP = new THREE.Vector3(0, 1, 0);
    const floorY = box.min.y;
    const topY = box.max.y;
    const height = topY - floorY;
    const axis = new THREE.Vector3((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const away = awayDir.clone().setY(0);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);

    // The piece's outline: how far it reaches from the centre line at each height and in each direction
    // (sampled over its whole surface, so it also fits the knight, which is not a turned piece)
    const BINS = 48, SECTORS = 24;
    const profile = Array.from({ length: BINS }, () => new Array(SECTORS).fill(0));
    const v = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const note = (p: THREE.Vector3) => {
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(((p.y - floorY) / height) * BINS)));
      const ang = Math.atan2(p.z - axis.z, p.x - axis.x);
      const sec = ((Math.floor(((ang + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS) + SECTORS) % SECTORS;
      profile[bin][sec] = Math.max(profile[bin][sec], Math.hypot(p.x - axis.x, p.z - axis.z));
    };
    for (const src of sources) {
      const pos = src.geometry.getAttribute('position');
      const idx = src.geometry.getIndex();
      const tris = idx ? idx.count / 3 : pos.count / 3;
      for (let i = 0; i < tris; i++) {
        const ia = idx ? idx.getX(i * 3) : i * 3, ib = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, ic = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        va.fromBufferAttribute(pos, ia).applyMatrix4(src.matrixWorld);
        vb.fromBufferAttribute(pos, ib).applyMatrix4(src.matrixWorld);
        vc.fromBufferAttribute(pos, ic).applyMatrix4(src.matrixWorld);
        for (const [x, y] of [[1, 0], [0, 1], [0, 0], [0.5, 0.5], [0.5, 0], [0, 0.5], [0.33, 0.33]]) {
          v.copy(va).multiplyScalar(x).addScaledVector(vb, y).addScaledVector(vc, 1 - x - y);
          note(v);
        }
      }
    }
    // turned pieces: fill the sectors a coarse mesh missed from their neighbours
    for (const row of profile) for (let k = 0; k < SECTORS; k++) if (row[k] === 0) row[k] = Math.min(row[(k + SECTORS - 1) % SECTORS], row[(k + 1) % SECTORS]);
    const R = (y: number, ang = 0) => {
      if (y < floorY || y > topY) return 0;
      const bin = Math.min(BINS - 1, Math.floor(((y - floorY) / height) * BINS));
      const f = ((ang + Math.PI) / (Math.PI * 2)) * SECTORS - 0.5;
      const k0 = ((Math.floor(f) % SECTORS) + SECTORS) % SECTORS, k1 = (k0 + 1) % SECTORS;
      const fr = f - Math.floor(f);
      return THREE.MathUtils.lerp(profile[bin][k0], profile[bin][k1], fr);
    };
    const inside = (p: THREE.Vector3) => Math.hypot(p.x - axis.x, p.z - axis.z) <= R(p.y, Math.atan2(p.z - axis.z, p.x - axis.x));

    // The break lines: a slanted crown break, and a near-vertical split on the far side of the base
    const cutY = floorY + height * rand(0.45, 0.6);
    const cutNormal = UP.clone().addScaledVector(away, rand(0.3, 0.5)).addScaledVector(side, rand(-0.2, 0.2)).normalize();
    const cutPoint = new THREE.Vector3(axis.x, cutY, axis.z);
    const cutAbove = new THREE.Plane().setFromNormalAndCoplanarPoint(cutNormal, cutPoint);
    const cutBelow = cutAbove.clone().negate();
    const wedgeNormal = away.clone().addScaledVector(side, rand(-0.4, 0.4)).normalize();
    const wedgeOffset = Math.max(0.02, R(floorY + height * 0.25, Math.atan2(away.z, away.x)) * rand(0.3, 0.5));
    const wedgePoint = axis.clone().setY(floorY).addScaledVector(wedgeNormal, wedgeOffset);
    const wedgeFar = new THREE.Plane().setFromNormalAndCoplanarPoint(wedgeNormal, wedgePoint);
    const wedgeNear = wedgeFar.clone().negate();

    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const root = new THREE.Group();
    this.scene.add(root);
    const shell = (m: THREE.Material, planes: THREE.Plane[]) => {
      const c = m.clone();
      c.transparent = false;   // solid until the fade: transparent pieces sort badly and look like glass
      c.opacity = 1;
      c.side = THREE.DoubleSide;   // where a break face falls short, the stone's inside shows, never the board through it
      c.clippingPlanes = planes;
      c.clipShadows = true;
      materials.push(c);
      return c;
    };
    // The inside of the stone: the piece's own colour, matte and a shade deeper, faceted like a fresh break
    const coreBase = this.materials.getPieceMaterial(color).clone() as THREE.MeshPhysicalMaterial;
    coreBase.roughness = 0.92;
    coreBase.metalness = 0;
    coreBase.clearcoat = 0;
    coreBase.flatShading = true;
    coreBase.color.multiplyScalar(color === 'w' ? 0.86 : 1.25);
    coreBase.transparent = false;
    materials.push(coreBase);
    const core = (planes: THREE.Plane[]) => {
      const c = coreBase.clone();
      c.clippingPlanes = planes;
      c.clipShadows = true;
      materials.push(c);
      return c;
    };

    // A rough break face on a plane: rings out to the silhouette, the rim jagged and the face bumped outwards,
    // so it reads as broken stone. `edge(dir)` finds how far the solid reaches along an in-plane direction.
    const breakFace = (centre: THREE.Vector3, normal: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3, edge: (dir: THREE.Vector3) => number, rough: number) => {
      const SEG = 36, RINGS = 4;
      const positions: number[] = [];
      const rim: number[] = [];
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        rim.push(edge(e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a))));
      }
      const bumps: number[][] = [];
      for (let r = 0; r <= RINGS; r++) {
        bumps.push([]);
        for (let s = 0; s < SEG; s++) bumps[r].push(r === 0 ? rough * 0.6 : rand(-0.3, 1) * rough * (r === RINGS ? 1.4 : 1));
      }
      const point = (r: number, s: number) => {
        const a = (s / SEG) * Math.PI * 2;
        const k = r / RINGS;
        const reach = rim[s % SEG] * k * (r === RINGS ? rand(0.9, 1.0) : 1);
        return centre.clone().addScaledVector(e1, Math.cos(a) * reach).addScaledVector(e2, Math.sin(a) * reach).addScaledVector(normal, bumps[r][s % SEG]);
      };
      const grid: THREE.Vector3[][] = [];
      for (let r = 0; r <= RINGS; r++) {
        grid.push([]);
        for (let s = 0; s < SEG; s++) grid[r].push(point(r, s));
      }
      const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let r = 0; r < RINGS; r++) {
        for (let s = 0; s < SEG; s++) {
          const a = grid[r][s], b = grid[r][(s + 1) % SEG], c = grid[r + 1][s], d = grid[r + 1][(s + 1) % SEG];
          if (r > 0) tri(a, b, d);
          tri(a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.computeVertexNormals();
      // face the triangles outwards, along `normal`
      const n = new THREE.Vector3();
      const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
      const pos = g.getAttribute('position');
      p0.fromBufferAttribute(pos, 0); p1.fromBufferAttribute(pos, 1); p2.fromBufferAttribute(pos, 2);
      n.subVectors(p1, p0).cross(p2.clone().sub(p0));
      if (n.dot(normal) < 0) {
        g.index = null;
        for (let i = 0; i < pos.count; i += 3) {
          const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
          pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
          pos.setXYZ(i + 2, x, y, z);
        }
        g.computeVertexNormals();
      }
      geometries.push(g);
      return g;
    };
    // How far the solid reaches from `from` along `dir` before leaving the silhouette (bisection)
    const reach = (from: THREE.Vector3, dir: THREE.Vector3) => {
      let lo = 0, hi = radius * 2.2;
      const p = new THREE.Vector3();
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        p.copy(from).addScaledVector(dir, mid);
        if (inside(p)) lo = mid; else hi = mid;
      }
      return lo;
    };

    const cutE1 = side.clone().projectOnPlane(cutNormal).normalize();
    const cutE2 = new THREE.Vector3().crossVectors(cutNormal, cutE1).normalize();
    const crownRough = Math.min(0.03, height * 0.025);
    const cutEdge = (dir: THREE.Vector3) => reach(cutPoint, dir);
    // the wedge split is a vertical plane: centre it at mid-height of the base
    const wedgeE1 = new THREE.Vector3(-wedgeNormal.z, 0, wedgeNormal.x);
    const wedgeCentre = wedgePoint.clone().setY(floorY + (cutY - floorY) * 0.45);
    const wedgeEdge = (dir: THREE.Vector3) => reach(wedgeCentre, dir);

    type Body = {
      obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3;
      hull: THREE.Vector3[];                    // local points that touch the board
      planes: { local: THREE.Plane; live: THREE.Plane }[];
      stump?: boolean; r?: number;
    };
    const bodies: Body[] = [];

    // One chunk of the piece: the real piece's meshes kept on the given sides of the break lines, plus its break faces
    const chunk = (keep: THREE.Plane[], faces: { g: THREE.BufferGeometry; clip: THREE.Plane[] }[], vel: THREE.Vector3, spin: THREE.Vector3, stump = false) => {
      // centre of mass: average of solid sample points on the kept side
      const pts: THREE.Vector3[] = [];
      for (let yi = 0; yi <= 16; yi++) {
        const y = floorY + (yi / 16) * height;
        for (let ai = 0; ai < 16; ai++) {
          for (const k of [0.35, 0.98]) {
            const a = (ai / 16) * Math.PI * 2 - Math.PI;
            const r = R(y, a);
            const p = new THREE.Vector3(axis.x + Math.cos(a) * r * k, y, axis.z + Math.sin(a) * r * k);
            if (keep.every((pl) => pl.distanceToPoint(p) >= 0)) pts.push(p);
          }
        }
      }
      for (const f of faces) {
        const pos = f.g.getAttribute('position');
        for (let i = 0; i < pos.count; i += 7) {
          const p = new THREE.Vector3().fromBufferAttribute(pos, i);
          if (f.clip.every((pl) => pl.distanceToPoint(p) >= -1e-4)) pts.push(p);
        }
      }
      if (!pts.length) return;
      const centre = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);

      const g = new THREE.Group();
      g.position.copy(centre);
      root.add(g);
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert();
      const allPlanes = new Map<THREE.Plane, THREE.Plane>();   // world plane at rest -> live plane
      const livePlane = (p: THREE.Plane) => {
        if (!allPlanes.has(p)) allPlanes.set(p, p.clone());
        return allPlanes.get(p)!;
      };
      const keepLive = keep.map(livePlane);
      for (const src of sources) {
        const mat = Array.isArray(src.material) ? src.material.map((m) => shell(m, keepLive)) : shell(src.material, keepLive);
        const mesh = new THREE.Mesh(src.geometry, mat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.multiplyMatrices(inv, src.matrixWorld);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      for (const f of faces) {
        const mesh = new THREE.Mesh(f.g, core(f.clip.map(livePlane)));
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(inv);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      bodies.push({
        obj: g, vel, spin, stump,
        hull: pts.map((p) => p.clone().applyMatrix4(inv)),
        planes: [...allPlanes].map(([rest, live]) => ({ local: rest.clone().applyMatrix4(inv), live })),
      });
    };

    const crownFace = breakFace(cutPoint, cutNormal.clone().negate(), cutE1, cutE2, cutEdge, crownRough);
    const baseFace = breakFace(cutPoint, cutNormal, cutE1, cutE2, cutEdge, crownRough);
    const wedgeFaceNear = breakFace(wedgeCentre, wedgeNormal.clone().negate(), wedgeE1, UP, wedgeEdge, crownRough * 0.8);
    const wedgeFaceFar = breakFace(wedgeCentre, wedgeNormal, wedgeE1, UP, wedgeEdge, crownRough * 0.8);

    // The crown: snaps off and topples away from the blow
    chunk([cutAbove], [{ g: crownFace, clip: [] }],
      away.clone().multiplyScalar(rand(0.7, 1.0)).addScaledVector(side, rand(-0.25, 0.25)).setY(rand(0.8, 1.15)),
      side.clone().multiplyScalar(rand(6, 9)).addScaledVector(UP, rand(-1.5, 1.5)));
    // The wedge: splits from the far side of the base
    chunk([cutBelow, wedgeFar], [{ g: baseFace, clip: [wedgeFar] }, { g: wedgeFaceFar, clip: [cutBelow] }],
      wedgeNormal.clone().multiplyScalar(rand(0.55, 0.85)).addScaledVector(side, rand(-0.3, 0.3)).setY(rand(0.35, 0.6)),
      new THREE.Vector3().crossVectors(UP, wedgeNormal).multiplyScalar(rand(5, 8)).addScaledVector(UP, rand(-2, 2)));
    // The stump: stays standing, rocked by the blow
    chunk([cutBelow, wedgeNear], [{ g: baseFace, clip: [wedgeNear] }, { g: wedgeFaceNear, clip: [cutBelow] }],
      new THREE.Vector3(), side.clone(), true);

    // Shards: irregular stones, a few larger and many tiny, faceted like broken stone
    const shardMat = coreBase.clone();
    shardMat.color.copy(this.materials.getPieceMaterial(color).color).multiplyScalar(color === 'w' ? 0.95 : 1.1);
    materials.push(shardMat);
    for (let i = 0; i < 26; i++) {
      const size = 0.012 + Math.pow(Math.random(), 2.4) * 0.07;
      const geom = Math.random() < 0.55 ? new THREE.TetrahedronGeometry(size) : new THREE.OctahedronGeometry(size * 0.85);
      geom.scale(rand(0.5, 1.4), rand(0.35, 0.9), rand(0.5, 1.4));
      geometries.push(geom);
      const mesh = new THREE.Mesh(geom, shardMat);
      mesh.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const ring = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const fromCut = Math.random() < 0.7;
      const y = fromCut ? cutY + rand(-0.04, 0.04) : floorY + rand(0.05, cutY - floorY);
      mesh.position.copy(axis).addScaledVector(ring, R(y, a > Math.PI ? a - Math.PI * 2 : a) * rand(0.6, 1.0)).setY(y);
      mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      root.add(mesh);
      const speed = rand(0.35, 1.0) * Math.min(2.2, 0.05 / (size + 0.02));   // the small ones fly further
      const vel = ring.multiplyScalar(speed * 0.7).addScaledVector(away, speed * 0.5).setY(rand(0.4, 1.6));
      bodies.push({ obj: mesh, vel, spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(rand(8, 24)), hull: [], planes: [], r: size * 0.45 });
    }

    // Dust: a soft puff from the break that spreads, lifts a little and thins away
    const dustTex = this.captureDustTexture();
    const dustColor = color === 'w' ? 0xe9dfcb : 0x9a9187;
    const dust: { sprite: THREE.Sprite; vel: THREE.Vector3; grow: number; peak: number; delay: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({ map: dustTex, color: dustColor, transparent: true, opacity: 0, depthWrite: false });
      materials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const low = i >= 8;   // a few low puffs where the pieces hit the board
      sprite.position.copy(axis).addScaledVector(dir, radius * (low ? 0.9 : 0.4)).setY(low ? floorY + 0.04 : cutY + rand(-0.06, 0.04));
      sprite.scale.setScalar(rand(0.1, 0.18));
      root.add(sprite);
      dust.push({
        sprite, vel: dir.multiplyScalar(rand(0.2, 0.45)).addScaledVector(away, 0.15).setY(rand(0.05, 0.2)),
        grow: rand(0.6, 1.1), peak: rand(0.22, 0.38) * (low ? 0.7 : 1), delay: low ? rand(0.18, 0.3) : 0,
      });
    }

    const HOLD = 0.05;   // the blow lands, the stone cracks, and only then does it come apart
    const REST = 1.05;   // seconds before the pieces start to fade
    const FADE = 0.5;
    const END = Math.max(REST + FADE, 1.4);
    const STEP = 1 / 240;
    const q = new THREE.Quaternion();
    const w = new THREE.Vector3();
    let t = 0;
    let fading = false;
    let last = performance.now();

    const integrate = (dt: number) => {
      t += dt;
      for (const b of bodies) {
        if (b.stump) {
          // rocks on its base and settles back upright
          const k = Math.exp(-t * 7) * Math.sin(t * 40) * 0.08;
          b.obj.quaternion.setFromAxisAngle(b.spin, k);
          continue;
        }
        if (t < HOLD && b.hull.length) {
          // the crack: a shiver before the chunks part
          continue;
        }
        b.vel.y -= 9.8 * dt;
        b.obj.position.addScaledVector(b.vel, dt);
        const s = b.spin.length();
        if (s > 1e-3) b.obj.quaternion.premultiply(q.setFromAxisAngle(w.copy(b.spin).divideScalar(s), s * dt));

        // contact with the board: the lowest point of the body may not go under it
        let low = Infinity;
        if (b.hull.length) {
          b.obj.updateMatrixWorld(true);
          for (const p of b.hull) low = Math.min(low, w.copy(p).applyMatrix4(b.obj.matrixWorld).y);
        } else {
          low = b.obj.position.y - (b.r ?? 0);
        }
        if (low < floorY) {
          b.obj.position.y += floorY - low;
          if (b.vel.y < -0.35) {
            b.vel.y = -b.vel.y * 0.22;   // stone barely bounces
            b.vel.x *= 0.6; b.vel.z *= 0.6;
            b.spin.multiplyScalar(0.5);
          } else {
            b.vel.y = Math.max(0, b.vel.y);
            b.vel.x *= 1 - 6 * dt; b.vel.z *= 1 - 6 * dt;   // grinding to a stop
            b.spin.multiplyScalar(1 - 7 * dt);
          }
        }
      }
      for (const d of dust) {
        const life = (t - d.delay) / 1.2;
        if (life < 0) continue;
        d.sprite.position.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(1 - 1.8 * dt);
        d.sprite.scale.multiplyScalar(1 + d.grow * dt);
        (d.sprite.material as THREE.SpriteMaterial).opacity = life < 0.1 ? d.peak * (life / 0.1) : d.peak * Math.max(0, 1 - (life - 0.1) / 0.9) ** 1.7;
      }
    };

    const step = (now: number) => {
      const target = Math.min(END, this.fxTarget(t, Math.min(0.05, (now - last) / 1000)));
      last = now;
      if (target < t) {
        requestAnimationFrame(step);   // (dev) seeking backwards is not supported; hold
        return;
      }
      while (t + STEP <= target) integrate(STEP);
      for (const b of bodies) {
        if (!b.planes.length) continue;
        b.obj.updateMatrixWorld(true);
        for (const p of b.planes) p.live.copy(p.local).applyMatrix4(b.obj.matrixWorld);
      }
      const fade = t < REST ? 1 : Math.max(0, 1 - (t - REST) / FADE);
      if (fade < 1 && !fading) {
        fading = true;
        for (const m of materials) if (!(m instanceof THREE.SpriteMaterial)) { m.transparent = true; m.needsUpdate = true; }
      }
      for (const m of materials) if (!(m instanceof THREE.SpriteMaterial)) m.opacity = fade;

      if (t < END - STEP) {
        requestAnimationFrame(step);
      } else {
        this.scene.remove(root);
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
      }
    };
    requestAnimationFrame(step);
  }

  private dustTexture: THREE.Texture | null = null;
  private captureDustTexture(): THREE.Texture {
    if (this.dustTexture) return this.dustTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.dustTexture = new THREE.CanvasTexture(c);
    return this.dustTexture;
  }

  private animateCaptureRemoval(pieceObj: PieceMeshObject, id: string, impactSourcePos?: THREE.Vector3) {
    if (pieceObj.userData.isAnimating) return;
    pieceObj.userData.isAnimating = true;

    const color = pieceObj.userData.color as PieceColor;
    const targetIndex = this.capturedMeshes[color].length;
    const targetSlot = this.getCapturedSlotPos(color, targetIndex);
    // Claim its tray slot now, not on arrival: a board resync during the flight then counts it
    // instead of rebuilding the tray with a second copy of it
    this.capturedMeshes[color].push(pieceObj);
    const discardIfReplaced = () => {
      if (!pieceObj.userData.trayDiscarded) return false;
      this.activeCaptureAnimations.delete(pieceObj);
      if (pieceObj.parent) pieceObj.parent.remove(pieceObj);
      return true;
    };

    // Free up board occupancy square immediately
    this.pieceObjects.delete(id);
    pieceObj.userData.square = null;

    // Clone materials so opacity modification only affects this captured piece
    const clonedMaterials: THREE.Material[] = [];
    pieceObj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => {
            const cloned = m.clone();
            cloned.transparent = true;
            clonedMaterials.push(cloned);
            return cloned;
          });
        } else {
          const cloned = child.material.clone();
          cloned.transparent = true;
          clonedMaterials.push(cloned);
          child.material = cloned;
        }
      }
    });

    // 1. Calculate physical recoil slide direction
    let impulseDir: THREE.Vector3;
    if (impactSourcePos) {
      impulseDir = new THREE.Vector3(
        pieceObj.position.x - impactSourcePos.x,
        0,
        pieceObj.position.z - impactSourcePos.z
      );
    } else {
      const outwardX = color === 'b' ? -1 : 1;
      impulseDir = new THREE.Vector3(outwardX, 0, (Math.random() - 0.5) * 0.4);
    }

    if (impulseDir.lengthSq() < 0.0001) {
      impulseDir.set(color === 'b' ? -1 : 1, 0, 0);
    }
    impulseDir.normalize();

    // Subtle slide vector (0.45 units along the tile surface)
    const slideDir = impulseDir.clone();
    const slideDistance = 0.45;
    const slideVector = slideDir.multiplyScalar(slideDistance);

    const startPos = pieceObj.position.clone();
    const slideTargetPos = new THREE.Vector3(
      startPos.x + slideVector.x,
      startPos.y,
      startPos.z + slideVector.z
    );

    // Subtle tilt axis perpendicular to slide direction
    const toppleAxis = new THREE.Vector3(-slideDir.z, 0, slideDir.x).normalize();
    const maxTiltAngle = Math.PI * 0.12; // Subtle 21-degree tilt recoil
    const initialQuaternion = pieceObj.quaternion.clone();

    // Target rotation upright in tray, facing slightly toward the battlefield
    const targetRotationY = color === 'b' ? Math.PI * 0.20 : -Math.PI * 0.20;
    const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);

    // The piece breaks on its square; the whole piece is hidden until it reappears in the tray
    this.spawnCaptureBreak(pieceObj, color, impulseDir);
    pieceObj.visible = false;

    const stage1Duration = 900; // the piece lies broken on its square before it reappears in the tray
    const stage2Duration = 260; // 260ms soft drop & fade-in into tray slot
    const startTime = performance.now();
    const session = this.captureAnimationSession;
    let isStage2 = false;
    let stage2StartTime = 0;

    const finalizePiece = () => {
      if (discardIfReplaced()) return;
      this.activeCaptureAnimations.delete(pieceObj);
      if (pieceObj.parent !== this.capturedPiecesGroup) {
        if (pieceObj.parent) pieceObj.parent.remove(pieceObj);
        this.capturedPiecesGroup.add(pieceObj);
      }
      if (!this.capturedMeshes[color].includes(pieceObj)) {
        this.capturedMeshes[color].push(pieceObj);
      }
      pieceObj.visible = true;
      pieceObj.position.copy(targetSlot);
      pieceObj.quaternion.copy(targetQuaternion);
      pieceObj.scale.set(1.0, 1.0, 1.0);
      pieceObj.userData.isAnimating = false;
      pieceObj.userData.isGrabbed = false;
      pieceObj.userData.square = null;

      // Restore full opacity
      for (const mat of clonedMaterials) {
        mat.opacity = 1.0;
      }

      if (pieceObj.userData.shadowPlane) {
        const shadow = pieceObj.userData.shadowPlane;
        shadow.position.set(targetSlot.x, this.deskY, targetSlot.z);
        shadow.scale.set(1.0, 1.0, 1.0);
        const shadowMat = shadow.material as THREE.MeshBasicMaterial;
        shadowMat.opacity = 0.55;
        shadow.visible = true;
      }
    };

    const captureAnim = () => {
      if (discardIfReplaced()) return;
      if (this.captureAnimationSession !== session) {
        finalizePiece();
        return;
      }

      const now = performance.now();

      // =====================================================================
      // STAGE 1: Subtle slide & fade-out on the board square
      // =====================================================================
      if (!isStage2) {
        const elapsed1 = now - startTime;
        const progress1 = Math.min(1, elapsed1 / stage1Duration);

        // Smooth ease-out for natural deceleration
        const ease1 = 1 - Math.pow(1 - progress1, 2.5);

        // Slide subtly across the square
        const currX = THREE.MathUtils.lerp(startPos.x, slideTargetPos.x, ease1);
        const currZ = THREE.MathUtils.lerp(startPos.z, slideTargetPos.z, ease1);
        const currY = startPos.y + Math.sin(progress1 * Math.PI) * 0.05; // Tiny hop

        pieceObj.position.set(currX, currY, currZ);

        // Subtle knockback tilt that eases back
        const tiltAngle = maxTiltAngle * Math.sin(progress1 * Math.PI);
        const qTilt = new THREE.Quaternion().setFromAxisAngle(toppleAxis, tiltAngle);
        pieceObj.quaternion.copy(qTilt).multiply(initialQuaternion);

        // Subtle scale shrink
        const currScale = 1.0 - 0.12 * ease1;
        pieceObj.scale.set(currScale, currScale, currScale);

        // Fade out piece opacity
        const currOpacity = Math.max(0, 1 - ease1);
        for (const mat of clonedMaterials) {
          mat.opacity = currOpacity;
        }

        // Fade out contact shadow on the board
        if (pieceObj.userData.shadowPlane) {
          const shadow = pieceObj.userData.shadowPlane;
          shadow.position.set(currX, 0.082, currZ);
          const shadowMat = shadow.material as THREE.MeshBasicMaterial;
          shadowMat.opacity = 0.65 * (1 - ease1);
          shadow.scale.setScalar(currScale);
        }

        if (progress1 < 1) {
          this.scheduleCaptureAnimFrame(pieceObj, captureAnim, finalizePiece);
        } else {
          // Transition to Stage 2: Move to captured pieces list on the table flank
          isStage2 = true;
          stage2StartTime = performance.now();

          // Reparent to captured group
          if (pieceObj.parent) {
            pieceObj.parent.remove(pieceObj);
          }
          this.capturedPiecesGroup.add(pieceObj);
          if (!this.capturedMeshes[color].includes(pieceObj)) {
            this.capturedMeshes[color].push(pieceObj);
          }

          // Reset scale and set initial hovering position above slot
          pieceObj.visible = true;
          pieceObj.scale.set(1.0, 1.0, 1.0);
          pieceObj.position.set(targetSlot.x, targetSlot.y + 0.22, targetSlot.z);
          pieceObj.quaternion.copy(targetQuaternion);

          for (const mat of clonedMaterials) {
            mat.opacity = 0;
          }

          if (pieceObj.userData.shadowPlane) {
            const shadow = pieceObj.userData.shadowPlane;
            shadow.position.set(targetSlot.x, this.deskY, targetSlot.z);
            shadow.scale.set(1.0, 1.0, 1.0);
            const shadowMat = shadow.material as THREE.MeshBasicMaterial;
            shadowMat.opacity = 0;
            shadow.visible = true;
          }

          this.scheduleCaptureAnimFrame(pieceObj, captureAnim, finalizePiece);
        }
      }
      // =====================================================================
      // STAGE 2: Gentle landing & fade-in into the captured pieces table slot
      // =====================================================================
      else {
        const elapsed2 = now - stage2StartTime;
        const progress2 = Math.min(1, elapsed2 / stage2Duration);

        // Smooth cubic ease-out landing
        const ease2 = 1 - Math.pow(1 - progress2, 3);

        const currY = THREE.MathUtils.lerp(targetSlot.y + 0.22, targetSlot.y, ease2);
        pieceObj.position.set(targetSlot.x, currY, targetSlot.z);

        // Fade in piece opacity
        for (const mat of clonedMaterials) {
          mat.opacity = ease2;
        }

        // Fade in shadow onto the marble table
        if (pieceObj.userData.shadowPlane) {
          const shadowMat = pieceObj.userData.shadowPlane.material as THREE.MeshBasicMaterial;
          shadowMat.opacity = 0.55 * ease2;
        }

        if (progress2 < 1) {
          this.scheduleCaptureAnimFrame(pieceObj, captureAnim, finalizePiece);
        } else {
          finalizePiece();
        }
      }
    };

    this.scheduleCaptureAnimFrame(pieceObj, captureAnim, finalizePiece);
  }

  public clearLastMoveHighlights() {
    this.lastMoveHighlights.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
    });
    this.lastMoveHighlights = [];
  }

  public highlightLastMove(from: Square, to: Square) {
    this.lastMoveHighlights.forEach((m) => this.scene.remove(m));
    this.lastMoveHighlights = [];

    [from, to].forEach((sq) => {
      const geom = new THREE.PlaneGeometry(0.98, 0.98);
      geom.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geom, this.materials.lastMoveMaterial);
      const pos = this.squareToWorldPos(sq);
      mesh.position.set(pos.x, 0.0805, pos.z);
      this.scene.add(mesh);
      this.lastMoveHighlights.push(mesh);
    });
  }

  // --- SPATIAL HAND & MOUSE INTERACTION SYSTEM ---

  public handleSpatialPointer(
    normalizedX: number, // 0..1 (Screen X)
    normalizedY: number, // 0..1 (Screen Y)
    isPinching: boolean,
    chess: Chess
  ) {
    // 1. Convert normalized 0..1 to NDC (-1 to +1)
    const ndcX = normalizedX * 2 - 1;
    const ndcY = -(normalizedY * 2 - 1);

    if (this.study.ownsCamera) return;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    if (isPinching) {
      if (!this.grabbedPiece) {
        // Attempt to grab piece under pointer
        this.attemptGrab(chess);
      } else {
        // Drag active piece along elevated drag plane
        this.updateDrag(chess);
      }
    } else {
      if (this.grabbedPiece) {
        // Release piece
        this.attemptDrop(chess);
      } else {
        // Hovering over board without pinch
        this.updateHover(chess);
      }
    }
  }

  private attemptGrab(chess: Chess) {
    // 1. Guard with cooldown debounce to prevent accidental re-grabs right after dropping
    if (performance.now() - this.lastDropTimestamp < this.GRAB_COOLDOWN_MS) {
      return;
    }

    const currentTurn = chess.turn();
    let candidatePiece: PieceMeshObject | null = null;

    // 2. Direct 3D piece mesh raycast
    const pieceMeshes: THREE.Object3D[] = [];
    this.pieceObjects.forEach((p) => {
      if (!p.userData.isAnimating) {
        pieceMeshes.push(p);
      }
    });

    const intersects = this.raycaster.intersectObjects(pieceMeshes, true);
    const pieceOf = (obj: THREE.Object3D | null): PieceMeshObject | null => {
      while (obj) {
        if (obj.parent === this.piecesGroup) return obj as PieceMeshObject;
        obj = obj.parent;
      }
      return null;
    };
    const hitPieces = intersects.map((i) => pieceOf(i.object)).filter((p): p is PieceMeshObject => !!p);

    // From behind the player a taller piece in front can cover the base of the one behind it,
    // so a pointer on a square takes the piece standing there whenever the ray also touches it
    const boardPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, boardPoint)) {
      const sq = this.worldPosToSquare(boardPoint);
      const onSquare = sq ? [...this.pieceObjects.values()].find((p) => p.userData.square === sq) : undefined;
      if (onSquare && hitPieces.includes(onSquare) && onSquare.userData.color === currentTurn && !onSquare.userData.isAnimating) {
        candidatePiece = onSquare;
      }
    }

    if (!candidatePiece && hitPieces.length > 0) {
      const piece = hitPieces[0];
      if (piece.userData.color === currentTurn && !piece.userData.isAnimating) {
        candidatePiece = piece;
      }
    }

    // 3. Tile-level fallback: If user points to a square containing their piece
    if (!candidatePiece) {
      const tileObjects = Array.from(this.tileMeshes.values());
      const tileIntersects = this.raycaster.intersectObjects(tileObjects, false);
      if (tileIntersects.length > 0) {
        const sq = tileIntersects[0].object.userData.square as Square;
        for (const p of this.pieceObjects.values()) {
          if (p.userData.square === sq && p.userData.color === currentTurn && !p.userData.isAnimating) {
            candidatePiece = p;
            break;
          }
        }
      }
    }

    // 4. Board proximity fallback: Find closest friendly piece within comfortable grab radius
    if (!candidatePiece) {
      const intersectPoint = new THREE.Vector3();
      const hit = this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
      if (hit) {
        let closestDist = 0.88; // Comfortable grab radius
        for (const p of this.pieceObjects.values()) {
          if (p.userData.color === currentTurn && !p.userData.isAnimating) {
            const dist = Math.hypot(intersectPoint.x - p.position.x, intersectPoint.z - p.position.z);
            if (dist < closestDist) {
              closestDist = dist;
              candidatePiece = p;
            }
          }
        }
      }
    }

    if (candidatePiece) {
      this.grabbedPiece = candidatePiece;
      candidatePiece.userData.isGrabbed = true;
      candidatePiece.userData.originalPos = candidatePiece.position.clone();
      candidatePiece.userData.originalPos.y = 0.08;

      soundEffects.playLiftSound();
      soundEffects.playPinchEngage();

      // Calculate legal moves for this piece
      this.legalMovesForGrabbed.clear();
      const moves = chess.moves({ square: candidatePiece.userData.square, verbose: true });
      moves.forEach((m) => this.legalMovesForGrabbed.add(m.to as Square));

      // Show valid move dots
      this.showValidMoveDots();

      // Show origin highlight
      if (this.selectedTileHighlight) {
        const originPos = this.squareToWorldPos(candidatePiece.userData.square);
        this.selectedTileHighlight.position.set(originPos.x, 0.081, originPos.z);
        this.selectedTileHighlight.visible = true;
      }
    }
  }

  private updateDrag(chess: Chess) {
    if (!this.grabbedPiece) return;

    // Raycast against the elevated plane
    const intersectPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);

    if (hit) {
      // 1. Strictly clamp coordinates within chessboard boundaries [-3.85, 3.85]
      const clampedX = Math.max(-3.85, Math.min(3.85, intersectPoint.x));
      const clampedZ = Math.max(-3.85, Math.min(3.85, intersectPoint.z));

      // 2. The piece goes exactly where the hand points, and the highlighted square is the one under it.
      //    Near a tile edge the current square holds for a little longer, so the highlight never flickers.
      const targetX = clampedX;
      const targetZ = clampedZ;
      let activeSquare = this.worldPosToSquare(new THREE.Vector3(clampedX, 0, clampedZ));
      if (this.hoveredTile && activeSquare !== this.hoveredTile) {
        const held = this.squareToWorldPos(this.hoveredTile);
        if (Math.abs(clampedX - held.x) < 0.62 && Math.abs(clampedZ - held.z) < 0.62) activeSquare = this.hoveredTile;
      }

      // 3. Follow the hand closely: only enough easing to take the edge off camera jitter
      this.grabbedPiece.position.x += (targetX - this.grabbedPiece.position.x) * 0.6;
      this.grabbedPiece.position.z += (targetZ - this.grabbedPiece.position.z) * 0.6;
      this.grabbedPiece.position.y += (this.PIECE_LIFT_HEIGHT - this.grabbedPiece.position.y) * 0.35;

      // Subtle, damped tilt while moving for natural physics feel
      const vx = (targetX - this.grabbedPiece.position.x) * 0.12;
      const vz = (targetZ - this.grabbedPiece.position.z) * 0.12;
      this.grabbedPiece.rotation.z = -vx;
      this.grabbedPiece.rotation.x = vz;

      // Dynamic soft contact shadow update on board surface (tracks horizontal projection while scaling with elevation)
      if (this.grabbedPiece.userData.shadowPlane) {
        const shadow = this.grabbedPiece.userData.shadowPlane;
        shadow.position.set(this.grabbedPiece.position.x, 0.082, this.grabbedPiece.position.z);
        shadow.visible = true;
        
        // Scale and soften shadow based on physical lift height
        const elevation = Math.max(0, (this.grabbedPiece.position.y - 0.08) / (this.PIECE_LIFT_HEIGHT - 0.08));
        shadow.scale.setScalar(0.95 + elevation * 1.35);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.18, 0.65 * (1.0 - elevation * 0.48));
      }

      // Update hovered tile and visual affordance
      if (activeSquare !== this.hoveredTile) {
        this.hoveredTile = activeSquare;
        this.updateHoverAffordance(activeSquare);
      }
    }
  }

  private updateHover(chess: Chess) {
    const tileObjects = Array.from(this.tileMeshes.values());
    const intersects = this.raycaster.intersectObjects(tileObjects, false);

    let activeSq: Square | null = null;
    if (intersects.length > 0) {
      activeSq = intersects[0].object.userData.square as Square;
    } else {
      const pieceMeshes = Array.from(this.pieceObjects.values());
      const pieceIntersects = this.raycaster.intersectObjects(pieceMeshes, true);
      if (pieceIntersects.length > 0) {
        let curr: THREE.Object3D | null = pieceIntersects[0].object;
        while (curr) {
          if (curr.parent === this.piecesGroup) {
            activeSq = (curr as PieceMeshObject).userData.square;
            break;
          }
          curr = curr.parent;
        }
      }
    }

    if (activeSq !== this.hoveredTile) {
      this.hoveredTile = activeSq;
      if (this.onHoverChangeCallback) {
        this.onHoverChangeCallback(activeSq ? { square: activeSq, isLegal: false } : null);
      }
    }
  }

  private updateHoverAffordance(square: Square | null) {
    if (!square || !this.hoverIndicatorMesh) {
      if (this.hoverIndicatorMesh) this.hoverIndicatorMesh.visible = false;
      if (this.onHoverChangeCallback) this.onHoverChangeCallback(null);
      return;
    }

    const pos = this.squareToWorldPos(square);
    this.hoverIndicatorMesh.position.set(pos.x, 0.082, pos.z);
    this.hoverIndicatorMesh.visible = true;

    const isLegal = this.legalMovesForGrabbed.has(square);
    this.hoverIndicatorMesh.material = isLegal
      ? this.materials.legalTileHoverMaterial
      : this.materials.illegalTileHoverMaterial;

    if (this.onHoverChangeCallback) {
      this.onHoverChangeCallback({ square, isLegal });
    }
  }

  private attemptDrop(chess: Chess) {
    if (!this.grabbedPiece) return;

    this.lastDropTimestamp = performance.now();
    soundEffects.playPinchRelease();

    const piece = this.grabbedPiece;
    const fromSquare = piece.userData.square;

    // The piece lands on the square that was highlighted while it was held; anything else goes back home
    const toSquare: Square | null = this.hoveredTile && this.legalMovesForGrabbed.has(this.hoveredTile) ? this.hoveredTile : null;

    let moveSuccess = false;
    if (toSquare && this.legalMovesForGrabbed.has(toSquare)) {
      if (this.onPieceDroppedCallback) {
        moveSuccess = this.onPieceDroppedCallback(fromSquare, toSquare);
      }
    }

    if (moveSuccess && toSquare) {
      let isCapture = false;
      const dropSourcePos = piece.position.clone();

      // 1. Remove captured piece on toSquare if any
      for (const [id, pieceObj] of this.pieceObjects.entries()) {
        if (pieceObj.userData.square === toSquare && pieceObj !== piece) {
          isCapture = true;
          this.animateCaptureRemoval(pieceObj, id, dropSourcePos);
        }
      }

      // 2. En Passant capture handling
      if (piece.userData.type === 'p' && fromSquare[0] !== toSquare[0]) {
        const capturedPawnSq = `${toSquare[0]}${fromSquare[1]}` as Square;
        for (const [id, pieceObj] of this.pieceObjects.entries()) {
          if (pieceObj.userData.square === capturedPawnSq && pieceObj.userData.color !== piece.userData.color) {
            isCapture = true;
            this.animateCaptureRemoval(pieceObj, id, dropSourcePos);
          }
        }
      }

      // 3. Castling secondary rook move
      if (piece.userData.type === 'k') {
        const fileFrom = fromSquare.charCodeAt(0);
        const fileTo = toSquare.charCodeAt(0);
        const rank = fromSquare[1];
        if (fileTo - fileFrom === 2) {
          this.animateSecondaryRookCastle(`h${rank}` as Square, `f${rank}` as Square);
        } else if (fileFrom - fileTo === 2) {
          this.animateSecondaryRookCastle(`a${rank}` as Square, `d${rank}` as Square);
        }
      }

      // Valid Drop: Animate landing drop & snap to center (play move sound if not capture)
      if (!isCapture) {
        soundEffects.playMoveSound();
      }
      piece.userData.square = toSquare;
      const targetPos = this.squareToWorldPos(toSquare);
      this.animateDropLanding(piece, targetPos, () => {
        this.syncWithChess(chess, true);
      });
    } else {
      // Invalid Drop: Snap back to original square
      soundEffects.playInvalidSound();
      this.animateSnapBack(piece, piece.userData.originalPos);
    }

    // Cleanup drag state
    this.clearValidMoveDots();
    if (this.hoverIndicatorMesh) this.hoverIndicatorMesh.visible = false;
    if (this.selectedTileHighlight) this.selectedTileHighlight.visible = false;
    this.grabbedPiece = null;
    this.hoveredTile = null;
    this.legalMovesForGrabbed.clear();
  }

  private animateDropLanding(piece: PieceMeshObject, targetPos: THREE.Vector3, onComplete?: () => void) {
    piece.userData.isAnimating = true;
    const startPos = piece.position.clone();
    const startTime = performance.now();
    const duration = 260; // Clean, responsive soft landing

    const session = this.animationSession;
    const landingAnim = () => {
      if (this.animationSession !== session) return;

      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Soft cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);

      piece.position.x = startPos.x + (targetPos.x - startPos.x) * ease;
      piece.position.z = startPos.z + (targetPos.z - startPos.z) * ease;
      piece.position.y = startPos.y + (0.08 - startPos.y) * ease;
      piece.rotation.x = piece.rotation.x * (1 - ease);
      piece.rotation.z = piece.rotation.z * (1 - ease);

      if (piece.userData.shadowPlane) {
        const shadow = piece.userData.shadowPlane;
        shadow.position.set(piece.position.x, 0.082, piece.position.z);
        const elev = Math.max(0, (piece.position.y - 0.08) / this.PIECE_LIFT_HEIGHT);
        shadow.scale.setScalar(0.95 + elev * 1.35);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.18, 0.65 * (1.0 - elev * 0.48));
        shadow.visible = true;
      }

      if (progress < 1) {
        this.scheduleAnimFrame(landingAnim);
      } else {
        if (this.animationSession !== session) return;
        piece.position.copy(targetPos);
        piece.rotation.x = 0;
        piece.rotation.z = 0;
        piece.userData.isAnimating = false;
        piece.userData.isGrabbed = false;

        if (piece.userData.shadowPlane) {
          piece.userData.shadowPlane.position.set(targetPos.x, 0.082, targetPos.z);
          piece.userData.shadowPlane.scale.setScalar(0.95);
          (piece.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.48;
          piece.userData.shadowPlane.visible = true;
        }

        if (onComplete) {
          onComplete();
        }
      }
    };
    this.scheduleAnimFrame(landingAnim);
  }

  private animateSnapBack(piece: PieceMeshObject, originalPos: THREE.Vector3) {
    piece.userData.isAnimating = true;
    const startPos = piece.position.clone();
    const startTime = performance.now();
    const duration = 280; // Smooth, snappy snap return

    const session = this.animationSession;
    const snapAnim = () => {
      if (this.animationSession !== session) return;

      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Soft cubic ease out
      const ease = 1 - Math.pow(1 - progress, 3);

      piece.position.x = startPos.x + (originalPos.x - startPos.x) * ease;
      piece.position.z = startPos.z + (originalPos.z - startPos.z) * ease;
      piece.position.y = startPos.y + (originalPos.y - startPos.y) * ease;
      piece.rotation.x *= 0.85;
      piece.rotation.z *= 0.85;

      if (piece.userData.shadowPlane) {
        const shadow = piece.userData.shadowPlane;
        shadow.position.set(piece.position.x, 0.082, piece.position.z);
        const elev = Math.max(0, (piece.position.y - 0.08) / this.PIECE_LIFT_HEIGHT);
        shadow.scale.setScalar(0.95 + elev * 1.35);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.18, 0.65 * (1.0 - elev * 0.48));
        shadow.visible = true;
      }

      if (progress < 1) {
        this.scheduleAnimFrame(snapAnim);
      } else {
        if (this.animationSession !== session) return;
        piece.position.copy(originalPos);
        piece.rotation.x = 0;
        piece.rotation.z = 0;
        piece.userData.isAnimating = false;
        piece.userData.isGrabbed = false;

        if (piece.userData.shadowPlane) {
          piece.userData.shadowPlane.position.set(originalPos.x, 0.082, originalPos.z);
          piece.userData.shadowPlane.scale.setScalar(0.95);
          (piece.userData.shadowPlane.material as THREE.MeshBasicMaterial).opacity = 0.48;
          piece.userData.shadowPlane.visible = true;
        }
      }
    };
    this.scheduleAnimFrame(snapAnim);
  }

  // Legal moves: a bright dot with a dark rim, so it stands out on both cream and black squares;
  // a square holding a piece that can be taken gets a ring around that piece instead
  private showValidMoveDots() {
    this.clearValidMoveDots();
    const flat = (g: THREE.BufferGeometry) => { g.rotateX(-Math.PI / 2); return g; };
    const dotRim = flat(new THREE.CircleGeometry(0.2, 32)), dotFill = flat(new THREE.CircleGeometry(0.15, 32));
    const ringRim = flat(new THREE.RingGeometry(0.38, 0.48, 48)), ringFill = flat(new THREE.RingGeometry(0.4, 0.46, 48));
    const occupied = new Set([...this.pieceObjects.values()].filter((p) => p !== this.grabbedPiece).map((p) => p.userData.square));

    this.legalMovesForGrabbed.forEach((sq) => {
      const pos = this.squareToWorldPos(sq);
      const capture = occupied.has(sq);
      const rim = new THREE.Mesh(capture ? ringRim : dotRim, this.materials.validDotRimMaterial);
      const fill = new THREE.Mesh(capture ? ringFill : dotFill, this.materials.validDotMaterial);
      rim.position.set(pos.x, 0.0812, pos.z);
      fill.position.set(pos.x, 0.0814, pos.z);
      rim.renderOrder = 2; fill.renderOrder = 3;
      for (const m of [rim, fill]) { this.scene.add(m); this.validMoveIndicators.push(m); }
    });
  }

  private clearValidMoveDots() {
    this.validMoveIndicators.forEach((dot) => this.scene.remove(dot));
    this.validMoveIndicators = [];
  }

  // --- CAMERA CONTROLS & PRESETS ---

  /** An online duel: the opponent's camera stands across the table (null takes it away) */
  public setOpponentVideo(stream: MediaStream | null, mySide: 'w' | 'b') {
    const had = this.opponentFrame.hasStream;
    this.opponentFrame.setStream(stream);
    // The playing view pulls back a little while the frame is up, so it fits above the board
    if (had !== !!stream && (this.currentPreset === 'white' || this.currentPreset === 'black')) this.setCameraPreset(this.currentPreset);
    this.placeOpponentFrame(mySide);
  }

  private placeOpponentFrame(mySide: 'w' | 'b' = this.studySide) {
    if (!this.opponentFrame.hasStream) return;
    const v = this.study.gameView();
    const eye = this.camera.clone();
    eye.position.copy(v.pos);
    this.opponentFrame.place(mySide, eye);
  }

  public setCameraPreset(preset: CameraPreset, animated = true) {
    const nextTargetPos = new THREE.Vector3();
    const nextTargetLookAt = new THREE.Vector3(0, 0, 0);

    this.currentPreset = preset;
    if (preset === 'white' || preset === 'black') {
      this.studySide = preset === 'white' ? 'w' : 'b';
      this.shadeDarkPieces();
    }
    if (this.study.ownsCamera) return;   // still on the landing page or in the book; the study hands over later

    switch (preset) {
      case 'white':
      case 'black': {
        const v = this.study.gameView();
        nextTargetPos.copy(v.pos);
        nextTargetLookAt.copy(v.target);
        break;
      }
      case 'overhead':
        nextTargetPos.set(0, 13.5, 0.01);
        nextTargetLookAt.set(0, 0, 0);
        break;
      case 'isometric':
        nextTargetPos.set(8.4, 10.2, 8.4);
        nextTargetLookAt.set(0, 0, 0);
        break;
      case 'free':
        return;
    }

    if (!animated) {
      this.isOrbitTransitioning = false;
      this.targetCameraPos.copy(nextTargetPos);
      this.targetCameraLookAt.copy(nextTargetLookAt);
      this.currentCameraLookAt.copy(nextTargetLookAt);
      this.camera.position.copy(nextTargetPos);
      this.camera.lookAt(nextTargetLookAt);
      return;
    }

    // Determine if we should perform an orbital transition around lookAt center
    const center = nextTargetLookAt;
    const currX = this.camera.position.x - center.x;
    const currZ = this.camera.position.z - center.z;
    const currR = Math.hypot(currX, currZ);
    const currAngle = Math.atan2(currX, currZ);

    const targetX = nextTargetPos.x - center.x;
    const targetZ = nextTargetPos.z - center.z;
    const targetR = Math.hypot(targetX, targetZ);
    const targetAngle = Math.atan2(targetX, targetZ);

    // If both current and target have positive horizontal radius, use orbital arc
    if (currR > 0.5 && targetR > 0.5) {
      let deltaAngle = targetAngle - currAngle;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

      // When rotating ~180 degrees (e.g. White to Black or Black to White):
      // Pick a consistent smooth direction
      if (Math.abs(Math.abs(deltaAngle) - Math.PI) < 0.08) {
        deltaAngle = Math.PI;
      }

      this.isOrbitTransitioning = true;
      this.orbitStartTime = performance.now();
      this.orbitDuration = 820;
      this.orbitStartAngle = currAngle;
      this.orbitDeltaAngle = deltaAngle;
      this.orbitStartRadius = currR;
      this.orbitTargetRadius = targetR;
      this.orbitStartY = this.camera.position.y;
      this.orbitTargetY = nextTargetPos.y;
      this.orbitStartLookAt.copy(this.currentCameraLookAt);
      this.orbitTargetLookAt.copy(nextTargetLookAt);
      this.targetCameraPos.copy(nextTargetPos);
      this.targetCameraLookAt.copy(nextTargetLookAt);
    } else {
      // Fallback straight lerp for near-zero radius (like straight overhead)
      this.isOrbitTransitioning = false;
      this.targetCameraPos.copy(nextTargetPos);
      this.targetCameraLookAt.copy(nextTargetLookAt);
    }
  }

  // --- MOUSE / TOUCH EVENT LISTENERS ---

  private setupEventListeners() {
    const dom = this.renderer.domElement;

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', (e) => {
      const rect = dom.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      this.mouseCoords.set(nx, ny);
      this.lastMouseScreenPos.set(e.clientX, e.clientY);

      if (e.button === 2 && !this.study) {
        this.isRightMouseDown = true;
        this.isOrbitTransitioning = false;
      } else if (e.button === 0) {
        this.isMouseDown = true;
      }
    });

    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      this.mouseCoords.set(nx, ny);

      if (this.isRightMouseDown) {
        this.isOrbitTransitioning = false;
        const dx = (e.clientX - this.lastMouseScreenPos.x) * 0.006;
        const dy = (e.clientY - this.lastMouseScreenPos.y) * 0.006;

        // Orbit targetCameraPos around lookAt point
        const offset = this.targetCameraPos.clone().sub(this.targetCameraLookAt);
        const radius = offset.length();

        let theta = Math.atan2(offset.x, offset.z) - dx;
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) + dy;
        phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, phi)); // Don't flip under the board

        this.targetCameraPos.x = this.targetCameraLookAt.x + radius * Math.sin(phi) * Math.sin(theta);
        this.targetCameraPos.y = this.targetCameraLookAt.y + radius * Math.cos(phi);
        this.targetCameraPos.z = this.targetCameraLookAt.z + radius * Math.sin(phi) * Math.cos(theta);
      }
      this.lastMouseScreenPos.set(e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', this.onPointerUp);

    // Smooth interactive mouse wheel distance scaling
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        return;   // the camera stays fixed behind the player
        this.isOrbitTransitioning = false;
        const zoomDelta = e.deltaY * 0.005;
        const currentDist = this.targetCameraPos.length();
        const newDist = Math.max(8.0, Math.min(22.0, currentDist + zoomDelta));
        this.targetCameraPos.normalize().multiplyScalar(newDist);
      },
      { passive: false }
    );

    window.addEventListener('resize', this.onResize);
  }

  private onPointerUp = () => {
    this.isMouseDown = false;
    this.isRightMouseDown = false;
  };

  public handleMouseFallback(chess: Chess) {
    this.handleSpatialPointer(this.mouseCoords.x, this.mouseCoords.y, this.isMouseDown, chess);
  }

  public isPieceLifted(): boolean {
    return this.grabbedPiece !== null;
  }

  private onResize = () => {
    if (!this.container || !this.renderer || !this.camera || !this.composer || !this.study) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
    this.study.onResize();   // aspect, field of view and the post-processing targets
    if (!this.study.ownsCamera && (this.currentPreset === 'white' || this.currentPreset === 'black')) {
      this.setCameraPreset(this.currentPreset, false);   // refit the board to the new shape
    }
  };

  public setOnPieceDropped(cb: (from: Square, to: Square) => boolean) {
    this.onPieceDroppedCallback = cb;
  }

  public setOnHoverChange(cb: (hover: { square: Square; isLegal: boolean } | null) => void) {
    this.onHoverChangeCallback = cb;
  }

  private animate = () => {
    // Camera animation
    if (this.study.ownsCamera) {
      // the study drives the camera on the landing page and in the book
    } else if (this.isOrbitTransitioning) {
      const now = performance.now();
      const elapsed = now - this.orbitStartTime;
      const progress = Math.min(1, Math.max(0, elapsed / this.orbitDuration));

      // Ease-in-out cubic
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const angle = this.orbitStartAngle + this.orbitDeltaAngle * eased;
      const r = this.orbitStartRadius + (this.orbitTargetRadius - this.orbitStartRadius) * eased;
      const y = this.orbitStartY + (this.orbitTargetY - this.orbitStartY) * eased;

      this.camera.position.set(
        this.targetCameraLookAt.x + r * Math.sin(angle),
        this.targetCameraLookAt.y + y,
        this.targetCameraLookAt.z + r * Math.cos(angle)
      );

      this.currentCameraLookAt.lerpVectors(this.orbitStartLookAt, this.orbitTargetLookAt, eased);
      this.camera.lookAt(this.currentCameraLookAt);

      if (progress >= 1) {
        this.isOrbitTransitioning = false;
        this.camera.position.copy(this.targetCameraPos);
        this.currentCameraLookAt.copy(this.targetCameraLookAt);
        this.camera.lookAt(this.currentCameraLookAt);
      }
    } else {
      // Camera smooth lerp
      this.camera.position.lerp(this.targetCameraPos, 0.06);
      this.currentCameraLookAt.lerp(this.targetCameraLookAt, 0.06);
      this.camera.lookAt(this.currentCameraLookAt);
    }

    // Check indicator pulse
    if (this.checkHighlightMesh && this.checkHighlightMesh.visible) {
      const time = performance.now() * 0.005;
      const scale = 1.0 + Math.sin(time) * 0.08;
      this.checkHighlightMesh.scale.set(scale, 1, scale);
    }

    // Natural candlelight breathing flicker
    if (this.candleLight) {
      const t = performance.now() * 0.003;
      this.candleLight.intensity = 0.70 + Math.sin(t * 5.2) * 0.05 + Math.cos(t * 9.7) * 0.03;
    }

    // The study renders through its own pipeline (AO, grade); nothing is drawn until it has loaded,
    // or while a full-screen overlay has asked for the frames (renderHold)
    if (!isSceneRenderHeld()) this.study.tick();
    // The player's own camera tile matches the opponent's frame on screen (read by CSS as --opp-frame-w/h)
    // Only in the playing view: the book (Profile) and the landing page move the camera elsewhere
    this.opponentFrame.group.visible = this.opponentFrame.hasStream && !this.study.ownsCamera;
    const fs = this.opponentFrame.tick(this.camera, this.container.clientWidth, this.container.clientHeight);
    const key = fs ? `${Math.round(fs.w)}x${Math.round(fs.h)}` : '';
    if (key !== this.frameSize) {
      this.frameSize = key;
      const root = document.documentElement.style;
      if (fs) { root.setProperty('--opp-frame-w', `${Math.round(fs.w)}px`); root.setProperty('--opp-frame-h', `${Math.round(fs.h)}px`); }
      else { root.removeProperty('--opp-frame-w'); root.removeProperty('--opp-frame-h'); }
    }
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  public dispose() {
    this.cancelOngoingAnimations(true);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerup', this.onPointerUp);

    // Clean up captured pieces meshes and shadows
    ['w', 'b'].forEach((col) => {
      this.capturedMeshes[col as PieceColor].forEach((piece) => {
        if (piece.userData.shadowPlane) {
          this.scene.remove(piece.userData.shadowPlane);
          try {
            piece.userData.shadowPlane.geometry.dispose();
            (piece.userData.shadowPlane.material as THREE.Material).dispose();
          } catch {}
        }
      });
    });

    this.opponentFrame.dispose();
    this.study.dispose();
    this.renderer.dispose();
    this.composer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
