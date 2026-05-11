/* 🎬 Forest scene — single-play intro video + bubble overlay
   For 'login' variant: plays ONCE, freezes on last frame.
   Bubbles rise continuously to keep the scene alive.
   Usage: <body data-forest="login|day|lake|sunlit|evening">
*/

const FOREST_VIDEOS = {
  login:   { src: 'img/video-compressed/login-intro.mp4',
             loop: false, bubbles: true },
  day:     { src: 'img/video-compressed/login-mongolian-steppe.mp4', loop: true },
  lake:    { src: 'img/video-compressed/dashboard-khovsgol.mp4', loop: true },
  sunlit:  { src: 'img/video-compressed/nohon-sunlit-forest.mp4', loop: true },
  evening: { src: 'img/video-compressed/admin-evening-mountain.mp4', loop: true }
};

const FOREST_POSTERS = {
  login:   'img/bg/login-mongolian-steppe.jpg',
  day:     'img/bg/login-mongolian-steppe.jpg',
  lake:    'img/bg/dashboard-khovsgol.jpg',
  sunlit:  'img/bg/nohon-sunlit-forest.jpg',
  evening: 'img/bg/admin-evening-mountain.jpg'
};

function spawnBubbles(scene, count = 24){
  const layer = document.createElement('div');
  layer.className = 'bubble-layer';
  for (let i = 0; i < count; i++){
    const b = document.createElement('span');
    b.className = 'bubble';
    const size = 8 + Math.random() * 36;          // 8-44px (bigger)
    const left = Math.random() * 100;
    const dur = 6 + Math.random() * 10;           // 6-16s rise (faster)
    const delay = -Math.random() * dur;
    const drift = (Math.random() * 80 - 40);      // -40 to +40 px sideways
    const opacity = 0.55 + Math.random() * 0.35;  // 0.55-0.90 max opacity
    b.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      --drift:${drift}px;
      --max-opacity:${opacity};
    `;
    layer.appendChild(b);
  }
  scene.appendChild(layer);
}

function renderForestScene(target = 'body', variant = 'day'){
  const root = document.querySelector(target);
  if (!root) return;
  root.querySelector('.forest-scene')?.remove();

  const scene = document.createElement('div');
  scene.className = `forest-scene forest-scene--${variant}`;

  const cfg = FOREST_VIDEOS[variant] || FOREST_VIDEOS.day;
  const poster = FOREST_POSTERS[variant];

  const v = document.createElement('video');
  v.className = 'forest-video';
  v.poster = poster || '';
  v.autoplay = true;
  v.muted = true;
  v.defaultMuted = true;
  v.loop = cfg.loop;
  v.playsInline = true;
  v.preload = 'auto';
  v.disablePictureInPicture = true;
  v.setAttribute('aria-hidden', 'true');
  v.setAttribute('disableremoteplayback', '');
  v.src = cfg.src;
  scene.appendChild(v);

  // Quick gentle slowdown — last 1.5 seconds ease from 1.0 → 0.5
  // Fast enough to feel intentional, never slow enough to feel frozen
  if (!cfg.loop){
    const SLOW_BAND = 1.5;   // start slowing 1.5 sec before end
    const MIN_RATE  = 0.5;   // floor rate (still 50% motion at the end)
    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      const remaining = v.duration - v.currentTime;
      if (remaining <= SLOW_BAND){
        const t = Math.max(0, remaining / SLOW_BAND);  // 0..1
        v.playbackRate = MIN_RATE + (1 - MIN_RATE) * t;
      }
    });
  }

  // Bubbles overlay (only for login)
  if (cfg.bubbles) spawnBubbles(scene, 8);

  // Fireflies overlay (skipped for login — bubbles replace them)
  if (!cfg.bubbles){
    const flies = document.createElement('div');
    flies.className = 'firefly-layer';
    for (let i = 0; i < 12; i++){
      const f = document.createElement('div');
      f.className = 'firefly';
      flies.appendChild(f);
    }
    scene.appendChild(flies);
  }

  root.insertBefore(scene, root.firstChild);

  // iOS Safari sometimes needs explicit play()
  v.play().catch(()=>{});
}

document.addEventListener('DOMContentLoaded', () => {
  const variant = document.body.dataset.forest;
  if (variant) renderForestScene('body', variant);
});
