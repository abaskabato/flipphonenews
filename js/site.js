// Marketing-page interactivity: Stripe checkout, email capture, footer year

// ---- Footer year ----
document.getElementById('yr').textContent = new Date().getFullYear();

// ---- Post-purchase success banner ----
const params = new URLSearchParams(location.search);
if (params.get('reset') === 'success') {
    const banner = document.createElement('div');
    banner.className = 'reset-banner';
    banner.textContent = '✅ Welcome to the 30-Day Reset! Check your email for instant access.';
    document.querySelector('.hero').after(banner);
    setTimeout(() => banner.remove(), 8000);
}

// ---- 30-Day Reset: Stripe checkout ----
document.querySelectorAll('.js-buy').forEach((btn) => {
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Opening checkout…';
        try {
            const res = await fetch('/api/checkout-reset', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Something went wrong');
            location.href = data.url;
        } catch (e) {
            const msg = document.getElementById('buyMsg');
            if (msg) msg.textContent = 'Could not open checkout. Please try again.';
            btn.disabled = false;
            btn.textContent = original;
        }
    });
});

// ---- Email capture (7-Day Starter) ----
const form = document.getElementById('subscribeForm');
const input = document.getElementById('emailInput');
const msg = document.getElementById('subscribeMsg');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!email) return;
        msg.textContent = 'Sending…';
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Something went wrong');
            msg.textContent = "You're in! Check your inbox for the 7-Day Starter.";
            input.value = '';
        } catch (e) {
            msg.textContent = e.message || 'Could not subscribe. Try again.';
        }
    });
}
