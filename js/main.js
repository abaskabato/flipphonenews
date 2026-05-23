import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { drawKeypad, drawExtScreen, drawExtMessage } from './faces.js';
import { loadSponsor, applySponsor, drawPlaceholder } from './sponsor.js';
import { playFlip } from './audio.js';
import { NostrChat } from './nostr-chat.js';

// ---------- renderer / scene ----------
const canvasEl = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const stage = canvasEl.parentElement; // the .hero section
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0.1, 0.25, 4.6);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202028, 0.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(2.6, 4.2, 3.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -3; keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3; keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
rim.position.set(-3, 1.5, -2.5);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.32 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.55;
ground.receiveShadow = true;
scene.add(ground);

// ---------- canvases / textures ----------
function makeCanvasTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { canvas: c, ctx: c.getContext('2d'), tex, W: w, H: h };
}
const screenC = makeCanvasTexture(512, 576);
const keypadC = makeCanvasTexture(540, 760);
const extC = makeCanvasTexture(360, 150);
const sponsorC = makeCanvasTexture(512, 280);

drawKeypad(keypadC.ctx, keypadC.W, keypadC.H);
keypadC.tex.needsUpdate = true;
drawPlaceholder(sponsorC.ctx, sponsorC.tex);

const phone = buildPhone({
    screenTex: screenC.tex, keypadTex: keypadC.tex,
    extScreenTex: extC.tex, sponsorTex: sponsorC.tex,
});
scene.add(phone.group);

// ---------- controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false; // let the page scroll over the canvas
controls.minDistance = 2.6;
controls.maxDistance = 7;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = Math.PI - 0.7;
controls.target.set(0, -0.05, 0);
controls.addEventListener('start', () => { grabbed = true; });
let grabbed = false;

// ---------- screen apps ----------
const chat = new NostrChat(screenC.canvas);
const apps = { chat };
let activeName = 'chat';
let activeApp = apps.chat;

// ---------- external display state ----------
let extOverride = null; // { title, sub } or null = clock
function refreshExternal() {
    if (extOverride) drawExtMessage(extC.ctx, extC.W, extC.H, extOverride.title, extOverride.sub);
    else drawExtScreen(extC.ctx, extC.W, extC.H, new Date().toTimeString().slice(0, 5));
    extC.tex.needsUpdate = true;
}
refreshExternal();
setInterval(refreshExternal, 30 * 1000);

// ---------- open / close ----------
let open = 0, openTarget = 0, lastDir = 0;
phone.setOpenAmount(0);
function setOpenTarget(v) {
    const closing = v < 0.5 && openTarget > 0.5;
    openTarget = v; lastDir = v;
    if (closing && activeName === 'chat' && chat.draft) {
        // flip closed = send draft, like hanging up
        chat.send(chat.draft);
        chat.draft = '';
    }
    playFlip(v === 1);
}
function toggle() { setOpenTarget(openTarget > 0.5 ? 0 : 1); }
document.getElementById('flipBtn').addEventListener('click', toggle);

// tap the phone to flip
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(phone.group, true).length) toggle();
});

// ---------- mode switching ----------
function setApp(name) {
    activeName = name;
    activeApp = apps[name];
    activeApp.enter && activeApp.enter();
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.app === name));
    extOverride = { title: 'CHAT', sub: chat.gh ? `#${chat.gh}` : '' };
    refreshExternal();
}
document.querySelector('.tab').addEventListener('click', () => setApp('chat'));

// ---------- keyboard: send messages via Enter ----------
addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (activeName === 'chat' && e.key === 'Enter') {
        const input = document.getElementById('chat-input');
        if (input && input.value.trim()) {
            chat.send(input.value);
            input.value = '';
        }
    }
});

// ---------- CHAT panel wiring ----------
const $ = (id) => document.getElementById(id);
const chatInput = $('chat-input');
const chatSend = $('chat-send');
const chatStatus = $('chat-status');
const chatName = $('chat-name');
const chatKey = $('chat-key');

chatSend.addEventListener('click', () => {
    if (chatInput.value.trim()) {
        chat.send(chatInput.value);
        chatInput.value = '';
    }
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (chatInput.value.trim()) {
            chat.send(chatInput.value);
            chatInput.value = '';
        }
        e.preventDefault();
    }
});
chatName.addEventListener('input', () => {
    chat.name = chatName.value.trim();
});

// update status from the chat app
const origDraw = chat.draw.bind(chat);
chat.draw = function () {
    chatStatus.textContent = this.status;
    chatKey.textContent = `key: ${this.pk ? this.pk.slice(0, 12) + '…' : '—'}`;
    origDraw();
};

// ---------- boot: always start in chat ----------
setApp('chat');

// ---------- data loads ----------
loadSponsor().then((data) => applySponsor(data, {
    ctx: sponsorC.ctx, tex: sponsorC.tex, mat: phone.sponsorMat,
    loader: new THREE.TextureLoader(), domTag: document.getElementById('sponsorTag'),
}));

// ---------- render loop ----------
const clock = new THREE.Clock();
let booted = false;
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    open += (openTarget - open) * Math.min(1, 9 * dt);
    if (Math.abs(openTarget - open) < 0.001) open = openTarget;
    phone.setOpenAmount(open);

    if (activeName === 'chat' && !grabbed) phone.group.rotation.y += dt * 0.18;

    activeApp.update(dt);
    screenC.tex.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);

    if (!booted) { booted = true; document.getElementById('loader').classList.add('hidden'); }
}
animate();

function sizeToStage() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
addEventListener('resize', sizeToStage);
new ResizeObserver(sizeToStage).observe(stage);

// debug/test hook
window.FPN = {
    chat,
    setOpen: (v) => setOpenTarget(v),
    stopIdle: () => { grabbed = true; },
};
