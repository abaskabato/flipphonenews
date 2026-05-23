// Fullscreen on first tap — feels like a real phone.
// Android Chrome: requestFullscreen() hides everything.
// iOS Safari: no Fullscreen API, but PWA standalone mode + meta tags hide chrome.
//             Also scrolls to 0,0 on touch to collapse the address bar.
// If the page is already in standalone mode (added to home screen), skip.

(function () {
    // Already standalone (added to home screen on iOS/Android)
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return;

    function enterFS() {
        try { document.documentElement.requestFullscreen(); } catch (_) {}
        window.scrollTo(0, 0);
        document.removeEventListener('pointerdown', enterFS);
        document.removeEventListener('touchstart', enterFS);
    }

    // iOS: collapsing the URL bar on scroll requires a real scroll.
    // We do it on touchstart so the address bar collapses before the user sees anything.
    function collapseBar() {
        window.scrollTo(0, 0);
        document.removeEventListener('touchstart', collapseBar);
    }

    document.addEventListener('pointerdown', enterFS);
    document.addEventListener('touchstart', enterFS);
    document.addEventListener('touchstart', collapseBar);
})();
