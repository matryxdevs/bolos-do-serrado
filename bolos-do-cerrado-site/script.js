/* Bolos do Cerrado: altere o número abaixo caso o WhatsApp comercial mude. */
const WHATSAPP_NUMBER = '5594991195754';
const whatsappUrl = (message) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

document.querySelectorAll('[data-whatsapp]').forEach((link) => {
  link.href = whatsappUrl(link.dataset.whatsapp);
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => {
    const product = button.dataset.product;
    const message = `Olá! Vi no site a sugestão de ${product}. Esse sabor está disponível hoje? Poderia informar os tamanhos e valores?`;
    window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer');
  });
});

const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');
menuToggle?.addEventListener('click', () => {
  const opened = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(opened));
  menuToggle.setAttribute('aria-label', opened ? 'Fechar menu' : 'Abrir menu');
});
mainNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  mainNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menu');
}));

const filters = Array.from(document.querySelectorAll('[data-filter]'));
filters.forEach((button) => button.addEventListener('click', () => {
  const category = button.dataset.filter;
  filters.forEach((f) => {
    f.classList.toggle('active', f === button);
    f.setAttribute('aria-pressed', String(f === button));
  });
  document.querySelectorAll('[data-category]').forEach((card) => {
    card.classList.toggle('is-hidden', category !== 'todos' && card.dataset.category !== category);
  });
}));

const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {threshold:0.07, rootMargin:'0px 0px 30px 0px'});
  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('visible'));
}

document.getElementById('year').textContent = new Date().getFullYear();
