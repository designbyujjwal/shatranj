// @ts-nocheck
/* Study world: the dark study, banker's lamp, rosewood tournament board, lighting, book onboarding and
 * post-processing, generated from experiments/study/index.html by experiments/tools/make-study-module.mjs.
 * Edit the prototype and regenerate rather than editing this file by hand. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One game unit = one square = 5.5 cm in the study. */
export const STUDY_SCALE = 1 / 0.055;
/** Height of the game's board surface (top of its tiles). */
const GAME_BOARD_TOP = 0.08;

const STUDY_CSS = "  #study-ui {\n    color-scheme: dark;\n    --crimson: #7d0c12;\n    --crimson-deep: #3f0508;\n    --brass: #c99a4b;\n    --brass-soft: #ecd29a;\n    --parchment: #e9dcc0;\n    --ink: #120c08;\n  }\n\n  #veil { position: fixed; inset: 0; z-index: 50; background: #050403; display: grid; place-items: center; transition: opacity 1.6s ease; }\n  #veil.gone { opacity: 0; pointer-events: none; }\n  #veil span { font-family: 'Cinzel', serif; letter-spacing: .4em; font-size: 12px; color: rgba(233, 220, 192, .5); }\n\n  .modes { position: fixed; top: max(14px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); z-index: 30; display: flex; gap: 4px; }\n  .modes button { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(201, 154, 75, .28); background: rgba(8, 6, 4, .45); color: rgba(233, 220, 192, .6); cursor: pointer; }\n  .modes button.active { border-color: var(--brass); color: var(--brass-soft); }\n\n  #landing { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-bottom: max(34px, env(safe-area-inset-bottom, 0px)); padding-top: 120px; background: linear-gradient(to top, rgba(4, 3, 2, .92), rgba(4, 3, 2, .55) 50%, transparent); transition: opacity .9s, transform .9s; }\n  #landing.hidden { opacity: 0; transform: translateY(24px); pointer-events: none; }\n  /* one column: logo, tagline, name field and button share this width, so both edges line up */\n  #landing { --col: clamp(280px, 30vw, 340px); }\n  .brand { margin: 0; line-height: 0; width: var(--col); }\n  .brand img { width: 100%; height: auto; display: block; filter: drop-shadow(0 8px 30px rgba(0, 0, 0, .7)); }\n  .tagline { font-family: 'Cinzel', serif; width: var(--col); font-size: 10px; letter-spacing: .12em; white-space: nowrap; text-transform: uppercase; color: rgba(233, 220, 192, .7); margin: 14px 0 16px; text-align: center; }\n  .name { width: var(--col); height: 44px; border-radius: 6px; color: #f6e9cf; text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 500; outline: none;\n    background: linear-gradient(180deg, rgba(58, 42, 28, .78), rgba(26, 18, 11, .82));\n    border: 1.5px solid rgba(224, 186, 108, .75);\n    box-shadow: inset 0 1px 0 rgba(255, 232, 180, .22), inset 0 0 14px rgba(0, 0, 0, .35), 0 0 0 3px rgba(201, 154, 75, .14), 0 6px 16px rgba(0, 0, 0, .5);\n    transition: border-color .2s, box-shadow .25s; }\n  .name::placeholder { font-style: italic; color: rgba(240, 224, 190, .72); }\n  .name:hover { border-color: rgba(240, 206, 128, .9); }\n  .name:focus { border-color: #f1d48d; box-shadow: inset 0 1px 0 rgba(255, 232, 180, .3), inset 0 0 14px rgba(0, 0, 0, .3), 0 0 0 3px rgba(224, 186, 108, .3), 0 0 22px rgba(224, 186, 108, .4), 0 6px 16px rgba(0, 0, 0, .5); }\n  /* Join button: a gold cartouche with ogee points at each end, an inner line, studs and centre finials.\n     At rest it is muted (dim, desaturated gold); on hover it warms up, glows and a light sweeps across it.\n     The artwork is SVG (end caps keep their shape, the middle stretches), so it works at any column width. */\n  .join { --h: 60px; position: relative; display: block; width: var(--col); height: var(--h); margin-top: 14px; padding: 0 64px; cursor: pointer; border: 0; background-color: transparent;\n    font-family: 'Cinzel', serif; font-weight: 700; font-size: 14px; letter-spacing: .3em; text-indent: .3em; color: #fbefd2;\n    text-shadow: 0 1px 0 rgba(63, 5, 8, .95), 0 0 14px rgba(255, 190, 90, .4);\n    background-image: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2034%2060%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%20%3Cg%20id%3D%22fin%22%3E%3Cpath%20d%3D%22M17%200.5%20L22.5%205%20L17%209.5%20L11.5%205%20Z%22%20fill%3D%22url(%23b)%22%20stroke%3D%22%238a5d20%22%20stroke-width%3D%22.6%22%2F%3E%3Cpath%20d%3D%22M4%205%20H11.5%20M22.5%205%20H30%22%20stroke%3D%22%23f1d48d%22%20stroke-width%3D%222.6%22%2F%3E%3Ccircle%20cx%3D%223.6%22%20cy%3D%225%22%20r%3D%221.7%22%20fill%3D%22url(%23b)%22%2F%3E%3Ccircle%20cx%3D%2230.4%22%20cy%3D%225%22%20r%3D%221.7%22%20fill%3D%22url(%23b)%22%2F%3E%3C%2Fg%3E%20%3Cuse%20href%3D%22%23fin%22%20transform%3D%22translate(0%2060)%20scale(1%20-1)%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2014%2014%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M7%200.5%20L13.5%207%20L7%2013.5%20L0.5%207%20Z%22%20fill%3D%22url(%23b)%22%20stroke%3D%22%238a5d20%22%20stroke-width%3D%22.6%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2014%2014%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M7%200.5%20L13.5%207%20L7%2013.5%20L0.5%207%20Z%22%20fill%3D%22url(%23b)%22%20stroke%3D%22%238a5d20%22%20stroke-width%3D%22.6%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cg%20transform%3D%22matrix(-1%200%200%201%2046%200)%22%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%204%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%20%3Crect%20x%3D%220%22%20y%3D%225%22%20width%3D%224%22%20height%3D%2250%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%223.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23f6dd9c%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2253.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23e6bd6a%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%229.5%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2249.6%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3C%2Fsvg%3E\");\n    background-repeat: no-repeat;\n    background-position: center, 58px center, calc(100% - 58px) center, left center, right center, center;\n    background-size: 34px 100%, 12px 12px, 12px 12px, 46px 100%, 46px 100%, calc(100% - 88px) 100%;\n    filter: drop-shadow(0 8px 12px rgba(0, 0, 0, .6)) drop-shadow(0 0 0 rgba(255, 190, 90, 0)) brightness(1);\n    transition: transform .2s, filter .25s; }\n  /* The shine: a soft diagonal band, masked to the button's own outline (frame, face and pointed ends) */\n  .join::before { content: ''; position: absolute; inset: 0; pointer-events: none;\n    background: linear-gradient(105deg, transparent 44%, rgba(255, 206, 120, .12) 47.2%, rgba(255, 248, 224, .5) 50%, rgba(255, 206, 120, .12) 52.8%, transparent 56%) 160% 0 / 260% 100% no-repeat;\n    /* plain alpha, no blend mode: a blend inside the drop-shadowed button made Chrome paint a dark box behind it */\n    -webkit-mask-image: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cg%20transform%3D%22matrix(-1%200%200%201%2046%200)%22%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%204%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%20%3Crect%20x%3D%220%22%20y%3D%225%22%20width%3D%224%22%20height%3D%2250%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%223.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23f6dd9c%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2253.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23e6bd6a%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%229.5%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2249.6%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3C%2Fsvg%3E\"); mask-image: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2046%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cg%20transform%3D%22matrix(-1%200%200%201%2046%200)%22%3E%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%20Z%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%20stroke-width%3D%222.6%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M46%205%20H23%20Q11.5%205%2011.5%2016.5%20C11.5%2022%208%2023.5%205.2%2026%20Q2%2028%202%2030%20Q2%2032%205.2%2034%20C8%2036.5%2011.5%2038%2011.5%2043.5%20Q11.5%2055%2023%2055%20H46%22%20fill%3D%22none%22%20stroke%3D%22%23e9c97c%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%22.9%22%20transform%3D%22translate(46%2030)%20scale(.82)%20translate(-46%20-30)%22%2F%3E%20%3Ccircle%20cx%3D%228.6%22%20cy%3D%2230%22%20r%3D%222.1%22%20fill%3D%22url(%23b)%22%2F%3E%20%3Cpath%20d%3D%22M15%2020.5%20q-3.5%205%200%209.5%20q3.5%20-4.5%200%20-9.5%20Z%20M15%2039.5%20q-3.5%20-5%200%20-9.5%20q3.5%204.5%200%209.5%20Z%22%20fill%3D%22%23e2b65f%22%20fill-opacity%3D%22.85%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E\"), url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%204%2060%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%20%3ClinearGradient%20id%3D%22g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f6dd9c%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23b88a3a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6bd6a%22%2F%3E%3C%2FlinearGradient%3E%20%3ClinearGradient%20id%3D%22r%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%225%22%20x2%3D%220%22%20y2%3D%2255%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%239c1019%22%2F%3E%3Cstop%20offset%3D%22.55%22%20stop-color%3D%22%236e0a12%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234a0609%22%2F%3E%3C%2FlinearGradient%3E%20%3CradialGradient%20id%3D%22b%22%20cx%3D%22.4%22%20cy%3D%22.35%22%20r%3D%22.8%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff3c9%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23e2b65f%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238a5d20%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%20%3Crect%20x%3D%220%22%20y%3D%225%22%20width%3D%224%22%20height%3D%2250%22%20fill%3D%22url(%23r)%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%223.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23f6dd9c%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2253.7%22%20width%3D%224%22%20height%3D%222.6%22%20fill%3D%22%23e6bd6a%22%2F%3E%20%3Crect%20x%3D%220%22%20y%3D%229.5%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2249.6%22%20width%3D%224%22%20height%3D%22.9%22%20fill%3D%22%23e9c97c%22%20fill-opacity%3D%220.6%22%2F%3E%3C%2Fsvg%3E\");\n    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;\n    -webkit-mask-position: left center, right center, center; mask-position: left center, right center, center;\n    -webkit-mask-size: 46px 100%, 46px 100%, calc(100% - 88px) 100%; mask-size: 46px 100%, 46px 100%, calc(100% - 88px) 100%;\n    transition: background-position 1.1s cubic-bezier(.3, .6, .3, 1); }\n  .join:hover, .join:focus-visible { transform: translateY(-1px); filter: drop-shadow(0 10px 14px rgba(0, 0, 0, .65)) drop-shadow(0 0 12px rgba(201, 154, 75, .5)) brightness(1.08); }\n  .join:hover::before, .join:focus-visible::before { background-position: -60% 0; }\n  .join:active { transform: translateY(1px); filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .6)) drop-shadow(0 0 0 rgba(255, 190, 90, 0)) brightness(.95); }\n  .join:focus-visible, .modes button:focus-visible { outline: 2px solid var(--brass-soft); outline-offset: 3px; }\n\n  #hud { position: fixed; inset: 0; z-index: 20; pointer-events: none; transition: opacity .9s; }\n  #hud.hidden { opacity: 0; }\n  .card { position: absolute; pointer-events: auto; background: rgba(10, 8, 6, .62); border: 1px solid rgba(201, 154, 75, .25); border-radius: 6px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }\n  .opp { top: max(16px, env(safe-area-inset-top)); left: max(16px, env(safe-area-inset-left)); padding: 10px 14px; display: flex; gap: 12px; align-items: center; }\n  .opp .seal { width: 38px; height: 38px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #a8161e, var(--crimson-deep)); color: var(--brass-soft); display: grid; place-items: center; font-size: 18px; border: 1.5px solid var(--brass); }\n  .opp b { font-family: 'Cinzel', serif; font-size: 13px; letter-spacing: .1em; display: block; color: var(--brass-soft); }\n  .opp small { font-size: 14px; font-style: italic; color: rgba(233, 220, 192, .7); }\n  .moves { top: 64px; right: max(16px, env(safe-area-inset-right)); width: 170px; padding: 12px 14px; }\n  .moves h3 { margin: 0 0 6px; font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: .24em; color: var(--brass); border-bottom: 1px solid rgba(201, 154, 75, .25); padding-bottom: 6px; font-weight: 600; }\n  .moves ol { margin: 0; padding-left: 22px; font-size: 16px; line-height: 1.45; min-height: 92px; color: var(--parchment); font-variant-numeric: tabular-nums; }\n  .status { position: absolute; bottom: max(22px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 9px 20px; border-radius: 999px; background: rgba(10, 8, 6, .62); border: 1px solid rgba(201, 154, 75, .3); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; }\n  .status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brass); box-shadow: 0 0 10px var(--brass); }\n  .status button { font: inherit; font-size: 9px; color: var(--brass-soft); background: none; border: 1px solid rgba(201, 154, 75, .35); border-radius: 999px; padding: 4px 10px; cursor: pointer; }\n\n  #hud.hidden *, #landing.hidden * { pointer-events: none !important; }\n\n  /* Book step: heading above the open spread, confirm below; the pages themselves are the choices */\n  #bookUI { position: fixed; inset: 0; z-index: 20; pointer-events: none; }\n  #bookUI > * { transition: opacity .8s; will-change: opacity; }\n  #bookUI.hidden > * { opacity: 0; }\n  #bookUI.hidden * { pointer-events: none !important; }\n  /* Slim bars only, so the open book can fill almost the whole screen */\n  .book-head { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; text-align: center; padding: max(12px, env(safe-area-inset-top, 0px)) 150px 30px; background: linear-gradient(to bottom, rgba(6, 4, 2, .82), rgba(6, 4, 2, .5) 55%, rgba(6, 4, 2, 0)); }\n  .book-head h2 { margin: 0; display: flex; align-items: center; gap: 16px; font: 700 clamp(17px, 1.7vw, 24px) 'Cinzel', serif; letter-spacing: .26em; text-transform: uppercase; color: #f3e3bf; text-shadow: 0 2px 14px rgba(0, 0, 0, .95), 0 0 2px rgba(0, 0, 0, .6); }\n  .book-head h2::before, .book-head h2::after { content: ''; width: clamp(40px, 6vw, 96px); height: 1px; background: linear-gradient(to right, rgba(201, 154, 75, 0), var(--brass)); }\n  .book-head h2::after { background: linear-gradient(to left, rgba(201, 154, 75, 0), var(--brass)); }\n  .book-foot { position: absolute; left: 0; right: 0; bottom: max(10px, env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px 18px; padding-inline: 16px; text-align: center; }\n  .book-foot { --col: min(500px, 92vw); }\n  .book-confirm { pointer-events: auto; margin-top: 0; padding: 0 76px; white-space: nowrap; }\n  /* Disabled (nothing chosen yet): same frame, dimmed and flat, no glow or sweep */\n  .join:disabled, .join:disabled:hover, .join:disabled:active { cursor: not-allowed; transform: none; color: rgba(251, 239, 210, .5); text-shadow: none;\n    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .5)) drop-shadow(0 0 0 rgba(255, 190, 90, 0)) brightness(.62) saturate(.35); }\n  .join:disabled::before { display: none; }\n  @media (max-width: 900px) { .book-head { padding-inline: 110px; } }\n  .book-back { position: absolute; z-index: 2; top: max(16px, env(safe-area-inset-top, 0px)); left: max(16px, env(safe-area-inset-left, 0px)); pointer-events: auto; font: 600 11px 'Cinzel', serif; letter-spacing: .16em; color: var(--parchment); background: rgba(10, 8, 6, .55); border: 1px solid rgba(201, 154, 75, .3); border-radius: 6px; padding: 8px 14px; cursor: pointer; }\n  .book-back:hover { border-color: var(--brass); }\n  .book-back:focus-visible, .book-confirm:focus-visible { outline: 2px solid var(--brass-soft); outline-offset: 3px; }\n  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n  .sr-only button { pointer-events: auto; }\n\n  /* Wide screens: the title card sits over the dark bookshelves on the left, leaving the board clear */\n  @media (min-aspect-ratio: 5/4) and (min-width: 700px), (min-aspect-ratio: 2/1) {\n    #landing { top: 0; right: auto; width: min(640px, 52vw); justify-content: center; align-items: flex-start; padding-top: 0; padding-bottom: 0; padding-left: max(64px, env(safe-area-inset-left, 0px)); padding-right: 0; background: linear-gradient(to right, rgba(4, 3, 2, .82), rgba(4, 3, 2, .5) 55%, transparent); }\n    .tagline { text-align: left; }\n  }\n  /* Short windows (e.g. a docked preview pane): shrink the title card so the scene stays visible */\n  @media (max-height: 520px) {\n    #landing { padding-top: 24px; padding-bottom: max(14px, env(safe-area-inset-bottom, 0px)); }\n    #landing { --col: 240px; }\n    .tagline { display: none; }\n    .name { height: 36px; font-size: 15px; margin-top: 10px; }\n    .join { --h: 46px; margin-top: 8px; padding: 0 52px; font-size: 11px; }\n    .opp { padding: 6px 10px; } .opp .seal { width: 30px; height: 30px; font-size: 14px; }\n    .moves { top: 52px; padding: 8px 12px; } .moves ol { min-height: 0; font-size: 14px; }\n    .status { padding: 6px 14px; }\n  }\n  @media (max-width: 640px) {\n    #landing { --col: min(260px, 78vw); }\n    .moves { display: none; }\n    .opp { top: 56px; }\n  }\n  #study-ui .modes, #study-ui #hud { display: none !important; }   /* the real game has its own HUD */\n  #study-ui, #study-ui * { box-sizing: border-box; }\n  #study-ui { font-family: 'Cormorant Garamond', Georgia, serif; color: var(--parchment); }\n  #study-ui.study-hidden { display: none; }";
const STUDY_MARKUP = "<div id=\"veil\"><span>LIGHTING THE LAMP</span></div>\n\n<div class=\"modes\">\n  <button data-mode=\"landing\" class=\"active\">Landing</button>\n  <button data-mode=\"book\">Book</button>\n  <button data-mode=\"game\">In-game</button>\n</div>\n\n<div id=\"landing\">\n  <h1 class=\"brand\"><img src=\"%BASE%shatranj-logo-full.png\" alt=\"Shatranj, the royal game\" /></h1>\n  <div class=\"tagline\">Play with Gesture · Command by Voice · Beyond VR</div>\n  <input id=\"player-name\" class=\"name\" placeholder=\"Enter your name here\" maxlength=\"24\" />\n  <button class=\"join\" id=\"join\">JOIN BATTLE</button>\n</div>\n\n<div id=\"bookUI\" class=\"hidden\" aria-hidden=\"true\">\n  <button id=\"bookBack\" class=\"book-back\">← Back</button>\n  <header class=\"book-head\">\n    <h2>Choose your control style</h2>\n    <p id=\"bookHint\" class=\"sr-only\" aria-live=\"polite\">Tap the Voice Commands page or the Hand Gestures page to choose.</p>\n  </header>\n  <div class=\"book-foot\">\n    <button id=\"bookConfirm\" class=\"join book-confirm\" disabled>TAP A PAGE TO CHOOSE</button>\n  </div>\n  <div id=\"bookPicks\" class=\"sr-only\" role=\"group\" aria-label=\"Choices on this page\"></div>\n</div>\n\n<div id=\"hud\" class=\"hidden\">\n  <div class=\"card opp\"><div class=\"seal\">♚</div><div><b>GRAND VIZIER</b><small>Royal Engine · ~1900</small></div></div>\n  <div class=\"card moves\"><h3>THE CHRONICLE</h3><ol id=\"movelist\"></ol></div>\n  <div class=\"status\"><span class=\"dot\"></span><span id=\"statusText\">White to move</span><button id=\"back\">Leave table</button></div>\n</div>\n";
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Pinyon+Script&display=swap';

export type StudyOrder = 'reset' | 'howto' | 'signout';
/** The match as it stands, written into the profile chapter when it is opened from the game. */
export interface StudyProfileState { name: string; side: 'w' | 'b'; control: 'voice' | 'gesture' | 'mouse'; format: 'vs-bot' | 'two-player' | 'online'; difficulty: string | null; moves: number; }
export interface StudySelection { control: 'voice' | 'gesture' | 'mouse'; side: 'w' | 'b'; format: 'vs-bot' | 'two-player' | 'online'; difficulty: 'easy' | 'medium' | 'hard' | null; roomId: string; name: string; }
export interface StudyOptions {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  onComplete?: (s: StudySelection) => void;          // the book was confirmed: start the match
  onConfirm?: (s: StudySelection) => void;           // the Confirm click itself, while the browser still counts it as a user gesture
  onGameCamera?: (pos: THREE.Vector3, target: THREE.Vector3) => void;   // hand the camera to the game
  onProfileApply?: (s: StudySelection) => void;      // profile chapter: Apply was clicked (still inside the click)
  onProfileClosed?: (order: StudyOrder | null) => void;   // profile chapter: back at the board, with the standing order that was tapped (if any)
  startInGame?: boolean;
  getSide?: () => 'w' | 'b';                          // which chair the playing view is from
}

export function createStudyWorld(opts: StudyOptions) {
  const { renderer, scene, camera } = opts;
  const S = STUDY_SCALE, LS = S * S;
  const world = new THREE.Group(); world.name = 'studyWorld';
  world.scale.setScalar(S);
  world.position.y = GAME_BOARD_TOP - 0.0225 * S;
  scene.add(world);
  const toGame = (v) => v.clone().multiplyScalar(S).add(world.position);
  const fromGame = (v) => v.clone().sub(world.position).divideScalar(S);

  // Overlay UI (landing card and book controls) and fonts
  if (!document.getElementById('study-fonts')) { const l = document.createElement('link'); l.id = 'study-fonts'; l.rel = 'stylesheet'; l.href = FONTS_HREF; document.head.appendChild(l); }
  const styleEl = document.createElement('style'); styleEl.textContent = STUDY_CSS; document.head.appendChild(styleEl);
  const ui = document.createElement('div'); ui.id = 'study-ui'; ui.innerHTML = STUDY_MARKUP.split('%BASE%').join(import.meta.env.BASE_URL); document.body.appendChild(ui);

  let camPos = new THREE.Vector3(), focusM = 1.3;
  // Units are metres. Desk top is y = 0, board centred at the origin, White sits toward +z.
  const MODEL_DIR = import.meta.env.BASE_URL + 'models/';
  const SQ = 0.055;              // square size
  const BOARD = 0.51;            // board incl. frame
  const BOARD_TOP = 0.0225;
  const FLOOR = -0.76;
  const PIECE_SCALE = 0.04;      // GLB units -> metres (king = 9.5 cm)
  const LIGHT_SQ = { value: new THREE.Color(1, 1, 1) };   // multiplier for the light squares, eased in during play

  // ---------- Renderer (owned by the game) ----------
  const canvas = renderer.domElement;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // r185: PCFSoft is folded into PCF (softened by shadow.radius)
  renderer.shadowMap.autoUpdate = true;   // pieces move freely in the real game
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  RectAreaLightUniformsLib.init();
  scene.background = new THREE.Color(0x020202);
  scene.fog = new THREE.FogExp2(0x060504, 0.12 / S);

  // ---------- Procedural texture toolkit ----------
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

  // Wood: s runs along the grain, t across it (both metres). Returns [r,g,b] 0-255 and a roughness 0-1.
  function wood(s, t, P) {
    const warp = fbm(s * P.warpFreq + P.seed, t * P.warpFreq * 4 + P.seed * 1.7, 3);
    const rings = t * P.rings + warp * P.warp + fbm(s * 2 + P.seed, t * 3, 2) * 2;
    const r = rings - Math.floor(rings);
    const late = Math.pow(r, 3.5);
    const streak = fbm(s * 6 + P.seed * 3, t * 900, 2);
    const pore = vnoise(s * 1400, t * 9000);
    const k = clamp01(late * (P.ringAmt ?? .62) + streak * P.streak + (pore > .82 ? .25 : 0));
    const col = [0, 1, 2].map(i => lerp(P.light[i], P.dark[i], k) * (0.92 + 0.16 * fbm(s * .8 + 9, t * .8, 2)));
    return { col, rough: clamp01(P.roughBase + k * .25) };
  }
  function pixelCanvas(w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const [r, g, b] = fn(x, y); d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
  function tex(c, { srgb = true, repeat } = {}) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function woodTextures(w, h, metresW, metresH, P, along = 'x') {
    const rough = new Float32Array(w * h);
    const col = pixelCanvas(w, h, (x, y) => {
      const mx = x / w * metresW, my = y / h * metresH;
      const r = along === 'x' ? wood(mx, my, P) : wood(my, mx, P);
      rough[y * w + x] = r.rough; return r.col;
    });
    const rc = pixelCanvas(w, h, (x, y) => { const v = rough[y * w + x] * 255; return [v, v, v]; });
    return { map: tex(col), roughnessMap: tex(rc, { srgb: false }) };
  }
  function heightToNormal(w, h, heightFn, strength, wrap = true) {
    const H = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = heightFn(x, y);
    const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
    const c = pixelCanvas(w, h, (x, y) => {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      return [(-dx / l * .5 + .5) * 255, (dy / l * .5 + .5) * 255, (1 / l * .5 + .5) * 255];
    });
    return tex(c, { srgb: false });
  }
  function drawCanvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
  function imageCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; }
  // One pass over the pixels: fn(x, y, o) fills o = [r, g, b, height, roughness, metalness].
  // Returns a colour map, a normal map derived from the height field, and an ORM map (G = roughness, B = metalness).
  function surface(w, h, fn, normalStrength = 1) {
    const H = new Float32Array(w * h), cImg = new ImageData(w, h), oImg = new ImageData(w, h), cd = cImg.data, od = oImg.data;
    const o = [0, 0, 0, 0, .5, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      o[3] = 0; o[4] = .5; o[5] = 0;
      fn(x, y, o);
      const i = y * w + x, p = i * 4;
      cd[p] = o[0]; cd[p + 1] = o[1]; cd[p + 2] = o[2]; cd[p + 3] = 255;
      od[p] = 255; od[p + 1] = o[4] * 255; od[p + 2] = o[5] * 255; od[p + 3] = 255;
      H[i] = o[3];
    }
    const nImg = new ImageData(w, h), nd = nImg.data;
    for (let y = 0; y < h; y++) {
      const yu = y > 0 ? y - 1 : y, yd = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
        const dx = (H[y * w + xr] - H[y * w + xl]) * normalStrength, dy = (H[yd * w + x] - H[yu * w + x]) * normalStrength;
        const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), p = (y * w + x) * 4;
        nd[p] = (-dx * l * .5 + .5) * 255; nd[p + 1] = (dy * l * .5 + .5) * 255; nd[p + 2] = (l * .5 + .5) * 255; nd[p + 3] = 255;
      }
    }
    return { map: tex(imageCanvas(cImg)), normalMap: tex(imageCanvas(nImg), { srgb: false }), orm: tex(imageCanvas(oImg), { srgb: false }) };
  }
  // Veneer wood for the board: s along the grain, t across it (metres). Writes colour, height and roughness into o.
  function veneer(s, t0, P, o) {
    const t = t0 + (P.cath || 0) * (s - (P.sc || 0)) ** 2;                     // crown-cut veneer: growth rings arch into cathedrals
    const warp = fbm(s * P.warpFreq + P.seed, t * P.warpFreq * 3 + P.seed * 1.7, 3);
    const rings = t * P.rings + warp * P.warp + vnoise(s * 1.5 + P.seed, t * 2) * 1.5;
    const r = rings - Math.floor(rings);
    const late = r > .55 ? ((r - .55) / .45) ** 2 : 0;                       // latewood band at the end of each ring
    const streak = fbm(s * 5 + P.seed * 3, t * 700, 2);                       // long fine streaks along the grain
    const pn = vnoise(s * P.poreS + P.seed * 7, t * P.poreT);
    const pore = pn > P.poreCut ? (pn - P.poreCut) / (1 - P.poreCut) : 0;     // open pores, stretched along the grain
    const fig = P.figure ? Math.sin(s * 760 + fbm(s * 18 + P.seed, t * 30, 2) * 9) * P.figure : 0;   // curl figure (maple)
    const tone = .9 + .2 * fbm(s * .9 + 9 + P.seed, t * .9, 2);
    const k = clamp01(late * P.ringAmt + streak * P.streak + pore * P.poreAmt);
    const f = tone * (1 + fig);
    o[0] = lerp(P.light[0], P.dark[0], k) * f; o[1] = lerp(P.light[1], P.dark[1], k) * f; o[2] = lerp(P.light[2], P.dark[2], k) * f;
    o[3] = -late * .35 - pore * .55 + fig * 1.2;
    o[4] = P.roughBase + pore * .35;
  }

  const WOOD = {
    mahogany: { light: [74, 32, 17], dark: [24, 8, 4], rings: 45, warp: 1.8, warpFreq: 1.2, streak: .3, roughBase: .42, seed: 3, ringAmt: .32 },
    frame: { light: [112, 64, 38], dark: [56, 28, 14], rings: 70, warp: 2.5, warpFreq: 4, streak: .3, roughBase: .38, seed: 11 },
    maple: { light: [226, 192, 140], dark: [184, 140, 88], rings: 90, warp: 1.6, warpFreq: 5, streak: .22, roughBase: .4, seed: 21 },
    walnut: { light: [136, 84, 50], dark: [68, 38, 20], rings: 80, warp: 2.2, warpFreq: 5, streak: .3, roughBase: .42, seed: 31 },
    case: { light: [58, 30, 16], dark: [22, 10, 5], rings: 40, warp: 3, warpFreq: 2, streak: .3, roughBase: .5, seed: 41 },
  };

  // ---------- Materials ----------
  const M = {};
  function buildMaterials() {
    const desk = woodTextures(1536, 768, 1.7, .95, WOOD.mahogany);
    M.desk = new THREE.MeshPhysicalMaterial({ ...desk, color: 0x9c7464, roughness: 1, specularIntensity: .25, clearcoat: .5, clearcoatRoughness: .22, envMapIntensity: .45 });
    const deskSide = woodTextures(512, 256, .6, .3, WOOD.mahogany);
    M.deskSide = new THREE.MeshPhysicalMaterial({ ...deskSide, roughness: 1, clearcoat: .7, clearcoatRoughness: .2 });
    const frame = woodTextures(512, 128, .51, .03, WOOD.frame);
    M.frame = new THREE.MeshPhysicalMaterial({ ...frame, roughness: 1, clearcoat: .8, clearcoatRoughness: .15 });
    const cs = woodTextures(512, 512, 1.2, 1.2, WOOD.case);
    cs.map.wrapS = cs.map.wrapT = cs.roughnessMap.wrapS = cs.roughnessMap.wrapT = THREE.RepeatWrapping;
    M.case = new THREE.MeshStandardMaterial({ ...cs, roughness: 1 });
    M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: .28 });
    M.brassDark = new THREE.MeshStandardMaterial({ color: 0x8a6a35, metalness: 1, roughness: .45 });

    // Leather: fine grain + tufting variants
    const grain = (x, y) => fbm(x / 6, y / 6, 3) * .6 + vnoise(x / 1.5, y / 1.5) * .4;
    M.leatherN = heightToNormal(512, 512, grain, 2.2);
    M.leatherN.wrapS = M.leatherN.wrapT = THREE.RepeatWrapping; M.leatherN.repeat.set(4, 4);
    const tuft = (x, y) => {
      const p = 128, u = (x + y) / p, v = (x - y + 512) / p;
      const fu = u - Math.floor(u), fv = v - Math.floor(v);
      const pillow = Math.pow(Math.sin(Math.PI * fu) * Math.sin(Math.PI * fv), .45);
      return pillow * 14 + grain(x, y) * 1.2;
    };
    M.tuftN = heightToNormal(512, 512, tuft, 1.4);
    M.tuftN.wrapS = M.tuftN.wrapT = THREE.RepeatWrapping;
    const leatherCol = (base) => tex(pixelCanvas(256, 256, (x, y) => { const n = fbm(x / 40, y / 40, 4); const k = .75 + n * .5; return base.map(c => c * k); }), { repeat: [2, 2] });
    M.leatherBrown = new THREE.MeshPhysicalMaterial({ map: leatherCol([48, 20, 12]), normalMap: M.leatherN, normalScale: new THREE.Vector2(.4, .4), roughness: .5, clearcoat: .35, clearcoatRoughness: .4, sheen: .4, sheenColor: new THREE.Color(0x6a4a30), envMapIntensity: .3 });
    M.leatherBlack = new THREE.MeshPhysicalMaterial({ map: leatherCol([18, 14, 12]), normalMap: M.tuftN, normalScale: new THREE.Vector2(1, 1), roughness: .45, clearcoat: .4, clearcoatRoughness: .35, envMapIntensity: .3 });
    M.leatherNote = new THREE.MeshPhysicalMaterial({ map: leatherCol([30, 22, 18]), normalMap: M.leatherN, normalScale: new THREE.Vector2(.6, .6), roughness: .55, clearcoat: .2 });

    M.wall = new THREE.MeshStandardMaterial({ color: 0x14130f, roughness: .9 });
    M.pieceLight = new THREE.MeshPhysicalMaterial({ color: 0xcfd0cf, roughness: .45, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: 1 });   // cool light-grey satin: light enough to read as white, grey enough to show its shading
    M.pieceDark = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: .22, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 2.6 });   // glossy jet black
    M.felt = new THREE.MeshStandardMaterial({ color: 0x0d2a18, roughness: 1 });
  }

  // ---------- Environment map (for reflections on lacquer, brass and glass) ----------
  function buildEnvMap() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .78, .45).multiplyScalar(30) }));
    lamp.position.set(.4, .5, -.3); env.add(lamp);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .65, .8).multiplyScalar(2.2) }));
    win.position.set(2.2, 1, -2.4); win.lookAt(0, 0, 0); env.add(win);
    const shelfGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(.12, .07, .04) }));
    shelfGlow.position.set(-1.5, .5, -2.8); env.add(shelfGlow);
    // Large soft warm panel behind the player: gives the lacquered pieces a readable highlight on the side facing White
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .86, .68).multiplyScalar(2.4) }));
    softbox.position.set(-.3, 1.2, 2.2); softbox.lookAt(0, 0, 0); env.add(softbox);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, .02).texture;
    scene.environmentIntensity = .55;
  }

  const sh = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // ---------- Desk ----------
  function buildDesk() {
    const g = new THREE.Group();
    const top = sh(new THREE.Mesh(new RoundedBoxGeometry(1.7, .045, .95, 3, .012), M.desk));
    top.position.set(0, -.0225, -.055); g.add(top);
    const apron = sh(new THREE.Mesh(new THREE.BoxGeometry(1.62, .09, .88), M.deskSide));
    apron.position.set(0, -.09, -.055); g.add(apron);
    for (const x of [-.58, .58]) {
      const ped = sh(new THREE.Mesh(new THREE.BoxGeometry(.44, .62, .84), M.deskSide));
      ped.position.set(x, FLOOR + .31 + .03, -.055); g.add(ped);
      for (let i = 0; i < 3; i++) {
        const y = -.18 - i * .19;
        const drawer = sh(new THREE.Mesh(new RoundedBoxGeometry(.4, .16, .02, 2, .006), M.deskSide));
        drawer.position.set(x, y, .375); g.add(drawer);
        const pull = sh(new THREE.Mesh(new THREE.TorusGeometry(.016, .0035, 8, 20, Math.PI), M.brass));
        pull.position.set(x, y - .005, .39); pull.rotation.z = Math.PI; g.add(pull);
      }
    }
    return g;
  }

  // ---------- Board ----------
  const VENEER = {
    maple: { light: [230, 199, 152], dark: [192, 152, 102], rings: 320, warp: 1.3, warpFreq: 16, ringAmt: .36, streak: .32, cath: 2.5, poreS: 900, poreT: 7000, poreCut: .9, poreAmt: .15, roughBase: .38, figure: .035 },
    walnut: { light: [116, 76, 50], dark: [52, 32, 19], rings: 240, warp: 1.5, warpFreq: 14, ringAmt: .5, streak: .38, cath: 3, poreS: 260, poreT: 5200, poreCut: .76, poreAmt: .55, roughBase: .42, figure: 0 },
    rosewood: { light: [124, 58, 32], dark: [52, 20, 10], rings: 260, warp: 3, warpFreq: 18, ringAmt: .6, streak: .45, poreS: 300, poreT: 5600, poreCut: .78, poreAmt: .5, roughBase: .4, figure: 0 },
  };
  let boardGroupRef = null;
  // Gold-leaf coordinates on the wooden frame: files along White's and Black's edges, ranks down both sides
  function addBoardLabels() {
    const P = SQ * 8 + .012, FW = (BOARD - P) / 2, Np = 2048, px = (v) => (v + BOARD / 2) / BOARD * Np;
    const c = drawCanvas(Np, Np, (x) => {
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const fs = FW * .5 / BOARD * Np, mid = P / 2 + FW / 2;
      for (let i = 0; i < 8; i++) {
        const fx = px((i - 3.5) * SQ), ry = px((3.5 - i) * SQ);
        x.font = `700 ${fs}px Cinzel, serif`; x.fillText('ABCDEFGH'[i], fx, px(mid));
        x.save(); x.translate(fx, px(-mid)); x.rotate(Math.PI); x.fillText('ABCDEFGH'[i], 0, 0); x.restore();
        x.font = `italic 600 ${fs * 1.1}px "EB Garamond", serif`; x.fillText(String(i + 1), px(-mid), ry); x.fillText(String(i + 1), px(mid), ry);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ color: 0xd9ad55, metalness: .6, roughness: .35, emissive: 0xd9ad55, emissiveIntensity: .25, alphaMap: tex(c, { srgb: false }), transparent: true, alphaTest: .3, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = BOARD_TOP + .0021; boardGroupRef.add(m);
  }
  function buildBoard() {
    // Playing field: tournament squares (matte jet black and warm off-white) inside a 6 mm black border, ~0.22 mm per pixel
    const INLAY = .006, P = SQ * 8 + INLAY * 2, N = 2048, mpp = P / N;
    const field = surface(N, N, (x, y, o) => {
      const mx = (x + .5) * mpp, my = (y + .5) * mpp, fx = mx - INLAY, fy = my - INLAY;
      const grain = vnoise(x * .35, y * .35) * .6 + vnoise(x * 1.3 + 40, y * 1.3) * .4;   // faint satin-lacquer texture
      if (fx >= 0 && fy >= 0 && fx < SQ * 8 && fy < SQ * 8) {
        const c = Math.floor(fx / SQ), r = Math.floor(fy / SQ), lx = fx - c * SQ, ly = fy - r * SQ, dark = (c + r) % 2 === 1;
        const base = dark ? [12, 11, 10] : [196, 188, 172], k = dark ? .9 + .25 * grain : .965 + .05 * grain;
        o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k; o[3] = grain * .25; o[4] = dark ? .42 : .55;
        const edge = Math.min(lx, ly, SQ - lx, SQ - ly) / mpp;   // fine tan hairline between squares
        if (edge < 1.2) { o[0] = 176; o[1] = 156; o[2] = 120; o[3] -= .6; }
      } else {
        const d = Math.min(mx, my, P - mx, P - my) / INLAY;   // black border with a fine gold line against the wood
        if (d < .16) { o[0] = 200; o[1] = 160; o[2] = 82; o[4] = .3; o[5] = .9; } else { o[0] = o[1] = o[2] = 12 * (.9 + .2 * grain); o[4] = .45; }
      }
    }, 1);
    const fieldMat = M.field = new THREE.MeshPhysicalMaterial({ map: field.map, normalMap: field.normalMap, normalScale: new THREE.Vector2(.25, .25), roughnessMap: field.orm, metalnessMap: field.orm, roughness: 1, metalness: 1, clearcoat: .15, clearcoatRoughness: .4, envMapIntensity: .8 });
    // During play the light squares (only) are deepened to a tan, so pale boxwood pieces stand out against them
    fieldMat.onBeforeCompile = (s) => {
      s.uniforms.uLightSq = LIGHT_SQ;
      s.fragmentShader = 'uniform vec3 uLightSq;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  float sqL = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));\n  diffuseColor.rgb *= mix(vec3(1.), uLightSq, smoothstep(.18, .4, sqL));');
    };

    // Frame: four mitred rosewood pieces with rounded (bevelled) edges, raised 2 mm above the field
    const FW = (BOARD - P) / 2, FH = BOARD_TOP + .002, bev = .0013;
    const frameTex = surface(2048, 256, (x, y, o) => veneer(x / 2048 * .62, y / 256 * .078, { ...VENEER.rosewood, seed: 17 }, o), 1.1);
    const g = new THREE.Group();
    for (let side = 0; side < 4; side++) {
      const s = new THREE.Shape();
      const ins = bev * .45;
      s.moveTo(-P / 2 + ins, ins); s.lineTo(P / 2 - ins, ins); s.lineTo(P / 2 + FW - ins * 2.4, FW - ins); s.lineTo(-P / 2 - FW + ins * 2.4, FW - ins); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: FH - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, bev, -P / 2);
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 1, clearcoat: .3, clearcoatRoughness: .55, envMapIntensity: .6, normalScale: new THREE.Vector2(.5, .5) });
      for (const k of ['map', 'normalMap']) { const t = frameTex[k].clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / .62, 1 / .078); t.offset.set(.5 + side * .21, .1 + side * .17); mat[k] = t; }
      const r = frameTex.orm.clone(); r.wrapS = r.wrapT = THREE.RepeatWrapping; r.repeat.copy(mat.map.repeat); r.offset.copy(mat.map.offset); mat.roughnessMap = r;
      const m = sh(new THREE.Mesh(geo, mat)); m.rotation.y = side * Math.PI / 2; g.add(m);
    }
    boardGroupRef = g;
    const core = sh(new THREE.Mesh(new THREE.BoxGeometry(P + .002, BOARD_TOP - .001, P + .002), M.frame), false, true);
    core.position.y = (BOARD_TOP - .001) / 2; g.add(core);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(P, P), fieldMat);
    top.rotation.x = -Math.PI / 2; top.position.y = BOARD_TOP; top.receiveShadow = true; g.add(top);
    return g;
  }

  // ---------- Banker's lamp ----------
  function buildLamp(scale = 1, withLight = true) {
    const g = new THREE.Group();
    const v = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const base = sh(new THREE.Mesh(new THREE.LatheGeometry(v([[0, 0], [.088, 0], [.09, .004], [.088, .01], [.078, .016], [.07, .03], [.056, .042], [.036, .052], [.026, .066], [.022, .08], [.03, .086], [.03, .092], [.018, .1], [0, .1]]), 64), M.brass));
    g.add(base);
    const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .095, 0), new THREE.Vector3(0, .2, 0), new THREE.Vector3(0, .3, .005), new THREE.Vector3(0, .36, .035), new THREE.Vector3(0, .385, .085)]);
    g.add(sh(new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 64, .0075, 16), M.brass)));
    const knuckle = sh(new THREE.Mesh(new THREE.SphereGeometry(.014, 16, 12), M.brass)); knuckle.position.set(0, .2, 0); g.add(knuckle);
    // Shade: half tube, axis along local x, opening facing down
    const L = .27, R = .07;
    const shadeGeo = new THREE.CylinderGeometry(R, R, L, 72, 1, true, 0, Math.PI);
    shadeGeo.rotateZ(Math.PI / 2);
    const shadeGroup = new THREE.Group(); shadeGroup.position.set(0, .385, .09); shadeGroup.scale.set(1, .78, 1); g.add(shadeGroup);
    // Cased glass: the bulb behind it makes the green glow from within, hottest over the bulb and fading to the ends and rims
    const glowMap = (edge) => tex(drawCanvas(64, 256, (c) => {
      const img = c.createImageData(64, 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
        const u = (x / 63 - .5) * 2, w = (y / 255 - .5) * 2;                       // u: around the arc (0 = crown), w: along the tube
        const k = edge + (1 - edge) * Math.exp(-(w * w) / .3) * (1 - .45 * u * u);
        const i = (y * 64 + x) * 4, q = Math.round(255 * k); img.data[i] = img.data[i + 1] = img.data[i + 2] = q; img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }));
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a4a22, roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .16, emissive: 0x1fb04e, emissiveMap: glowMap(.16), emissiveIntensity: 2.5, side: THREE.FrontSide, envMapIntensity: .12 });
    const outer = sh(new THREE.Mesh(shadeGeo, glass), true, false); shadeGroup.add(outer);
    const inner = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffcf8c, emissiveMap: glowMap(.22), emissiveIntensity: 4.8, side: THREE.BackSide }));
    inner.scale.setScalar(.985); shadeGroup.add(inner);
    // Thin warm line along both long edges (the opal glass edge catches the bulb)
    for (const s of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(.0014, .0014, L * .96, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .8, .46).multiplyScalar(4.5) }));
      lip.rotation.z = Math.PI / 2; lip.position.set(0, .001, s * R); shadeGroup.add(lip);
    }
    for (const s of [-1, 1]) {
      const cap = sh(new THREE.Mesh(new THREE.CircleGeometry(R + .004, 40, 0, Math.PI), M.brass));
      cap.rotation.y = s * Math.PI / 2; cap.rotation.order = 'YXZ'; cap.rotation.z = 0; cap.position.x = s * (L / 2 + .001);
      cap.rotation.x = 0; shadeGroup.add(cap);
      const capBack = cap.clone(); capBack.rotation.y += Math.PI; shadeGroup.add(capBack);
      const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(R + .003, .003, 8, 40, Math.PI), M.brass)); rim.rotation.y = Math.PI / 2; rim.position.x = s * (L / 2 + .002); shadeGroup.add(rim);
    }
    // Frosted tubular bulb tucked up inside the shade (hidden from the side, so the glow stays in the lamp), on a brass socket
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(.011, .07, 8, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .86, .62).multiplyScalar(16) }));
    bulb.rotation.z = Math.PI / 2; bulb.position.set(.012, .411, .09); g.add(bulb);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, .06, 20), M.brass); socket.rotation.z = Math.PI / 2; socket.position.set(-.1, .411, .09); g.add(socket);
    // Pull chain
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(.0018, 8, 6), M.brass, 22);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 22; i++) { mtx.makeTranslation(.06, .37 - i * .0042, .135); beads.setMatrixAt(i, mtx); }
    beads.castShadow = false; g.add(beads);   // a real chain throws a hair-thin shadow; the shadow map would smear it into a band
    const pullEnd = sh(new THREE.Mesh(new THREE.ConeGeometry(.005, .014, 12), M.brass), false); pullEnd.position.set(.06, .27, .135); pullEnd.rotation.x = Math.PI; g.add(pullEnd);
    g.scale.setScalar(scale);
    g.userData.glass = glass;
    g.userData.bulbLocal = new THREE.Vector3(0, .37, .09);
    return g;
  }

  // ---------- Pieces ----------
  function pawnGeometry() {
    const P = [];
    const add = (r, y) => P.push(new THREE.Vector2(r, y));
    const br = .40, wr = .19;
    add(0, 0); add(br * .95, 0); add(br, .02); add(br, .045); add(br * .935, .055); add(br * .94, .075);
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + i / 16 * Math.PI; add(br * .93 + Math.cos(a) * .055, .135 + Math.sin(a) * .055); }
    add(br * .85, .205); add(br * .77, .24); add(br * .69, .28); add(br * .63, .315); add(br * .6, .34);
    add(br * .66, .355); add(br * .67, .365); add(br * .63, .372); add(wr, .38);
    add(.17, .48); add(.145, .62); add(.138, .72); add(.155, .81);
    add(.245, .835); add(.255, .855); add(.245, .875); add(.18, .895); add(.135, .915); add(.13, .95);
    for (let i = 0; i <= 26; i++) { const a = -Math.PI / 2 + i / 26 * Math.PI; const px = Math.cos(a) * .22, py = 1.14 + Math.sin(a) * .22; if (px >= 0 && py >= .95) add(px, py); }
    add(0, 1.36);
    const g = new THREE.LatheGeometry(P, 64); g.computeVertexNormals(); return g;
  }
  const GEO = {};
  async function loadPieces() {
    const loader = new GLTFLoader();
    const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
    const files = { knight: import.meta.env.BASE_URL + 'models/shatranj-knight.glb' };   // the refined, sculpted Shatranj knight (mane, eye, open mouth)
    const bundled = window.SHATRANJ_MODELS;   // models.js: works even when the page is opened from disk
    await Promise.all(Object.entries(names).map(async ([k, n]) => {
      let gltf;
      if (bundled && bundled[n]) {
        const bin = atob(bundled[n]); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        gltf = await loader.parseAsync(bytes.buffer, '');
      } else {
        const url = files[n] || MODEL_DIR + n + '.glb';
        gltf = await loader.loadAsync(url).catch(e => { throw new Error(`the ${n} model (${url}) did not load: ${e.message}`); });
      }
      gltf.scene.traverse(c => { if (c.isMesh && !GEO[k]) GEO[k] = c.geometry; });
      GEO[k] = toCreasedNormals(GEO[k], Math.PI / 5);   // smooth the facets, keep genuinely sharp edges crisp
    }));
    GEO.p = pawnGeometry();
  }
  function pieceRotation(type, color, file) {
    const white = color === 'w';
    if (type === 'n') { const inward = file <= 'd' ? .62 : -.62; return (white ? Math.PI / 2 : -Math.PI / 2) + (white ? -inward : inward); }   // files run -x → +x here, so the inward turn is mirrored vs. ChessScene
    if (type === 'b') { const inward = file <= 'd' ? .22 : -.22; return (white ? -.2 : Math.PI - .2) + (white ? -inward : inward); }
    return white ? 0 : Math.PI;
  }
  const sqPos = (sq) => new THREE.Vector3(('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, BOARD_TOP + .0004, (3.5 - (+sq[1] - 1)) * SQ);
  const piecesGroup = new THREE.Group();
  let bySquare = {};
  // Turned boxwood for the light pieces: growth rings around an axis slightly off the piece centre (as in a real lathe blank),
  // which show as fine streaks up the sides and rings where the profile cuts across, plus tiny pore flecks.
  function boxwoodGrain(s) {
    s.vertexShader = 'varying vec3 vLocal;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;');
    s.fragmentShader = `varying vec3 vLocal;
      float bwH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float bwN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(bwH(i), bwH(i + vec3(1, 0, 0)), f.x), mix(bwH(i + vec3(0, 1, 0)), bwH(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(bwH(i + vec3(0, 0, 1)), bwH(i + vec3(1, 0, 1)), f.x), mix(bwH(i + vec3(0, 1, 1)), bwH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
    ` + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 q = vLocal;
      float r = length(q.xz + vec2(.41, -.23)) * 11. + bwN(q * vec3(2.2, 5., 2.2)) * 2.4 + q.y * .45;
      float ring = smoothstep(.04, .42, abs(fract(r) - .5));
      float streak = bwN(q * vec3(26., 1.6, 26.));
      float fleck = bwN(q * vec3(70., 9., 70.));
      diffuseColor.rgb *= mix(.92, 1.02, ring) * (.97 + .04 * streak) * (.985 + .025 * fleck);   // faint: it should read as polished ivory`);
  }
  function makePiece(type, color) {
    const base = color === 'w' ? M.pieceLight : M.pieceDark;
    const mat = base.clone();
    mat.color.offsetHSL((Math.random() - .5) * .015, 0, (Math.random() - .5) * .03);
    const m = sh(new THREE.Mesh(GEO[type], mat));
    m.scale.setScalar(PIECE_SCALE);
    const g = new THREE.Group(); g.add(m);
    const felt = new THREE.Mesh(new THREE.CircleGeometry(.4 * PIECE_SCALE * 1.05, 32), M.felt); felt.rotation.x = Math.PI / 2; felt.position.y = .0002; g.add(felt);
    g.userData = { type, color };
    return g;
  }
  function setPosition(fen) {
    piecesGroup.clear(); bySquare = {};
    renderer.shadowMap.needsUpdate = true;
    fen.split(' ')[0].split('/').forEach((row, ri) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const sq = 'abcdefgh'[f] + (8 - ri);
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase();
        const p = makePiece(type, color);
        p.position.copy(sqPos(sq));
        p.position.x += (Math.random() - .5) * .002; p.position.z += (Math.random() - .5) * .002;
        p.rotation.y = pieceRotation(type, color, sq[0]) + (Math.random() - .5) * .08;
        piecesGroup.add(p); bySquare[sq] = p;
        f++;
      }
    });
  }

  // ---------- The Shatranj book: a real binding that opens ----------
  // Closed: boards overhang a gilt-edged text block, rounded spine with raised bands, pebble-grain leather
  // with rubbed edges, blind- and gold-tooled cover. The book is split along the spine into two halves:
  // `bottom` (back board + lower half of the pages, carrying the RIGHT page) and `top` (front board + upper
  // half, carrying the LEFT page), which hinges about the spine axis. Rotating `top` by PI opens the book.
  const BOOK = { W: .156, D: .25, T: .04, BT: .0034 };
  const PAGE_PX = { w: 1270, h: 2048 };
  const INK = '#8a1414';

  // --- page artwork helpers (canvas 2D) ---
  function spacedText(c, text, x, y, sp, align = 'center') {
    const chars = [...text], widths = chars.map(ch => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prev = c.textAlign; c.textAlign = 'left';
    chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += widths[i] + sp; });
    c.textAlign = prev;
  }
  function wrapCentered(c, text, cx, y, maxW, lh) {
    const words = text.split(' '); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, cx, yy); yy += lh; line = w; } else line = t; }
    if (line) c.fillText(line, cx, yy);
    return yy;
  }
  function richWrap(c, runs, x, y, maxW, lh) {
    let cx = x, cy = y;
    for (const r of runs) for (const w of r.text.split(' ').filter(Boolean)) {
      c.font = r.font; c.fillStyle = r.color;
      const ww = c.measureText(w).width, sp = c.measureText(' ').width;
      if (cx + ww > x + maxW && cx > x) { cx = x; cy += lh; }
      c.fillText(w, cx, cy); cx += ww + sp;
    }
    return cy;
  }
  function drawEmblem(c, cx, cy, kind) {
    c.save(); c.strokeStyle = '#6a4a2c'; c.fillStyle = '#efdcb4'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 76, 0, 7); c.stroke();
    c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, 64, 0, 7); c.stroke();
    c.lineWidth = 3.4;
    if (kind === 'mic') {
      c.beginPath(); c.roundRect(cx - 12, cy - 40, 24, 44, 12); c.stroke();
      for (const dy of [-26, -18, -10]) { c.beginPath(); c.moveTo(cx - 6, cy + dy); c.lineTo(cx + 6, cy + dy); c.stroke(); }
      c.beginPath(); c.arc(cx, cy - 8, 21, .05, Math.PI - .05); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 13); c.lineTo(cx, cy + 30); c.moveTo(cx - 14, cy + 31); c.lineTo(cx + 14, cy + 31); c.stroke();
      for (const r of [34, 45]) { c.beginPath(); c.arc(cx, cy - 16, r, Math.PI - .55, Math.PI + .55); c.stroke(); c.beginPath(); c.arc(cx, cy - 16, r, -.55, .55); c.stroke(); }
    } else {
      const fingers = [[-15, 28], [-5, 37], [5, 35], [15, 27]];
      for (const [dx, h] of fingers) { c.beginPath(); c.roundRect(cx + dx - 4.6, cy - 6 - h, 9.2, h + 14, 4.6); c.fill(); c.stroke(); }
      c.save(); c.translate(cx - 19, cy + 12); c.rotate(-.9); c.beginPath(); c.roundRect(-4.6, -30, 9.2, 34, 4.6); c.fill(); c.stroke(); c.restore();
      c.beginPath(); c.roundRect(cx - 20, cy - 4, 40, 40, 11); c.fill(); c.stroke();
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx - 8, cy + 20); c.quadraticCurveTo(cx, cy + 26, cx + 9, cy + 18); c.stroke();
    }
    c.restore();
  }
  function drawCheck(c, x, y) {
    c.save(); c.strokeStyle = INK; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, 14, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x - 1.5, y + 5); c.lineTo(x + 7, y - 5); c.stroke(); c.restore();
  }
  function drawSmallIcon(c, x, y, kind) {
    c.save(); c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 2.6; c.lineCap = 'round';
    if (kind === 'mic') { c.beginPath(); c.roundRect(x - 5, y - 15, 10, 17, 5); c.fill(); c.beginPath(); c.arc(x, y - 3, 9, .1, Math.PI - .1); c.stroke(); c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y + 11); c.stroke(); }
    else { c.beginPath(); c.roundRect(x - 14, y - 11, 28, 21, 4); c.stroke(); c.beginPath(); c.arc(x, y - .5, 6, 0, 7); c.stroke(); c.fillRect(x - 5, y - 15, 10, 4); }
    c.restore();
  }
  function rnd32(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  // Aged paper with mottling, fibres, foxing, darkened edges and the gutter shadow, inside a gilt double frame
  function drawParchment(c, W, H, gutterRight, seed) {
    const r = rnd32(seed);
    const g = c.createRadialGradient(W * .5, H * .45, 80, W * .5, H * .5, H * .78);
    g.addColorStop(0, '#f5e8c9'); g.addColorStop(.55, '#ecd6aa'); g.addColorStop(1, '#d2ad72');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${130 + r() * 40},${90 + r() * 30},${40 + r() * 20},${.018 + r() * .02})`; c.beginPath(); c.ellipse(r() * W, r() * H, 20 + r() * 110, 14 + r() * 80, r() * 3, 0, 7); c.fill(); }
    c.lineWidth = 1;
    for (let i = 0; i < 2600; i++) { const x = r() * W, y = r() * H, a = r() * 6.28, l = 4 + r() * 16; c.strokeStyle = `rgba(110,80,40,${.04 + r() * .05})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(150,100,50,${.08 + r() * .12})`; c.beginPath(); c.arc(r() * W, r() * H, 1.5 + r() * 5, 0, 7); c.fill(); }
    const edge = (x0, y0, x1, y1, a) => { const e = c.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, `rgba(110,70,25,${a})`); e.addColorStop(1, 'rgba(110,70,25,0)'); c.fillStyle = e; c.fillRect(0, 0, W, H); };
    edge(0, 0, 0, 60, .28); edge(0, H, 0, H - 60, .28); edge(gutterRight ? 0 : W, 0, gutterRight ? 60 : W - 60, 0, .28);
    const gx = gutterRight ? W : 0, gs = c.createLinearGradient(gx, 0, gutterRight ? W - 260 : 260, 0);   // gutter shadow
    gs.addColorStop(0, 'rgba(45,25,8,.72)'); gs.addColorStop(.12, 'rgba(55,32,10,.38)'); gs.addColorStop(.4, 'rgba(60,35,12,.12)'); gs.addColorStop(1, 'rgba(60,35,12,0)');
    c.fillStyle = gs; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#b4893a'; c.lineWidth = 5; c.strokeRect(55, 55, W - 110, H - 110);
    c.lineWidth = 2; c.strokeRect(72, 72, W - 144, H - 144);
    c.fillStyle = '#b4893a';
    for (const [x, y, sx, sy] of [[55, 55, 1, 1], [W - 55, 55, -1, 1], [55, H - 55, 1, -1], [W - 55, H - 55, -1, -1]]) {
      c.save(); c.translate(x, y); c.scale(sx, sy);
      c.beginPath(); c.arc(28, 28, 8, 0, 7); c.fill();
      c.lineWidth = 2.4; c.strokeStyle = '#b4893a'; c.beginPath(); c.arc(28, 28, 16, Math.PI * .9, Math.PI * 1.6); c.stroke();
      c.restore();
    }
  }
  // One page of the control-style spread, laid out after the design at 2.5 px per design px
  function drawControlPage(spec) {
    const { w: W, h: H } = PAGE_PX;
    return drawCanvas(W, H, (c) => {
      drawParchment(c, W, H, spec.gutterRight, spec.seed);
      const dark = '#140a05', body = '#1d120a', crimson = '#741010', muted = '#5a4630', cx = W / 2;
      c.textBaseline = 'middle';
      c.fillStyle = dark; c.font = '600 30px Cinzel, serif';
      spacedText(c, spec.folio, 130, 112, 5, 'left'); spacedText(c, spec.motto, cx, 112, 5); spacedText(c, spec.side, W - 130, 112, 5, 'right');
      const rule = (y, a = .45) => { c.strokeStyle = `rgba(110,80,45,${a})`; c.lineWidth = 1.6; c.beginPath(); c.moveTo(130, y); c.lineTo(W - 130, y); c.stroke(); };
      rule(150);
      drawEmblem(c, cx, 330, spec.emblem);
      c.fillStyle = '#3e2914'; c.font = '600 30px Cinzel, serif'; spacedText(c, '· ' + spec.latin + ' ·', cx, 452, 8);
      c.fillStyle = crimson; c.font = '600 33px Cinzel, serif'; spacedText(c, '— ' + spec.chapter + ' —', cx, 585, 6);
      c.fillStyle = dark; c.font = '700 70px Cinzel, serif'; c.textAlign = 'center'; c.fillText(spec.title, cx, 652);
      c.fillStyle = body; c.font = 'italic 500 43px "EB Garamond", serif'; c.fillText(spec.subtitle, cx, 728);
      c.font = '500 44px "EB Garamond", serif'; wrapCentered(c, spec.para, cx, 852, 1010, 60);
      rule(1092);
      c.fillStyle = crimson; c.font = '600 29px Cinzel, serif'; spacedText(c, '~ ' + spec.section + ' ~', cx, 1132, 6);
      c.fillStyle = body; c.font = 'italic 500 41px "EB Garamond", serif'; c.fillText(spec.examples.join('  •  '), cx, 1184);
      rule(1232);
      c.textAlign = 'left';
      let y = 1345;
      for (const [lead, text] of spec.bullets) {
        drawCheck(c, 160, y);
        const end = richWrap(c, [{ text: lead, font: '600 42px "EB Garamond", serif', color: dark }, { text, font: '500 42px "EB Garamond", serif', color: body }], 195, y, 945, 60);
        y = end + 70;
      }
      c.font = '600 32px Cinzel, serif'; c.fillStyle = dark;
      const apW = (() => { let t = 0; for (const ch of spec.apparatus) t += c.measureText(ch).width + 5; return t; })();
      drawSmallIcon(c, cx - apW / 2 - 30, 1777, spec.emblem === 'mic' ? 'mic' : 'cam');
      spacedText(c, spec.apparatus, cx + 8, 1777, 5);
      c.fillStyle = muted; c.font = '500 24px Cinzel, serif';
      spacedText(c, 'BOOK OF SHATRANJ', 130, 1912, 4, 'left'); spacedText(c, '— ' + spec.pageNo + ' —', cx, 1912, 4); spacedText(c, spec.footer, W - 130, 1912, 4, 'right');
    });
  }
  const CONTROL_PAGES = {
    voice: { folio: 'FOLIO I', motto: '✦ THE SPOKEN WORD ✦', side: 'LEFT PAGE', emblem: 'mic', latin: 'VOX REGIA', chapter: 'CHAPTER I', title: 'VOICE COMMANDS',
      subtitle: 'Speak your moves out loud to play hands-free',
      para: 'Just speak your chess move clearly. Say the piece and where you want it to go, and it will glide across the board without touching a key.',
      section: 'SPOKEN INCANTATIONS', examples: ['“Knight to F3”', '“Pawn to E4”', '“Castle Kingside”'],
      bullets: [['Everyday Words:', 'Say moves in simple chess language (e.g. “Bishop takes D5”).'], ['Spoken Confirmation:', 'A royal herald speaks back to confirm your moves and checks.'], ['Completely Hands-Free:', 'Sit back and command the battlefield with your microphone.']],
      apparatus: 'APPARATUS: LIVE MICROPHONE', pageNo: 1, footer: 'VOICE COMMAND', gutterRight: true, seed: 11 },
    gesture: { folio: 'FOLIO II', motto: '✦ THE LIVING HAND ✦', side: 'RIGHT PAGE', emblem: 'hand', latin: 'MANVS ARTIFEX', chapter: 'CHAPTER II', title: 'HAND GESTURES',
      subtitle: 'Use your real hand in the air to pick up pieces',
      para: 'Control the board naturally in front of your camera. Pinch your fingers to pick up a piece, move it in 3D space, and open your hand to place it down.',
      section: 'AIR KINEMATICS', examples: ['1. Pinch to Grab', '2. Move in the Air', '3. Open to Drop'],
      bullets: [['Camera Tracking:', 'Your webcam sees your hand without any gloves or extra hardware.'], ['Pinch & Lift:', 'Pinch thumb and index finger together to grab any piece on the board.'], ['Golden Target Light:', 'A light beam shows exactly which square the piece will land on.']],
      apparatus: 'APPARATUS: OPTICAL WEBCAM', pageNo: 2, footer: 'GESTURE CONTROL', gutterRight: false, seed: 23 },
  };
  // Pen annotation: a hand-drawn ellipse around a chosen option, optionally followed by "Selected" written in the margin.
  // Drawn twice: the ink itself, and an "order" map (0..1 = when each pixel is laid down) used to animate the pen.
  const inkCache = new Map();
  function drawInk(def) {
    const key = JSON.stringify(def);
    if (inkCache.has(key)) return inkCache.get(key);
    const { w: W, h: H } = PAGE_PX, r = rnd32(77 + Math.round(def.cx * 3 + def.cy));
    const { cx, cy, rx, ry, word } = def, span = word ? .62 : 1;
    const pts = [], a0 = -2.5, turns = 1.1, N = 220;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = a0 + t * Math.PI * 2 * turns;
      const grow = 1 + t * .045 + Math.sin(a * 3 + 1) * .018 + Math.sin(a * 7) * .008;
      pts.push([cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow * (1 + t * .06) - t * 10 * ry / 128]);
    }
    const strokeEllipse = (c, isOrder) => {
      c.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const t = i / N, press = Math.sin(Math.min(1, t * 1.15) * Math.PI) ** .6;
        c.lineWidth = 2.5 + press * 7.5 + (isOrder ? 4 : 0);
        c.strokeStyle = isOrder ? `rgb(${Math.round(t * span * 255)},0,0)` : `rgba(112,10,12,${.86 + r() * .1})`;
        c.beginPath(); c.moveTo(...pts[i - 1]); c.lineTo(...pts[i]); c.stroke();
      }
    };
    const writeWord = (c, isOrder) => {
      if (!word) return;
      const k = word.size / 148;
      c.save(); c.translate(word.x, word.y); c.rotate(word.rot);
      c.font = `${word.size}px "Pinyon Script", cursive`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText('Selected').width;
      if (isOrder) { const g = c.createLinearGradient(-tw / 2, 0, tw / 2, 0); g.addColorStop(0, 'rgb(168,0,0)'); g.addColorStop(1, 'rgb(240,0,0)'); c.fillStyle = g; c.strokeStyle = g; c.lineWidth = 6; c.strokeText('Selected', 0, 0); }
      else { c.fillStyle = 'rgba(112,10,12,.95)'; c.strokeStyle = 'rgba(112,10,12,.95)'; c.lineWidth = 2.6 * k; c.strokeText('Selected', 0, 0); }   // a broad-nibbed pen: fill plus a hairline stroke for weight
      c.fillText('Selected', 0, 0);
      c.lineCap = 'round'; c.lineWidth = (isOrder ? 10 : 5.5) * k;
      if (isOrder) { const g2 = c.createLinearGradient(-tw / 2, 0, tw / 2, 0); g2.addColorStop(0, 'rgb(242,0,0)'); g2.addColorStop(1, 'rgb(255,0,0)'); c.strokeStyle = g2; } else c.strokeStyle = 'rgba(112,10,12,.9)';
      c.beginPath(); c.moveTo(-tw / 2 + 10 * k, 62 * k); c.bezierCurveTo(-tw / 6, 80 * k, tw / 5, 48 * k, tw / 2 + 20 * k, 58 * k); c.stroke();
      c.restore();
    };
    const inkC = drawCanvas(W, H, (c) => { strokeEllipse(c, false); writeWord(c, false); });
    const orderC = drawCanvas(W, H, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); strokeEllipse(c, true); writeWord(c, true); });
    const out = { ink: tex(inkC), order: tex(orderC, { srgb: false }), canvas: inkC };
    inkCache.set(key, out);
    return out;
  }
  const CONTROL_INK = { cx: PAGE_PX.w / 2 + 6, cy: 668, rx: 520, ry: 128, word: { x: 975, y: 372, size: 148, rot: -.16 } };

  // ---------- Spread 2: Configure Your Match (left: I. Choose your army · right: II. Game format + III. conditions) ----------
  const INKC = { dark: '#140a05', body: '#1d120a', crimson: '#741010', muted: '#5a4630' };
  function pageChrome(c, spec) {
    const { w: W, h: H } = PAGE_PX, cx = W / 2;
    drawParchment(c, W, H, spec.gutterRight, spec.seed);
    c.textBaseline = 'middle';
    c.fillStyle = INKC.dark; c.font = '600 30px Cinzel, serif';
    spacedText(c, spec.folio, 130, 112, 5, 'left'); spacedText(c, spec.motto, cx, 112, 5); spacedText(c, spec.side, W - 130, 112, 5, 'right');
    rule(c, 150);
    c.fillStyle = INKC.muted; c.font = '500 24px Cinzel, serif';
    spacedText(c, 'BOOK OF SHATRANJ', 130, 1912, 4, 'left'); spacedText(c, '— ' + spec.pageNo + ' —', cx, 1912, 4); spacedText(c, spec.footer, W - 130, 1912, 4, 'right');
  }
  function rule(c, y, a = .45, x0 = 130, x1 = PAGE_PX.w - 130) { c.strokeStyle = `rgba(110,80,45,${a})`; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
  function sectionLabel(c, num, text, y) {
    c.textAlign = 'left'; c.font = '700 32px Cinzel, serif'; c.fillStyle = INKC.crimson; c.fillText(num, 130, y);
    const w = c.measureText(num + ' ').width;
    c.fillStyle = INKC.dark; c.font = '600 32px Cinzel, serif'; spacedText(c, text, 130 + w + 8, y, 5, 'left');
  }
  function leftWrap(c, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); yy += lh; line = w; } else line = t; }
    if (line) c.fillText(line, x, yy);
    return yy;
  }
  // Woodcut-style marks, drawn in brown ink
  function drawMark(c, kind, x, y) {
    c.save(); c.translate(x, y); c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = '#2a1608';
    const paper = '#efdcb4';
    if (kind === 'pawn-w' || kind === 'pawn-b') {
      const black = kind === 'pawn-b';
      c.fillStyle = black ? '#1e120a' : paper;
      const part = (fn) => { c.beginPath(); fn(); c.fill(); c.stroke(); };
      part(() => { c.moveTo(-44, 62); c.lineTo(-20, 2); c.lineTo(20, 2); c.lineTo(44, 62); c.closePath(); });
      part(() => c.roundRect(-66, 60, 132, 28, 9));
      part(() => c.ellipse(0, 0, 36, 11, 0, 0, 7));
      part(() => c.arc(0, -40, 34, 0, 7));
      c.strokeStyle = black ? 'rgba(239,220,180,.55)' : 'rgba(42,22,8,.55)'; c.lineWidth = 2;   // woodcut hatching on the shaded side
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(10 + i * 5, 12 + i * 9); c.lineTo(22 + i * 4, 56); c.stroke(); }
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, -40, 26 - i * 5, -.9, .4); c.stroke(); }
    } else if (kind === 'cog') {
      c.fillStyle = paper;
      c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.save(); c.rotate(a); c.rect(-9, -64, 18, 18); c.restore(); } c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 50, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); c.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); c.stroke(); }
    } else if (kind === 'swords') {
      for (const s of [-1, 1]) {
        c.save(); c.rotate(s * .78);
        c.fillStyle = paper; c.beginPath(); c.moveTo(-6, 34); c.lineTo(-6, -58); c.lineTo(0, -72); c.lineTo(6, -58); c.lineTo(6, 34); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(0, -60); c.lineTo(0, 30); c.lineWidth = 1.5; c.stroke(); c.lineWidth = 4;
        c.beginPath(); c.moveTo(-26, 36); c.lineTo(26, 36); c.stroke();
        c.beginPath(); c.moveTo(0, 38); c.lineTo(0, 62); c.stroke();
        c.beginPath(); c.arc(0, 68, 7, 0, 7); c.fillStyle = '#2a1608'; c.fill();
        c.restore();
      }
    } else if (kind === 'scroll') {
      c.fillStyle = paper;
      c.beginPath(); c.roundRect(-50, -40, 100, 80, 6); c.fill(); c.stroke();
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(0, s * 42, 60, 12, 0, 0, 7); c.fill(); c.stroke(); }
      c.lineWidth = 2.4; for (const yy of [-16, -2, 12]) { c.beginPath(); c.moveTo(-34, yy); c.lineTo(34, yy); c.stroke(); }
      c.fillStyle = '#741010'; c.beginPath(); c.arc(24, 30, 11, 0, 7); c.fill();
    }
    c.restore();
  }
  // A selectable row: woodcut mark on the left, title, italic description and a crimson tag line
  function drawOptionRow(c, o, x0, sizes) {
    drawMark(c, o.icon, 250, o.cy);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = INKC.dark; c.font = `700 ${sizes.title}px Cinzel, serif`; c.fillText(o.title, x0, o.cy - sizes.titleUp);
    c.fillStyle = INKC.body; c.font = `italic 500 ${sizes.desc}px "EB Garamond", serif`; leftWrap(c, o.desc, x0, o.cy - sizes.descUp, 1140 - x0, sizes.lh);
    c.fillStyle = INKC.crimson; c.font = '600 28px Cinzel, serif'; spacedText(c, o.tag, x0, o.cy + sizes.tagDown, 3, 'left');
  }
  const ARMY_OPTS = [
    { value: 'w', cy: 1065, icon: 'pawn-w', title: 'WHITE VANGUARD', desc: 'Seize opening tempo and command the center squares.', tag: 'MOVES FIRST  •  1. E4 / 1. D4', label: 'White Vanguard' },
    { value: 'b', cy: 1565, icon: 'pawn-b', title: 'BLACK VANGUARD', desc: 'Defend the throne with tactical counter-gambits.', tag: 'MOVES SECOND  •  COUNTER-ATTACKING', label: 'Black Vanguard' },
  ];
  const FORMAT_OPTS = [
    { value: 'vs-bot', cy: 505, icon: 'cog', title: 'AUTOMATON MAESTER', desc: 'Face an autonomous clockwork chess engine with real-time positional foresight.', tag: 'SOLO  •  AI ENGINE', label: 'Automaton Maester' },
    { value: 'two-player', cy: 805, icon: 'swords', title: 'COUNCIL DUEL', desc: 'Two commanders duel on this shared battlefield with alternating turns.', tag: 'LOCAL  •  PASS & PLAY', label: 'Council Duel' },
    { value: 'online', cy: 1105, icon: 'scroll', title: 'IMPERIAL COURIER', desc: 'Dispatch an encrypted courier scroll to duel a distant rival with live voice.', tag: 'ONLINE  •  PEER-TO-PEER', label: 'Imperial Courier' },
  ];
  const DEPTH_OPTS = [
    { value: 'easy', cx: 300, title: 'APPRENTICE', sub: 'Casual & Warmup', depth: 'DEPTH: 1–2', label: 'Apprentice' },
    { value: 'medium', cx: 635, title: 'MAESTER', sub: 'Tactical Balance', depth: 'DEPTH: 4–5', label: 'Maester' },
    { value: 'hard', cx: 970, title: 'GRAND ARCHON', sub: 'Deep Calculation', depth: 'DEPTH: 8–10', label: 'Grand Archon' },
  ];
  const DEPTH_NOTE = { easy: 'Apprentice (Casual & Warmup)', medium: 'Maester (Tactical Balance)', hard: 'Grand Archon (Deep Calculation)' };
  const COPY_RECT = [130, 1690, 640, 1780];
  function drawArmyPage(st, name) {
    const { w: W, h: H } = PAGE_PX, cx = W / 2;
    return drawCanvas(W, H, (c) => {
      pageChrome(c, { folio: 'FOLIO III', motto: '✦ BATTLE DECREE ✦', side: 'LEFT PAGE', pageNo: 3, footer: 'THE BATTLE DECREE', gutterRight: true, seed: 31 });
      c.textAlign = 'center';
      c.fillStyle = INKC.crimson; c.font = '600 33px Cinzel, serif'; spacedText(c, '— CHAPTER III —', cx, 290, 6);
      c.fillStyle = INKC.dark; c.font = '700 64px Cinzel, serif'; c.fillText('CONFIGURE YOUR MATCH', cx, 362);
      c.fillStyle = INKC.body; c.font = 'italic 500 41px "EB Garamond", serif';
      wrapCentered(c, `Inscribe your army, combat format, and computational depth, ${name}.`, cx, 445, 960, 54);
      rule(c, 585, .35, 330, W - 330); c.fillStyle = '#b4893a'; c.save(); c.translate(cx, 585); c.rotate(Math.PI / 4); c.fillRect(-7, -7, 14, 14); c.restore();
      sectionLabel(c, 'I.', 'CHOOSE YOUR ARMY', 690);
      c.textAlign = 'left'; c.fillStyle = INKC.body; c.font = 'italic 500 37px "EB Garamond", serif';
      c.fillText(st.side === 'b' ? 'Black commands tactical counter-strikes.' : st.side === 'w' ? 'White holds opening initiative (1. e4 / 1. d4).' : 'White moves first; Black answers. Choose your colours.', 130, 748);
      rule(c, 800);
      for (const o of ARMY_OPTS) drawOptionRow(c, o, 400, { title: 52, titleUp: 88, desc: 40, descUp: 18, lh: 50, tagDown: 98 });
      rule(c, 1315, .3);
      rule(c, 1820);
    });
  }
  function drawFormatPage(st, roomId) {
    const { w: W, h: H } = PAGE_PX, cx = W / 2;
    return drawCanvas(W, H, (c) => {
      pageChrome(c, { folio: 'FOLIO IV', motto: '✦ COMMISSION OF WAR ✦', side: 'RIGHT PAGE', pageNo: 4, footer: 'COMMISSION OF WAR', gutterRight: false, seed: 37 });
      sectionLabel(c, 'II.', 'CHOOSE GAME FORMAT', 230);
      c.textAlign = 'left'; c.fillStyle = INKC.body; c.font = 'italic 500 37px "EB Garamond", serif'; c.fillText('Select your combat doctrine.', 130, 288);
      rule(c, 335);
      for (const o of FORMAT_OPTS) drawOptionRow(c, o, 390, { title: 46, titleUp: 82, desc: 38, descUp: 20, lh: 46, tagDown: 98 });
      rule(c, 655, .3); rule(c, 955, .3); rule(c, 1265);
      // III changes with the chosen format
      const f = st.format;
      sectionLabel(c, 'III.', f === 'vs-bot' ? 'ENGINE DEPTH' : f === 'online' ? 'IMPERIAL DISPATCH LINK' : f === 'two-player' ? 'WAR COUNCIL PROTOCOL' : 'CONDITIONS OF BATTLE', 1340);
      c.textAlign = 'left'; c.fillStyle = INKC.body; c.font = 'italic 500 37px "EB Garamond", serif';
      if (f === 'vs-bot') {
        c.fillText(st.difficulty ? DEPTH_NOTE[st.difficulty] : 'Choose how deeply the engine calculates.', 130, 1398);
        rule(c, 1445);
        c.strokeStyle = 'rgba(110,80,45,.3)'; c.lineWidth = 1.6; for (const x of [467, 803]) { c.beginPath(); c.moveTo(x, 1480); c.lineTo(x, 1700); c.stroke(); }
        c.textAlign = 'center';
        for (const d of DEPTH_OPTS) {
          c.fillStyle = INKC.dark; c.font = '700 38px Cinzel, serif'; c.fillText(d.title, d.cx, 1530);
          c.fillStyle = INKC.body; c.font = 'italic 500 36px "EB Garamond", serif'; c.fillText(d.sub, d.cx, 1592);
          c.fillStyle = INKC.crimson; c.font = '600 28px Cinzel, serif'; spacedText(c, d.depth, d.cx, 1652, 3);
        }
        rule(c, 1735);
      } else if (f === 'online') {
        c.fillText('Share the courier link with your rival.', 130, 1398);
        rule(c, 1445);
        c.fillStyle = INKC.crimson; c.font = '600 27px Cinzel, serif'; spacedText(c, 'SEALED ROOM DISPATCH', 130, 1495, 5, 'left');
        c.fillStyle = INKC.dark; c.font = '600 46px "EB Garamond", serif'; c.fillText('Room · ' + roomId, 130, 1555);
        c.fillStyle = INKC.body; c.font = 'italic 500 36px "EB Garamond", serif'; leftWrap(c, 'Share this secret courier link to duel across the realm with peer-to-peer audio.', 130, 1615, 1010, 46);
        const [x0, y0, x1, y1] = COPY_RECT;
        c.fillStyle = '#24120a'; c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, 8); c.fill();
        c.strokeStyle = '#b4893a'; c.lineWidth = 3; c.stroke();
        c.fillStyle = st.copied ? '#9fd6a4' : '#f3e3bf'; c.font = '600 28px Cinzel, serif'; spacedText(c, st.copied ? 'LINK COPIED ✓' : 'COPY COURIER LINK', (x0 + x1) / 2, (y0 + y1) / 2 + 2, 4);
      } else if (f === 'two-player') {
        c.fillText('Both commanders share this table.', 130, 1398);
        rule(c, 1445);
        c.textAlign = 'center'; c.font = 'italic 500 39px "EB Garamond", serif';
        wrapCentered(c, 'Both commanders share this single royal console. The battlefield alternates smoothly between White Vanguard and Black Vanguard turns.', cx, 1530, 960, 54);
      } else {
        c.fillStyle = INKC.muted; c.fillText('Choose a format above and its conditions will be written here.', 130, 1398);
      }
    });
  }

  // ---------- Profile spread (opened from the game): the commander's record and standing orders ----------
  const CONTROL_NAME = { mouse: 'Pointer & touch', gesture: 'Hand gestures', voice: 'Voice commands' };
  const ORDER_OPTS = [
    { value: 'reset', cy: 560, icon: 'swords', title: 'NEW BATTLE', desc: 'Clear the board and set the pieces for a fresh match.', tag: 'RESETS THE CURRENT GAME', label: 'Start a new battle' },
    { value: 'howto', cy: 990, icon: 'scroll', title: 'RULES OF PLAY', desc: 'Open the codex on moves, gestures and spoken commands.', tag: 'HOW TO PLAY', label: 'Open the rules of play' },
    { value: 'signout', cy: 1420, icon: 'pawn-w', title: 'LEAVE THE STUDY', desc: 'Sign out and return to the entrance hall.', tag: 'ENDS YOUR SESSION', label: 'Sign out' },
  ];
  const ROW_SIZES = { title: 50, titleUp: 86, desc: 40, descUp: 18, lh: 50, tagDown: 98 };
  function drawProfilePage(st, who) {
    const { w: W, h: H } = PAGE_PX, cx = W / 2;
    return drawCanvas(W, H, (c) => {
      pageChrome(c, { folio: 'FOLIO V', motto: '✦ THE COMMANDER ✦', side: 'LEFT PAGE', pageNo: 5, footer: 'COMMANDER’S RECORD', gutterRight: true, seed: 43 });
      c.save(); c.translate(cx, 340); c.scale(1.45, 1.45); drawMark(c, st.side === 'b' ? 'pawn-b' : 'pawn-w', 0, 0); c.restore();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = INKC.crimson; c.font = '600 33px Cinzel, serif'; spacedText(c, '— COMMANDER OF RECORD —', cx, 560, 6);
      const name = (who.name || 'Grandmaster').toUpperCase();
      let size = 84; c.font = `700 ${size}px Cinzel, serif`;
      while (size > 44 && c.measureText(name).width > 980) { size -= 4; c.font = `700 ${size}px Cinzel, serif`; }
      c.fillStyle = INKC.dark; c.fillText(name, cx, 652);
      c.fillStyle = INKC.body; c.font = 'italic 500 43px "EB Garamond", serif';
      c.fillText(`Commander of the ${st.side === 'b' ? 'Black' : 'White'} Vanguard`, cx, 738);
      rule(c, 830, .35, 330, W - 330); c.fillStyle = '#b4893a'; c.save(); c.translate(cx, 830); c.rotate(Math.PI / 4); c.fillRect(-7, -7, 14, 14); c.restore();
      const fmt = FORMAT_OPTS.find(o => o.value === st.format), depth = DEPTH_OPTS.find(o => o.value === st.difficulty);
      const rival = st.format === 'two-player' ? 'A commander at this table' : st.format === 'online' ? 'A distant rival, by courier' : depth ? `${depth.label} engine` : 'Master engine';
      const rows = [['ARMY', st.side === 'b' ? 'Black Vanguard' : 'White Vanguard'], ['FORMAT', fmt ? fmt.label : '—'], ['RIVAL', rival], ['CONTROL', CONTROL_NAME[st.control] || '—'], ['MOVES RECORDED', String(who.moves || 0)]];
      rows.forEach(([k, v], i) => {
        const y = 940 + i * 140;
        c.fillStyle = INKC.crimson; c.font = '600 29px Cinzel, serif'; spacedText(c, k, 130, y, 5, 'left');
        c.fillStyle = INKC.dark; c.font = '600 46px "EB Garamond", serif'; c.textAlign = 'right'; c.fillText(v, W - 130, y);
        rule(c, y + 62, .3);
      });
      c.textAlign = 'center'; c.fillStyle = INKC.body; c.font = 'italic 500 39px "EB Garamond", serif';
      wrapCentered(c, 'Turn back a page to change your control style or to configure the match.', cx, 1700, 940, 54);
    });
  }
  function drawOrdersPage() {
    const { w: W, h: H } = PAGE_PX;
    return drawCanvas(W, H, (c) => {
      pageChrome(c, { folio: 'FOLIO VI', motto: '✦ STANDING ORDERS ✦', side: 'RIGHT PAGE', pageNo: 6, footer: 'STANDING ORDERS', gutterRight: false, seed: 47 });
      sectionLabel(c, 'I.', 'STANDING ORDERS', 230);
      c.textAlign = 'left'; c.fillStyle = INKC.body; c.font = 'italic 500 37px "EB Garamond", serif'; c.fillText('Tap an order to carry it out.', 130, 288);
      rule(c, 335);
      for (const o of ORDER_OPTS) drawOptionRow(c, o, 400, ROW_SIZES);
      rule(c, 775, .3); rule(c, 1205, .3); rule(c, 1640);
      c.textAlign = 'center'; c.fillStyle = INKC.muted; c.font = 'italic 500 37px "EB Garamond", serif';
      c.fillText('Your match waits on the board while the book is open.', W / 2, 1730);
    });
  }

  function buildBook() {
    const { W, D, T, BT } = BOOK;
    const g = new THREE.Group(); g.name = 'shatranjBook';
    const ox = [84, 16, 14], wear = [128, 56, 34], gold = [236, 186, 92];
    // Pebble grain + mottling shared by every leather surface (x, y in pixels at ~4.6 px/mm)
    const leather = (x, y, o, edgeDist) => {
      const m = .8 + .4 * fbm(x / 110, y / 110, 4);
      const peb = vnoise(x / 2.3, y / 2.3), fine = vnoise(x / 1.1 + 40, y / 1.1);
      const crease = Math.abs(fbm(x / 90 + 3, y / 90, 3) - .5) < .005 ? .5 : 0;
      const wr = edgeDist == null ? 0 : clamp01(1 - edgeDist / 16) ** 1.6 * (.55 + .45 * fbm(x / 9, y / 9, 2));
      const k = m * (.9 + .12 * peb);
      o[0] = lerp(ox[0] * k, wear[0], wr); o[1] = lerp(ox[1] * k, wear[1], wr); o[2] = lerp(ox[2] * k, wear[2], wr);
      if (crease) { o[0] *= .8; o[1] *= .8; o[2] *= .8; }
      o[3] = peb * .6 + fine * .22 - crease * .6; o[4] = .58 - wr * .18 + peb * .06; o[5] = 0;
    };
    // Cover tooling masks drawn with the canvas, then read back as alpha
    const CW = 720, CH = Math.round(720 * D / W), k = CH / 1016;
    const maskOf = (draw) => drawCanvas(CW, CH, (c) => { c.fillStyle = c.strokeStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; draw(c); }).getContext('2d').getImageData(0, 0, CW, CH).data;
    const fleuron = (c, x, y, s) => {   // corner ornament: four petals, a lozenge and dots
      c.save(); c.translate(x, y);
      for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, -s * .12); c.quadraticCurveTo(s * .28, -s * .55, 0, -s * .9); c.quadraticCurveTo(-s * .28, -s * .55, 0, -s * .12); c.fill(); c.beginPath(); c.arc(s * .42, -s * .42, s * .07, 0, 7); c.fill(); }
      c.beginPath(); c.moveTo(0, -s * .16); c.lineTo(s * .16, 0); c.lineTo(0, s * .16); c.lineTo(-s * .16, 0); c.closePath(); c.fill();
      c.restore();
    };
    const giltMask = maskOf((c) => {
      c.lineWidth = 8; c.strokeRect(40, 40, CW - 80, CH - 80); c.lineWidth = 3.5; c.strokeRect(58, 58, CW - 116, CH - 116);
      for (const [x, y] of [[92, 92], [CW - 92, 92], [92, CH - 92], [CW - 92, CH - 92]]) fleuron(c, x, y, 34);
      c.font = '700 86px Cinzel, serif'; c.fillText('SHATRANJ', CW / 2, 300 * k);
      c.lineWidth = 2; c.beginPath(); c.moveTo(210, 362 * k); c.lineTo(CW - 210, 362 * k); c.stroke();
      c.font = '500 36px Cinzel, serif'; c.fillText('THE ROYAL GAME', CW / 2, 408 * k);
      c.lineWidth = 3; c.beginPath(); c.arc(CW / 2, 640 * k, 92, 0, 7); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(CW / 2, 640 * k, 80, 0, 7); c.stroke();
      c.font = '120px serif'; c.fillText('♞', CW / 2, 646 * k);
      c.font = '500 28px Cinzel, serif'; c.fillText('OPENINGS · ENDINGS', CW / 2, 860 * k);
    });
    const blindMask = maskOf((c) => {           // blind tooling: pressed but not gilded
      c.lineWidth = 3; c.strokeRect(120, 120, CW - 240, CH - 240);
      c.lineWidth = 5; c.beginPath(); c.moveTo(20, 0); c.lineTo(20, CH); c.stroke();   // hinge groove along the spine edge
      c.beginPath(); c.moveTo(CW / 2, 640 * k - 190); c.lineTo(CW / 2 + 150, 640 * k); c.lineTo(CW / 2, 640 * k + 190); c.lineTo(CW / 2 - 150, 640 * k); c.closePath(); c.stroke();
    });
    const cover = surface(CW, CH, (x, y, o) => {
      leather(x, y, o, Math.min(x, y, CW - 1 - x, CH - 1 - y));
      const i = (y * CW + x) * 4, gm = giltMask[i] / 255, bm = blindMask[i] / 255;
      if (bm > 0) { o[0] *= 1 - bm * .35; o[1] *= 1 - bm * .35; o[2] *= 1 - bm * .35; o[3] -= bm * 2.2; o[4] -= bm * .12; }
      if (gm > 0) {
        const worn = vnoise(x / 6, y / 6) < .1 ? .55 : 1;   // a little gold rubbed away
        const gv = .85 + .3 * vnoise(x / 1.6, y / 1.6), a = gm * worn;
        o[0] = lerp(o[0], gold[0] * gv, a); o[1] = lerp(o[1], gold[1] * gv, a); o[2] = lerp(o[2], gold[2] * gv, a);
        o[3] -= gm * 2.6; o[4] = lerp(o[4], .26, a); o[5] = a;
      }
    }, 1.4);
    const coverMat = new THREE.MeshPhysicalMaterial({ map: cover.map, normalMap: cover.normalMap, normalScale: new THREE.Vector2(.6, .6), roughnessMap: cover.orm, metalnessMap: cover.orm, roughness: 1, metalness: 1, specularIntensity: .45, clearcoat: .08, clearcoatRoughness: .5, sheen: .06, sheenColor: new THREE.Color(0x6a2a1e) });
    const plain = surface(512, 512, (x, y, o) => leather(x, y, o, null), 1.4);
    const edgeMat = new THREE.MeshPhysicalMaterial({ map: plain.map, normalMap: plain.normalMap, normalScale: new THREE.Vector2(.6, .6), roughnessMap: plain.orm, roughness: 1, specularIntensity: .45, sheen: .06, sheenColor: new THREE.Color(0x6a2a1e) });
    // Gilt edges of the text block: gold leaf over the fine lines of the stacked pages
    const leaves = surface(1024, 128, (x, y, o) => {
      const line = vnoise(x / 220, y * 2.3) * .7 + vnoise(x / 60, y * 4.1) * .3;   // faint page lines under burnished leaf
      const gv = .93 + .1 * line;
      o[0] = gold[0] * gv; o[1] = gold[1] * gv * .97; o[2] = gold[2] * gv * .9;
      o[3] = line * .25; o[4] = .17 + line * .06; o[5] = 1;
    }, 1);
    const leafMat = new THREE.MeshPhysicalMaterial({ map: leaves.map, normalMap: leaves.normalMap, roughnessMap: leaves.orm, metalnessMap: leaves.orm, roughness: 1, metalness: 1, side: THREE.DoubleSide });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe9d9b6, roughness: .9 });

    const bottom = new THREE.Group(); g.add(bottom);
    const top = new THREE.Group(); top.position.set(-W / 2, T / 2, 0); g.add(top);   // pivot on the spine axis
    const P = (x, y, z) => new THREE.Vector3(x + W / 2, y - T / 2, z);                 // closed-book coords -> pivot coords
    const board = (parent, pos, topMat, bottomMat) => { const m = sh(new THREE.Mesh(new RoundedBoxGeometry(W, BT, D, 3, .0013), [edgeMat, edgeMat, topMat, bottomMat, edgeMat, edgeMat])); m.position.copy(pos); parent.add(m); return m; };
    board(top, P(0, T - BT / 2, 0), coverMat, edgeMat);
    board(bottom, new THREE.Vector3(0, BT / 2, 0), edgeMat, edgeMat);
    // Text block in two halves; it stops 12 mm short of the spine so the opened pages can curve down into the gutter
    const gutterPaper = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: .95 });   // inner wall of the text block, in the shadow of the gutter
    const bw = W - .016, bx = .004, bh = T / 2 - BT, bmats = [leafMat, gutterPaper, gutterPaper, gutterPaper, leafMat, leafMat];   // block faces are hidden under the pages; keep any glimpse dark
    const lower = sh(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, D - .006), bmats)); lower.position.set(bx, BT + bh / 2, 0); bottom.add(lower);
    const upper = sh(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, D - .006), bmats)); upper.position.copy(P(bx, T / 2 + bh / 2, 0)); top.add(upper);
    // Rounded spine, split into two quarter shells so each half carries its own
    const spineTex = surface(256, 1016, (x, y, o) => {
      leather(x, y, o, null);
      const bandYs = [203, 406, 610, 813];
      const nb = Math.min(...bandYs.map(b => Math.abs(y - b)));
      if (nb < 5 && nb > 2) { const gv = .9 + .2 * vnoise(x, y); o[0] = gold[0] * gv; o[1] = gold[1] * gv; o[2] = gold[2] * gv; o[3] -= 1.5; o[4] = .26; o[5] = 1; }
      if (y > 628 && y < 795) { o[0] = 26; o[1] = 18; o[2] = 14; o[4] = .5; }   // dark morocco title label near the head
    }, 1.4);
    const sc = drawCanvas(256, 1016, (c) => { c.drawImage(spineTex.map.image, 0, 0); c.fillStyle = '#e2b866'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 17px Cinzel, serif'; c.fillText('SHATRANJ', 128, 711); c.font = '34px serif'; c.fillText('♞', 128, 305); c.fillText('♞', 128, 508); });
    const spineMap = tex(sc);
    const quarter = (thetaStart, uOff) => {
      const geo = new THREE.CylinderGeometry(T / 2, T / 2, D, 24, 1, true, thetaStart, Math.PI / 2); geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshPhysicalMaterial({ normalScale: new THREE.Vector2(.7, .7), roughness: 1, metalness: 1, specularIntensity: .45, sheen: .06, sheenColor: new THREE.Color(0x6a2a1e) });
      for (const [key, src] of [['map', spineMap], ['normalMap', spineTex.normalMap], ['roughnessMap', spineTex.orm], ['metalnessMap', spineTex.orm]]) { const t = src.clone(); t.repeat.set(.5, 1); t.offset.set(uOff, 0); mat[key] = t; }
      return sh(new THREE.Mesh(geo, mat));
    };
    top.add(quarter(Math.PI, 0));                                                      // upper quarter (top → left)
    const lowQ = quarter(Math.PI * 1.5, .5); lowQ.position.set(-W / 2, T / 2, 0); bottom.add(lowQ);
    // Spine furniture (only visible while closed): raised bands, headbands and the ends of the text block
    const closedOnly = [];
    const bandTex = drawCanvas(256, 16, (c, w, h) => { for (let i = 0; i < 64; i++) { c.fillStyle = i % 2 ? '#d7b46a' : '#7c1a18'; c.fillRect(i * 4, 0, 4, h); } });
    const headbandMat = new THREE.MeshStandardMaterial({ map: tex(bandTex), roughness: .6 });
    const capShape = new THREE.Shape(); const cr = T / 2 - BT * .6;
    capShape.moveTo(.012, cr); capShape.lineTo(0, cr); capShape.absarc(0, 0, cr, Math.PI / 2, Math.PI * 1.5, false); capShape.lineTo(.012, -cr); capShape.closePath();
    for (const sgn of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(capShape, 12), leafMat); cap.position.set(0, 0, sgn * (D / 2 - .003)); top.add(cap); closedOnly.push(cap);
      const hbGeo = new THREE.TorusGeometry(T / 2 - BT - .0006, .0017, 8, 24, Math.PI); hbGeo.rotateZ(Math.PI / 2);
      const hb = new THREE.Mesh(hbGeo, headbandMat); hb.position.set(0, 0, sgn * (D / 2 - .0028)); top.add(hb); closedOnly.push(hb);
    }
    for (const z of [-.075, -.025, .025, .075]) {
      const bandGeo = new THREE.TorusGeometry(T / 2 - .0004, .0014, 10, 40, Math.PI); bandGeo.rotateZ(Math.PI / 2); bandGeo.scale(1, 1, 1.9);   // low, wide raised band
      const band = sh(new THREE.Mesh(bandGeo, edgeMat)); band.position.set(0, 0, z); top.add(band); closedOnly.push(band);
    }
    // Silk ribbon marker trailing out of the tail onto the desk
    const rib = new THREE.PlaneGeometry(.0075, .085, 1, 16), rp = rib.attributes.position;
    for (let i = 0; i < rp.count; i++) { const t = (rp.getY(i) + .0425) / .085; rp.setY(i, -t * .085); rp.setZ(i, .0006 + .013 * (1 - THREE.MathUtils.smoothstep(t, 0, .22))); }
    rib.rotateX(-Math.PI / 2); rib.computeVertexNormals();
    const ribbon = new THREE.Mesh(rib, new THREE.MeshPhysicalMaterial({ color: 0x7a0c16, roughness: .45, sheen: 1, sheenRoughness: .3, sheenColor: new THREE.Color(0xff8a8a), side: THREE.DoubleSide }));
    ribbon.position.set(.03, 0, D / 2 - .012); ribbon.rotation.y = .25; ribbon.castShadow = true; ribbon.receiveShadow = true; bottom.add(ribbon);

    // --- the opened spread: two curved page surfaces; each carries two ink layers for pen annotations ---
    const PW = W - .005, PD = D - .006, pageY = T / 2 + .0008;
    const pageGeo = (gutterOnLeft) => {
      const geo = new THREE.PlaneGeometry(PW, PD, 48, 1); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), d = gutterOnLeft ? x + PW / 2 : PW / 2 - x; p.setY(i, -.0078 * Math.exp(-d / .0045)); }   // pages dip into the gutter
      const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);   // shade as flat paper; the painted gutter shadow does the darkening
      return geo;
    };
    const fibres = surface(512, 512, (x, y, o) => { const f = vnoise(x / 1.4, y / 6) * .6 + vnoise(x / 7, y / 1.3) * .4; o[0] = o[1] = o[2] = 255; o[3] = f; o[4] = .85; }, .9);
    fibres.normalMap.wrapS = fibres.normalMap.wrapT = THREE.RepeatWrapping; fibres.normalMap.repeat.set(3, 5);
    const blank = tex(drawCanvas(4, 4, () => {}));
    const paperMat = (side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ map: blank, normalMap: fibres.normalMap, normalScale: new THREE.Vector2(.18, .18), color: new THREE.Color().setScalar(.5), roughness: .88, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0, side });   // paper albedo tuned for the lamp right above it
    const pages = {};
    const makePage = (side, gutterOnLeft, x) => {
      const mat = paperMat(), geo = pageGeo(gutterOnLeft);
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, pageY, 0); mesh.receiveShadow = true; mesh.userData.side = side;
      const layers = [0, 1].map((k) => {
        const prog = { value: 0 }, order = { value: blank };
        const m = new THREE.MeshStandardMaterial({ map: blank, transparent: true, alphaTest: .02, roughness: .35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - k, polygonOffsetUnits: -2 - k });
        m.onBeforeCompile = (s) => {   // reveal the ink in the order the pen would lay it down
          s.uniforms.uProgress = prog; s.uniforms.uOrder = order;
          s.fragmentShader = 'uniform float uProgress;\nuniform sampler2D uOrder;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  if (texture2D(uOrder, vMapUv).r > uProgress) discard;');
        };
        const ink = new THREE.Mesh(geo, m); ink.position.y = .00015 * (k + 1); ink.visible = false; mesh.add(ink);
        return { mesh: ink, mat: m, prog, order, key: null };
      });
      pages[side] = { mesh, mat, layers, hover: 0 };
      return mesh;
    };
    bottom.add(makePage('right', true, -.0015));                          // right page, gutter on its left
    const left = makePage('left', false, -W + .0015);                     // left page, built in its opened pose…
    g.add(left); top.rotation.z = Math.PI; g.updateMatrixWorld(true); top.attach(left); top.rotation.z = 0;   // …then carried by the hinge

    // The turning leaf: a strip of paper bent along a curve as it swings over the gutter.
    // Its front shows the right page it lifts; its back (mirrored) is the left page it lands as.
    const LN = 48, leafGeo = new THREE.BufferGeometry();
    const lp = new Float32Array((LN + 1) * 6), luv = new Float32Array((LN + 1) * 4), lidx = [];
    for (let i = 0; i <= LN; i++) for (let j = 0; j < 2; j++) { const v = i * 2 + j; luv[v * 2] = i / LN; luv[v * 2 + 1] = j; }
    for (let i = 0; i < LN; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; lidx.push(a, c, b, b, c, d); }
    leafGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3)); leafGeo.setAttribute('uv', new THREE.BufferAttribute(luv, 2)); leafGeo.setIndex(lidx);
    const leafFront = new THREE.Mesh(leafGeo, paperMat(THREE.FrontSide)), leafBack = new THREE.Mesh(leafGeo, paperMat(THREE.BackSide));
    leafFront.castShadow = true; leafFront.receiveShadow = leafBack.receiveShadow = true;
    const leafGroup = new THREE.Group(); leafGroup.add(leafFront, leafBack); leafGroup.visible = false; g.add(leafGroup);
    const gx = -W / 2 + .001, ly = pageY + .0014, ds = PW / LN;
    const setLeaf = (t) => {   // t: 0 = lying on the right page … 1 = lying on the left page
      const th = Math.PI * ease(t), curl = .9 * Math.sin(Math.PI * t);   // the free edge leads, so the leaf curls as it turns
      let x = gx, y = ly;
      for (let i = 0; i <= LN; i++) {
        if (i > 0) { const a = Math.min(Math.PI, th + curl * (i - .5) / LN); x += Math.cos(a) * ds; y += Math.sin(a) * ds; }
        for (let j = 0; j < 2; j++) { const v = (i * 2 + j) * 3; lp[v] = x; lp[v + 1] = y; lp[v + 2] = j ? -PD / 2 : PD / 2; }
      }
      leafGeo.attributes.position.needsUpdate = true; leafGeo.computeVertexNormals(); leafGeo.computeBoundingSphere();
    };
    setLeaf(0);

    g.userData.rig = {
      top, pages, closedOnly, blank,
      leaf: { group: leafGroup, front: leafFront, back: leafBack, set: setLeaf },
      setOpen(a) {   // a: 0 closed .. 1 open
        top.rotation.z = Math.PI * a;
        top.position.y = T / 2 + Math.sin(Math.PI * a) * .004;   // the boards lift slightly as they swing
        for (const o of closedOnly) o.visible = a < .45;
      },
    };
    return g;
  }

  // ---------- Cut-glass inkwell ----------
  function buildInkwell() {
    const g = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: .035, ior: 1.54, dispersion: .35, roughness: .015, attenuationColor: new THREE.Color(0xd9efe6), attenuationDistance: .2, specularIntensity: 1, envMapIntensity: 2.6 });
    // Cut-glass body: square with chamfered corners, flat-cut bevels on every edge (bevelSegments 1 = crisp facets)
    const a = .052, c = .0075, s = new THREE.Shape();
    s.moveTo(-a / 2 + c, -a / 2); s.lineTo(a / 2 - c, -a / 2); s.lineTo(a / 2, -a / 2 + c); s.lineTo(a / 2, a / 2 - c); s.lineTo(a / 2 - c, a / 2); s.lineTo(-a / 2 + c, a / 2); s.lineTo(-a / 2, a / 2 - c); s.lineTo(-a / 2, -a / 2 + c); s.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: .039, bevelEnabled: true, bevelThickness: .0045, bevelSize: .004, bevelSegments: 1 });
    bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, .0045, 0); bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, glass); body.receiveShadow = true; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.0135, .016, .009, 8), glass); neck.rotation.y = Math.PI / 8; neck.position.y = .0525; g.add(neck);
    // Ink in a round well inside the glass, with a slightly concave reflective surface
    const inkMat = new THREE.MeshPhysicalMaterial({ color: 0x060914, roughness: .04, clearcoat: 1, clearcoatRoughness: .02 });
    const well = sh(new THREE.Mesh(new THREE.CylinderGeometry(.0115, .011, .022, 40), inkMat), true, false); well.position.y = .02;   // small round reservoir: most of the body stays clear glass g.add(well);
    // Hinged brass lid with a knurled rim and a small finial
    const lid = new THREE.Group(); lid.position.y = .0595; g.add(lid);
    lid.add(sh(new THREE.Mesh(new THREE.CylinderGeometry(.0158, .0162, .005, 40), M.brass)));
    const dome = sh(new THREE.Mesh(new THREE.SphereGeometry(.0155, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.brass)); dome.scale.y = .32; dome.position.y = .0025; lid.add(dome);
    const knurl = new THREE.InstancedMesh(new THREE.BoxGeometry(.0009, .0045, .0012), M.brass, 48), mtx = new THREE.Matrix4();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; mtx.makeRotationY(-a).setPosition(Math.cos(a) * .0163, 0, Math.sin(a) * .0163); knurl.setMatrixAt(i, mtx); }
    lid.add(knurl);
    const fin = sh(new THREE.Mesh(new THREE.SphereGeometry(.0028, 16, 12), M.brass)); fin.position.y = .0062; lid.add(fin);
    const hinge = sh(new THREE.Mesh(new THREE.CylinderGeometry(.0018, .0018, .009, 12), M.brass)); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, .0, -.0175); lid.add(hinge);
    const collar = sh(new THREE.Mesh(new THREE.TorusGeometry(.0142, .0012, 8, 40), M.brass)); collar.rotation.x = Math.PI / 2; collar.position.y = .0572; g.add(collar);
    return g;
  }

  // ---------- Desk props ----------
  async function buildProps() {
    const g = new THREE.Group();
    await Promise.all(['600 40px Cinzel', '700 40px Cinzel', '400 40px "EB Garamond"', '600 40px "EB Garamond"', 'italic 400 40px "EB Garamond"', '500 40px "EB Garamond"', 'italic 500 40px "EB Garamond"', '40px "Pinyon Script"'].map(f => document.fonts.load(f).catch(() => {})));
    // The Shatranj book (see buildBook)
    const book = buildBook(); book.position.copy(BOOK_HOME.pos); book.rotation.y = BOOK_HOME.rot; g.add(book);
    bookGroup = book; bookRig = book.userData.rig;
    // Carriage clock
    const clock = new THREE.Group(); clock.position.set(.5, 0, -.13); clock.rotation.y = -.5; g.add(clock);
    const cb = sh(new THREE.Mesh(new RoundedBoxGeometry(.075, .085, .045, 2, .006), M.deskSide)); cb.position.y = .05; clock.add(cb);
    const cbase = sh(new THREE.Mesh(new RoundedBoxGeometry(.09, .012, .055, 2, .003), M.brass)); cbase.position.y = .006; clock.add(cbase);
    const ctop = sh(new THREE.Mesh(new RoundedBoxGeometry(.085, .01, .05, 2, .003), M.brass)); ctop.position.y = .097; clock.add(ctop);
    const handle = sh(new THREE.Mesh(new THREE.TorusGeometry(.025, .0025, 8, 24, Math.PI), M.brass)); handle.position.y = .102; clock.add(handle);
    const now = new Date();
    const faceC = drawCanvas(256, 256, (c, w) => {
      c.fillStyle = '#efe4c8'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill();
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#2a1a10'; c.font = '600 26px Cinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const a = i / 12 * Math.PI * 2; c.fillText(n, 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); });
      const hand = (a, len, wid) => { c.lineWidth = wid; c.lineCap = 'round'; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
      c.strokeStyle = '#1a1008';
      hand((now.getHours() % 12 + now.getMinutes() / 60) / 12 * Math.PI * 2, 58, 6); hand(now.getMinutes() / 60 * Math.PI * 2, 84, 4);
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(.026, 40), new THREE.MeshPhysicalMaterial({ map: tex(faceC), roughness: .3, clearcoat: 1, clearcoatRoughness: .02 }));
    face.position.set(0, .052, .0231); clock.add(face);
    const bezel = sh(new THREE.Mesh(new THREE.TorusGeometry(.027, .0025, 8, 40), M.brass)); bezel.position.set(0, .052, .023); clock.add(bezel);
    // Notebook + fountain pen
    const nb = sh(new THREE.Mesh(new RoundedBoxGeometry(.15, .018, .21, 3, .005), M.leatherNote)); nb.position.set(-.5, .009, .22); nb.rotation.y = .22; g.add(nb);
    const band = new THREE.Mesh(new THREE.BoxGeometry(.004, .0185, .212), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: .7 })); band.position.set(.06, 0, 0); nb.add(band);
    const pen = new THREE.Group(); pen.position.set(-.47, .021, .21); pen.rotation.set(0, .9, Math.PI / 2); g.add(pen);
    const resin = new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: .15, clearcoat: 1, clearcoatRoughness: .05 });
    const barrel = sh(new THREE.Mesh(new THREE.CylinderGeometry(.0055, .006, .1, 24), resin)); pen.add(barrel);
    const capP = sh(new THREE.Mesh(new THREE.CylinderGeometry(.0062, .0062, .06, 24), resin)); capP.position.y = .075; pen.add(capP);
    for (const y of [.046, .104]) { const r = sh(new THREE.Mesh(new THREE.CylinderGeometry(.0065, .0065, .003, 24), M.brass)); r.position.y = y; pen.add(r); }
    const clip = sh(new THREE.Mesh(new THREE.BoxGeometry(.002, .045, .003), M.brass)); clip.position.set(.0068, .08, 0); pen.add(clip);
    const tip = sh(new THREE.Mesh(new THREE.ConeGeometry(.005, .018, 24), M.brass)); tip.position.y = -.059; tip.rotation.x = Math.PI; pen.add(tip);
    // Cut-glass inkwell (see buildInkwell)
    const ink = buildInkwell(); ink.position.set(-.34, 0, -.27); ink.rotation.y = .4; g.add(ink);
    // Brass desk bell at the far left
    const bell = sh(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.04, 0], [.04, .004], [.03, .012], [.025, .03], [.022, .045], [.012, .055], [.004, .062], [.006, .075], [0, .078]].map(([r, y]) => new THREE.Vector2(r, y)), 48), M.brass));
    bell.position.set(-.62, 0, -.32); g.add(bell);
    return g;
  }

  // ---------- Room ----------
  const ROOM_DIM = .6;   // how much light the room's finishes give back, next to the desk's
  function spineTexture(base, seed) {
    return tex(drawCanvas(64, 256, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * .2})`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 3); }
      const sg = c.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(0,0,0,.45)'); sg.addColorStop(.35, 'rgba(255,255,255,.06)'); sg.addColorStop(.6, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.5)'); c.fillStyle = sg; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d6ad5c';
      const bands = 2 + (seed % 3);
      for (let i = 0; i < bands; i++) { c.fillRect(0, 18 + i * 9, w, 3); c.fillRect(0, h - 22 - i * 9, w, 3); }
      if (seed % 2) { c.fillStyle = 'rgba(10,6,4,.7)'; c.fillRect(6, 70, w - 12, 42); c.strokeStyle = '#b8914a'; c.lineWidth = 2; c.strokeRect(8, 72, w - 16, 38); c.fillStyle = '#b8914a'; c.fillRect(14, 86, w - 28, 3); c.fillRect(18, 94, w - 36, 2); }
      else { c.fillStyle = '#b8914a'; c.fillRect(12, 90, w - 24, 2); c.fillRect(16, 98, w - 32, 2); }
    }));
  }
  function buildRoom() {
    const g = new THREE.Group();
    const backZ = -2.0;
    // Floor, walls
    const floorT = woodTextures(512, 512, 2, 2, { ...WOOD.case, rings: 30 });
    floorT.map.wrapS = floorT.map.wrapT = THREE.RepeatWrapping; floorT.map.repeat.set(4, 4);
    const floor = sh(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: floorT.map, roughness: .6, color: 0x5a4a40 })), false);
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; g.add(floor);
    const rugC = drawCanvas(512, 512, (c, w, h) => {
      c.fillStyle = '#3a0c0c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1b2236'; c.lineWidth = 30; c.strokeRect(30, 30, w - 60, h - 60);
      c.strokeStyle = '#7a5a2a'; c.lineWidth = 6; c.strokeRect(56, 56, w - 112, h - 112);
      c.save(); c.translate(w / 2, h / 2); for (let r = 0; r < 12; r++) { c.rotate(Math.PI / 6); c.fillStyle = r % 2 ? '#5a1a14' : '#24304a'; c.beginPath(); c.ellipse(0, 70, 20, 60, 0, 0, 7); c.fill(); } c.restore();
      for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * .25})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshStandardMaterial({ map: tex(rugC), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(.2, FLOOR + .003, -.6); rug.receiveShadow = true; g.add(rug);
    const back = sh(new THREE.Mesh(new THREE.PlaneGeometry(10, 4), M.wall), false); back.position.set(0, FLOOR + 2, backZ); g.add(back);
    const wainscot = sh(new THREE.Mesh(new THREE.BoxGeometry(10, .95, .03), M.case), false); wainscot.position.set(0, FLOOR + .475, backZ + .015); g.add(wainscot);
    const side = sh(new THREE.Mesh(new THREE.PlaneGeometry(6, 4), M.wall), false); side.rotation.y = Math.PI / 2; side.position.set(-2.9, FLOOR + 2, -.5); g.add(side);

    // Bookcase: x from -2.85 to 0.35
    const bc = new THREE.Group(); g.add(bc);
    const x0 = -2.85, x1 = .12, depth = .36, front = backZ + depth, H = 2.6;
    const panel = (w, h, d, x, y, z) => { const m = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.case)); m.position.set(x, y, z); bc.add(m); return m; };
    panel(x1 - x0, H, .02, (x0 + x1) / 2, FLOOR + H / 2, backZ + .02);
    const bays = 4, bayW = (x1 - x0) / bays;
    for (let i = 0; i <= bays; i++) panel(.045, H, depth, x0 + i * bayW, FLOOR + H / 2, backZ + depth / 2);
    panel(x1 - x0 + .12, .09, depth + .06, (x0 + x1) / 2, FLOOR + H + .045, backZ + depth / 2 + .02);
    panel(x1 - x0 + .16, .04, depth + .09, (x0 + x1) / 2, FLOOR + H + .1, backZ + depth / 2 + .03);
    // Lower cabinets
    const cabH = .62;
    panel(x1 - x0, cabH, depth + .04, (x0 + x1) / 2, FLOOR + cabH / 2, backZ + depth / 2 + .02);
    for (let i = 0; i < bays * 2; i++) {
      const cx = x0 + bayW / 4 + i * bayW / 2;
      const door = sh(new THREE.Mesh(new RoundedBoxGeometry(bayW / 2 - .03, cabH - .1, .02, 2, .006), M.case)); door.position.set(cx, FLOOR + cabH / 2, front + .03); bc.add(door);
      const inset = sh(new THREE.Mesh(new RoundedBoxGeometry(bayW / 2 - .12, cabH - .22, .01, 2, .004), M.case)); inset.position.set(cx, FLOOR + cabH / 2, front + .043); bc.add(inset);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.009, 12, 8), M.brass); knob.position.set(cx + (i % 2 ? -1 : 1) * (bayW / 4 - .04), FLOOR + cabH / 2 + .1, front + .05); bc.add(knob);
    }
    // Shelves and books
    const shelfYs = [cabH + .02, cabH + .41, cabH + .8, cabH + 1.19, cabH + 1.58];
    const SPINES = ['#1f4a2c', '#5a1712', '#3a2414', '#1b2a4a', '#6a4220', '#18241a', '#4a1424', '#7a5428', '#24361f', '#4a2516', '#5a4a30', '#141418', '#2e5a3a', '#6e2a1a'];
    const variants = SPINES.map((c, i) => ({ spine: spineTexture(c, i), color: c, items: [] }));
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let b = 0; b < bays; b++) {
      for (const sy of shelfYs) {
        panel(bayW - .04, .028, depth - .02, x0 + b * bayW + bayW / 2, FLOOR + sy, backZ + depth / 2 + .01);
        let x = x0 + b * bayW + .03;
        const end = x0 + (b + 1) * bayW - .03;
        let mustStand = false;   // the book after a leaning one stands upright, so the lean rests against it
        while (x < end - .03) {
          if (!mustStand && rnd() < .035) { x += .03 + rnd() * .06; continue; }
          if (!mustStand && rnd() < .05) {   // a short stack of books lying flat: squared up, clear of its neighbours and of the back panel
            let sy2 = FLOOR + sy + .014; const sw = .2 + rnd() * .06;
            if (x + sw + .03 > end) break;
            for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) { const th = .03 + rnd() * .025, d = .2 + rnd() * .04; variants[Math.floor(rnd() * variants.length)].items.push({ x: x + .015 + sw / 2, y: sy2 + th / 2, z: backZ + .045 + d / 2, w: sw - rnd() * .03, h: th, d, lean: 0, flat: (rnd() - .5) * .08 }); sy2 += th; }
            x += sw + .03; continue;
          }
          const w = .022 + rnd() * .035, h = .22 + rnd() * .12, d = .17 + rnd() * .06;
          if (x + w > end) break;
          const y0 = FLOOR + sy + .014, z = backZ + .04 + d / 2 + rnd() * .03;
          // Now and then a book leans into a gap: it pivots on its bottom corner and its top rests on the next book
          const a = .1 + rnd() * .12, reach = h * Math.sin(a);
          if (!mustStand && rnd() < .06 && x + w + reach + .07 < end && h * Math.cos(a) + w * Math.sin(a) < .345) {
            const px = x + w;
            variants[Math.floor(rnd() * variants.length)].items.push({ x: px - (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a), y: y0 + (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a), z, w, h, d, lean: -a });
            x += w + reach + .002; mustStand = true; continue;
          }
          variants[Math.floor(rnd() * variants.length)].items.push({ x: x + w / 2, y: y0 + h / 2, z, w, h, d, lean: 0 });
          x += w + .001; mustStand = false;
        }
      }
    }
    const pageMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const v of variants) {
      const side = new THREE.MeshStandardMaterial({ color: v.color, roughness: .7 });
      const spine = new THREE.MeshStandardMaterial({ map: v.spine, roughness: .42, metalness: .15 });
      const im = new THREE.InstancedMesh(box, [side, side, pageMat, pageMat, spine, side], v.items.length);
      v.items.forEach((it, i) => { e.set(0, it.flat || 0, it.lean); q.setFromEuler(e); mtx.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.w, it.h, it.d)); im.setMatrixAt(i, mtx); });
      im.castShadow = im.receiveShadow = true; bc.add(im);
    }

    // Window with curtains (right)
    const winX = 1.42, winW = .9, winY = FLOOR + 1.3, winH = 1.7;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ color: new THREE.Color(.42, .5, .62).multiplyScalar(1.1) }));
    glow.position.set(winX, winY, backZ + .01); g.add(glow);
    for (const [w, h, x, y] of [[.035, winH, winX, winY], [winW, .035, winX, winY], [winW + .1, .08, winX, winY - winH / 2], [winW + .1, .08, winX, winY + winH / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .05), M.case); m.position.set(x, y, backZ + .03); g.add(m);
    }
    const curtainMat = new THREE.MeshStandardMaterial({ color: 0x232a22, roughness: .95, side: THREE.DoubleSide });
    for (const [cx, w] of [[winX - winW / 2 - .05, .5], [winX + winW / 2 + .12, .55]]) {
      const geo = new THREE.PlaneGeometry(w, 2.35, 60, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 38) * .035 + Math.sin(x * 13 + 1) * .02); }
      geo.computeVertexNormals();
      const c = sh(new THREE.Mesh(geo, curtainMat)); c.position.set(cx, FLOOR + 1.18, backZ + .12); g.add(c);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.9), M.brassDark); rod.rotation.z = Math.PI / 2; rod.position.set(winX, FLOOR + 2.38, backZ + .14); g.add(rod);
    const winLight = new THREE.RectAreaLight(0xa8bcd6, 2.2, winW, winH); winLight.position.set(winX, winY, backZ + .05); winLight.lookAt(winX - .6, winY - .6, 0); g.add(winLight);

    // Painting with picture light
    const paintC = drawCanvas(512, 384, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#2a2a22'); sky.addColorStop(.55, '#8a6a3a'); sky.addColorStop(.62, '#c09050'); sky.addColorStop(1, '#1a1a10'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
      c.fillStyle = '#20241a'; c.beginPath(); c.moveTo(0, h * .62); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * .62 - Math.sin(x / 60) * 18 - Math.sin(x / 23) * 6); c.lineTo(w, h); c.lineTo(0, h); c.fill();
      c.fillStyle = '#12140e'; c.beginPath(); c.moveTo(0, h * .75); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * .74 - Math.sin(x / 90 + 2) * 14); c.lineTo(w, h); c.lineTo(0, h); c.fill();
      c.fillStyle = '#0e100a'; for (let i = 0; i < 3; i++) { const tx = 120 + i * 160; c.beginPath(); c.ellipse(tx, h * .5, 40, 60, 0, 0, 7); c.fill(); c.fillRect(tx - 3, h * .5, 6, 80); }
      for (let i = 0; i < 15000; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,220,160'},${Math.random() * .06})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      const vg = c.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * .7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = vg; c.fillRect(0, 0, w, h);
    });
    const pX = .5, pY = FLOOR + 1.62;
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(.54, .4), new THREE.MeshPhysicalMaterial({ map: tex(paintC), roughness: .6, clearcoat: .5, clearcoatRoughness: .3 }));
    painting.position.set(pX, pY, backZ + .035); g.add(painting);
    const gilt = new THREE.MeshStandardMaterial({ color: 0xa8823a, metalness: 1, roughness: .38 });
    for (const [w, h, x, y] of [[.66, .06, 0, .23], [.66, .06, 0, -.23], [.06, .52, -.3, 0], [.06, .52, .3, 0]]) {
      const f = sh(new THREE.Mesh(new RoundedBoxGeometry(w, h, .04, 2, .01), gilt)); f.position.set(pX + x, pY + y, backZ + .03); g.add(f);
    }
    const picLamp = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .32, 16), M.brass); picLamp.rotation.z = Math.PI / 2; picLamp.position.set(pX, pY + .33, backZ + .12); g.add(picLamp);
    const picLight = new THREE.SpotLight(0xffc98a, .7, 2, .7, .9, 2); picLight.position.set(pX, pY + .32, backZ + .16); picLight.target.position.set(pX, pY - .1, backZ); g.add(picLight, picLight.target);

    // A stuffed leather roll: a cylinder whose ends round softly over, as leather does (lies along y, like a cylinder)
    const leatherRoll = (r, len, mat) => {
      const b = r * .32, pts = [new THREE.Vector2(0, -len / 2)];
      for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + Math.sin(t) * b, -len / 2 + b - Math.cos(t) * b)); }
      for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + Math.cos(t) * b, len / 2 - b + Math.sin(t) * b)); }
      pts.push(new THREE.Vector2(0, len / 2));
      const geo = new THREE.LatheGeometry(pts, 40);
      // Map the grain in metres (round the roll, and along it) so it is never stretched along a long roll
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, pos.getY(i) + len / 2);
      return sh(new THREE.Mesh(geo, mat));
    };
    // Short turned feet, so the pieces stand on the floor instead of sitting on it
    const footWood = M.deskSide;
    const bunFoot = (h) => sh(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.024, 0], [.03, h * .25], [.033, h * .55], [.028, h * .85], [.024, h], [0, h]].map(([r, y]) => new THREE.Vector2(r, y)), 24), footWood));

    // Chesterfield sofa (right, angled in front of the window): clear of the wall, the curtains and the desk
    const sofa = new THREE.Group(); sofa.position.set(1.58, FLOOR, -.92); sofa.rotation.y = -.45; g.add(sofa);
    const sofaBack = M.leatherBlack.clone(); sofaBack.normalMap = M.tuftN.clone(); sofaBack.normalMap.repeat.set(2.8, 1); sofaBack.normalScale.set(1.6, 1.6);
    const plain = M.leatherBlack.clone(); plain.normalMap = M.leatherN; plain.normalScale.set(.35, .35);   // smooth hide: a fine grain, not a rough one
    const seat = sh(new THREE.Mesh(new RoundedBoxGeometry(1.48, .22, .78, 4, .07), plain)); seat.position.set(0, .34, .05); sofa.add(seat);
    const plinth = sh(new THREE.Mesh(new RoundedBoxGeometry(1.8, .2, .9, 2, .03), plain)); plinth.position.set(0, .13, 0); sofa.add(plinth);
    const bk = sh(new THREE.Mesh(new RoundedBoxGeometry(1.9, .5, .22, 4, .08), sofaBack)); bk.position.set(0, .66, -.36); sofa.add(bk);
    for (const s of [-1, 1]) {
      const arm = sh(new THREE.Mesh(new RoundedBoxGeometry(.22, .5, .9, 4, .08), sofaBack)); arm.position.set(s * .84, .45, 0); sofa.add(arm);
      const roll = leatherRoll(.13, .92, plain); roll.rotation.x = Math.PI / 2; roll.position.set(s * .87, .68, 0); sofa.add(roll);
      for (const fz of [-.38, .38]) { const f = bunFoot(.03); f.position.set(s * .82, 0, fz); sofa.add(f); }
    }
    const brollTop = leatherRoll(.13, 1.9, plain); brollTop.rotation.z = Math.PI / 2; brollTop.position.set(0, .9, -.38); sofa.add(brollTop);
    const cushion = sh(new THREE.Mesh(new RoundedBoxGeometry(.4, .35, .14, 4, .06), M.leatherBrown)); cushion.position.set(.42, .6, -.18); cushion.rotation.set(-.2, -.2, .1); sofa.add(cushion);

    // Opponent's club chair behind the desk (Black's seat): its back clear of the bookcase
    const chair = new THREE.Group(); chair.position.set(-.62, FLOOR, -1.04); chair.rotation.y = .3; g.add(chair);
    // Chesterfield club chair: tufted back and arms, rolled tops, loose seat cushion
    const cTuft = M.leatherBrown.clone(); cTuft.normalMap = M.tuftN.clone(); cTuft.normalMap.repeat.set(1.6, 1); cTuft.normalScale.set(1.5, 1.5);
    const cBase = sh(new THREE.Mesh(new RoundedBoxGeometry(.86, .3, .76, 3, .04), M.leatherBrown)); cBase.position.set(0, .2, 0); chair.add(cBase);
    const cSeat = sh(new THREE.Mesh(new RoundedBoxGeometry(.58, .14, .6, 4, .06), M.leatherBrown)); cSeat.position.set(0, .41, .05); chair.add(cSeat);
    const cBack = sh(new THREE.Mesh(new RoundedBoxGeometry(.86, .4, .16, 4, .06), cTuft)); cBack.position.set(0, .55, -.3); chair.add(cBack);
    const cRoll = leatherRoll(.08, .9, M.leatherBrown); cRoll.rotation.z = Math.PI / 2; cRoll.position.set(0, .78, -.31); chair.add(cRoll);
    for (const s of [-1, 1]) {
      const a = sh(new THREE.Mesh(new RoundedBoxGeometry(.14, .28, .74, 4, .05), cTuft)); a.position.set(s * .36, .46, 0); chair.add(a);
      const r = leatherRoll(.075, .78, M.leatherBrown); r.rotation.x = Math.PI / 2; r.position.set(s * .38, .62, .01); chair.add(r);
      for (const fz of [-.32, .32]) { const f = bunFoot(.05); f.position.set(s * .38, 0, fz); chair.add(f); }
    }
    const nails = new THREE.InstancedMesh(new THREE.SphereGeometry(.005, 6, 4), M.brass, 40);
    for (let i = 0; i < 40; i++) { mtx.makeTranslation(-.39 + i * .02, .32, .365); nails.setMatrixAt(i, mtx); } chair.add(nails);

    // The room sits a little darker than the desk, so the lamp reads as the light of the scene: the room's own
    // finishes reflect less (materials it shares with the desk are copied first, so the desk and its things are unchanged;
    // the window's glow is a light, not a finish, and stays as it is)
    const dimmed = new Map();
    const dim = (m) => { if (!m || m.isMeshBasicMaterial) return m; if (!dimmed.has(m)) { const c = m.clone(); c.color.multiplyScalar(ROOM_DIM); dimmed.set(m, c); } return dimmed.get(m); };
    g.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(dim) : dim(o.material); });
    return g;
  }

  // ---------- Lamp light, haze and dust ----------
  let dust, dustBase, haze, sparkles, lampGlass;
  const LAMP_ON = 3.5, LAMP_READ = 2.5;   // lamp key intensity on the landing view / while reading
  function buildLighting(lampGroup) {
    lampGroup.updateMatrix();
    const bulb = lampGroup.userData.bulbLocal.clone().applyMatrix4(lampGroup.matrix);   // in the lamp's parent space, so it stays right when the whole study is scaled
    const spot = new THREE.SpotLight(0xffbb74, LAMP_ON, 0, 1.15, .8, 2);
    spot.position.copy(bulb).add(new THREE.Vector3(0, -.012, 0));
    spot.target.position.set(-.04, 0, .06);
    spot.castShadow = true; spot.shadow.mapSize.set(4096, 4096);
    spot.shadow.camera.near = .05; spot.shadow.camera.far = 3; spot.shadow.bias = -.00012; spot.shadow.normalBias = .0008; spot.shadow.radius = 4;
    world.add(spot, spot.target);
    // Soft upward spill so the shade top and lamp base read
    const spill = new THREE.PointLight(0xffbb74, .004, 1.2, 2); spill.position.copy(bulb).add(new THREE.Vector3(0, -.05, 0)); world.add(spill);
    // Faint fill so the darkest areas are not pure black
    roomFills.hemi = new THREE.HemisphereLight(0x3a4250, 0x1a1008, .4); world.add(roomFills.hemi);
    // Soft warm fill from the player's side so the faces of the pieces turned toward White are readable
    const frontFill = new THREE.DirectionalLight(0xffe0bc, 1.05); roomFills.front = frontFill; frontFill.position.set(-.4, 1.3, 1.5); frontFill.target.position.set(0, 0, 0); world.add(frontFill, frontFill.target);
    // Cool low back-light from Black's side: rims every piece so its silhouette separates from the squares behind it
    const rimLight = new THREE.DirectionalLight(0xc8d8ff, 1.1); rimLight.position.set(-1.6, .7, -1.0); rimLight.target.position.set(0, .03, 0); world.add(rimLight, rimLight.target);
    // Gentle overhead room light so the study is dim rather than black
    const roomLight = new THREE.PointLight(0xffd2a0, .95, 6, 1.6); roomFills.room = roomLight; roomLight.position.set(-.3, 1.7, -.4); world.add(roomLight);
    const winFill = new THREE.DirectionalLight(0x8ea4c2, .3); winFill.position.set(2.5, 1.8, -1.8); winFill.target.position.set(0, 0, 0); world.add(winFill, winFill.target);
    // Soft overhead panel for play: fades in in game view so every square is evenly lit
    overheadLight = new THREE.RectAreaLight(0xffffff, 0, .9, .9); overheadLight.position.set(0, 1.0, .02); overheadLight.lookAt(0, 0, .02); world.add(overheadLight);
    // …plus a soft top light with shadows, so each piece sits on a short contact shadow and separates from its square
    gameKey = new THREE.DirectionalLight(0xffffff, 1.5); gameKey.position.set(-.78, .58, .4);   // low from the left: longer shadows and a lit and a shaded side on every piece gameKey.target.position.set(0, 0, 0);
    gameKey.castShadow = true; gameKey.shadow.mapSize.set(2048, 2048); Object.assign(gameKey.shadow.camera, { left: -.42, right: .42, top: .42, bottom: -.42, near: .3, far: 2.5 }); gameKey.shadow.bias = -.0003; gameKey.shadow.radius = 6;
    world.add(gameKey, gameKey.target);
    gameSide = new THREE.DirectionalLight(0xe6eeff, .55); gameSide.position.set(.8, .45, -.15); gameSide.target.position.set(0, .03, 0); world.add(gameSide, gameSide.target);   // cool fill from the right, so shaded sides keep their shape
    // Dim warm wash on the bookshelves so the spines read in the dark
    const shelfWash = new THREE.SpotLight(0xffb878, 1.6, 6, .75, 1, 2); shelfWash.position.set(-.9, 1.6, -.9); shelfWash.target.position.set(-1.0, FLOOR + 1.45, -2.0); shelfWash.angle = .95; world.add(shelfWash, shelfWash.target);
    // Lacquered desk: a soft, low-res mirror added on top of the clearcoat shading
    const refl = new Reflector(new THREE.PlaneGeometry(1.66, .91), { textureWidth: innerWidth / 3, textureHeight: innerHeight / 3, clipBias: .003 });
    refl.material.transparent = true; refl.material.blending = THREE.AdditiveBlending; refl.material.depthWrite = false;
    refl.material.uniforms.uStrength = { value: .085 };
    refl.material.fragmentShader = `uniform sampler2D tDiffuse; uniform float uStrength; varying vec4 vUv; void main(){ vec4 b = texture2DProj(tDiffuse, vUv); gl_FragColor = vec4(b.rgb * uStrength, 1.); }`;
    refl.rotation.x = -Math.PI / 2; refl.position.set(0, .0004, -.055); world.add(refl);

    // Volumetric haze cone
    const h = bulb.y - .0;
    const coneGeo = new THREE.ConeGeometry(.55, h, 64, 1, true); coneGeo.translate(0, -h / 2, 0);
    haze = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(1, .72, .4) }, uH: { value: h }, uAmt: { value: .13 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-(viewMatrix*wp).xyz); vY = -position.y; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uH; uniform float uAmt; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); float t = clamp(vY/uH,0.,1.); float a = f * (1.-t) * smoothstep(0.,.12,t) * uAmt; gl_FragColor = vec4(uColor*a, a); }`,
    }));
    haze.position.copy(bulb); world.add(haze);
    // Dust motes inside the light pool
    const N = 260; const pos = new Float32Array(N * 3); dustBase = [];
    for (let i = 0; i < N; i++) {
      const t = Math.random(), r = Math.sqrt(Math.random()) * .45 * (t + .15), a = Math.random() * 6.283;
      const p = [bulb.x + Math.cos(a) * r - .04 * t, bulb.y - t * (bulb.y - .03), bulb.z + Math.sin(a) * r + .03 * t];
      pos.set(p, i * 3); dustBase.push({ p, ph: Math.random() * 100, sp: .2 + Math.random() * .6 });
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sprite = tex(drawCanvas(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: sprite, color: new THREE.Color(1, .85, .6).multiplyScalar(1.6), size: .0035 * S, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
    world.add(dust);
    // Tiny glints: a few motes that catch the lamp and twinkle as they sink through the beam
    const SN = 70, sp3 = new Float32Array(SN * 3), sSeed = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random());
      sp3.set([Math.cos(a) * r, Math.random(), Math.sin(a) * r], i * 3);          // unit cone coordinates: (x, z) on the disc, y = start height
      sSeed.set([Math.random() * 100, .5 + Math.random(), .6 + Math.random() * .8], i * 3);   // phase, speed, size
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp3, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 3));
    sparkles = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uBulb: { value: bulb.clone() }, uScale: { value: innerHeight * renderer.getPixelRatio() }, uColor: { value: new THREE.Color(1, .8, .5) } },
      vertexShader: `uniform float uTime; uniform vec3 uBulb; uniform float uScale; attribute vec3 aSeed; varying float vA;
        void main(){
          float t = fract(position.y + uTime * .012 * aSeed.y);                    // 0 at the shade, 1 at the desk: a slow fall
          float rad = .05 + .34 * t;                                               // the beam widens on the way down
          vec3 p = uBulb + vec3(position.x * rad - .04 * t, -.03 - t * (uBulb.y - .05), position.z * rad + .03 * t);
          p.x += sin(uTime * .21 * aSeed.y + aSeed.x) * .012; p.z += cos(uTime * .17 * aSeed.y + aSeed.x * 1.7) * .012;
          float tw = pow(max(0., sin(uTime * 1.3 * aSeed.y + aSeed.x * 6.)), 10.);  // short, rare glints
          vA = (.12 + .88 * tw) * smoothstep(0., .08, t) * smoothstep(1., .8, t) * (1. - .55 * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = aSeed.z * (.006 + .005 * tw) * length(modelMatrix[0].xyz) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.; float a = (exp(-r * r * 9.) + .35 * exp(-r * r * 2.5)) * step(r, 1.) * vA; gl_FragColor = vec4(uColor * a * 5., a); }`,
    }));
    sparkles.frustumCulled = false; world.add(sparkles);
    return spot;
  }

  // ---------- Post-processing ----------
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 1 }, uGrain: { value: .045 }, uTone: { value: .5 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uVig; uniform float uGrain; uniform float uTone; varying vec2 vUv;
      float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(.2126,.7152,.0722));
        vec3 shadowTint = vec3(.74, .95, .9);
        vec3 highTint = vec3(1.08, .99, .82);
        c *= mix(vec3(1.), mix(shadowTint, highTint, smoothstep(.04, .55, l)), uTone);
        c = mix(c, c*c*(3.-2.*c), .3);
        vec2 d = (vUv - .5) * vec2(uRes.x/uRes.y, 1.);
        float v = smoothstep(1.05, .2, length(d * vec2(.78, 1.)));
        c *= mix(1., mix(.45, 1., v), uVig);
        float g = rand(vUv * uRes + fract(uTime * 7.13) * 91.7) - .5;
        c += g * uGrain * (1. - l * .7);
        gl_FragColor = vec4(max(c, 0.), 1.);
      }`,
  };
  let composer, bokeh, grade, gtao;
  function buildComposer() {
    const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * renderer.getPixelRatio(), h * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, w, h);
    const gtaoSetSize = gtao.setSize.bind(gtao); gtao.setSize = (w2, h2) => gtaoSetSize(Math.ceil(w2 / 2), Math.ceil(h2 / 2));   // AO at half resolution
    gtao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    gtao.updateGtaoMaterial({ radius: .06 * S, distanceExponent: 1.4, thickness: .6 * S, scale: 1.1, samples: 10 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    gtao.blendIntensity = .6;
    composer.addPass(gtao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), .55, .5, 13));
    bokeh = new BokehPass(scene, camera, { focus: .8 * S, aperture: .0012 / S, maxblur: .007 });
    composer.addPass(bokeh);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
  }

  // ---------- Camera: fixed behind White, no orbit ----------
  const VIEWS = {
    landing: { pos: new THREE.Vector3(0, .56, 1.22), target: new THREE.Vector3(.07, .03, -.6), focus: 1.3 },
    game: { pos: new THREE.Vector3(0, .56, .95), target: new THREE.Vector3(.04, .05, -.22), focus: 1.1 },
  };
  let mode = 'landing', tween = null;
  const camTarget = new THREE.Vector3();
  const mouse = new THREE.Vector2();
  // Landing only: the camera orbits a little around what it looks at, following the cursor (eased, a couple of degrees)
  const ORBIT_YAW = .045, ORBIT_PITCH = .022;   // radians at the window's edge
  const orbit = new THREE.Vector2(), orbitRest = new THREE.Vector2(), orbitOff = new THREE.Vector3();
  addEventListener('pointermove', (e) => { mouse.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5); });
  function viewFor(m) {
    if (m === 'book') {   // reading view: both pages edge to edge; the title and button float over the book
      const t2 = 2 * Math.tan(camera.fov * Math.PI / 360);
      const d = Math.max(.252 / .985 / t2, .332 / (.985 * camera.aspect) / t2), el = 1.53;   // looking straight down so the pages read flat
      const target = BOOK_READ.target.clone();
      return { pos: target.clone().add(new THREE.Vector3(0, Math.sin(el) * d, Math.cos(el) * d)), target, focus: d };
    }
    if (m === 'game') {   // playing view: high, centred behind White, the whole board large on screen so pieces are easy to pick out and grab
      const t2 = 2 * Math.tan(camera.fov * Math.PI / 360), el = .88;   // a little lower and closer, so the pieces get more pixels
      const d = Math.max(.53 / t2, .6 / (camera.aspect * t2));   // fit the board plus the height of Black's back rank
      const target = new THREE.Vector3(0, .025, .035);   // board sits a little high, clear of the status bar
      const pos = target.clone().add(new THREE.Vector3(0, Math.sin(el) * d, Math.cos(el) * d));
      if (opts.getSide?.() === 'b') { pos.z *= -1; target.z *= -1; }
      return { pos, target, focus: d };
    }
    const v = VIEWS[m];
    const pos = v.pos.clone();
    const target = v.target.clone();
    const wide = camera.aspect >= 2 || (camera.aspect >= 1.25 && innerWidth >= 700);   // matches the CSS breakpoint for the side title card
    if (m === 'landing' && wide) target.x -= .27;          // yaw slightly so the board sits right of the title card
    if (camera.aspect < 1) { pos.add(new THREE.Vector3(0, .32, .5)); if (m === 'landing') target.y -= .16; }
    return { pos, target, focus: v.focus + (camera.aspect < 1 ? .45 : 0) };
  }
  function setMode(m) {
    const prevMode = mode; mode = m;
    if (m === 'game') setCrisp(true); else if (prevMode === 'game') setCrisp(false, m === 'book');
    M.pieceDark.envMapIntensity = 2.6;   // bright reflections trace the black pieces' outlines (same in every view)
    const bloomPass = composer && composer.passes.find(p => p instanceof UnrealBloomPass); if (bloomPass) bloomPass.enabled = m !== 'game'; if (haze) haze.visible = m !== 'game'; if (sparkles) sparkles.visible = m !== 'game';   // no lamp glow over the board while playing
    if (overheadLight) { const o0 = overheadLight.intensity, o1 = m === 'game' ? .45 : 0, g0 = gameKey.intensity, g1 = m === 'game' ? 3.4 : 1.5, q0 = gameSide.intensity, q1 = m === 'game' ? .9 : .55, h0 = roomFills.hemi.intensity, r0 = roomFills.front.intensity, p0 = roomFills.room.intensity, n0 = scene.environmentIntensity, f0 = LIGHT_SQ.value.clone(), f1 = m === 'game' ? new THREE.Color(.5, .49, .48) : new THREE.Color(1, 1, 1), c0 = M.field.clearcoat, c1 = .15, s0 = M.field.specularIntensity, s1 = m === 'game' ? .6 : 1, e0 = renderer.toneMappingExposure, e1 = m === 'game' ? 1.02 : 1.2;   // deeper maple in play so ivory pieces stand off the light squares
      animate(.9, (t) => { overheadLight.intensity = lerp(o0, o1, t); gameKey.intensity = lerp(g0, g1, t); gameSide.intensity = lerp(q0, q1, t); const pg = m === 'game'; roomFills.hemi.intensity = lerp(h0, pg ? .15 : .4, t); roomFills.front.intensity = lerp(r0, pg ? .3 : 1.05, t); roomFills.room.intensity = lerp(p0, (pg ? .25 : .95) * LS, t); scene.environmentIntensity = lerp(n0, pg ? .35 : .55, t); LIGHT_SQ.value.copy(f0).lerp(f1, t); M.field.clearcoat = lerp(c0, c1, t); M.field.specularIntensity = lerp(s0, s1, t); renderer.toneMappingExposure = lerp(e0, e1, t); renderer.shadowMap.needsUpdate = true; }); }
    if (keySpot && m !== 'book') { const k0 = keySpot.intensity, k1 = (m === 'game' ? .6 : LAMP_ON) * LS; animate(.8, (t) => { keySpot.intensity = lerp(k0, k1, t); }); }   // softer lamp while playing, so no square is washed out
    const to = viewFor(m);
    if (m !== 'game' && prevMode === 'game') takeCamera();   // before the tween reads where the camera is
    tween = { t: 0, fromP: camPos.clone(), fromT: camTarget.clone(), fromF: focusM, to };
    document.getElementById('landing').classList.toggle('hidden', m !== 'landing');
    document.getElementById('hud').classList.toggle('hidden', m !== 'game');
    document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  }

  // ---------- The book flow: Join Battle → book slides over and opens → pick a control style → into the game ----------
  const BOOK_HOME = { pos: new THREE.Vector3(.58, 0, .1), rot: -.38 };                  // where it rests by the lamp
  const BOOK_READ = { pos: new THREE.Vector3(.52, 0, .12), rot: 0 };                     // squared up beside the board to be read
  BOOK_READ.target = new THREE.Vector3(BOOK_READ.pos.x - BOOK.W / 2, .02, BOOK_READ.pos.z);   // centre of the open spread
  const CONTROL_LABEL = { voice: 'Voice command', gesture: 'Hand gestures' };
  let keySpot = null;
  let overheadLight = null;
  let gameKey = null;
  let gameSide = null;
  const roomFills = {};   // general room fill lights; turned down during play so the side light can model the pieces
  let bookGroup = null, bookRig = null, bookOpen = false, bookBusy = false, hover = null, turning = false;
  const anims = [];
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  function animate(dur, fn) { return new Promise(res => anims.push({ t: 0, dur, fn, res })); }
  function stepAnims(dt) { for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t = Math.min(1, a.t + dt / a.dur); a.fn(a.t); if (a.t >= 1) { anims.splice(i, 1); a.res(); } } }
  function moveBook(to, dur) {
    const fromP = bookGroup.position.clone(), fromR = bookGroup.rotation.y;
    return animate(dur, (t) => {
      const e = ease(t);
      bookGroup.position.lerpVectors(fromP, to.pos, e); bookGroup.position.y = Math.sin(Math.PI * e) * .025;   // lifted a little as it is drawn over
      bookGroup.rotation.y = lerp(fromR, to.rot, e); renderer.shadowMap.needsUpdate = true;
    });
  }
  const bookUI = document.getElementById('bookUI'), confirmBtn = document.getElementById('bookConfirm'), bookHint = document.getElementById('bookHint');
  const bookTitle = document.querySelector('.book-head h2'), pickGroup = document.getElementById('bookPicks');
  function showBookUI(on) { bookUI.classList.toggle('hidden', !on); bookUI.setAttribute('aria-hidden', String(!on)); }
  // Transitions are queued: a click made while the book is still moving runs as soon as that move finishes
  let bookTask = Promise.resolve();
  function enterBook() { bookTask = bookTask.then(doEnterBook); return bookTask; }
  function closeBook(next) { bookTask = bookTask.then(() => doCloseBook(next)); return bookTask; }
  function turnPage(dir) { bookTask = bookTask.then(() => doTurnPage(dir)); return bookTask; }
  // Crisp mode for play: no depth-of-field, grain, vignette or warm grade; full-resolution render
  function setRes(sharp) {   // reallocates every render target, so only when the ratio really changes
    const pr = Math.min(devicePixelRatio, sharp ? 2 : qualityRatio);
    if (renderer.getPixelRatio() === pr) return;
    renderer.setPixelRatio(pr); composer.setPixelRatio(pr); onResize();
  }
  function setCrisp(on, sharp = on) {
    const g = grade.uniforms, v0 = g.uVig.value, g0 = g.uGrain.value, t0 = g.uTone.value;
    animate(.8, (t) => { g.uVig.value = lerp(v0, on ? .25 : 1, t); g.uGrain.value = lerp(g0, on ? .006 : .045, t); g.uTone.value = lerp(t0, on ? 0 : .5, t); });
    bokeh.enabled = !on;
    setRes(sharp);
  }
  // Reading mode: while the book is open, drop the effects that soften or darken text and render at full resolution
  function setReading(on, sharp = on) {
    const g = grade.uniforms, v0 = g.uVig.value, g0 = g.uGrain.value, v1 = on ? .15 : 1, g1 = on ? .008 : .045;
    animate(.6, (t) => { g.uVig.value = lerp(v0, v1, t); g.uGrain.value = lerp(g0, g1, t); });
    bokeh.enabled = !on;
    if (keySpot) { const k0 = keySpot.intensity, k1 = (on ? LAMP_READ : LAMP_ON) * LS; animate(.8, (t) => { keySpot.intensity = lerp(k0, k1, t); }); }   // ease the lamp down while reading
    setRes(sharp);
  }
  async function doEnterBook() {
    if (bookOpen) return; bookBusy = true;
    applySpread(spreadIdx);
    setMode('book');
    setRes(true);   // full resolution from the first frame of the move, so nothing stalls when the book lands open
    await moveBook(BOOK_READ, 1.3);
    await animate(1.5, (t) => { bookRig.setOpen(ease(t)); renderer.shadowMap.needsUpdate = true; });
    bookOpen = true; bookBusy = false; showBookUI(true); setReading(true);
  }
  async function doCloseBook(next) {
    if (!bookOpen) { if (mode !== next) setMode(next); return; }
    bookBusy = true; bookOpen = false; hover = null; canvas.style.cursor = ''; showBookUI(false); setReading(false, next === 'game');
    await animate(1.1, (t) => { bookRig.setOpen(1 - ease(t)); renderer.shadowMap.needsUpdate = true; });
    if (next === 'game') { updateOpponentCard(); if (!profile.on) opts.onComplete?.({ ...sel, roomId: ROOM_ID, name: playerName() }); }
    setMode(next);
    await moveBook(BOOK_HOME, 1.1);
    bookBusy = false;
    if (profile.on) endProfile();
  }

  // ---- Selections, spreads and their clickable regions (in page-canvas pixels) ----
  const sel = { control: null, side: null, format: null, difficulty: null, copied: false };
  const ROOM_ID = (() => { const A = ['royal', 'clever', 'swift', 'grand', 'valiant', 'noble', 'silent', 'bold'], B = ['knight', 'bishop', 'rook', 'queen', 'king', 'pawn', 'gambit', 'castle']; return `${A[Math.floor(Math.random() * A.length)]}-${B[Math.floor(Math.random() * B.length)]}-${Math.floor(10 + Math.random() * 90)}`; })();
  const playerName = () => profile.on ? profile.name : document.getElementById('player-name').value.trim() || 'Grandmaster';
  const FULL_PAGE = [0, 0, PAGE_PX.w, PAGE_PX.h];
  const SPREADS = [
    {
      title: 'Choose your control style', cta: 'TURN THE PAGE  ›',
      draw: { left: () => drawControlPage(CONTROL_PAGES.voice), right: () => drawControlPage(CONTROL_PAGES.gesture) },
      regions: () => ({
        left: [{ group: 'control', value: 'voice', rect: FULL_PAGE, layer: 0, ink: CONTROL_INK, label: 'Voice Commands' }],
        right: [{ group: 'control', value: 'gesture', rect: FULL_PAGE, layer: 0, ink: CONTROL_INK, label: 'Hand Gestures' }],
      }),
      missing: () => sel.control ? null : 'TAP A PAGE TO CHOOSE',
    },
    {
      title: 'Configure your match', cta: 'CONFIRM · ENTER BATTLE',
      draw: { left: () => drawArmyPage(sel, playerName()), right: () => drawFormatPage(sel, ROOM_ID) },
      regions: () => ({
        left: ARMY_OPTS.map(o => ({ group: 'side', value: o.value, rect: [130, o.cy - 205, 1140, o.cy + 205], layer: 0, label: o.label,
          ink: { cx: 640, cy: o.cy + 4, rx: 545, ry: 200, word: { x: 1010, y: o.cy - 176, size: 104, rot: -.14 } } })),
        right: formatRegions(),
      }),
      missing: () => !sel.side ? 'CHOOSE YOUR ARMY' : !sel.format ? 'CHOOSE A GAME FORMAT' : (sel.format === 'vs-bot' && !sel.difficulty) ? 'CHOOSE ENGINE DEPTH' : null,
    },
    {   // only reached from the game's Profile button
      title: 'Commander’s profile', cta: 'APPLY · RETURN TO BOARD',
      draw: { left: () => drawProfilePage(sel, profile), right: () => drawOrdersPage() },
      regions: () => ({ left: [], right: ORDER_OPTS.map(o => ({ action: o.value, rect: [130, o.cy - 190, 1140, o.cy + 190], label: o.label })) }),
      missing: () => null,
    },
  ];
  function formatRegions() {
    return [
      ...FORMAT_OPTS.map(o => ({ group: 'format', value: o.value, rect: [130, o.cy - 148, 1140, o.cy + 148], layer: 0, label: o.label,
        ink: { cx: 640, cy: o.cy + 6, rx: 548, ry: 150, word: { x: 1018, y: o.cy - 132, size: 92, rot: -.12 } } })),
      ...(sel.format === 'vs-bot' ? DEPTH_OPTS.map(d => ({ group: 'difficulty', value: d.value, rect: [d.cx - 166, 1470, d.cx + 166, 1710], layer: 1, label: d.label,
        ink: { cx: d.cx, cy: 1590, rx: 168, ry: 108, word: null } })) : []),
      ...(sel.format === 'online' ? [{ action: 'copy', rect: COPY_RECT, label: 'Copy courier link' }] : []),
    ];
  }
  // Opened from the game at the profile spread, which sits after the two onboarding spreads; turning back shows them with the current settings marked.
  const profile = { on: false, name: '', moves: 0, saved: null, after: null };
  const profileHooks = { apply: null, closed: null };
  let spreadLo = 0, spreadHi = 1;
  function openProfile(st) {
    if (mode !== 'game' || bookOpen || bookBusy || profile.on) return false;
    Object.assign(profile, { on: true, name: st.name, moves: st.moves, saved: { ...sel }, after: null });
    Object.assign(sel, { control: st.control, side: st.side, format: st.format, difficulty: st.difficulty, copied: false });
    spreadHi = 2; spreadIdx = 2;
    for (const s of [0, 1, 2]) for (const side of ['left', 'right']) if (spreadTex[s][side]) pageTexture(s, side, true);   // rewritten for the match as it stands
    enterBook();
    return true;
  }
  function endProfile() {
    const after = profile.after;
    Object.assign(sel, profile.saved); profile.on = false; profile.saved = null; profile.after = null;
    spreadHi = 1; spreadIdx = 0;
    for (const side of ['left', 'right']) if (spreadTex[1][side]) pageTexture(1, side, true);
    profileHooks.closed?.(after);
  }
  function bookBackClick() { if (bookOpen && spreadIdx > spreadLo) turnPage(-1); else closeBook(profile.on ? 'game' : 'landing'); }
  let spreadIdx = 0;
  const spreadTex = SPREADS.map(() => ({}));
  function pageTexture(s, side, redraw) {   // each spread's page artwork, drawn once and redrawn in place when its wording changes
    const cache = spreadTex[s];
    if (!cache[side]) cache[side] = tex(SPREADS[s].draw[side]());
    else if (redraw) { cache[side].image = SPREADS[s].draw[side](); cache[side].needsUpdate = true; }
    return cache[side];
  }
  const chosenOn = (s, side) => SPREADS[s].regions()[side].filter(r => r.group && sel[r.group] === r.value);
  function applyInk(s, side, penGroup) {   // show the pen marks for the current selections; animate the one just made
    bookRig.pages[side].layers.forEach((L, k) => {
      const r = chosenOn(s, side).find(r => r.layer === k);
      if (!r) {
        if (L.key) { L.key = null; animate(.35, (t) => { L.mat.opacity = 1 - t; }).then(() => { if (!L.key) { L.mesh.visible = false; L.mat.opacity = 1; } }); }
        return;
      }
      const key = r.group + ':' + r.value;
      if (L.key === key) return;
      const ink = drawInk(r.ink);
      L.mat.map = ink.ink; L.order.value = ink.order; L.key = key; L.mesh.visible = true; L.mat.opacity = 1;
      if (penGroup === r.group) { L.prog.value = 0; animate(r.ink.word ? 1.7 : 1.0, (t) => { if (L.key === key) L.prog.value = t * 1.02; }); }
      else L.prog.value = 1.02;
    });
  }
  function setPage(s, side) {
    const P = bookRig.pages[side];
    P.mat.map = pageTexture(s, side);
    P.layers.forEach(L => { L.mesh.visible = false; L.key = null; L.mat.opacity = 1; });
    applyInk(s, side);
  }
  function applySpread(s) { setPage(s, 'left'); setPage(s, 'right'); bookTitle.textContent = SPREADS[s].title; updateCta(); }
  function updateCta() {
    const S = SPREADS[spreadIdx], miss = S.missing();
    confirmBtn.disabled = !!miss || turning; confirmBtn.textContent = miss || (spreadIdx < spreadHi ? 'TURN THE PAGE  ›' : S.cta);
    // keyboard and screen-reader access: one real button per choice on this spread
    const R = S.regions(), all = [...R.left, ...R.right];
    pickGroup.innerHTML = '';
    for (const r of all) { const b = document.createElement('button'); b.textContent = (r.action ? '' : 'Choose ') + r.label + (r.group && sel[r.group] === r.value ? ' (selected)' : ''); b.onclick = () => select(r); pickGroup.appendChild(b); }
  }
  function select(r) {
    if (!bookOpen || turning) return;
    if (r.action === 'copy') {
      const url = `${location.origin}${location.pathname}?room=${ROOM_ID}&hostSide=${sel.side || 'w'}&mode=${sel.control === 'gesture' ? 'virtual' : 'voice'}&host=${encodeURIComponent(playerName())}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      sel.copied = true; pageTexture(spreadIdx, 'right', true); bookHint.textContent = 'Courier link copied';
      const s = spreadIdx; setTimeout(() => { sel.copied = false; pageTexture(s, 'right', true); }, 2500);
      return;
    }
    if (r.action) { profile.after = r.action; closeBook('game'); return; }   // a standing order: back to the board, then carried out
    if (sel[r.group] === r.value) return;
    sel[r.group] = r.value;
    if (r.group === 'side') pageTexture(spreadIdx, 'left', true);        // the note under "I." follows the chosen army
    if (r.group === 'format' || r.group === 'difficulty') pageTexture(spreadIdx, 'right', true);   // section III is rewritten for the format
    if (profile.on) pageTexture(2, 'left', true);   // the commander's record follows the new choices
    applyInk(spreadIdx, 'left', r.group); applyInk(spreadIdx, 'right', r.group);
    bookHint.textContent = r.label + ' chosen';
    updateCta();
  }
  // Page turn: the leaf lifts from one side and lands on the other, carrying the old page on its front and the new one on its back
  function composePage(s, side, mirror) {
    const base = pageTexture(s, side).image, c = drawCanvas(base.width, base.height, (x) => {
      if (mirror) { x.translate(base.width, 0); x.scale(-1, 1); }
      x.drawImage(base, 0, 0);
      for (const r of chosenOn(s, side)) x.drawImage(drawInk(r.ink).canvas, 0, 0);
    });
    return tex(c);
  }
  async function doTurnPage(dir) {
    const from = spreadIdx, to = from + dir;
    if (!bookOpen || to < spreadLo || to > spreadHi) return;
    turning = true; hover = null; canvas.style.cursor = '';
    const L = bookRig.leaf;
    for (const m of [L.front.material, L.back.material]) if (m.map !== bookRig.blank) m.map.dispose();
    L.front.material.map = composePage(dir > 0 ? from : to, 'right');
    L.back.material.map = composePage(dir > 0 ? to : from, 'left', true);
    setPage(to, dir > 0 ? 'right' : 'left');                              // the page being uncovered already shows the next spread
    L.set(dir > 0 ? 0 : 1); L.group.visible = true;
    spreadIdx = to; bookTitle.textContent = SPREADS[to].title; updateCta();
    await animate(1.3, (t) => { L.set(dir > 0 ? t : 1 - t); renderer.shadowMap.needsUpdate = true; });
    setPage(to, dir > 0 ? 'left' : 'right');
    L.group.visible = false; renderer.shadowMap.needsUpdate = true;
    turning = false; updateCta();
  }
  function updateOpponentCard() {
    const name = document.querySelector('.opp b'), sub = document.querySelector('.opp small');
    if (sel.format === 'two-player') { name.textContent = 'COUNCIL DUEL'; sub.textContent = 'Pass & play · one table'; }
    else if (sel.format === 'online') { name.textContent = 'IMPERIAL COURIER'; sub.textContent = 'Room · ' + ROOM_ID; }
    else { const d = DEPTH_OPTS.find(o => o.value === (sel.difficulty || 'medium')); name.textContent = d.title; sub.textContent = 'Royal Engine · ' + d.depth.toLowerCase(); }
  }
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickRegion(e) {
    if (!bookOpen || turning) return null;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([bookRig.pages.left.mesh, bookRig.pages.right.mesh], false)[0];
    if (!hit) return null;
    const side = hit.object.userData.side, px = hit.uv.x * PAGE_PX.w, py = (1 - hit.uv.y) * PAGE_PX.h;
    const r = SPREADS[spreadIdx].regions()[side].find(r => px >= r.rect[0] && px <= r.rect[2] && py >= r.rect[1] && py <= r.rect[3]);
    return r ? { ...r, side } : null;
  }
  canvas.addEventListener('pointermove', (e) => { if (!bookOpen) return; hover = pickRegion(e); canvas.style.cursor = hover ? 'pointer' : ''; });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => { const r = pickRegion(e); if (r) select(r); });
  function stepBookHover() {
    if (!bookRig) return;
    for (const [side, p] of Object.entries(bookRig.pages)) {
      const on = hover && hover.side === side && !(hover.group && sel[hover.group] === hover.value);
      p.hover = lerp(p.hover, on ? 1 : 0, .15); p.mat.emissiveIntensity = p.hover * .04;
    }
  }
  function goTo(m) {
    if (m === 'book') return enterBook();
    return closeBook(m);   // closes the book first if it is open, otherwise just moves the camera
  }

  // ---------- Boot ----------
  let ready = false, shown = 0, disposed = false;   // disposed: React may unmount the scene while it is still loading
  async function boot() {
    const piecesLoading = loadPieces();
    buildMaterials();
    buildEnvMap();
    world.add(buildDesk());
    world.add(buildBoard());
    await piecesLoading;
    if (disposed) return;
    const lamp = buildLamp(1);
    lamp.position.set(.4, 0, -.34);
    lamp.rotation.y = Math.atan2(-.4, .34) + .15;
    world.add(lamp);
    world.add(await buildProps());
    if (disposed) return;
    addBoardLabels();
    world.add(buildRoom());
    keySpot = buildLighting(lamp); lampGlass = lamp.userData.glass;
    scaleLights();
    buildComposer();
    onResize();
    if (opts.startInGame) { setMode('game'); stepAnims(99); tween = null; handCameraToGame(); }   // straight to the board: lighting and grade in their playing state
    else {
      renderer.setPixelRatio(Math.min(devicePixelRatio, qualityRatio)); composer.setPixelRatio(renderer.getPixelRatio()); onResize();
      const v = viewFor('landing'); camPos.copy(v.pos); camTarget.copy(v.target); focusM = v.focus;
    }
    document.getElementById('join').onclick = () => enterBook();
    document.getElementById('bookBack').onclick = bookBackClick;
    profileHooks.closed = (order) => opts.onProfileClosed?.(order);
    confirmBtn.onclick = () => {
      if (confirmBtn.disabled) return;
      if (spreadIdx < spreadHi) { turnPage(1); return; }
      (profile.on ? opts.onProfileApply : opts.onConfirm)?.({ ...sel, roomId: ROOM_ID, name: playerName() });   // inside the click, so the browser allows the mic or camera to start
      closeBook('game');
    };
    await renderer.compileAsync(scene, camera).catch(() => {});
    if (disposed) return;
    ready = true;
  }
  // Falloff, shadow cameras and rect-light size do not follow a parent's scale, so correct them once
  function scaleLights() {
    world.traverse((o) => {
      if (!o.isLight) return;
      if (o.isSpotLight || o.isPointLight) { o.intensity *= LS; if (o.distance > 0) o.distance *= S; }
      if (o.isRectAreaLight) { o.width *= S; o.height *= S; }
      if (o.shadow) {
        const c = o.shadow.camera;
        if (c.isOrthographicCamera) { c.left *= S; c.right *= S; c.top *= S; c.bottom *= S; }
        c.near *= S; c.far *= S; c.updateProjectionMatrix();
        o.shadow.normalBias *= S;
      }
    });
  }
  function onResize() {
    const w = renderer.domElement.clientWidth || innerWidth, h = renderer.domElement.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 50 : 34;
    camera.near = .3; camera.far = 400;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); grade.uniforms.uRes.value.set(w, h); }
  }
  addEventListener('resize', onResize);
  let qFrames = 0, qTime = 0, qDone = false, qualityRatio = 1.5;
  function adaptQuality(dt) {
    if (qDone || document.hidden || dt > .5) return;
    if (++qFrames < 20) return;
    qTime += dt;
    if (qFrames < 140) return;
    qDone = true;
    if (qTime / (qFrames - 20) > 1 / 24) { qualityRatio = 1; if (mode === 'landing') { renderer.setPixelRatio(1); composer.setPixelRatio(1); onResize(); } gtao.enabled = false; }
  }
  // The study drives the camera on the landing page and in the book; the game drives it while playing
  let ownsCamera = !opts.startInGame;
  function handCameraToGame() {
    const v = viewFor('game');
    ownsCamera = false;
    opts.onGameCamera?.(toGame(v.pos), toGame(v.target));
    bokeh.uniforms.focus.value = v.focus * S;
  }
  function takeCamera() { const v = viewFor('game'); camPos.copy(fromGame(camera.position)); camTarget.copy(v.target); focusM = v.focus; ownsCamera = true; }
  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  function tick() {
    if (!ready || disposed) return false;
    const rawDt = clock.getDelta(), dt = Math.min(rawDt, .05), t = clock.elapsedTime;
    adaptQuality(rawDt);
    if (ownsCamera) {
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 1.6);
        const e = tween.t < .5 ? 4 * tween.t ** 3 : 1 - Math.pow(-2 * tween.t + 2, 3) / 2;
        camPos.lerpVectors(tween.fromP, tween.to.pos, e);
        camTarget.lerpVectors(tween.fromT, tween.to.target, e);
        focusM = lerp(tween.fromF, tween.to.focus, e);
        if (tween.t >= 1) { tween = null; if (mode === 'game') handCameraToGame(); }
      } else if (mode !== 'game') {
        const v = viewFor(mode);
        // Cursor orbit on the landing view: a couple of degrees around what the camera looks at, eased; centred again elsewhere
        orbit.lerp(mode === 'landing' && !bookOpen ? mouse : orbitRest, 1 - Math.exp(-dt * 2.2));
        orbitOff.copy(v.pos).sub(v.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit.x * 2 * ORBIT_YAW);
        orbitOff.y -= orbitOff.length() * orbit.y * 2 * ORBIT_PITCH;
        camTarget.lerp(v.target, .05); camPos.lerp(orbitOff.add(v.target), .05);
      }
      if (ownsCamera) {
        look.copy(camTarget);
        camera.position.copy(toGame(camPos)); camera.lookAt(toGame(look));
        bokeh.uniforms.focus.value = focusM * S;
      }
    }
    if (sparkles) sparkles.material.uniforms.uTime.value = t;
    if (haze) { const br = 1 + .05 * Math.sin(t * .9) + .03 * Math.sin(t * 2.3 + 1.1); haze.material.uniforms.uAmt.value = .13 * br; if (lampGlass) lampGlass.emissiveIntensity = 2.7 * br; }
    if (dust) {
      const a = dust.geometry.attributes.position;
      for (let i = 0; i < dustBase.length; i++) { const d = dustBase[i]; a.setXYZ(i, d.p[0] + Math.sin(t * .13 * d.sp + d.ph) * .02, d.p[1] + Math.sin(t * .09 * d.sp + d.ph * 2) * .015, d.p[2] + Math.cos(t * .11 * d.sp + d.ph) * .02); }
      a.needsUpdate = true;
    }
    stepAnims(dt);
    stepBookHover();
    grade.uniforms.uTime.value = t;
    composer.render();
    if (++shown === 3) document.getElementById('veil').classList.add('gone');
    return true;
  }
  const ready$ = boot();

  return {
    world, ready: ready$, tick, onResize,
    get ownsCamera() { return ownsCamera; },
    get composer() { return composer; },
    /** Piece geometry, material and scale in the study finish, for the game's own piece meshes. */
    pieceParts(type, color) {
      const mat = (color === 'w' ? M.pieceLight : M.pieceDark).clone();
      return { geometry: GEO[type], material: mat, scale: PIECE_SCALE * S };
    },
    /** Camera position/target for the playing view from White's or Black's chair, in game units. */
    gameView() { const v = viewFor('game'); return { pos: toGame(v.pos), target: toGame(v.target) }; },
    /** Resting rotation for a piece (faces the opponent; knights and bishops turned inward). */
    pieceRotation,
    /** Surface height of the desk (for captured pieces), in game units. */
    deskTop: world.position.y,
    showLanding() { if (mode === 'game') setMode('landing'); },
    enterGame() { if (ready && !bookOpen && !bookBusy && mode !== 'game') setMode('game'); },
    /** Open the book at the profile chapter from the game. False if the book cannot be opened right now. */
    openProfile(state) { return ready ? openProfile(state) : false; },
    get mode() { return mode; },
    dispose() { disposed = true; removeEventListener('resize', onResize); ui.remove(); styleEl.remove(); scene.remove(world); },
  };
}
