/* ============================================================
   SafeWork — ХАБЭА удирдлагын систем
   Бүрэн ажиллагаатай хувилбар — өгөгдөл browser-т (localStorage) хадгалагдана.
   ============================================================ */
(function () {
'use strict';

/* ============ Үндсэн тогтмолууд ============ */
var LSKEY = 'safework_db_v2';
var USER = { name: 'Д. Ариунаа', initials: 'ДА', role: 'ХАБЭА-н мэргэжилтэн' };

/* ============ Firebase (monos-hab-system — үндсэн системтэй нэгдсэн) ============ */
var firebaseConfig = {
  apiKey: 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0',
  authDomain: 'monos-hab-system.firebaseapp.com',
  projectId: 'monos-hab-system',
  storageBucket: 'monos-hab-system.firebasestorage.app',
  messagingSenderId: '81969155633',
  appId: '1:81969155633:web:20dfac4abed86e0d0ccf10'
};
var fdb = null, fbReady = false, fauth = null;
try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    fdb = firebase.firestore();
    fauth = firebase.auth();
    fbReady = true;
  }
} catch (e) { fbReady = false; }

/* Firestore байршил: KPI-ийн бүх өгөгдөл нэг баримтад (kpi_state/main) */
var KPI_DOC = function () { return fdb.collection('kpi_state').doc('main'); };

/* Нэвтэрсэн хэрэглэгчийн сешн: { role:'admin' } эсвэл { role:'employee', empId, email, uid } */
var SESSION = null;
function isAdmin() { return SESSION && SESSION.role === 'admin'; }
function isEmp() { return SESSION && SESSION.role === 'employee'; }
function myEmp() { return SESSION && SESSION.empId ? DB.employees.filter(function (e) { return e.id === SESSION.empId; })[0] : null; }

/* Энгийн ажилтанд нуух хуудсууд (Илүү нээлттэй горим — өөрийн KPI/Шалгалт/ХХХ харна) */
var ADMIN_ONLY_PAGES = ['employees', 'incidents', 'council', 'teams', 'reports', 'dataflow', 'settings'];
function rand4() { return String(Math.floor(1000 + Math.random() * 9000)); }

var pageLabels = {
  dashboard: 'Хяналтын самбар', employees: 'Ажилтнууд', kpi: 'KPI үнэлгээ',
  hazards: 'Эрсдэл, аюул', incidents: 'Осол, гэмтэл', inspections: 'Шалгалт',
  suggestions: 'Сайжруулалтын санал', training: 'Сургалт', health: 'Эрүүл мэндийн үзлэг',
  ppe: 'ХХХ хяналт', council: 'ХАБЭА-н зөвлөл', teams: 'Teams интеграц',
  chatbot: 'Чат бот', reports: 'Тайлан', dataflow: 'Дата урсгал', settings: 'Тохиргоо'
};

var DEPTS = ['Цех №1', 'Цех №2', 'Цех №3', 'Захиргаа', 'Тээвэр', 'Үйлчилгээ'];
var AREAS = ['Цех №1', 'Цех №2', 'Цех №3', 'Захиргааны байр', 'Агуулах', 'Гадна талбай', 'Тээврийн зогсоол'];
var ROLES = ['Оператор', 'Технологич', 'Цех ахлагч', 'Цахилгаанчин', 'Гагнуурчин', 'Жолооч',
  'Нягтлан', 'Инженер', 'Слесарь', 'Угсрагч', 'Механикч', 'Чанарын шалгагч',
  'Агуулахын ажилтан', 'Туслах ажилтан', 'Хүний нөөцийн ажилтан', 'Менежер'];
var HAZARD_TYPES = ['Цахилгаан', 'Машин механизм', 'Гал', 'Хор', 'Бусад'];

/* ============ Жижиг туслахууд ============ */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function elc(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function num(v, d) { var n = parseFloat(v); return isNaN(n) ? (d || 0) : n; }
function pad(n) { return String(n).length < 3 ? ('00' + n).slice(-3) : String(n); }
function pageEl(p) { return $('.page[data-page="' + p + '"]'); }
function gauss(m, sd) {
  var s = 0; for (var i = 0; i < 3; i++) s += Math.random();
  return m + ((s / 3) - 0.5) * 2 * sd * 1.732;
}
function timeAgo(iso) {
  var diff = Date.now() - new Date(iso).getTime();
  var min = diff / 60000;
  if (min < 1) return 'Дөнгөж сая';
  if (min < 60) return Math.round(min) + ' мин';
  var hr = min / 60;
  if (hr < 24) return Math.round(hr) + ' ц';
  var d = hr / 24;
  if (d < 2) return 'өчигдөр';
  if (d < 7) return Math.round(d) + ' хоног';
  var dt = new Date(iso);
  return (dt.getMonth() + 1) + '-р сар ' + dt.getDate();
}
function hoursAgoISO(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function makeInitials(name) {
  var parts = String(name).replace(/[^Ѐ-ӿA-Za-z ]/g, '').trim().split(/\s+/);
  var s = parts.map(function (p) { return p.charAt(0); }).join('');
  return s.slice(0, 2).toUpperCase() || 'АА';
}

/* ============ Өгөгдлийн сан (localStorage) ============ */
var DB = null;

function seedEmployees() {
  var list = [];
  var named = [
    ['ДА', 'Д. Ариунаа', 'ХАБЭА-н мэргэжилтэн', 'Захиргаа', 96, 88, 94, 100, 92],
    ['БТ', 'Б. Туяа', 'Технологич', 'Цех №1', 92, 85, 90, 95, 84],
    ['МБ', 'М. Баатар', 'Цех ахлагч', 'Цех №3', 88, 82, 92, 90, 80],
    ['ОБ', 'О. Бат', 'Оператор', 'Цех №1', 84, 76, 88, 95, 70],
    ['ЦС', 'Ц. Сараа', 'Менежер', 'Захиргаа', 95, 92, 96, 100, 92],
    ['БЭ', 'Б. Энхбат', 'Цахилгаанчин', 'Цех №2', 78, 70, 82, 88, 66],
    ['ГН', 'Г. Намуун', 'Инженер', 'Захиргаа', 90, 75, 85, 92, 74],
    ['ДБ', 'Д. Болд', 'Гагнуурчин', 'Цех №3', 72, 68, 70, 80, 60],
    ['ЭТ', 'Э. Төгөлдөр', 'Жолооч', 'Тээвэр', 80, 78, 84, 90, 72],
    ['НО', 'Н. Оюун', 'Нягтлан', 'Захиргаа', 88, 82, 92, 100, 82]
  ];
  named.forEach(function (n, i) {
    list.push({
      id: 'EMP-' + pad(i + 1), initials: n[0], name: n[1], role: n[2], dept: n[3],
      training: n[4], participation: n[5], discipline: n[6], health: n[7], leadership: n[8],
      onLeave: false, pin: rand4()
    });
  });
  var given = ['Энхтуяа', 'Ганболд', 'Мөнхбат', 'Оюунчимэг', 'Батсайхан', 'Дэлгэрмаа', 'Тэмүүжин',
    'Сувд', 'Алтанцэцэг', 'Ганзориг', 'Нандинцэцэг', 'Болормаа', 'Эрдэнэбат', 'Цэцэгмаа',
    'Хүрэлбаатар', 'Анударь', 'Мягмарсүрэн', 'Золзаяа', 'Баярсайхан', 'Уранчимэг', 'Лхагвасүрэн',
    'Гэрэлмаа', 'Отгонбаатар', 'Сарангэрэл', 'Дашням', 'Энхжаргал', 'Пүрэвдорж', 'Намжилмаа',
    'Чимэддорж', 'Ариунзаяа', 'Баттулга', 'Долгормаа', 'Ганхуяг', 'Мөнхзул', 'Тэгшбаяр',
    'Оюунгэрэл', 'Батжаргал', 'Сэргэлэн', 'Хонгорзул', 'Энхбаяр', 'Мандахнаран', 'Бямбадорж'];
  var sur = ['А', 'Б', 'В', 'Г', 'Д', 'Ж', 'З', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Х', 'Ц', 'Ч', 'Ш', 'Э'];
  var deptPick = ['Цех №1', 'Цех №1', 'Цех №1', 'Цех №2', 'Цех №2', 'Цех №2', 'Цех №3', 'Цех №3', 'Захиргаа', 'Тээвэр', 'Үйлчилгээ'];
  var deptOff = { 'Цех №1': 5, 'Цех №2': -9, 'Цех №3': 1, 'Захиргаа': 8, 'Тээвэр': -3, 'Үйлчилгээ': -15 };
  var means = { training: 90, participation: 80, discipline: 88, health: 94, leadership: 76 };
  for (var i = 11; i <= 142; i++) {
    var dept = deptPick[Math.floor(Math.random() * deptPick.length)];
    var off = deptOff[dept];
    var gn = given[Math.floor(Math.random() * given.length)];
    var si = sur[Math.floor(Math.random() * sur.length)];
    var sc = function (m) { return clamp(Math.round(gauss(m + off, 8)), 46, 100); };
    list.push({
      id: 'EMP-' + pad(i), initials: si + gn.charAt(0), name: si + '. ' + gn,
      role: ROLES[Math.floor(Math.random() * ROLES.length)], dept: dept,
      training: sc(means.training), participation: sc(means.participation),
      discipline: sc(means.discipline), health: sc(means.health), leadership: sc(means.leadership),
      onLeave: Math.random() < 0.1
    });
  }
  return list;
}

function seedDB() {
  var hz = [
    ['Цахилгааны кабель ил гарсан', 'Цахилгаан', 'Цех №2', 3, 'open', 'teams', 'Б. Энхбат', 2],
    ['Тэсрэх бодис буруу хадгалагдсан', 'Хор', 'Агуулах', 5, 'open', 'bot', 'М. Баатар', 5],
    ['Гал унтраагуурын хугацаа дууссан', 'Гал', 'Захиргааны байр', 2, 'resolved', 'web', 'Ц. Сараа', 26],
    ['Кран чичирхийлэлтэй, шалгуулах', 'Машин механизм', 'Цех №3', 3, 'review', 'teams', 'О. Бат', 28],
    ['Шатны гэрэлтүүлэг бүдэг', 'Бусад', 'Захиргааны байр', 1, 'resolved', 'bot', 'Г. Намуун', 50],
    ['Шалны тэгш бус хэсэг', 'Бусад', 'Цех №1', 2, 'resolved', 'web', 'Б. Туяа', 92],
    ['Химийн бодисын хурц үнэр', 'Хор', 'Цех №2', 3, 'review', 'teams', 'Д. Болд', 120],
    ['Тоног төхөөрөмжийн хамгаалалт байхгүй', 'Машин механизм', 'Цех №1', 4, 'open', 'bot', 'О. Бат', 150],
    ['Дуу шуугиан хэвийн хэмжээнээс хэтэрсэн', 'Бусад', 'Цех №2', 2, 'resolved', 'web', 'Н. Оюун', 200],
    ['Гарцын тэмдэглэгээ баларсан', 'Бусад', 'Гадна талбай', 1, 'resolved', 'web', 'Э. Төгөлдөр', 260]
  ];
  var hazards = hz.map(function (h, i) {
    return {
      id: 'HZ-2026-' + pad(28 - i), title: h[0], type: h[1], location: h[2],
      severity: h[3], status: h[4], source: h[5], reporter: h[6],
      desc: '', createdAt: hoursAgoISO(h[7])
    };
  });

  var sg = [
    ['Цех №1-д агааржуулалт нэмэх', 'Зуны халуунд цехийн агаар бүгчим болдог. Нэмэлт сэнс болон агааржуулалтын систем суурилуулбал ажлын нөхцөл сайжирна.', 'Цех №1', 'done', 24, 'Ц. Сараа', 'ЦС', 1500],
    ['Эргономик сандал шинэчлэх', 'Оффисын сандал хуучирсан, нурууны өвчинд хүргэж байна. Эргономик сандлаар солих шаардлагатай.', 'Захиргаа', 'review', 18, 'Б. Туяа', 'БТ', 520],
    ['Шатны гэрэлтүүлэг сайжруулах', 'Шатанд хөдөлгөөн мэдрэгчтэй гэрэл суурилуулбал шөнийн цагт аюулгүй болно.', 'Захиргаа', 'new', 7, 'Г. Намуун', 'ГН', 22],
    ['Гар утасны апп — эрсдэл мэдээлэх', 'QR код уншуулж шууд эрсдэл мэдээлэх боломжтой гар утасны апп хийвэл хурдан болно.', 'Цех №3', 'done', 31, 'М. Баатар', 'МБ', 2900],
    ['Анхны тусламжийн хайрцаг шинэчлэх', 'Зарим хайрцагт эм дутуу, хугацаа дууссан зүйл байна. Сар бүр шалгаж нөхөх журам хэрэгтэй.', 'Цех №2', 'review', 11, 'Д. Болд', 'ДБ', 200],
    ['Цэвэр усны байрлал нэмэх', 'Цех №3-д ундны усны цэг хол байна. Ойр байрлуулбал ажилчдад дөхөм.', 'Цех №3', 'new', 5, 'О. Бат', 'ОБ', 70]
  ];
  var suggestions = sg.map(function (s, i) {
    return {
      id: 'SG-' + pad(i + 1), title: s[0], body: s[1], dept: s[2], status: s[3],
      votes: s[4], author: s[5], authorInitials: s[6], voted: false, createdAt: hoursAgoISO(s[7])
    };
  });

  var inc = [
    ['2025-12-29', 'light', 'Цех №2', 'Б. Дорж', 'Тэгш бус шалнаас унасан', 'resolved'],
    ['2025-11-12', 'near-miss', 'Цех №3', '', 'Краны чичирхийлэл — ослоос сэргийлсэн', 'closed'],
    ['2025-10-04', 'light', 'Агуулах', 'М. Цогт', 'ХХХ зөв ашиглаагүй', 'resolved'],
    ['2025-08-21', 'light', 'Цех №1', 'А. Бат', 'Тоног төхөөрөмжийн эвдрэл', 'resolved']
  ];
  var incidents = inc.map(function (n, i) {
    return {
      id: 'IN-' + pad(i + 1), date: n[0], type: n[1], location: n[2],
      injured: n[3], cause: n[4], status: n[5], createdAt: new Date(n[0] + 'T12:00:00').toISOString()
    };
  });

  return {
    settings: {
      org: { name: 'Үндэсний Үйлдвэрлэл ХХК', regNo: '6021234', sector: 'Хөнгөн үйлдвэр', headcount: 142, riskClass: 'Дунд' },
      weights: { training: 20, participation: 30, discipline: 25, health: 15, leadership: 10 }
    },
    employees: seedEmployees(),
    hazards: hazards,
    suggestions: suggestions,
    incidents: incidents,
    notifications: [
      { id: 'N1', text: 'Шинэ эрсдэл мэдээлэгдлээ — Цех №2', time: hoursAgoISO(2), read: false, page: 'hazards' },
      { id: 'N2', text: 'Сарын KPI тайлан бэлэн боллоо', time: hoursAgoISO(20), read: false, page: 'reports' },
      { id: 'N3', text: 'Сургалтын хугацаа 3 хоногийн дараа дуусна', time: hoursAgoISO(46), read: true, page: 'training' }
    ]
  };
}

function loadDB() {
  // Firestore-оос ачаална; интернэт/Firebase боломжгүй бол локал cache руу шилжинэ.
  return new Promise(function (resolve) {
    function useLocalOrSeed() {
      var fresh = false;
      try {
        var raw = localStorage.getItem(LSKEY);
        if (raw) { DB = JSON.parse(raw); if (!DB || !DB.employees || !DB.settings) { DB = seedDB(); fresh = true; } }
        else { DB = seedDB(); fresh = true; }
      } catch (e) { DB = seedDB(); fresh = true; }
      resolve(fresh);
    }
    if (!fbReady) { useLocalOrSeed(); return; }
    KPI_DOC().get().then(function (snap) {
      if (snap.exists && snap.data() && snap.data().employees && snap.data().settings) {
        DB = snap.data();
        try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
        resolve(false);
      } else {
        // Cloud хоосон — жишээ өгөгдөл үүсгэнэ (зөвхөн админ cloud руу бичнэ)
        DB = seedDB();
        try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
        if (isAdmin()) { KPI_DOC().set(DB).catch(function () {}); }
        resolve(true);
      }
    }).catch(function () { useLocalOrSeed(); });
  });
}
var _saveTimer = null;
function saveDB() {
  // Локал cache-д шууд хадгална
  try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
  // Cloud (Firestore) руу debounce-той бичнэ — бүх ажилтны мэдээлэл нэг газар
  if (!fbReady) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    KPI_DOC().set(DB).catch(function () { toast('Cloud-д хадгалахад алдаа гарлаа', 'error'); });
  }, 700);
}

/* ============ KPI тооцоо ============ */
function empTotal(e) {
  var w = DB.settings.weights;
  var t = (e.training * w.training + e.participation * w.participation +
           e.discipline * w.discipline + e.health * w.health + e.leadership * w.leadership) / 100;
  return Math.round(t);
}
function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
function avgKpi() { return avg(DB.employees.map(empTotal)); }
function categoryAverages() {
  var e = DB.employees;
  return {
    training: Math.round(avg(e.map(function (x) { return x.training; }))),
    participation: Math.round(avg(e.map(function (x) { return x.participation; }))),
    discipline: Math.round(avg(e.map(function (x) { return x.discipline; }))),
    health: Math.round(avg(e.map(function (x) { return x.health; }))),
    leadership: Math.round(avg(e.map(function (x) { return x.leadership; })))
  };
}
function dayCounter() {
  var acc = DB.incidents.filter(function (i) { return i.type !== 'near-miss'; });
  if (!acc.length) return 365;
  var latest = acc.map(function (i) { return new Date(i.date).getTime(); }).sort(function (a, b) { return b - a; })[0];
  return Math.max(0, Math.floor((Date.now() - latest) / 86400000));
}
function lastAccident() {
  var acc = DB.incidents.filter(function (i) { return i.type !== 'near-miss'; })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return acc[0] || null;
}
function nextHazardId() {
  var max = 28;
  DB.hazards.forEach(function (h) {
    var m = /(\d+)$/.exec(h.id); if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'HZ-2026-' + pad(max + 1);
}
function nextId(prefix, arr) {
  var max = 0;
  arr.forEach(function (x) { var m = /(\d+)$/.exec(x.id); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return prefix + '-' + pad(max + 1);
}
function scoreClass(s) { return s >= 90 ? 'score-high' : (s >= 75 ? 'score-mid' : 'score-low'); }

/* ============ Toast мэдэгдэл ============ */
var toastRoot;
function toast(msg, type) {
  type = type || 'success';
  if (!toastRoot) { toastRoot = elc('div', 'toast-wrap'); document.body.appendChild(toastRoot); }
  var icons = { success: 'ti-circle-check', warn: 'ti-alert-triangle', error: 'ti-alert-octagon', info: 'ti-info-circle' };
  var t = elc('div', 'toast toast-' + type, '<i class="ti ' + (icons[type] || icons.info) + '"></i><span>' + esc(msg) + '</span>');
  toastRoot.appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 10);
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, 3400);
}

/* ============ Modal ============ */
var modalRoot;
function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
  document.body.style.overflow = '';
}
function buildModal(title, contentNode, opts) {
  opts = opts || {};
  if (!modalRoot) { modalRoot = elc('div', 'modal-root'); document.body.appendChild(modalRoot); }
  var overlay = elc('div', 'modal-overlay');
  var modal = elc('div', 'modal');
  if (opts.width) modal.style.maxWidth = opts.width;
  var head = elc('div', 'modal-head', '<h3>' + esc(title) + '</h3>');
  var x = elc('button', 'modal-x', '<i class="ti ti-x"></i>');
  x.type = 'button'; x.addEventListener('click', closeModal);
  head.appendChild(x);
  var body = elc('div', 'modal-body');
  body.appendChild(contentNode);
  modal.appendChild(head); modal.appendChild(body);
  overlay.appendChild(modal);
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeModal(); });
  modalRoot.innerHTML = '';
  modalRoot.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  return { overlay: overlay, modal: modal, body: body };
}

/* Форм бүхий modal */
function formModal(opts) {
  var form = elc('form', 'form');
  opts.fields.forEach(function (f) {
    var grp = elc('div', 'form-group');
    grp.setAttribute('data-field', f.name);
    if (f.label) {
      grp.innerHTML = '<label>' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
    }
    var ctrl;
    if (f.type === 'textarea') {
      ctrl = elc('textarea'); ctrl.rows = f.rows || 3;
      if (f.placeholder) ctrl.placeholder = f.placeholder;
      if (f.value) ctrl.value = f.value;
    } else if (f.type === 'select') {
      ctrl = elc('select');
      (f.options || []).forEach(function (o) {
        var val = (o && o.value != null) ? o.value : o;
        var lbl = (o && o.label != null) ? o.label : o;
        var op = elc('option'); op.value = val; op.textContent = lbl;
        if (String(val) === String(f.value)) op.selected = true;
        ctrl.appendChild(op);
      });
    } else if (f.type === 'chips') {
      ctrl = elc('div', 'chip-select');
      (f.options || []).forEach(function (o, i) {
        var b = elc('button', 'chip-opt' + (i === 0 ? ' active' : ''), esc(o));
        b.type = 'button'; b.setAttribute('data-value', o);
        ctrl.appendChild(b);
      });
    } else if (f.type === 'severity') {
      ctrl = elc('div', 'severity-bar');
      ['1 · Бага', '2', '3 · Дунд', '4', '5 · Яаралтай'].forEach(function (lbl, i) {
        var b = elc('button', 'sev-btn' + (i === 2 ? ' active' : ''), lbl);
        b.type = 'button'; b.setAttribute('data-value', i + 1);
        ctrl.appendChild(b);
      });
    } else {
      ctrl = elc('input'); ctrl.type = f.type || 'text';
      if (f.placeholder) ctrl.placeholder = f.placeholder;
      if (f.value != null) ctrl.value = f.value;
      if (f.min != null) ctrl.min = f.min;
      if (f.max != null) ctrl.max = f.max;
    }
    grp.appendChild(ctrl);
    if (f.hint) grp.appendChild(elc('div', 'fld-hint', esc(f.hint)));
    form.appendChild(grp);
  });

  var foot = elc('div', 'modal-foot');
  var cancel = elc('button', 'btn btn-secondary', 'Цуцлах');
  cancel.type = 'button'; cancel.addEventListener('click', closeModal);
  var submit = elc('button', 'btn btn-primary', opts.submitLabel || 'Хадгалах');
  submit.type = 'submit';
  foot.appendChild(cancel); foot.appendChild(submit);

  var m = buildModal(opts.title, form, { width: opts.width || '480px' });
  m.modal.appendChild(foot);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var vals = {}, ok = true;
    opts.fields.forEach(function (f) {
      var grp = form.querySelector('[data-field="' + f.name + '"]');
      var v;
      if (f.type === 'chips') {
        var ca = grp.querySelector('.chip-opt.active'); v = ca ? ca.getAttribute('data-value') : '';
      } else if (f.type === 'severity') {
        var sa = grp.querySelector('.sev-btn.active'); v = sa ? parseInt(sa.getAttribute('data-value'), 10) : 3;
      } else {
        v = grp.querySelector('input,select,textarea').value;
        if (typeof v === 'string') v = v.trim();
      }
      if (f.required && !v) { ok = false; grp.classList.add('fld-error'); }
      else grp.classList.remove('fld-error');
      vals[f.name] = v;
    });
    if (!ok) { toast('Шаардлагатай талбарыг бөглөнө үү', 'warn'); return; }
    var res = opts.onSubmit(vals);
    if (res !== false) closeModal();
  });
  setTimeout(function () {
    var fi = form.querySelector('input,textarea,select'); if (fi) fi.focus();
  }, 60);
}

/* Мэдээлэл харуулах modal */
function infoModal(title, html, width) {
  var node = elc('div', 'modal-info', html);
  buildModal(title, node, { width: width || '460px' });
}

/* ============ Унждаг цэс (dropdown) ============ */
var activeMenu = null;
function closeMenu() { if (activeMenu) { activeMenu.remove(); activeMenu = null; } }
function openMenu(anchor, items, onSelect) {
  closeMenu();
  var menu = elc('div', 'menu');
  items.forEach(function (it) {
    if (it.sep) { menu.appendChild(elc('div', 'menu-sep')); return; }
    var mi = elc('div', 'menu-item' + (it.danger ? ' menu-item-danger' : ''),
      (it.icon ? '<i class="ti ' + it.icon + '"></i>' : '') + '<span>' + esc(it.label) + '</span>');
    mi.addEventListener('click', function () { closeMenu(); onSelect(it); });
    menu.appendChild(mi);
  });
  document.body.appendChild(menu);
  var r = anchor.getBoundingClientRect();
  menu.style.minWidth = Math.max(r.width, 170) + 'px';
  var left = r.left + window.scrollX;
  if (left + 230 > window.innerWidth) left = window.innerWidth - 240;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = (r.bottom + 6 + window.scrollY) + 'px';
  activeMenu = menu;
}

/* ============ Хуудас солих ============ */
function switchPage(pageId) {
  // Энгийн ажилтан админ хуудас руу орохыг хориглоно
  if (!isAdmin() && ADMIN_ONLY_PAGES.indexOf(pageId) >= 0) { pageId = 'dashboard'; }
  $$('.nav-item').forEach(function (it) {
    it.classList.toggle('active', it.getAttribute('data-page') === pageId);
  });
  $$('.page').forEach(function (p) {
    p.classList.toggle('active', p.getAttribute('data-page') === pageId);
  });
  var bc = $('#bcCurrent');
  if (bc) bc.textContent = pageLabels[pageId] || pageId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.innerWidth < 768) { var sb = $('#sidebar'); if (sb) sb.classList.remove('open'); }
  if (pageId === 'dashboard') setTimeout(renderCharts, 60);
}

/* ============ Sidebar badge-ууд ============ */
function renderSidebar() {
  var pending = DB.hazards.filter(function (h) { return h.status !== 'resolved'; }).length;
  var hb = $('.nav-item[data-page="hazards"] .nav-badge');
  if (hb) hb.textContent = pending;
  var eb = $('.nav-item[data-page="employees"] .nav-badge');
  if (eb) eb.textContent = DB.employees.length;
}

/* ============ Dashboard ============ */
function setStat(scopeSel, idx, value) {
  var nodes = $$(scopeSel + ' .stat-num');
  if (nodes[idx]) nodes[idx].textContent = value;
}
function renderDashboard() {
  var a = avgKpi();
  var hero = $('.page[data-page="dashboard"] .kpi-hero .kpi-value');
  if (hero) hero.innerHTML = a.toFixed(1) + '<span class="kpi-unit">/100</span>';
  var fill = $('.page[data-page="dashboard"] .kpi-hero .kpi-bar-fill');
  if (fill) fill.style.width = a.toFixed(1) + '%';

  var cards = $$('.page[data-page="dashboard"] .kpi-grid .kpi-card');
  if (cards[2]) {
    var v2 = cards[2].querySelector('.kpi-value');
    if (v2) v2.textContent = DB.hazards.length;
  }
  if (cards[3]) {
    var v3 = cards[3].querySelector('.kpi-value');
    if (v3) v3.textContent = dayCounter();
  }

  /* Хэлтсийн KPI */
  var deptList = $('.page[data-page="dashboard"] .dept-list');
  if (deptList) {
    var rows = DEPTS.map(function (d) {
      var emps = DB.employees.filter(function (e) { return e.dept === d; });
      return { dept: d, score: emps.length ? Math.round(avg(emps.map(empTotal))) : 0, n: emps.length };
    }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.score - a.score; });
    deptList.innerHTML = rows.map(function (r) {
      var color = r.score >= 85 ? 'var(--emerald)' : (r.score >= 70 ? 'var(--amber)' : 'var(--coral)');
      return '<div class="dept-row"><div class="dept-name">' + esc(r.dept) +
        ' · ' + r.n + ' ажилтан</div><div class="dept-bar-wrap"><div class="dept-bar" style="width:' +
        r.score + '%; background:' + color + '"></div></div><div class="dept-score">' + r.score + '</div></div>';
    }).join('');
  }
  renderActivity();
}

function renderActivity() {
  var list = $('.page[data-page="dashboard"] .activity-list');
  if (!list) return;
  var items = [];
  DB.hazards.forEach(function (h) {
    items.push({ at: h.createdAt, cls: 'act-warn', icon: 'ti-alert-triangle',
      title: h.title, meta: esc(h.location) + ' · ' + esc(h.reporter), src: h.source });
  });
  DB.suggestions.forEach(function (s) {
    items.push({ at: s.createdAt, cls: 'act-info', icon: 'ti-bulb',
      title: s.title, meta: esc(s.author) + ' · ' + esc(s.dept), src: 'web' });
  });
  DB.incidents.forEach(function (n) {
    items.push({ at: n.createdAt, cls: 'act-success', icon: 'ti-first-aid-kit',
      title: (n.type === 'near-miss' ? 'Бараг осол' : 'Осол') + ' — ' + n.cause, meta: esc(n.location), src: 'system' });
  });
  items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  var srcMap = { teams: ['src-teams', 'Teams'], bot: ['src-bot', 'Бот'], web: ['src-web', 'Вэб'], system: ['src-system', 'Систем'] };
  list.innerHTML = items.slice(0, 6).map(function (it) {
    var s = srcMap[it.src] || srcMap.system;
    return '<li><div class="act-icon ' + it.cls + '"><i class="ti ' + it.icon + '"></i></div>' +
      '<div class="act-body"><div class="act-title">' + esc(it.title) + '</div>' +
      '<div class="act-meta">' + it.meta + ' <span class="src ' + s[0] + '">' + s[1] + '</span></div></div>' +
      '<div class="act-time">' + timeAgo(it.at) + '</div></li>';
  }).join('');
}

/* ============ Ажилтнууд ============ */
var empState = { q: '', dept: '', role: '', sort: 'total-desc', page: 1, perPage: 10 };

function filteredEmployees() {
  var q = empState.q.toLowerCase().trim();
  var list = DB.employees.filter(function (e) {
    if (empState.dept && e.dept !== empState.dept) return false;
    if (empState.role && e.role !== empState.role) return false;
    if (q) {
      var hay = (e.name + ' ' + e.role + ' ' + e.id + ' ' + e.dept).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (empState.sort === 'name') return a.name.localeCompare(b.name, 'mn');
    if (empState.sort === 'total-asc') return empTotal(a) - empTotal(b);
    return empTotal(b) - empTotal(a);
  });
  return list;
}

function renderEmployees() {
  var tbody = $('#empTableBody');
  if (!tbody) return;
  var list = filteredEmployees();
  var total = list.length;
  var pages = Math.max(1, Math.ceil(total / empState.perPage));
  if (empState.page > pages) empState.page = pages;
  var start = (empState.page - 1) * empState.perPage;
  var rows = list.slice(start, start + empState.perPage);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">' +
      '<i class="ti ti-search-off"></i><div>Илэрц олдсонгүй</div></div></td></tr>';
  } else {
    tbody.innerHTML = rows.map(function (e) {
      var tot = empTotal(e);
      return '<tr data-emp="' + e.id + '">' +
        '<td><input type="checkbox"></td>' +
        '<td><div class="emp-cell"><div class="avatar avatar-sm">' + esc(e.initials) + '</div>' +
        '<div class="emp-info"><div class="emp-name">' + esc(e.name) +
        (e.onLeave ? ' <span class="tag tag-warn">Чөлөөтэй</span>' : '') +
        '</div><div class="emp-role">' + esc(e.role) + '</div></div></div></td>' +
        '<td>' + esc(e.dept) + '</td>' +
        '<td><span class="score-pill ' + scoreClass(e.training) + '">' + e.training + '</span></td>' +
        '<td><span class="score-pill ' + scoreClass(e.participation) + '">' + e.participation + '</span></td>' +
        '<td><span class="score-pill ' + scoreClass(e.discipline) + '">' + e.discipline + '</span></td>' +
        '<td><span class="score-pill ' + scoreClass(e.health) + '">' + e.health + '</span></td>' +
        '<td><strong style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:15px">' + tot + '</strong></td>' +
        '<td><button class="icon-btn-sm" data-emp-menu="' + e.id + '"><i class="ti ti-dots-vertical"></i></button></td>' +
        '</tr>';
    }).join('');
  }

  var footer = $('.page[data-page="employees"] .table-footer');
  if (footer) {
    var from = total ? start + 1 : 0;
    var to = Math.min(start + empState.perPage, total);
    var btns = '';
    for (var p = 1; p <= pages; p++) {
      if (pages > 7 && p > 2 && p < pages - 1 && Math.abs(p - empState.page) > 1) {
        if (p === 3 || p === pages - 2) btns += '<button class="page-btn" disabled>…</button>';
        continue;
      }
      btns += '<button class="page-btn' + (p === empState.page ? ' active' : '') + '" data-pnum="' + p + '">' + p + '</button>';
    }
    footer.innerHTML = '<div>' + from + '-' + to + ' / ' + total + ' ажилтан</div>' +
      '<div class="pagination"><button class="page-btn" data-pnum="prev"><i class="ti ti-chevron-left"></i></button>' +
      btns + '<button class="page-btn" data-pnum="next"><i class="ti ti-chevron-right"></i></button></div>';
  }

  setStat('.page[data-page="employees"] .stat-strip', 0, DB.employees.length);
  setStat('.page[data-page="employees"] .stat-strip', 1, DB.employees.filter(function (e) { return !e.onLeave; }).length);
  setStat('.page[data-page="employees"] .stat-strip', 2, DB.employees.filter(function (e) { return e.onLeave; }).length);
  setStat('.page[data-page="employees"] .stat-strip', 3, avgKpi().toFixed(1));
  setStat('.page[data-page="employees"] .stat-strip', 4, DB.employees.filter(function (e) { return empTotal(e) < 75; }).length);
}

/* ============ KPI хуудас ============ */
function renderKpiPage() {
  var w = DB.settings.weights;
  var order = ['training', 'participation', 'discipline', 'health', 'leadership'];
  var strongs = $$('.page[data-page="kpi"] .formula .f-term strong');
  order.forEach(function (k, i) {
    if (strongs[i]) strongs[i].textContent = (w[k] / 100).toFixed(2);
  });
  var cat = categoryAverages();
  var scores = $$('.page[data-page="kpi"] .kpi-cat-score');
  var ps = $$('.page[data-page="kpi"] .kpi-cat-head p');
  order.forEach(function (k, i) {
    if (scores[i]) {
      var v = cat[k];
      scores[i].textContent = v;
      scores[i].className = 'kpi-cat-score' + (v >= 88 ? '' : (v >= 75 ? ' warn' : ' danger'));
    }
    if (ps[i]) ps[i].textContent = 'Жин: ' + w[k] + '%';
  });
}

/* ============ Эрсдэл ============ */
function hazardStatusTag(s) {
  if (s === 'resolved') return '<span class="tag tag-emerald">Шийдвэрлэгдсэн</span>';
  if (s === 'review') return '<span class="tag tag-info">Хянагдаж буй</span>';
  return '<span class="tag tag-warn">Шийдвэрлэгдээгүй</span>';
}
function hazardSrcTag(s) {
  if (s === 'teams') return '<span class="src src-teams"><i class="ti ti-brand-teams"></i> Teams</span>';
  if (s === 'bot') return '<span class="src src-bot"><i class="ti ti-message-chatbot"></i> Чат бот</span>';
  return '<span class="src src-web"><i class="ti ti-world"></i> Вэб</span>';
}
function renderHazards() {
  var list = $('.page[data-page="hazards"] .hazard-list');
  if (list) {
    var sorted = DB.hazards.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    if (!sorted.length) {
      list.innerHTML = '<div class="empty-state"><i class="ti ti-shield-check"></i><div>Бүртгэгдсэн эрсдэл алга</div></div>';
    } else {
      list.innerHTML = sorted.slice(0, 12).map(function (h) {
        return '<li class="hazard-item" data-hz="' + h.id + '">' +
          '<div class="hazard-sev sev-' + h.severity + '">' + h.severity + '</div>' +
          '<div class="hazard-body"><div class="hazard-title">' + esc(h.title) + '</div>' +
          '<div class="hazard-meta">' + esc(h.location) + ' · ' + esc(h.reporter) + ' · ' + timeAgo(h.createdAt) + '</div>' +
          '<div class="hazard-tags">' + hazardSrcTag(h.source) + hazardStatusTag(h.status) + '</div></div></li>';
      }).join('');
    }
  }
  var now = new Date(), monthN = 0;
  DB.hazards.forEach(function (h) {
    var d = new Date(h.createdAt);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) monthN++;
  });
  var pending = DB.hazards.filter(function (h) { return h.status !== 'resolved'; }).length;
  var resolved = DB.hazards.filter(function (h) { return h.status === 'resolved'; }).length;
  var urgent = DB.hazards.filter(function (h) { return h.severity >= 4; }).length;
  setStat('.page[data-page="hazards"] .stat-strip', 0, monthN || DB.hazards.length);
  setStat('.page[data-page="hazards"] .stat-strip', 1, pending);
  setStat('.page[data-page="hazards"] .stat-strip', 2, resolved);
  setStat('.page[data-page="hazards"] .stat-strip', 3, urgent);
}

/* ============ Осол ============ */
function incidentTypeTag(t) {
  if (t === 'near-miss') return '<span class="tag tag-info">Бараг осол</span>';
  if (t === 'serious') return '<span class="tag tag-danger">Хүнд</span>';
  return '<span class="tag tag-warn">Хөнгөн</span>';
}
function incidentStatusTag(s) {
  if (s === 'open') return '<span class="tag tag-warn">Нээлттэй</span>';
  if (s === 'closed') return '<span class="tag tag-emerald">Хаалттай</span>';
  return '<span class="tag tag-emerald">Шийдвэрлэгдсэн</span>';
}
function renderIncidents() {
  var tbody = $('.page[data-page="incidents"] .data-table tbody');
  if (tbody) {
    var sorted = DB.incidents.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    tbody.innerHTML = sorted.map(function (n) {
      return '<tr data-inc="' + n.id + '"><td>' + esc(n.date) + '</td>' +
        '<td>' + incidentTypeTag(n.type) + '</td><td>' + esc(n.location) + '</td>' +
        '<td>' + (n.injured ? esc(n.injured) : '—') + '</td><td>' + esc(n.cause) + '</td>' +
        '<td>' + incidentStatusTag(n.status) + '</td></tr>';
    }).join('');
  }
  var dc = dayCounter();
  var cn = $('.page[data-page="incidents"] .counter-num');
  if (cn) cn.textContent = dc;
  var la = lastAccident();
  var cs = $('.page[data-page="incidents"] .counter-sub');
  if (cs) cs.textContent = la ? ('Сүүлчийн осол: ' + la.date + ' · ' + la.location) : 'Бүртгэгдсэн осол алга';
  var yr = new Date().getFullYear();
  setStat('.page[data-page="incidents"] .stat-strip', 0, dc);
  setStat('.page[data-page="incidents"] .stat-strip', 1, DB.incidents.filter(function (n) { return new Date(n.date).getFullYear() === yr && n.type !== 'near-miss'; }).length);
  setStat('.page[data-page="incidents"] .stat-strip', 2, DB.incidents.filter(function (n) { return n.type === 'near-miss'; }).length);
  setStat('.page[data-page="incidents"] .stat-strip', 3, DB.incidents.filter(function (n) { return n.type === 'serious'; }).length);
}

/* ============ Санал ============ */
function suggestStatusTag(s) {
  if (s === 'done') return '<span class="tag tag-emerald">Хэрэгжүүлсэн</span>';
  if (s === 'review') return '<span class="tag tag-warn">Хянагдаж буй</span>';
  return '<span class="tag tag-info">Шинэ</span>';
}
function renderSuggestions() {
  var grid = $('.page[data-page="suggestions"] .suggest-grid');
  if (grid) {
    var sorted = DB.suggestions.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    grid.innerHTML = sorted.map(function (s) {
      return '<div class="suggest-card" data-sg="' + s.id + '">' +
        '<div class="suggest-head">' + suggestStatusTag(s.status) +
        '<span class="suggest-votes' + (s.voted ? ' voted' : '') + '" data-vote="' + s.id + '">' +
        '<i class="ti ti-thumb-up"></i> ' + s.votes + '</span></div>' +
        '<h4>' + esc(s.title) + '</h4><p>' + esc(s.body) + '</p>' +
        '<div class="suggest-foot"><div class="avatar avatar-sm">' + esc(s.authorInitials) + '</div>' +
        '<span>' + esc(s.author) + ' · ' + timeAgo(s.createdAt) + '</span></div></div>';
    }).join('');
  }
  var yr = new Date().getFullYear();
  setStat('.page[data-page="suggestions"] .stat-strip', 0, DB.suggestions.filter(function (s) { return new Date(s.createdAt).getFullYear() === yr; }).length || DB.suggestions.length);
  setStat('.page[data-page="suggestions"] .stat-strip', 1, DB.suggestions.filter(function (s) { return s.status === 'done'; }).length);
  setStat('.page[data-page="suggestions"] .stat-strip', 2, DB.suggestions.filter(function (s) { return s.status === 'review'; }).length);
  setStat('.page[data-page="suggestions"] .stat-strip', 3, DB.suggestions.filter(function (s) { return s.status === 'new'; }).length);
}

/* ============ Тохиргоо ============ */
function renderSettings() {
  var o = DB.settings.org;
  var inputs = $$('.page[data-page="settings"] .settings-body .card:first-child .form input, .page[data-page="settings"] .settings-body .card:first-child .form select');
  /* Дараалал: нэр, регистр, салбар, ажилтны тоо, эрсдэлийн ангилал */
  var byOrder = $$('.page[data-page="settings"] .settings-body .form')[0];
  if (byOrder) {
    var f = byOrder.querySelectorAll('input,select');
    if (f[0]) f[0].value = o.name;
    if (f[1]) f[1].value = o.regNo;
    if (f[2]) f[2].value = o.sector;
    if (f[3]) f[3].value = o.headcount;
    if (f[4]) f[4].value = o.riskClass;
  }
  var w = DB.settings.weights;
  var order = ['training', 'participation', 'discipline', 'health', 'leadership'];
  var rows = $$('.page[data-page="settings"] .weight-row');
  rows.forEach(function (row, i) {
    var slider = row.querySelector('input[type="range"]');
    var val = row.querySelector('.weight-val');
    if (slider) slider.value = w[order[i]];
    if (val) val.textContent = w[order[i]] + '%';
  });
  updateWeightTotal();
}
function updateWeightTotal() {
  var total = 0;
  $$('.page[data-page="settings"] .weight-row input[type="range"]').forEach(function (s) { total += parseInt(s.value, 10); });
  var el = $('.page[data-page="settings"] .weight-total');
  if (el) {
    el.innerHTML = total === 100
      ? 'Нийт: <strong>' + total + '%</strong> ✓'
      : 'Нийт: <strong>' + total + '%</strong> — ' + (total < 100 ? 'дутуу байна' : 'илүү байна');
    el.style.background = total === 100 ? 'var(--emerald-light)' : 'var(--amber-light)';
    el.style.color = total === 100 ? 'var(--emerald-dark)' : 'var(--amber-dark)';
  }
  return total;
}

/* ============ Мэдэгдэл ============ */
function renderNotifBadge() {
  var unread = DB.notifications.filter(function (n) { return !n.read; }).length;
  var dot = $('.icon-btn.notif .notif-dot');
  if (dot) dot.style.display = unread ? 'block' : 'none';
}
function openNotifications(anchor) {
  closeMenu();
  var panel = elc('div', 'menu notif-panel');
  var head = elc('div', 'notif-head', '<strong>Мэдэгдэл</strong>' +
    '<button class="link-btn" data-notif-all>Бүгдийг уншсан</button>');
  panel.appendChild(head);
  if (!DB.notifications.length) {
    panel.appendChild(elc('div', 'notif-empty', 'Мэдэгдэл алга'));
  } else {
    DB.notifications.slice().reverse().forEach(function (n) {
      var item = elc('div', 'notif-item' + (n.read ? '' : ' unread'),
        '<div class="notif-dotmark"></div><div class="notif-body"><div>' + esc(n.text) +
        '</div><span>' + timeAgo(n.time) + '</span></div>');
      item.addEventListener('click', function () {
        n.read = true; saveDB(); renderNotifBadge(); closeMenu();
        if (n.page) switchPage(n.page);
      });
      panel.appendChild(item);
    });
  }
  document.body.appendChild(panel);
  var r = anchor.getBoundingClientRect();
  panel.style.width = '320px';
  panel.style.left = Math.max(8, r.right + window.scrollX - 320) + 'px';
  panel.style.top = (r.bottom + 8 + window.scrollY) + 'px';
  activeMenu = panel;
}
function addNotification(text, page) {
  DB.notifications.push({ id: 'N' + Date.now(), text: text, time: new Date().toISOString(), read: false, page: page });
}

/* ============ Графикууд ============ */
var charts = { radar: null, trend: null };
function renderCharts() {
  if (typeof Chart === 'undefined') {
    $$('#kpiRadar, #trendChart').forEach(function (c) {
      if (c && !c.dataset.fb) {
        c.dataset.fb = '1';
        var d = elc('div', 'chart-fallback', '<i class="ti ti-chart-dots"></i> График ачаалж чадсангүй');
        c.parentNode.insertBefore(d, c.nextSibling);
      }
    });
    return;
  }
  var radarEl = $('#kpiRadar');
  if (radarEl) {
    if (charts.radar) charts.radar.destroy();
    var cat = categoryAverages();
    var cur = [cat.training, cat.participation, cat.discipline, cat.health, cat.leadership];
    var prev = cur.map(function (v) { return Math.max(0, v - 3 - Math.round(Math.random() * 2)); });
    charts.radar = new Chart(radarEl.getContext('2d'), {
      type: 'radar',
      data: {
        labels: [['Сургалт'], ['Идэвхтэй', 'оролцоо'], ['Дүрэм', 'сахилт'], ['Эрүүл мэнд'], ['Манлайлал']],
        datasets: [
          { label: 'Энэ сар', data: cur, backgroundColor: 'rgba(4,120,87,0.15)', borderColor: 'rgba(4,120,87,1)',
            borderWidth: 2, pointBackgroundColor: 'rgba(4,120,87,1)', pointRadius: 4, pointHoverRadius: 6 },
          { label: 'Өмнөх сар', data: prev, backgroundColor: 'rgba(217,119,6,0.08)', borderColor: 'rgba(217,119,6,0.6)',
            borderWidth: 1.5, borderDash: [4, 4], pointBackgroundColor: 'rgba(217,119,6,1)', pointRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Manrope', size: 12 }, padding: 14, usePointStyle: true } } },
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, display: false },
          grid: { color: 'rgba(26,24,21,0.06)' }, angleLines: { color: 'rgba(26,24,21,0.08)' },
          pointLabels: { font: { family: 'Manrope', size: 11, weight: '600' }, color: '#1A1815' } } }
      }
    });
  }
  var trendEl = $('#trendChart');
  if (trendEl) {
    if (charts.trend) charts.trend.destroy();
    var months = ['6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р', '1-р', '2-р', '3-р', '4-р', '5-р'];
    charts.trend = new Chart(trendEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          { label: 'KPI дундаж', data: [78, 80, 79, 82, 84, 83, 85, 84, 86, 85, 87, avgKpi()],
            borderColor: '#047857',
            backgroundColor: function (ctx) {
              var ch = ctx.chart, area = ch.chartArea; if (!area) return null;
              var g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, 'rgba(4,120,87,0.2)'); g.addColorStop(1, 'rgba(4,120,87,0)');
              return g;
            },
            borderWidth: 2.5, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5 },
          { label: 'Мэдээлсэн эрсдэл', data: [15, 18, 12, 20, 22, 19, 25, 18, 22, 24, 26, DB.hazards.length],
            borderColor: '#D97706', backgroundColor: 'transparent', borderWidth: 2, tension: 0.35,
            pointRadius: 0, pointHoverRadius: 5, yAxisID: 'y1' },
          { label: 'Осол', data: [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
            borderColor: '#DC2626', backgroundColor: 'transparent', borderWidth: 2, tension: 0.35,
            pointRadius: 0, pointHoverRadius: 5, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Manrope', size: 12 }, padding: 14, usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: '#1A1815', padding: 12, cornerRadius: 8 }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Manrope', size: 11 }, color: '#908A80' } },
          y: { min: 0, max: 100, grid: { color: 'rgba(26,24,21,0.05)' }, ticks: { font: { family: 'Manrope', size: 11 }, color: '#908A80', stepSize: 25 } },
          y1: { position: 'right', min: 0, max: 35, grid: { display: false }, ticks: { font: { family: 'Manrope', size: 11 }, color: '#908A80', stepSize: 10 } }
        }
      }
    });
  }
}

/* ============ Бүгдийг дахин зурах ============ */
function renderAll() {
  renderSidebar();
  renderDashboard();
  renderEmployees();
  renderKpiPage();
  renderHazards();
  renderIncidents();
  renderSuggestions();
  renderSettings();
  renderNotifBadge();
}

/* ============ Үйлдлүүд: Эрсдэл мэдээлэх ============ */
function createHazard(data) {
  var h = {
    id: nextHazardId(), title: data.title, type: data.type || 'Бусад',
    location: data.location || AREAS[0], severity: data.severity || 3,
    status: 'open', source: data.source || 'web', reporter: USER.name,
    desc: data.desc || '', createdAt: new Date().toISOString()
  };
  DB.hazards.unshift(h);
  addNotification('Шинэ эрсдэл: ' + h.title, 'hazards');
  saveDB();
  renderHazards(); renderDashboard(); renderSidebar(); renderNotifBadge();
  if (charts.trend) renderCharts();
  toast('Эрсдэл бүртгэгдлээ — ' + h.id);
}
function actionReportHazard() {
  formModal({
    title: 'Шинэ эрсдэл мэдээлэх',
    fields: [
      { name: 'title', label: 'Гарчиг', type: 'text', required: true, placeholder: 'Юу болсон тухай товч...' },
      { name: 'type', label: 'Эрсдэлийн төрөл', type: 'chips', options: HAZARD_TYPES },
      { name: 'location', label: 'Байршил', type: 'select', options: AREAS },
      { name: 'desc', label: 'Дэлгэрэнгүй тайлбар', type: 'textarea', placeholder: 'Юу харсан, юу болсон талаар...' },
      { name: 'severity', label: 'Яаралтай байдал', type: 'severity' }
    ],
    submitLabel: 'Илгээх',
    onSubmit: function (v) { createHazard(v); }
  });
}
/* Хуудсан дахь шууд форм */
function submitInlineHazard(form) {
  var typeBtn = form.querySelector('.chip-opt.active');
  var sel = form.querySelector('select');
  var ta = form.querySelector('textarea');
  var sevBtn = form.querySelector('.sev-btn.active');
  var title = ta && ta.value.trim();
  if (!title) {
    if (ta) ta.focus();
    toast('Тайлбар хэсгийг бөглөнө үү', 'warn');
    return;
  }
  createHazard({
    title: title.length > 60 ? title.slice(0, 60) + '…' : title,
    desc: title,
    type: typeBtn ? typeBtn.textContent.trim() : 'Бусад',
    location: sel ? sel.value : AREAS[0],
    severity: sevBtn ? parseInt(sevBtn.getAttribute('data-value') || '3', 10) : 3
  });
  if (ta) ta.value = '';
}

/* Эрсдэлийн дэлгэрэнгүй */
function openHazardDetail(id) {
  var h = DB.hazards.filter(function (x) { return x.id === id; })[0];
  if (!h) return;
  var html = '<div class="detail-grid">' +
    '<div class="detail-row"><span>Дугаар</span><b>' + esc(h.id) + '</b></div>' +
    '<div class="detail-row"><span>Төрөл</span><b>' + esc(h.type) + '</b></div>' +
    '<div class="detail-row"><span>Байршил</span><b>' + esc(h.location) + '</b></div>' +
    '<div class="detail-row"><span>Мэдээлсэн</span><b>' + esc(h.reporter) + '</b></div>' +
    '<div class="detail-row"><span>Яаралтай байдал</span><b>' + h.severity + ' / 5</b></div>' +
    '<div class="detail-row"><span>Огноо</span><b>' + new Date(h.createdAt).toLocaleString('mn-MN') + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + hazardStatusTag(h.status) + '</b></div>' +
    '</div>' +
    (h.desc ? '<p class="detail-desc">' + esc(h.desc) + '</p>' : '') +
    '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-hzstatus="open">Хүлээгдэж буй</button>' +
    '<button class="btn btn-secondary" data-hzstatus="review">Хянаж байна</button>' +
    '<button class="btn btn-primary" data-hzstatus="resolved">Шийдвэрлэсэн</button></div>';
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (e) {
    var b = e.target.closest('[data-hzstatus]');
    if (!b) return;
    h.status = b.getAttribute('data-hzstatus');
    saveDB();
    renderHazards(); renderDashboard(); renderSidebar();
    closeModal();
    toast('Эрсдэлийн төлөв шинэчлэгдлээ');
  });
  buildModal(esc(h.title), node, { width: '460px' });
}

/* ============ Үйлдлүүд: Санал ============ */
function actionAddSuggestion() {
  formModal({
    title: 'Сайжруулалтын санал гаргах',
    fields: [
      { name: 'title', label: 'Гарчиг', type: 'text', required: true, placeholder: 'Саналын товч нэр' },
      { name: 'dept', label: 'Хэлтэс', type: 'select', options: DEPTS },
      { name: 'body', label: 'Дэлгэрэнгүй', type: 'textarea', required: true, rows: 4, placeholder: 'Асуудал ба санал болгож буй шийдэл...' }
    ],
    submitLabel: 'Илгээх',
    onSubmit: function (v) {
      var s = {
        id: nextId('SG', DB.suggestions), title: v.title, body: v.body, dept: v.dept,
        status: 'new', votes: 0, author: USER.name, authorInitials: USER.initials,
        voted: false, createdAt: new Date().toISOString()
      };
      DB.suggestions.unshift(s);
      addNotification('Шинэ санал: ' + s.title, 'suggestions');
      saveDB();
      renderSuggestions(); renderDashboard(); renderNotifBadge();
      toast('Таны санал бүртгэгдлээ');
    }
  });
}
function openSuggestionDetail(id) {
  var s = DB.suggestions.filter(function (x) { return x.id === id; })[0];
  if (!s) return;
  var html = '<p class="detail-desc">' + esc(s.body) + '</p>' +
    '<div class="detail-grid">' +
    '<div class="detail-row"><span>Гаргасан</span><b>' + esc(s.author) + '</b></div>' +
    '<div class="detail-row"><span>Хэлтэс</span><b>' + esc(s.dept) + '</b></div>' +
    '<div class="detail-row"><span>Дэмжсэн</span><b>' + s.votes + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + suggestStatusTag(s.status) + '</b></div></div>' +
    '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-sgstatus="new">Шинэ</button>' +
    '<button class="btn btn-secondary" data-sgstatus="review">Хянагдаж буй</button>' +
    '<button class="btn btn-primary" data-sgstatus="done">Хэрэгжүүлсэн</button></div>';
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sgstatus]');
    if (!b) return;
    s.status = b.getAttribute('data-sgstatus');
    saveDB(); renderSuggestions(); closeModal();
    toast('Саналын төлөв шинэчлэгдлээ');
  });
  buildModal(esc(s.title), node, { width: '440px' });
}

/* ============ Үйлдлүүд: Ажилтан ============ */
function actionAddEmployee() {
  formModal({
    title: 'Шинэ ажилтан нэмэх',
    width: '520px',
    fields: [
      { name: 'name', label: 'Овог нэр', type: 'text', required: true, placeholder: 'Ж: Б. Болд' },
      { name: 'role', label: 'Албан тушаал', type: 'select', options: ROLES },
      { name: 'dept', label: 'Хэлтэс', type: 'select', options: DEPTS },
      { name: 'training', label: 'Сургалт (0-100)', type: 'number', value: 80, min: 0, max: 100 },
      { name: 'participation', label: 'Идэвхтэй оролцоо (0-100)', type: 'number', value: 75, min: 0, max: 100 },
      { name: 'discipline', label: 'Дүрэм сахилт (0-100)', type: 'number', value: 80, min: 0, max: 100 },
      { name: 'health', label: 'Эрүүл мэнд (0-100)', type: 'number', value: 90, min: 0, max: 100 },
      { name: 'leadership', label: 'Манлайлал (0-100)', type: 'number', value: 70, min: 0, max: 100 }
    ],
    submitLabel: 'Нэмэх',
    onSubmit: function (v) {
      var e = {
        id: nextId('EMP', DB.employees), initials: makeInitials(v.name), name: v.name,
        role: v.role, dept: v.dept,
        training: clamp(num(v.training, 80), 0, 100), participation: clamp(num(v.participation, 75), 0, 100),
        discipline: clamp(num(v.discipline, 80), 0, 100), health: clamp(num(v.health, 90), 0, 100),
        leadership: clamp(num(v.leadership, 70), 0, 100), onLeave: false
      };
      DB.employees.unshift(e);
      saveDB();
      empState.page = 1;
      renderEmployees(); renderDashboard(); renderKpiPage(); renderSidebar();
      if (charts.radar) renderCharts();
      toast('Ажилтан нэмэгдлээ — ' + e.name);
    }
  });
}
function openEmployeeDetail(id) {
  var e = DB.employees.filter(function (x) { return x.id === id; })[0];
  if (!e) return;
  var w = DB.settings.weights;
  var cats = [
    ['Сургалт, мэдлэг', e.training, w.training],
    ['Идэвхтэй оролцоо', e.participation, w.participation],
    ['Дүрэм сахилт', e.discipline, w.discipline],
    ['Эрүүл мэнд, осол', e.health, w.health],
    ['Манлайлал', e.leadership, w.leadership]
  ];
  var html = '<div class="detail-grid">' +
    '<div class="detail-row"><span>Албан тушаал</span><b>' + esc(e.role) + '</b></div>' +
    '<div class="detail-row"><span>Хэлтэс</span><b>' + esc(e.dept) + '</b></div>' +
    '<div class="detail-row"><span>Код</span><b>' + esc(e.id) + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + (e.onLeave ? 'Чөлөөтэй' : 'Идэвхтэй') + '</b></div></div>' +
    '<div class="kpi-breakdown">' + cats.map(function (c) {
      return '<div class="kb-row"><div class="kb-name">' + esc(c[0]) + ' <small>· жин ' + c[2] + '%</small></div>' +
        '<div class="kb-bar"><div class="kb-fill" style="width:' + c[1] + '%"></div></div>' +
        '<div class="kb-val">' + c[1] + '</div></div>';
    }).join('') + '</div>' +
    '<div class="kb-total">Нийт KPI оноо: <strong>' + empTotal(e) + ' / 100</strong></div>' +
    '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-emp-leave="' + e.id + '">' +
    (e.onLeave ? 'Идэвхтэй болгох' : 'Чөлөө олгох') + '</button>' +
    '<button class="btn btn-primary" data-emp-edit="' + e.id + '">Оноо засах</button></div>';
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (ev) {
    var lv = ev.target.closest('[data-emp-leave]');
    if (lv) { e.onLeave = !e.onLeave; saveDB(); renderEmployees(); closeModal(); toast('Ажилтны төлөв шинэчлэгдлээ'); return; }
    var ed = ev.target.closest('[data-emp-edit]');
    if (ed) { closeModal(); editEmployeeScores(e.id); }
  });
  buildModal(esc(e.name), node, { width: '480px' });
}
function editEmployeeScores(id) {
  var e = DB.employees.filter(function (x) { return x.id === id; })[0];
  if (!e) return;
  formModal({
    title: 'Оноо засах — ' + e.name,
    fields: [
      { name: 'training', label: 'Сургалт', type: 'number', value: e.training, min: 0, max: 100 },
      { name: 'participation', label: 'Идэвхтэй оролцоо', type: 'number', value: e.participation, min: 0, max: 100 },
      { name: 'discipline', label: 'Дүрэм сахилт', type: 'number', value: e.discipline, min: 0, max: 100 },
      { name: 'health', label: 'Эрүүл мэнд', type: 'number', value: e.health, min: 0, max: 100 },
      { name: 'leadership', label: 'Манлайлал', type: 'number', value: e.leadership, min: 0, max: 100 }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      e.training = clamp(num(v.training), 0, 100);
      e.participation = clamp(num(v.participation), 0, 100);
      e.discipline = clamp(num(v.discipline), 0, 100);
      e.health = clamp(num(v.health), 0, 100);
      e.leadership = clamp(num(v.leadership), 0, 100);
      saveDB();
      renderEmployees(); renderDashboard(); renderKpiPage();
      if (charts.radar) renderCharts();
      toast('Ажилтны оноо шинэчлэгдлээ');
    }
  });
}

/* ============ Үйлдлүүд: Осол ============ */
function actionReportIncident() {
  formModal({
    title: 'Осол бүртгэх',
    fields: [
      { name: 'date', label: 'Огноо', type: 'date', value: todayISO(), required: true },
      { name: 'type', label: 'Төрөл', type: 'select', value: 'light',
        options: [{ value: 'near-miss', label: 'Бараг осол' }, { value: 'light', label: 'Хөнгөн осол' }, { value: 'serious', label: 'Хүнд осол' }] },
      { name: 'location', label: 'Байршил', type: 'select', options: AREAS },
      { name: 'injured', label: 'Гэмтсэн хүн (хэрэв байгаа бол)', type: 'text', placeholder: 'Нэр' },
      { name: 'cause', label: 'Шалтгаан / тайлбар', type: 'text', required: true, placeholder: 'Юунаас болсон' },
      { name: 'status', label: 'Төлөв', type: 'select', value: 'open',
        options: [{ value: 'open', label: 'Нээлттэй' }, { value: 'resolved', label: 'Шийдвэрлэсэн' }, { value: 'closed', label: 'Хаалттай' }] }
    ],
    submitLabel: 'Бүртгэх',
    onSubmit: function (v) {
      var n = {
        id: nextId('IN', DB.incidents), date: v.date, type: v.type, location: v.location,
        injured: v.injured || '', cause: v.cause, status: v.status,
        createdAt: new Date().toISOString()
      };
      DB.incidents.unshift(n);
      addNotification('Осол бүртгэгдлээ — ' + n.location, 'incidents');
      saveDB();
      renderIncidents(); renderDashboard(); renderNotifBadge();
      toast('Осол бүртгэгдлээ');
    }
  });
}
function openIncidentDetail(id) {
  var n = DB.incidents.filter(function (x) { return x.id === id; })[0];
  if (!n) return;
  var html = '<div class="detail-grid">' +
    '<div class="detail-row"><span>Огноо</span><b>' + esc(n.date) + '</b></div>' +
    '<div class="detail-row"><span>Төрөл</span><b>' + incidentTypeTag(n.type) + '</b></div>' +
    '<div class="detail-row"><span>Байршил</span><b>' + esc(n.location) + '</b></div>' +
    '<div class="detail-row"><span>Гэмтсэн</span><b>' + (n.injured ? esc(n.injured) : '—') + '</b></div>' +
    '<div class="detail-row"><span>Шалтгаан</span><b>' + esc(n.cause) + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + incidentStatusTag(n.status) + '</b></div></div>' +
    '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-incstatus="open">Нээлттэй</button>' +
    '<button class="btn btn-secondary" data-incstatus="resolved">Шийдвэрлэсэн</button>' +
    '<button class="btn btn-primary" data-incstatus="closed">Хаах</button></div>';
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (e) {
    var b = e.target.closest('[data-incstatus]');
    if (!b) return;
    n.status = b.getAttribute('data-incstatus');
    saveDB(); renderIncidents(); closeModal();
    toast('Ослын төлөв шинэчлэгдлээ');
  });
  buildModal('Ослын мэдээлэл', node, { width: '460px' });
}

/* ============ Тохиргоо хадгалах ============ */
function saveOrgSettings() {
  var form = $$('.page[data-page="settings"] .settings-body .form')[0];
  if (!form) return;
  var f = form.querySelectorAll('input,select');
  DB.settings.org = {
    name: f[0] ? f[0].value.trim() : '',
    regNo: f[1] ? f[1].value.trim() : '',
    sector: f[2] ? f[2].value : '',
    headcount: f[3] ? num(f[3].value, 0) : 0,
    riskClass: f[4] ? f[4].value : ''
  };
  saveDB();
  toast('Байгууллагын мэдээлэл хадгалагдлаа');
}
function saveWeights() {
  var rows = $$('.page[data-page="settings"] .weight-row');
  var order = ['training', 'participation', 'discipline', 'health', 'leadership'];
  var vals = {}, total = 0;
  rows.forEach(function (row, i) {
    var s = row.querySelector('input[type="range"]');
    var v = s ? parseInt(s.value, 10) : 0;
    vals[order[i]] = v; total += v;
  });
  if (total !== 100) {
    toast('Жингийн нийлбэр 100% байх ёстой (одоо ' + total + '%)', 'warn');
    return;
  }
  DB.settings.weights = vals;
  saveDB();
  renderAll();
  renderCharts();
  toast('KPI-ийн жин хадгалагдаж, бүх оноо дахин тооцоологдлоо');
}

/* ============ Тайлан / экспорт ============ */
function download(filename, content, mime) {
  var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = elc('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
function exportEmployeesCSV() {
  var head = ['Код', 'Нэр', 'Албан тушаал', 'Хэлтэс', 'Сургалт', 'Оролцоо', 'Дүрэм', 'Эрүүл мэнд', 'Манлайлал', 'Нийт оноо'];
  var lines = [head];
  filteredEmployees().forEach(function (e) {
    lines.push([e.id, e.name, e.role, e.dept, e.training, e.participation, e.discipline, e.health, e.leadership, empTotal(e)]);
  });
  var csv = '﻿' + lines.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  download('SafeWork-ajiltnuud-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
  toast('Excel файл (CSV) татагдлаа');
}
function downloadReport() {
  var a = avgKpi(), cat = categoryAverages();
  var deptRows = DEPTS.map(function (d) {
    var emps = DB.employees.filter(function (e) { return e.dept === d; });
    return { d: d, n: emps.length, s: emps.length ? Math.round(avg(emps.map(empTotal))) : 0 };
  }).filter(function (r) { return r.n; }).sort(function (x, y) { return y.s - x.s; });
  var html = '<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8">' +
    '<title>SafeWork ХАБЭА тайлан</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#1A1815;max-width:780px;margin:32px auto;padding:0 24px;}' +
    'h1{font-size:22px;}h2{font-size:15px;margin-top:26px;border-bottom:2px solid #047857;padding-bottom:4px;}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;}' +
    'th,td{border:1px solid #ddd;padding:7px 9px;text-align:left;}th{background:#F5F2EA;}' +
    '.big{font-size:34px;font-weight:bold;color:#047857;}.muted{color:#777;font-size:12px;}' +
    '</style></head><body>' +
    '<h1>SafeWork — ХАБЭА удирдлагын тайлан</h1>' +
    '<div class="muted">' + esc(DB.settings.org.name) + ' · Гаргасан: ' + new Date().toLocaleString('mn-MN') + '</div>' +
    '<h2>Ерөнхий үзүүлэлт</h2>' +
    '<p>Нийт KPI дундаж оноо: <span class="big">' + a.toFixed(1) + '</span> / 100</p>' +
    '<table><tr><th>Үзүүлэлт</th><th>Утга</th></tr>' +
    '<tr><td>Нийт ажилтан</td><td>' + DB.employees.length + '</td></tr>' +
    '<tr><td>Мэдээлсэн эрсдэл</td><td>' + DB.hazards.length + ' (' +
    DB.hazards.filter(function (h) { return h.status !== 'resolved'; }).length + ' шийдвэрлэгдээгүй)</td></tr>' +
    '<tr><td>Осолгүй өдөр</td><td>' + dayCounter() + '</td></tr>' +
    '<tr><td>Сайжруулалтын санал</td><td>' + DB.suggestions.length + '</td></tr></table>' +
    '<h2>KPI ангиллын дундаж</h2><table><tr><th>Ангилал</th><th>Оноо</th></tr>' +
    '<tr><td>Сургалт, мэдлэг</td><td>' + cat.training + '</td></tr>' +
    '<tr><td>Идэвхтэй оролцоо</td><td>' + cat.participation + '</td></tr>' +
    '<tr><td>Дүрэм сахилт</td><td>' + cat.discipline + '</td></tr>' +
    '<tr><td>Эрүүл мэнд, осол</td><td>' + cat.health + '</td></tr>' +
    '<tr><td>Манлайлал</td><td>' + cat.leadership + '</td></tr></table>' +
    '<h2>Хэлтсийн KPI</h2><table><tr><th>Хэлтэс</th><th>Ажилтан</th><th>Дундаж оноо</th></tr>' +
    deptRows.map(function (r) { return '<tr><td>' + esc(r.d) + '</td><td>' + r.n + '</td><td>' + r.s + '</td></tr>'; }).join('') +
    '</table><p class="muted" style="margin-top:30px">Энэхүү тайланг SafeWork ХАБЭА систем автоматаар үүсгэв.</p>' +
    '</body></html>';
  download('SafeWork-tailan-' + todayISO() + '.html', html, 'text/html;charset=utf-8');
  toast('Тайлан татагдлаа (.html — хэвлэх боломжтой)');
}

/* ============ Дэлхийн хайлт ============ */
function globalSearch(q) {
  q = q.toLowerCase().trim();
  if (!q) return;
  var res = [];
  DB.employees.forEach(function (e) {
    if ((e.name + ' ' + e.role).toLowerCase().indexOf(q) > -1)
      res.push({ icon: 'ti-user', label: e.name, sub: e.role + ' · ' + e.dept, page: 'employees', act: function () { openEmployeeDetail(e.id); } });
  });
  DB.hazards.forEach(function (h) {
    if (h.title.toLowerCase().indexOf(q) > -1)
      res.push({ icon: 'ti-alert-triangle', label: h.title, sub: h.id + ' · ' + h.location, page: 'hazards', act: function () { openHazardDetail(h.id); } });
  });
  DB.suggestions.forEach(function (s) {
    if (s.title.toLowerCase().indexOf(q) > -1)
      res.push({ icon: 'ti-bulb', label: s.title, sub: 'Санал · ' + s.dept, page: 'suggestions', act: function () { openSuggestionDetail(s.id); } });
  });
  var node = elc('div', 'search-results');
  if (!res.length) {
    node.innerHTML = '<div class="empty-state"><i class="ti ti-search-off"></i><div>«' + esc(q) + '» — илэрц олдсонгүй</div></div>';
  } else {
    res.slice(0, 20).forEach(function (r) {
      var item = elc('div', 'search-item', '<i class="ti ' + r.icon + '"></i><div><div class="si-label">' +
        esc(r.label) + '</div><div class="si-sub">' + esc(r.sub) + '</div></div>');
      item.addEventListener('click', function () { closeModal(); switchPage(r.page); setTimeout(r.act, 120); });
      node.appendChild(item);
    });
  }
  buildModal('Хайлтын илэрц — «' + esc(q) + '»', node, { width: '520px' });
}

/* ============ Тусламж ============ */
function openHelp() {
  infoModal('Тусламж — SafeWork систем',
    '<div class="help-body">' +
    '<p>Энэхүү систем нь ХАБЭА (Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй)-н удирдлагын самбар юм.</p>' +
    '<ul>' +
    '<li><b>Эрсдэл, аюул</b> — товчоор шинэ эрсдэл мэдээлж, төлөвийг нь хянана.</li>' +
    '<li><b>Ажилтнууд</b> — KPI оноо, хайлт, шүүлт, шинэ ажилтан нэмэх.</li>' +
    '<li><b>KPI үнэлгээ</b> — 5 ангиллын жинтэй оноо. Жинг Тохиргоо хэсгээс өөрчилнө.</li>' +
    '<li><b>Сайжруулалтын санал, Осол</b> — бүртгэх, төлөв өөрчлөх.</li>' +
    '</ul>' +
    '<p class="muted">Таны оруулсан бүх мэдээлэл энэ компьютерийн browser-т автоматаар хадгалагдана. ' +
    'Анхдагч жишээ өгөгдөл рүү буцаахыг хүсвэл зүүн доод буланд байгаа хэрэглэгчийн нэр дээр дарна уу.</p>' +
    '</div>');
}

/* ============ Хэрэглэгчийн цэс ============ */
function openUserMenu(anchor) {
  var items = [
    { label: USER.name, icon: 'ti-user', value: 'profile' },
    { label: 'Тусламж', icon: 'ti-help-circle', value: 'help' },
    { label: 'Тайлан татах', icon: 'ti-download', value: 'report' }
  ];
  if (isAdmin()) {
    items.push({ sep: true });
    items.push({ label: 'Жишээ өгөгдөл рүү буцаах', icon: 'ti-refresh', value: 'reset', danger: true });
  }
  items.push({ sep: true });
  items.push({ label: 'Гарах', icon: 'ti-logout', value: 'logout', danger: true });
  openMenu(anchor, items, function (it) {
    if (it.value === 'logout') { try { if (fauth) fauth.signOut(); } catch (e) {} localStorage.removeItem('monos_user'); location.replace('/index.html'); return; }
    if (it.value === 'help') openHelp();
    else if (it.value === 'report') downloadReport();
    else if (it.value === 'profile') toast('Профайл: ' + USER.name + ' · ' + USER.role, 'info');
    else if (it.value === 'reset') {
      var node = elc('div', 'modal-info',
        '<p>Бүх өөрчлөлтийг устгаж, анхны жишээ өгөгдөл рүү буцаах уу? Энэ үйлдлийг буцаах боломжгүй.</p>' +
        '<div class="detail-actions"><button class="btn btn-secondary" data-rc>Болих</button>' +
        '<button class="btn btn-danger" data-rok>Тийм, буцаах</button></div>');
      node.addEventListener('click', function (e) {
        if (e.target.closest('[data-rc]')) closeModal();
        if (e.target.closest('[data-rok]')) {
          localStorage.removeItem(LSKEY);
          DB = seedDB(); saveDB();
          empState = { q: '', dept: '', role: '', sort: 'total-desc', page: 1, perPage: 10 };
          var si = $('.page[data-page="employees"] .filter-bar input'); if (si) si.value = '';
          renderAll(); renderCharts(); closeModal();
          toast('Жишээ өгөгдөл сэргээгдлээ');
        }
      });
      buildModal('Өгөгдөл шинэчлэх', node, { width: '400px' });
    }
  });
}

/* ============ Сонгох цэснүүд ============ */
function openEmpFilterMenu(pill, kind) {
  var items;
  if (kind === 'dept') {
    items = [{ label: 'Бүх хэлтэс', value: '' }].concat(DEPTS.map(function (d) { return { label: d, value: d }; }));
  } else if (kind === 'role') {
    items = [{ label: 'Бүх албан тушаал', value: '' }].concat(ROLES.map(function (r) { return { label: r, value: r }; }));
  } else {
    items = [
      { label: 'KPI оноо (өндөр → бага)', value: 'total-desc' },
      { label: 'KPI оноо (бага → өндөр)', value: 'total-asc' },
      { label: 'Нэр (А-Я)', value: 'name' }
    ];
  }
  openMenu(pill, items, function (it) {
    var span = pill.querySelector('span');
    if (kind === 'dept') { empState.dept = it.value; if (span) span.textContent = it.value || 'Бүх хэлтэс'; }
    else if (kind === 'role') { empState.role = it.value; if (span) span.textContent = it.value || 'Бүх албан тушаал'; }
    else { empState.sort = it.value; if (span) span.textContent = 'KPI оноо'; }
    empState.page = 1;
    renderEmployees();
  });
}

/* ============ Чатбот ============ */
var botResponses = {
  hazard: { text: 'Аюулыг товч тайлбарлаач. Зураг хавсаргавал илүү дээр.',
    replies: ['📷 Зураг хавсаргах', '📍 GPS байршил', '⚠️ Яаралтай'],
    follow: 'Маш сайн. Мэдээлэл хүлээн авлаа. ХАБЭА-н мэргэжилтэн 30 минутын дотор шалгана.' },
  suggest: { text: 'Та ямар сайжруулалт санал болгож байна вэ? Хэлтэс, асуудал, шийдлийг товч бичээрэй.',
    replies: ['💼 Цех №1', '💼 Цех №2', '💼 Захиргаа'],
    follow: 'Таны санал бүртгэгдлээ. ХАБЭА-н зөвлөл дараагийн хурлаараа хэлэлцэнэ.' },
  training: { text: 'Танд хамаарах сургалтууд:<br>• Гал түймрийн аюулгүй байдал — ✅ Дууссан<br>• Цахилгааны аюулгүй байдал — 65%<br>• Анхны тусламж — ✅ Дууссан',
    replies: ['📚 Үргэлжлүүлэх', '🏆 Гэрчилгээ авах'],
    follow: 'Цахилгааны аюулгүй байдлын модулийг нээж байна...' },
  health: { text: 'Таны эрүүл мэндийн мэдээлэл:<br>• Сүүлийн үзлэг: <strong>2025-11-15</strong><br>• Дараагийн товлогдсон: <strong>2026-05-22</strong><br>• Эрсдэлийн ангилал: Бага',
    replies: ['📅 Үзлэг өөрчлөх', '🩺 Мэдээлэл татах'],
    follow: 'Үзлэгийн цаг өөрчлөх хүсэлтийг хүлээн авлаа.' },
  other: { text: 'Танд юугаар туслах боломжтой:<br>• ХХХ захиалга<br>• Жижүүрийн хүн<br>• Ослын яаралтай дугаар',
    replies: ['🪖 ХХХ', '📞 Жижүүр', '⚖️ Хууль'],
    follow: 'Сонгосон сэдвээр дэлгэрэнгүй мэдээлэл өгье...' }
};
function appendMessage(html, isUser) {
  var messages = $('#chatMessages');
  if (!messages) return;
  var wrap = elc('div', isUser ? 'user-msg' : 'bot-msg');
  wrap.innerHTML = isUser
    ? '<div class="avatar avatar-sm">' + USER.initials + '</div><div class="bubble">' + html + '</div>'
    : '<div class="avatar avatar-sm bot-av"><i class="ti ti-robot"></i></div><div class="bubble">' + html + '</div>';
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}
function botReply(type) {
  var r = botResponses[type];
  if (!r) return;
  var labels = { hazard: '🚨 Аюул мэдээлэх', suggest: '💡 Санал гаргах', training: '🎓 Сургалт', health: '🩺 Эрүүл мэнд', other: '… Бусад' };
  appendMessage(labels[type] || type, true);
  setTimeout(function () {
    var rep = r.replies.map(function (x) { return '<button class="qr-btn">' + x + '</button>'; }).join('');
    appendMessage(r.text + '<div class="quick-replies">' + rep + '</div>', false);
  }, 400);
  setTimeout(function () { appendMessage(r.follow, false); }, 1700);
}
function sendChat() {
  var input = $('#chatInput');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  appendMessage(esc(text), true);
  input.value = '';
  setTimeout(function () {
    var lower = text.toLowerCase(), response;
    if (lower.indexOf('аюул') > -1 || lower.indexOf('эрсдэл') > -1)
      response = 'Аюулын мэдээлэл хүлээн авлаа. Доорх товчоор бүртгэлээ үүсгэх үү?<div class="quick-replies"><button class="qr-btn" data-openhz>📝 Эрсдэл бүртгэх</button></div>';
    else if (lower.indexOf('сургалт') > -1)
      response = 'Та энэ сард 2 сургалтад хамрагдсан. Дараагийн заавал сургалт: <strong>Химийн бодистой ажиллах</strong>.';
    else if (lower.indexOf('осол') > -1 || lower.indexOf('гэмт') > -1)
      response = 'Ослын мэдээлэл чухал. Яаралтай тохиолдолд 103, 105 руу залгана уу.';
    else if (lower.indexOf('ххх') > -1 || lower.indexOf('хувийн') > -1)
      response = 'ХХХ: дуулга, бээлий, шил, чихэвч, маск, ажлын хувцас. Аль нь хэрэгтэй вэ?';
    else if (lower.indexOf('эрүүл') > -1 || lower.indexOf('үзлэг') > -1)
      response = 'Таны дараагийн үзлэг 2026-05-22, 09:00 цагт товлогдсон байна.';
    else if (lower.indexOf('баярлал') > -1 || lower.indexOf('сайн') > -1)
      response = 'Танд туслахад таатай байна. Аюулгүй сайхан ажиллаарай!';
    else
      response = 'Доорхоос сонгоно уу:<div class="quick-replies"><button class="qr-btn" data-bot="hazard">🚨 Аюул</button><button class="qr-btn" data-bot="training">🎓 Сургалт</button><button class="qr-btn" data-bot="health">🩺 Эрүүл мэнд</button></div>';
    appendMessage(response, false);
  }, 500);
}
function resetChat() {
  var m = $('#chatMessages');
  if (!m) return;
  m.innerHTML = '<div class="bot-msg"><div class="avatar avatar-sm bot-av"><i class="ti ti-robot"></i></div>' +
    '<div class="bubble">Сайн байна уу, <strong>' + USER.name + '</strong>. Юугаар туслах вэ?' +
    '<div class="quick-replies">' +
    '<button class="qr-btn" data-bot="hazard">🚨 Аюул мэдээлэх</button>' +
    '<button class="qr-btn" data-bot="suggest">💡 Санал гаргах</button>' +
    '<button class="qr-btn" data-bot="training">🎓 Сургалт</button>' +
    '<button class="qr-btn" data-bot="health">🩺 Эрүүл мэнд</button>' +
    '<button class="qr-btn" data-bot="other">… Бусад</button></div></div></div>';
}

/* ============ Глобал функцууд (HTML onclick-д хэрэгтэй) ============ */
function toggleSidebar() { var s = $('#sidebar'); if (s) s.classList.toggle('open'); }
window.goTo = function (p) { switchPage(p); };
window.toggleSidebar = toggleSidebar;
window.botReply = botReply;
window.sendChat = sendChat;

/* ============ Үндсэн товч-чиглүүлэгч ============ */
function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

function handleClick(e) {
  /* Цэс гадуур дарвал хаах */
  if (activeMenu && !activeMenu.contains(e.target) &&
      !e.target.closest('.select-pill,.icon-btn.notif,.user-card,[data-emp-menu]')) {
    closeMenu();
  }

  var notifAll = e.target.closest('[data-notif-all]');
  if (notifAll) {
    e.stopPropagation();
    DB.notifications.forEach(function (n) { n.read = true; });
    saveDB(); renderNotifBadge(); closeMenu();
    return;
  }

  var el = e.target.closest(
    'button, a, .quick-card, .select-pill, .chip-opt, .sev-btn, .chip, .nav-item, .set-nav, ' +
    '.suggest-votes, .train-card, .page-btn, .hazard-item, .user-card, [data-emp-menu], ' +
    'tr[data-emp], tr[data-inc], .suggest-card, .qr-btn, .chat-list-item'
  );
  if (!el) return;

  /* Inline onclick-тэй элементүүдийг алгасах (HTML дотор аль хэдийн заасан) */
  if (el.hasAttribute && el.hasAttribute('onclick')) return;

  /* --- Навигаци --- */
  if (el.classList.contains('nav-item')) {
    var pg = el.getAttribute('data-page');
    if (pg) { e.preventDefault(); switchPage(pg); }
    return;
  }

  /* --- Чат: бот хариулт / quick reply --- */
  if (el.classList.contains('qr-btn')) {
    var bt = el.getAttribute('data-bot');
    if (bt) { botReply(bt); return; }
    if (el.hasAttribute('data-openhz')) { actionReportHazard(); return; }
    appendMessage(esc(txt(el)), true);
    setTimeout(function () { appendMessage('Хүлээн авлаа. Өөр асуух зүйл байна уу?', false); }, 500);
    return;
  }
  if (el.classList.contains('chat-list-item')) {
    $$('.chat-list-item').forEach(function (c) { c.classList.remove('active'); });
    el.classList.add('active');
    return;
  }

  /* --- Чип сонголтууд --- */
  if (el.classList.contains('chip-opt')) {
    var grp = el.closest('.chip-select');
    if (grp) { $$('.chip-opt', grp).forEach(function (c) { c.classList.remove('active'); }); el.classList.add('active'); }
    return;
  }
  if (el.classList.contains('sev-btn')) {
    var sbar = el.closest('.severity-bar');
    if (sbar) { $$('.sev-btn', sbar).forEach(function (c) { c.classList.remove('active'); }); el.classList.add('active'); }
    return;
  }
  if (el.classList.contains('chip')) {
    var cg = el.closest('.chip-group');
    if (cg) {
      $$('.chip', cg).forEach(function (c) { c.classList.remove('active'); });
      el.classList.add('active');
      if (charts.trend && cg.closest('[data-page="dashboard"]')) {
        var label = txt(el);
        var map = { 'Бүгд': -1, 'Сургалт': 0, 'Эрсдэл': 1, 'Осол': 2 };
        var sel = map[label];
        charts.trend.data.datasets.forEach(function (ds, i) {
          charts.trend.setDatasetVisibility(i, sel === -1 || sel === i);
        });
        charts.trend.update();
      }
    }
    return;
  }
  if (el.classList.contains('set-nav')) {
    $$('.set-nav').forEach(function (n) { n.classList.remove('active'); });
    el.classList.add('active');
    toast(txt(el) + ' хэсэг', 'info');
    return;
  }

  /* --- Хэрэглэгчийн цэс --- */
  if (el.classList.contains('user-card')) { e.stopPropagation(); openUserMenu(el); return; }

  /* --- Мэдэгдэл --- */
  if (el.classList.contains('icon-btn') && el.classList.contains('notif')) {
    e.stopPropagation(); openNotifications(el); return;
  }

  /* --- Топ баар: тусламж ба + --- */
  if (el.classList.contains('icon-btn')) {
    if (el.querySelector('.ti-help-circle')) { openHelp(); return; }
    if (el.querySelector('.ti-plus') || (el.getAttribute('title') || '').indexOf('эрсдэл') > -1) {
      actionReportHazard(); return;
    }
  }

  /* --- Хуудасны хуудаслалт --- */
  if (el.classList.contains('page-btn')) {
    var pn = el.getAttribute('data-pnum');
    if (!pn) return;
    var pages = Math.max(1, Math.ceil(filteredEmployees().length / empState.perPage));
    if (pn === 'prev') empState.page = Math.max(1, empState.page - 1);
    else if (pn === 'next') empState.page = Math.min(pages, empState.page + 1);
    else empState.page = parseInt(pn, 10);
    renderEmployees();
    return;
  }

  /* --- Сонгох pill цэснүүд --- */
  if (el.classList.contains('select-pill')) {
    e.stopPropagation();
    if (el.closest('[data-page="employees"]')) {
      var pills = $$('[data-page="employees"] .filter-bar .select-pill');
      var idx = pills.indexOf(el);
      openEmpFilterMenu(el, idx === 0 ? 'dept' : (idx === 1 ? 'role' : 'sort'));
    } else if (el.closest('[data-page="dashboard"]')) {
      openMenu(el, [
        { label: 'Энэ сар' }, { label: 'Өнгөрсөн сар' }, { label: 'Энэ улирал' }, { label: 'Энэ жил' }
      ], function (it) {
        var sp = el.querySelector('span'); if (sp) sp.textContent = it.label;
        toast('Хугацаа: ' + it.label, 'info');
      });
    } else {
      toast('Сонголт', 'info');
    }
    return;
  }

  /* --- Эрсдэл / санал / осол / ажилтны мөр дээр дарах --- */
  if (el.classList.contains('hazard-item')) { openHazardDetail(el.getAttribute('data-hz')); return; }
  if (el.classList.contains('suggest-votes')) {
    e.stopPropagation();
    var sg = DB.suggestions.filter(function (x) { return x.id === el.getAttribute('data-vote'); })[0];
    if (sg) {
      sg.voted = !sg.voted;
      sg.votes += sg.voted ? 1 : -1;
      saveDB(); renderSuggestions();
      toast(sg.voted ? 'Санал дэмжигдлээ' : 'Дэмжлэг цуцлагдлаа', 'info');
    }
    return;
  }
  if (el.classList.contains('suggest-card')) { openSuggestionDetail(el.getAttribute('data-sg')); return; }
  if (el.tagName === 'TR' && el.hasAttribute('data-emp')) { openEmployeeDetail(el.getAttribute('data-emp')); return; }
  if (el.tagName === 'TR' && el.hasAttribute('data-inc')) { openIncidentDetail(el.getAttribute('data-inc')); return; }
  if (el.hasAttribute && el.hasAttribute('data-emp-menu')) { e.stopPropagation(); openEmployeeDetail(el.getAttribute('data-emp-menu')); return; }

  /* --- Сургалтын карт --- */
  if (el.classList.contains('train-card')) {
    var h4 = el.querySelector('h4');
    toast('«' + (h4 ? txt(h4) : 'Сургалт') + '» нээгдэж байна', 'info');
    return;
  }
  if (el.classList.contains('quick-card')) return;

  /* --- Товчнууд (текстээр таних) --- */
  var t = txt(el);
  var page = el.closest('.page');
  var pageId = page ? page.getAttribute('data-page') : '';

  if (t.indexOf('Шинэ эрсдэл') > -1 || t.indexOf('Шинэ мэдээлэл') > -1) { actionReportHazard(); return; }
  if (t === 'Илгээх' && pageId === 'hazards') {
    var hf = el.closest('.form'); if (hf) submitInlineHazard(hf);
    return;
  }
  if (t.indexOf('Санал гаргах') > -1) { actionAddSuggestion(); return; }
  if (t.indexOf('Шинэ ажилтан') > -1) { actionAddEmployee(); return; }
  if (t.indexOf('осол бүртгэх') > -1 || t.indexOf('Осол бүртгэх') > -1) { actionReportIncident(); return; }
  if (t.indexOf('Жин засах') > -1) { switchPage('settings'); toast('KPI-ийн жинг доороос тохируулна уу', 'info'); return; }
  if (t === 'Жин хадгалах' || el.id === 'saveWeights') { saveWeights(); return; }
  if (t === 'Хадгалах' && pageId === 'settings') { saveOrgSettings(); return; }
  if (t === 'Цуцлах' && pageId === 'settings') { renderSettings(); toast('Өөрчлөлт цуцлагдлаа', 'info'); return; }
  if (t.indexOf('Excel') > -1) { exportEmployeesCSV(); return; }
  if (t.indexOf('Тайлан татах') > -1) { downloadReport(); return; }
  if (t === 'Шинэчлэх') { renderAll(); renderCharts(); toast('Мэдээлэл шинэчлэгдлээ'); return; }
  if (t.indexOf('Татах') > -1) { downloadReport(); return; }
  if (t === 'Загвар') { downloadReport(); return; }
  if (t.indexOf('Шинэ тайлан') > -1) { downloadReport(); return; }
  if (t.indexOf('Шинэ яриа') > -1) { resetChat(); return; }
  if (t.indexOf('Зураг хавсаргах') > -1) { toast('Зураг хавсаргах — файлаа сонгоно уу', 'info'); return; }
  if (t === 'GPS' || t.indexOf('GPS') > -1) { toast('Байршил: Цех №2, координат тогтоогдлоо', 'success'); return; }
  if (t.indexOf('Газрын зураг') > -1) { toast('Газрын зургийн харагдац удахгүй нэмэгдэнэ', 'info'); return; }
  if (t.indexOf('Синхрончлох') > -1) { toast('Teams интеграц синхрончлогдлоо ✓'); return; }
  if (t.indexOf('Шүүх') > -1 || t.indexOf('Filter') > -1) {
    var fi = $('.page[data-page="employees"] .filter-bar input'); if (fi) fi.focus();
    toast('Хайх талбар ба шүүлтүүрийг ашиглана уу', 'info'); return;
  }

  /* --- "Дэлгэрэнгүй" / "Бүгд" холбоосууд --- */
  if (el.classList.contains('link-btn')) {
    var card = el.closest('.card');
    var head = card ? card.querySelector('h3') : null;
    var hText = head ? txt(head) : '';
    if (hText.indexOf('KPI') > -1 && hText.indexOf('ангилл') > -1) switchPage('kpi');
    else if (hText.indexOf('мэдээлсэн') > -1) switchPage('hazards');
    else if (hText.indexOf('Хэлтсийн') > -1) switchPage('employees');
    else if (el.querySelector('.ti-plus')) toast('Шинэ мөр нэмэх', 'info');
    else if (el.querySelector('.ti-external-link')) toast('Тэмдэглэл нээгдэж байна', 'info');
    else toast('Дэлгэрэнгүй харагдац', 'info');
    return;
  }

  /* --- Бусад товчны ерөнхий хариу --- */
  if (el.tagName === 'BUTTON' && (el.classList.contains('btn') || el.classList.contains('icon-btn-sm'))) {
    if (t) toast('«' + t + '» — ' + actionHint(t), 'info');
  }
}

function actionHint(t) {
  if (t.indexOf('товлох') > -1 || t.indexOf('нэмэх') > -1) return 'удахгүй идэвхждэг боломж';
  if (t.indexOf('захиалах') > -1) return 'захиалгын хүсэлт бүртгэгдлээ';
  if (t.indexOf('Гэрчилгээ') > -1) return 'гэрчилгээний жагсаалт';
  if (t.indexOf('Түүх') > -1) return 'өөрчлөлтийн түүх';
  return 'үйлдэл хүлээн авлаа';
}

/* ============ Input үйл явдлууд ============ */
function handleInput(e) {
  var el = e.target;
  /* Ажилтны хайлт */
  if (el.matches('.page[data-page="employees"] .filter-bar input')) {
    empState.q = el.value;
    empState.page = 1;
    renderEmployees();
    return;
  }
  /* Жингийн слайдер */
  if (el.matches('.page[data-page="settings"] .weight-row input[type="range"]')) {
    var row = el.closest('.weight-row');
    var v = row.querySelector('.weight-val');
    if (v) v.textContent = el.value + '%';
    updateWeightTotal();
    return;
  }
}

/* ============ Эхлүүлэх ============ */
function injectControls() {
  /* Жин хадгалах товч нэмэх */
  var wl = $('.page[data-page="settings"] .weight-list');
  if (wl && !$('#saveWeights')) {
    var b = elc('button', 'btn btn-primary', 'Жин хадгалах');
    b.id = 'saveWeights';
    b.style.cssText = 'margin-top:8px;align-self:flex-end';
    wl.appendChild(b);
  }
}

/* ============ Нэвтрэлт + эрх (үндсэн системтэй нэгдсэн) ============ */
function establishSession() {
  return new Promise(function (resolve) {
    var u = null;
    try { u = JSON.parse(localStorage.getItem('monos_user') || 'null'); } catch (e) {}
    if (!u || !u.uid) { location.replace('/index.html'); return; } // нэвтрээгүй → нэвтрэх хуудас
    if (!fbReady) { SESSION = { role: 'admin', email: u.email, uid: u.uid }; resolve(); return; }

    function proceed(uid, email) {
      fdb.collection('users').doc(uid).get().then(function (snap) {
        var role = (snap.exists && snap.data() && snap.data().role === 'admin') ? 'admin' : 'employee';
        SESSION = { role: role, email: email, uid: uid, empId: null };
        resolve();
      }).catch(function () {
        SESSION = { role: 'employee', email: email, uid: uid, empId: null };
        resolve();
      });
    }

    // Firebase auth сессийг сэргээхийг хүлээнэ (эс бөгөөс Firestore хүсэлт эрхгүй болж унана)
    var settled = false;
    var unsub = fauth.onAuthStateChanged(function (fbUser) {
      if (settled) return; settled = true;
      try { unsub(); } catch (e) {}
      if (fbUser) { proceed(fbUser.uid, fbUser.email || u.email); }
      else { localStorage.removeItem('monos_user'); location.replace('/index.html'); } // сесси дууссан
    });
    // Найдваргүй тохиолдолд 5 сек дараа үргэлжлүүлнэ
    setTimeout(function () { if (!settled) { settled = true; proceed(u.uid, u.email); } }, 5000);
  });
}

function applyRole() {
  try {
    if (SESSION) {
      USER.name = (SESSION.email || '').split('@')[0] || USER.name;
      USER.initials = makeInitials(USER.name);
      USER.role = isAdmin() ? 'ХАБЭА-н мэргэжилтэн' : 'Ажилтан';
    }
    var nmeEl = document.querySelector('.user-name');
    var roleEl = document.querySelector('.user-role');
    var avEl = document.querySelector('.sidebar .avatar') || document.querySelector('.user-card .avatar');
    if (nmeEl) nmeEl.textContent = USER.name;
    if (roleEl) roleEl.textContent = USER.role;
    if (avEl) avEl.textContent = USER.initials;
  } catch (e) {}
  if (isAdmin()) return; // админд бүх хэсэг харагдана
  ADMIN_ONLY_PAGES.forEach(function (pg) {
    var nav = document.querySelector('.nav-item[data-page="' + pg + '"]');
    if (nav) nav.style.display = 'none';
    var pe = document.querySelector('.page[data-page="' + pg + '"]');
    if (pe) pe.setAttribute('data-locked', '1');
  });
  var active = document.querySelector('.nav-item.active');
  if (active && ADMIN_ONLY_PAGES.indexOf(active.getAttribute('data-page')) >= 0) { switchPage('dashboard'); }
}

async function init() {
  await establishSession();
  var fresh = await loadDB();
  injectControls();
  applyRole();
  renderAll();

  // URL-аас тодорхой хэсэг нээх (жишээ: /kpi/?page=hazards)
  try {
    var qp = new URLSearchParams(location.search).get('page');
    if (qp) switchPage(qp);
  } catch (e) {}

  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput);

  /* Топ баарын хайлт */
  var topSearch = $('.topbar .search-box input');
  if (topSearch) {
    topSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { globalSearch(topSearch.value); topSearch.value = ''; }
    });
  }
  /* Гар: Esc, Ctrl+K */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeMenu(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (topSearch) topSearch.focus();
    }
  });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  setTimeout(renderCharts, 80);
  if (fresh) setTimeout(function () { toast('Тавтай морил! Жишээ өгөгдөл ачааллаа.', 'info'); }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
