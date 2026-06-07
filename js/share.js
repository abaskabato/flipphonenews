// FLIPCAST · share loop. Turns whatever is currently tuned into a copiable
// deep link, and restores that exact station / episode when someone opens it.
//
// The link carries everything needed to play without depending on live API
// ordering: the stream URL + display metadata travel in the query string. For
// podcasts we also carry a timestamp (`t`) so you can share *the moment*, not
// just the episode.
//
// Schema (query string):
//   radio    ?b=r&u=<stream>&n=<name>&c=<country>&g=<tag>&br=<bitrate>
//   episode  ?b=p&u=<audio>&n=<title>&d=<secs>&dt=<date>&s=<show>&t=<secs>
//   show     ?b=p&show=<id>&n=<name>

const num = (v) => { const n = parseInt(v || '0', 10); return Number.isFinite(n) ? n : 0; };

// Read the current page URL into a shared-state object (or null if none).
export function parseShareParams(search) {
    const p = new URLSearchParams(search || '');
    const b = p.get('b');

    if (b === 'r') {
        const url = p.get('u');
        if (!url) return null;
        return {
            band: 'radio',
            station: {
                name: p.get('n') || 'Shared station',
                url,
                country: p.get('c') || '',
                tags: p.get('g') || '',
                bitrate: num(p.get('br')),
            },
        };
    }

    if (b === 'p') {
        const url = p.get('u');
        if (url) {
            return {
                band: 'podcast',
                episode: {
                    name: p.get('n') || 'Shared episode',
                    url,
                    duration: num(p.get('d')),
                    date: p.get('dt') || '',
                },
                show: p.get('s') || '',
                t: num(p.get('t')),
            };
        }
        const showId = p.get('show');
        if (showId) return { band: 'podcast', showId, show: p.get('n') || p.get('s') || '' };
    }

    return null;
}

// Build a shareable link for whatever the active band currently has selected.
// Returns null when there's nothing meaningful to share yet.
export function buildShareURL(app, band) {
    const base = location.origin + location.pathname;
    const p = new URLSearchParams();

    if (band === 'radio') {
        const st = app.current;
        if (!st || !st.url) return null;
        p.set('b', 'r');
        p.set('u', st.url);
        p.set('n', st.name);
        if (st.country) p.set('c', st.country);
        const tag = (st.tags || '').split(',')[0];
        if (tag) p.set('g', tag);
        if (st.bitrate) p.set('br', String(st.bitrate));
    } else {
        if (app.view === 'episodes') {
            const ep = app.current;
            if (!ep || !ep.url) return null;
            p.set('b', 'p');
            p.set('u', ep.url);
            p.set('n', ep.name);
            if (ep.duration) p.set('d', String(ep.duration));
            if (ep.date) p.set('dt', ep.date);
            if (app.show && app.show.name) p.set('s', app.show.name);
            // share the moment: only when this is the episode actually playing
            const t = app.playingEp === ep ? Math.floor(app.cur || 0) : 0;
            if (t > 5) p.set('t', String(t));
        } else {
            const sh = app.current;
            if (!sh || !sh.id) return null;
            p.set('b', 'p');
            p.set('show', String(sh.id));
            if (sh.name) p.set('n', sh.name);
        }
    }

    return base + '?' + p.toString();
}

// Restore shared state on load. `ctx` provides { radio, podcasts, activate }.
export function applyShareParams(s, ctx) {
    if (!s) return;
    if (s.band === 'radio') {
        ctx.activate('radio');
        ctx.radio.playShared(s.station);
    } else {
        ctx.activate('podcast');
        if (s.episode) ctx.podcasts.playSharedEpisode(s.episode, s.show, s.t);
        else if (s.showId) ctx.podcasts.openShow({ id: s.showId, name: s.show });
    }
}
