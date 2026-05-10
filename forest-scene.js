/* 🌲 Forest scene — real photo background + firefly overlay
   Usage: <body data-forest="day|lake|sunlit|evening">
*/

function renderForestScene(target = 'body', variant = 'day'){
  const root = document.querySelector(target);
  if (!root) return;

  // Remove existing scene
  root.querySelector('.forest-scene')?.remove();

  const scene = document.createElement('div');
  scene.className = `forest-scene forest-scene--${variant}`;

  // Photo background layer
  const photo = document.createElement('div');
  photo.className = 'forest-photo';
  scene.appendChild(photo);

  // Fireflies
  const flies = document.createElement('div');
  flies.className = 'firefly-layer';
  for (let i = 0; i < 12; i++){
    const f = document.createElement('div');
    f.className = 'firefly';
    flies.appendChild(f);
  }
  scene.appendChild(flies);

  // Insert as the FIRST child of body so it sits behind everything
  root.insertBefore(scene, root.firstChild);
}

// Auto-init from <body data-forest="...">
document.addEventListener('DOMContentLoaded', () => {
  const variant = document.body.dataset.forest;
  if (variant) renderForestScene('body', variant);
});
