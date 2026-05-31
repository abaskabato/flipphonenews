import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---- handset proportions (world units) ----
export const DIMS = {
    W: 0.98,      // body width
    H: 1.26,      // height of each half
    D: 0.14,      // body thickness
    R: 0.05,      // corner radius
};

const EPS = 0.001;

/**
 * Build the clamshell. The lid pivots about a hinge at the FRONT-top edge of
 * the base, so closing (rotation.x = PI) stacks the lid on top of the base with
 * its external display facing the camera — a real clamshell fold.
 *
 * Pass in three CanvasTextures: { screenTex, keypadTex, externalTex }.
 * Returns refs plus setOpenAmount(t) where t=0 closed, t=1 open.
 */
export function buildPhone({ screenTex, keypadTex, extScreenTex, sponsorTex }) {
    const { W, H, D, R } = DIMS;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xc9ccd1, metalness: 0.92, roughness: 0.34, envMapIntensity: 1.1,
    });
    const bodyMatDark = new THREE.MeshStandardMaterial({
        color: 0x9aa0a6, metalness: 0.9, roughness: 0.42, envMapIntensity: 1.0,
    });
    const trimMat = new THREE.MeshStandardMaterial({
        color: 0x2b2e33, metalness: 0.7, roughness: 0.5,
    });

    // glowing-LCD material factory
    const lcdMat = (tex) => new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.15,
        roughness: 0.32, metalness: 0.0,
    });

    // matte plastic for the printed faces (keypad / external)
    const printMat = (tex) => new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.6,
    });

    // ===== BASE (keypad half) =====
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 6, R), bodyMatDark);
    base.position.set(0, -H / 2, 0);   // top edge at y = 0
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    // keypad face on the base front
    const keypad = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.12), printMat(keypadTex));
    keypad.position.set(0, -H / 2, D / 2 + EPS);
    base.add(keypad);
    keypad.position.sub(base.position); // keep child-local relative to base centre

    // ===== HINGE GROUP (pivot at front-top edge of base) =====
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, D / 2);
    group.add(hinge);

    // hinge barrel spanning the width
    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(D * 0.42, D * 0.42, W * 0.74, 24),
        trimMat
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0, -D / 2);
    barrel.castShadow = true;
    hinge.add(barrel);

    // ===== LID (screen half) =====
    const lid = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 6, R), bodyMat);
    // local offset so that, at rotation 0 (open), the lid is coplanar above the base
    lid.position.set(0, H / 2, -D / 2);
    lid.castShadow = true; lid.receiveShadow = true;
    hinge.add(lid);

    // inner LCD (news) on the lid front
    const screenMat = lcdMat(screenTex);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, H - 0.34), screenMat);
    screen.position.set(0, 0.05, D / 2 + EPS);
    lid.add(screen);

    // earpiece slit above the screen
    const slit = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.34, 0.018, 0.01),
        trimMat
    );
    slit.position.set(0, H / 2 - 0.10, D / 2 + EPS);
    lid.add(slit);

    // small external clock LCD (glows), upper part of the lid back
    const extScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 0.6, H * 0.2), lcdMat(extScreenTex)
    );
    // face outward via rotation.x (not .y) so content reads upright once the
    // lid folds 180° closed — the only time the external face is seen
    // face outward via rotation.x (not .y) so content reads upright once the
    // lid folds 180° closed — the only time the external face is seen.
    // The fold inverts Y, so negative lid-local Y sits near the closed top.
    extScreen.position.set(0, -H * 0.26, -D / 2 - EPS);
    extScreen.rotation.x = Math.PI;
    lid.add(extScreen);

    // external speaker slit (closed top)
    const extSlit = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.018, 0.01), trimMat);
    extSlit.position.set(0, -H * 0.41, -D / 2 - EPS);
    lid.add(extSlit);

    // sponsor billboard (matte print, swappable texture) on the lower lid back
    const sponsorMat = printMat(sponsorTex);
    const sponsorPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 0.74, H * 0.4), sponsorMat
    );
    sponsorPanel.position.set(0, H * 0.08, -D / 2 - EPS);
    sponsorPanel.rotation.x = Math.PI;
    lid.add(sponsorPanel);

    // ===== antenna on the base, top-right =====
    const antenna = new THREE.Group();
    const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.024, 0.34, 16),
        new THREE.MeshStandardMaterial({ color: 0xbfc3c8, metalness: 0.95, roughness: 0.3 })
    );
    rod.position.y = 0.17;
    const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.4, roughness: 0.5 })
    );
    tip.position.y = 0.35;
    antenna.add(rod, tip);
    antenna.position.set(W / 2 - 0.1, -0.02, -0.01);
    antenna.castShadow = true;
    group.add(antenna);

    // ===== open / close =====
    // t = 0 closed (lid folded onto base, rotation.x = PI)
    // t = 1 open  (lid standing up, leaning back slightly)
    const CLOSED = Math.PI * 0.995;
    const OPEN = -0.12;
    function setOpenAmount(t) {
        hinge.rotation.x = THREE.MathUtils.lerp(CLOSED, OPEN, t);
    }
    setOpenAmount(0);

    return { group, hinge, base, lid, screen, keypad, extScreen, sponsorPanel, sponsorMat, bodyMat, setOpenAmount };
}
