const WEDDING_DATE = new Date('2026-11-05T16:00:00+02:00');

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateCountdown() {
  const now = new Date();
  const diff = WEDDING_DATE - now;
  const safeDiff = Math.max(0, diff);
  const days = Math.floor(safeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((safeDiff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((safeDiff / (1000 * 60)) % 60);
  const seconds = Math.floor((safeDiff / 1000) % 60);
  setText('count-days', days.toString());
  setText('count-hours', hours.toString().padStart(2, '0'));
  setText('count-minutes', minutes.toString().padStart(2, '0'));
  setText('count-seconds', seconds.toString().padStart(2, '0'));
  setText('mobile-count-days', days.toString());
  setText('mobile-count-hours', hours.toString().padStart(2, '0'));
  setText('mobile-count-minutes', minutes.toString().padStart(2, '0'));
  setText('mobile-count-seconds', seconds.toString().padStart(2, '0'));
}

function initRevealAnimations() {
  const items = document.querySelectorAll('.fade-in');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((item) => observer.observe(item));
}

function initContributionToggle() {
  const btn = document.querySelector('[data-toggle-contribution]');
  const panel = document.querySelector('[data-contribution-panel]');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    btn.textContent = open ? 'Versteek bankbesonderhede' : 'Klik hier vir besonderhede';
  });
}

updateCountdown();
setInterval(updateCountdown, 1000);
initRevealAnimations();
initContributionToggle();
