/* 🌲 Forest scene — looping cinematic nature VIDEO + firefly overlay
   Usage: <body data-forest="day|lake|sunlit|evening">
*/

const FOREST_VIDEOS = {
  day:     'img/video-compressed/login-mongolian-steppe.mp4',
  lake:    'img/video-compressed/dashboard-khovsgol.mp4',
  sunlit:  'img/video-compressed/nohon-sunlit-forest.mp4',
  evening: 'img/video-compressed/admin-evening-mountain.mp4'
};

const FOREST_POSTERS = {
  day:     'img/bg/login-mongolian-steppe.jpg',
  lake:    'img/bg/dashboard-khovsgol.jpg',
  sunlit:  'img/bg/nohon-sunlit-forest.jpg',
  evening: 'img/bg/admin-evening-mountain.jpg'
};

function renderForestScene(target = 'body', variant = 'day'){
  const root = document.querySelector(target);
  if (!root) return;

  // Remove existing scene
  root.querySelector('.forest-scene')?.remove();

  const scene = document.createElement('div');
  scene.className = `forest-scene forest-scene--${variant}`;

  // Looping video
  const src = FOREST_VIDEOS[variant] || FOREST_VIDEOS.day;
  const poster = FOREST_POSTERS[variant] || FOREST_POSTERS.day;
  const video = document.createElement('video');
  video.className = 'forest-video';
  video.src = src;
  video.poster = poster;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  scene.appendChild(video);

  // Fireflies overlay
  const flies = document.createElement('div');
  flies.className = 'firefly-layer';
  for (let i = 0; i < 12; i++){
    const f = document.createElement('div');
    f.className = 'firefly';
    flies.appendChild(f);
  }
  scene.appendChild(flies);

  root.insertBefore(scene, root.firstChild);

  // iOS Safari sometimes needs an explicit play() after appending
  video.play().catch(() => {/* ignore — autoplay+muted is normally allowed */});
}

document.addEventListener('DOMContentLoaded', () => {
  const variant = document.body.dataset.forest;
  if (variant) renderForestScene('body', variant);
});
