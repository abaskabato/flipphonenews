// Sponsor billboard: read the active sponsor and paint it onto the lid's
// back panel. Source priority: /api/sponsor (KV-backed) -> data/sponsor.json
// (committed default) -> built-in "slot open" placeholder.
import * as THREE from 'three';

export async function loadSponsor() {
    for (const url of ['/api/sponsor', 'data/sponsor.json']) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data === 'object') return data;
            }
        } catch (_) { /* try next */ }
    }
    return { name: null, imageUrl: null, link: null };
}

/**
 * @param data       {name, imageUrl, link}
 * @param ctx        2d context of the sponsor canvas (for the placeholder)
 * @param tex        CanvasTexture wrapping that canvas
 * @param mat        MeshStandardMaterial of the sponsor panel
 * @param loader     THREE.TextureLoader
 * @param domTag     HTMLElement for the on-page credit chip
 */
export function applySponsor(data, { ctx, tex, mat, loader, domTag }) {
    const W = ctx.canvas.width, H = ctx.canvas.height;

    if (data && data.imageUrl) {
        // load the logo straight into a texture (CORS-safe, no canvas taint)
        loader.load(
            data.imageUrl,
            (logo) => {
                logo.colorSpace = THREE.SRGBColorSpace;
                logo.anisotropy = 8;
                mat.map = logo;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
            },
            undefined,
            () => drawPlaceholder(ctx, tex, 'image failed to load')
        );
        showTag(domTag, data);
        return;
    }

    drawPlaceholder(ctx, tex);
    showTag(domTag, null);
}

export function drawPlaceholder(ctx, tex, note) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1d24');
    g.addColorStop(1, '#0d0f14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // dashed "ad slot" frame
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 44px Arial";
    ctx.fillText('YOUR BRAND', W / 2, H / 2 - 26);
    ctx.fillText('HERE', W / 2, H / 2 + 26);
    ctx.fillStyle = '#39ff14';
    ctx.font = "bold 22px Arial";
    ctx.fillText(note || 'flipphonenews.com/sponsor', W / 2, H - 46);
    if (tex) tex.needsUpdate = true;
}

function showTag(domTag, data) {
    if (!domTag) return;
    if (data && data.name) {
        const label = `Sponsored by <strong>${escapeHtml(data.name)}</strong>`;
        domTag.innerHTML = data.link
            ? `${label} · <a href="${escapeAttr(data.link)}" target="_blank" rel="noopener nofollow">visit</a>`
            : label;
    } else {
        domTag.innerHTML = `This billboard is open · <a href="/sponsor.html">claim it</a>`;
    }
    domTag.hidden = false;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
