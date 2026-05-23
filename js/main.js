import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { NewsTicker, fetchHeadlines } from './news.js';
import { drawKeypad, drawExtScreen } from './faces.js';
import { loadSponsor, applySponsor, drawPlaceholder } from './sponsor.js';
import { playFlip } from './audio.js';

const canvasEl = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.1, 0.25, 4.6);

// metallic reflections from a procedural room
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---- lighting ----
scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202028, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(2.6, 4.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 14;
key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
rim.position.set(-3, 1.5, -2.5);
scene.add(rim);

// ---- ground shadow catcher ----
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.32 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.55;
ground.receiveShadow = true;
scene.add(ground);

// ---- canvases / textures ----
function makeCanvasTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { canvas: c, ctx: c.getContext('2d'), tex };
}

const screenC = makeCanvasTexture(512, 576);   // inner news LCD
const keypadC = makeCanvasTexture(540, 760);   // base keypad
const extC = makeCanvasTexture(360, 150);      // external clock
const sponsorC = makeCanvasTexture(512, 280);  // sponsor billboard

drawKeypad(keypadC.ctx, keypadC.canvas.width, keypadC.canvas.height);
keypadC.tex.needsUpdate = true;
drawExtScreen(extC.ctx, extC.canvas.width, extC.canvas.height, new Date().toTimeString().slice(0, 5));
extC.tex.needsUpdate = true;
drawPlaceholder(sponsorC.ctx, sponsorC.tex);

const ticker = new NewsTicker(screenC.canvas);

// ---- build the handset ----
const phone = buildPhone({
    screenTex: screenC.tex,
    keypadTex: keypadC.tex,
    extScreenTex: extC.tex,
    sponsorTex: sponsorC.tex,
});
scene.add(phone.group);

// ---- controls ----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.6;
controls.maxDistance = 7;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = Math.PI - 0.7;
controls.target.set(0, -0.05, 0);

// ---- open/close state machine ----
let open = 0;          // current 0..1
let openTarget = 1;    // start by springing open
let lastDir = 1;
phone.setOpenAmount(open);

function toggle() {
    openTarget = openTarget > 0.5 ? 0 : 1;
    lastDir = openTarget;
    playFlip(openTarget === 1);
}
document.getElementById('flipBtn').addEventListener('click', toggle);

// click the phone itself to toggle, too
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return; // it was a drag, not a tap
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(phone.group, true).length) toggle();
});

// ---- news loading ----
fetchHeadlines(12)
    .then((titles) => ticker.setHeadlines(titles))
    .catch(() => { /* keep fallback headlines */ })
    .finally(() => setInterval(refreshNews, 10 * 60 * 1000)); // refresh every 10 min
function refreshNews() {
    fetchHeadlines(12).then((t) => ticker.setHeadlines(t)).catch(() => {});
}

// ---- sponsor loading ----
loadSponsor().then((data) => applySponsor(data, {
    ctx: sponsorC.ctx, tex: sponsorC.tex, mat: phone.sponsorMat,
    loader: new THREE.TextureLoader(), domTag: document.getElementById('sponsorTag'),
}));

// ---- spring-open easing ----
function approach(cur, target, dt) {
    // critically-damped-ish spring with a touch of overshoot near the latch
    const k = 9;
    let next = cur + (target - cur) * Math.min(1, k * dt);
    if (Math.abs(target - next) < 0.001) next = target;
    return next;
}

// ---- render loop ----
const clock = new THREE.Clock();
let booted = false;
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    open = approach(open, openTarget, dt);
    phone.setOpenAmount(open);

    // gentle idle turn until the user grabs it
    if (!controls._grabbed) phone.group.rotation.y += dt * 0.18;

    ticker.update(dt);
    screenC.tex.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);

    if (!booted) {
        booted = true;
        document.getElementById('loader').classList.add('hidden');
    }
}
controls.addEventListener('start', () => { controls._grabbed = true; });
animate();

// debug/test hook
window.FPN = {
    phone, controls, toggle,
    setOpen: (v) => { openTarget = v; lastDir = v; },
    stopIdle: () => { controls._grabbed = true; },
};

// keep external clock current
setInterval(() => {
    drawExtScreen(extC.ctx, extC.canvas.width, extC.canvas.height, new Date().toTimeString().slice(0, 5));
    extC.tex.needsUpdate = true;
}, 30 * 1000);

// ---- resize ----
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
