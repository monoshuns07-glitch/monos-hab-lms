/* 🌲 Forest scene generator — inserts SVG trees + fireflies into page background */

const TREE_SVGS = {
  pine: `<svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pinetrunk" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#3d2817"/>
        <stop offset="1" stop-color="#1f1208"/>
      </linearGradient>
      <linearGradient id="pineneedle" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#4a8c5a"/>
        <stop offset="1" stop-color="#1a3a2e"/>
      </linearGradient>
    </defs>
    <rect x="44" y="140" width="12" height="60" fill="url(#pinetrunk)" rx="2"/>
    <path d="M50 10 L20 70 L35 65 L15 110 L30 105 L10 150 L90 150 L70 105 L85 110 L65 65 L80 70 Z" fill="url(#pineneedle)"/>
    <path d="M50 25 L28 70 L40 67 L22 105 L78 105 L60 67 L72 70 Z" fill="#5fa46b" opacity=".5"/>
  </svg>`,

  birch: `<svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="birchtrunk" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#e8e3d8"/>
        <stop offset=".5" stop-color="#fafaf5"/>
        <stop offset="1" stop-color="#c4baa8"/>
      </linearGradient>
      <radialGradient id="birchcanopy" cx=".4" cy=".3">
        <stop offset="0" stop-color="#9bd482"/>
        <stop offset="1" stop-color="#3d6b40"/>
      </radialGradient>
    </defs>
    <rect x="46" y="80" width="8" height="120" fill="url(#birchtrunk)" rx="1"/>
    <g fill="#3d2817" opacity=".6">
      <rect x="46" y="100" width="8" height="2"/>
      <rect x="46" y="125" width="8" height="3"/>
      <rect x="46" y="155" width="8" height="2"/>
      <rect x="46" y="178" width="8" height="3"/>
    </g>
    <ellipse cx="50" cy="55" rx="42" ry="50" fill="url(#birchcanopy)"/>
    <ellipse cx="35" cy="40" rx="22" ry="25" fill="#a8d97c" opacity=".55"/>
    <ellipse cx="65" cy="45" rx="20" ry="22" fill="#86c468" opacity=".5"/>
  </svg>`,

  oak: `<svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="oakcanopy" cx=".5" cy=".4">
        <stop offset="0" stop-color="#7eb55c"/>
        <stop offset=".7" stop-color="#3a6b32"/>
        <stop offset="1" stop-color="#1f3a1a"/>
      </radialGradient>
    </defs>
    <path d="M50 200 L45 130 Q40 110 35 90 L40 88 L48 105 L50 130 L52 105 L60 88 L65 90 Q60 110 55 130 Z" fill="#3d2817"/>
    <ellipse cx="50" cy="55" rx="48" ry="48" fill="url(#oakcanopy)"/>
    <ellipse cx="30" cy="40" rx="22" ry="20" fill="#5a9244" opacity=".7"/>
    <ellipse cx="70" cy="50" rx="20" ry="18" fill="#5a9244" opacity=".6"/>
    <ellipse cx="50" cy="30" rx="18" ry="14" fill="#8bc97c" opacity=".5"/>
  </svg>`,

  bush: `<svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bushgrad" cx=".5" cy=".4">
        <stop offset="0" stop-color="#7ab26a"/>
        <stop offset="1" stop-color="#2d5a3d"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="55" rx="48" ry="28" fill="url(#bushgrad)"/>
    <ellipse cx="25" cy="48" rx="20" ry="17" fill="#5a9244" opacity=".7"/>
    <ellipse cx="75" cy="48" rx="22" ry="18" fill="#5a9244" opacity=".7"/>
    <ellipse cx="50" cy="38" rx="18" ry="14" fill="#8bc97c" opacity=".55"/>
  </svg>`,

  flower: `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
    <line x1="20" y1="60" x2="20" y2="32" stroke="#3a6b32" stroke-width="2"/>
    <ellipse cx="14" cy="42" rx="6" ry="3" fill="#5a9244" transform="rotate(-25 14 42)"/>
    <ellipse cx="26" cy="48" rx="6" ry="3" fill="#5a9244" transform="rotate(20 26 48)"/>
    <circle cx="20" cy="22" r="6" fill="#ff7eb1"/>
    <circle cx="20" cy="14" r="6" fill="#ff7eb1"/>
    <circle cx="14" cy="22" r="6" fill="#ff7eb1"/>
    <circle cx="26" cy="22" r="6" fill="#ff7eb1"/>
    <circle cx="20" cy="22" r="4" fill="#ffd84a"/>
  </svg>`
};

function renderForestScene(target = 'body', variant = 'day'){
  const root = document.querySelector(target);
  if (!root) return;

  // Remove existing scene if any
  root.querySelector('.forest-scene')?.remove();

  const scene = document.createElement('div');
  scene.className = `forest-scene forest-scene--${variant}`;

  // Layer 1: distant mountains + sky rays
  scene.innerHTML = `
    <div class="forest-rays"></div>
    <div class="forest-far"></div>
    <div class="forest-mid">
      <div class="tree-far tf1">${TREE_SVGS.pine}</div>
      <div class="tree-far tf2">${TREE_SVGS.pine}</div>
      <div class="tree-far tf3">${TREE_SVGS.birch}</div>
      <div class="tree-far tf4">${TREE_SVGS.pine}</div>
    </div>
    <div class="forest-near">
      <div class="tree t1">${TREE_SVGS.pine}</div>
      <div class="tree t2">${TREE_SVGS.birch}</div>
      <div class="tree t3">${TREE_SVGS.oak}</div>
      <div class="tree t4">${TREE_SVGS.pine}</div>
      <div class="tree t5">${TREE_SVGS.bush}</div>
    </div>
  `;

  // Fireflies
  const flies = document.createElement('div');
  flies.className = 'firefly-layer';
  flies.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  for (let i = 0; i < 10; i++){
    const f = document.createElement('div');
    f.className = 'firefly';
    flies.appendChild(f);
  }
  scene.appendChild(flies);

  // Butterflies
  const flutter = document.createElement('div');
  flutter.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  for (let i = 1; i <= 3; i++){
    const b = document.createElement('div');
    b.className = `butterfly b${i}`;
    flutter.appendChild(b);
  }
  scene.appendChild(flutter);

  // Insert as the FIRST child of body so it sits behind everything
  root.insertBefore(scene, root.firstChild);
}

// Auto-init if data attribute set on <body>
document.addEventListener('DOMContentLoaded', () => {
  const variant = document.body.dataset.forest;
  if (variant) renderForestScene('body', variant);
});
