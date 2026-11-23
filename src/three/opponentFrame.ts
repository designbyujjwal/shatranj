import * as THREE from 'three';

/**
 * The opponent's live camera in a gilded frame standing across the table, as if they sat opposite.
 * Game units: the board is 8 wide, centred on the origin, White's side toward +z.
 * The <video> here is silent; the HUD card plays the opponent's voice.
 */
export const FRAME_W = 4.4, FRAME_H = 3.3;          // the picture, 4:3
const BORDER = .32, DEPTH = .18;
const FAR = 5.3, LIFT = .05;                        // past the far edge of the board, raised above the table

export function createOpponentFrame() {
  const group = new THREE.Group();
  group.visible = false;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Unlit, so the picture keeps its own colours under the lamp
  const screenMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const blankMat = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_W, FRAME_H), blankMat);
  screen.position.z = DEPTH / 2 + .002;

  const gold = new THREE.MeshStandardMaterial({ color: 0xc99a4b, metalness: .9, roughness: .32 });
  const backing = new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: .8 });
  const bar = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), gold);
    m.position.set(x, y, 0);
    return m;
  };
  const W = FRAME_W + BORDER * 2, H = FRAME_H + BORDER * 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, DEPTH * .6), backing);
  back.position.z = -DEPTH * .25;
  // A thin inner lip in a darker gold reads as moulding
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x8a6428, metalness: .85, roughness: .4 });
  const lip = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH * .5), lipMat);
    m.position.set(x, y, DEPTH * .3);
    return m;
  };
  const L = .07;
  group.add(
    back, screen,
    bar(W, BORDER, 0, (H - BORDER) / 2), bar(W, BORDER, 0, -(H - BORDER) / 2),
    bar(BORDER, H, -(W - BORDER) / 2, 0), bar(BORDER, H, (W - BORDER) / 2, 0),
    lip(FRAME_W + L * 2, L, 0, FRAME_H / 2 + L / 2), lip(FRAME_W + L * 2, L, 0, -FRAME_H / 2 - L / 2),
    lip(L, FRAME_H, -FRAME_W / 2 - L / 2, 0), lip(L, FRAME_H, FRAME_W / 2 + L / 2, 0),
  );

  let live = false;
  const corners = [new THREE.Vector3(), new THREE.Vector3()];

  return {
    group,
    /** Show the frame with this stream (null hides it) */
    setStream(stream: MediaStream | null) {
      video.srcObject = stream;
      group.visible = !!stream;
      if (stream) video.play().catch(() => { /* muted video may still wait for a gesture; it starts on the next one */ });
    },
    /** Which side of the table the frame stands on: across from `mySide` */
    place(mySide: 'w' | 'b', camera: THREE.Camera) {
      const z = mySide === 'b' ? FAR : -FAR;
      group.position.set(0, LIFT + H / 2, z);
      // Face the player, leaning back a little like a portrait on a stand
      const eye = camera.position.clone();
      eye.y = group.position.y + (eye.y - group.position.y) * .25;
      group.lookAt(eye);
    },
    /** Per frame: swap in the picture once frames arrive, and report the frame's size on screen */
    tick(camera: THREE.Camera, width: number, height: number) {
      const ready = video.readyState >= 2 && video.videoWidth > 0;
      if (ready !== live) { live = ready; screen.material = ready ? screenMat : blankMat; }
      if (!group.visible) return null;
      group.updateMatrixWorld();
      corners[0].set(-FRAME_W / 2, -FRAME_H / 2, 0).applyMatrix4(group.matrixWorld).project(camera);
      corners[1].set(FRAME_W / 2, FRAME_H / 2, 0).applyMatrix4(group.matrixWorld).project(camera);
      return {
        w: Math.abs(corners[1].x - corners[0].x) / 2 * width,
        h: Math.abs(corners[1].y - corners[0].y) / 2 * height,
      };
    },
    dispose() {
      video.srcObject = null;
      texture.dispose(); screenMat.dispose(); blankMat.dispose(); gold.dispose(); backing.dispose(); lipMat.dispose();
      group.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    },
  };
}
