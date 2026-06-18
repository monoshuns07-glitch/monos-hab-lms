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

/* DEMO горим: локалаар (file://) эсвэл ?demo=1-ээр нээвэл Firebase-гүй, жишээ датагаар бүрэн ажиллана.
   Netlify дээр (https) бол жинхэнэ Firebase горим хэвээр. */
var DEMO = false;
try { DEMO = (location.protocol === 'file:') || (String(location.search).indexOf('demo=1') > -1); } catch (e) {}

/* Нэвтэрсэн хэрэглэгчийн сешн: { role:'admin' } эсвэл { role:'employee', empId, email, uid } */
var SESSION = null;
function isAdmin() { return SESSION && SESSION.role === 'admin'; }
function isDeptHead() { return SESSION && SESSION.role === 'depthead'; }
function isEmp() { return SESSION && SESSION.role === 'employee'; }
function myEmp() { return SESSION && SESSION.empId ? DB.employees.filter(function (e) { return e.id === SESSION.empId; })[0] : null; }

/* Нэвтрэх эрхийн 3 түвшин:
   - admin (ХАБЭА ажилтан): бүгдийг хардаг, удирддаг
   - depthead (Албаны дарга): зөвхөн өөрийн алба
   - employee (Ажилтан): зөвхөн өөрийн мэдээлэл, эерэг прогресс */
var ADMIN_ONLY_PAGES = ['employees', 'incidents', 'council', 'teams', 'reports', 'dataflow', 'settings', 'adminpanel', 'examadmin'];
var DEPTHEAD_HIDDEN_PAGES = ['settings', 'teams', 'dataflow', 'adminpanel', 'examadmin'];
function blockedPages() {
  if (isAdmin()) return [];
  if (isDeptHead()) return DEPTHEAD_HIDDEN_PAGES;
  return ADMIN_ONLY_PAGES;
}
function rand4() { return String(Math.floor(1000 + Math.random() * 9000)); }

var pageLabels = {
  dashboard: 'Хяналтын самбар', employees: 'Ажилтнууд', kpi: 'KPI үнэлгээ',
  reportflow: 'Аюул/Near-miss мэдээлэл', hazards: 'Эрсдэлийн бүртгэл', incidents: 'Осол, гэмтэл', inspections: 'Шалгалт',
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
  /* Шинэ KPI загварын суурь үзүүлэлтүүд (видео үзэлт %, шалгалтын дүн, ахиц, эхний удаа тэнцсэн) */
  list.forEach(function (e) {
    e.video = clamp(Math.round(gauss(e.training, 6)), 30, 100);
    e.examScore = clamp(Math.round(gauss(e.training - 2, 7)), 30, 100);
    e.examPrev = clamp(e.examScore - Math.round(gauss(6, 9)), 25, 100);
    e.firstTry = Math.random() < (e.examScore / 120) ? 1 : 0;
  });
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

  /* Аюул / осолд дөхсөн (near-miss) мэдээлэл — баталгаажуулалттай, бонус оноо төрүүлдэг эх үүсвэр */
  var rp = [
    // [type, risk, status, desc, location, dept, reporterId, reporterName, hoursAgo]
    ['near_miss', 'high', 'verified', 'Краны тросс элэгдэж эхэлсэн — ачаа унаж болзошгүй', 'Цех №3', 'Цех №3', 'EMP-004', 'О. Бат', 30],
    ['hazard', 'mid', 'verified', 'Шатны хашлага сул, ганхаж байна', 'Захиргааны байр', 'Захиргаа', 'EMP-007', 'Г. Намуун', 60],
    ['near_miss', 'mid', 'reported', 'Шалан дээр тос асгарсан, гулгаж болзошгүй', 'Цех №1', 'Цех №1', 'EMP-002', 'Б. Туяа', 5],
    ['hazard', 'low', 'verified', 'Агуулахын гэрэлтүүлэг бүдэг', 'Агуулах', 'Тээвэр', 'EMP-009', 'Э. Төгөлдөр', 120],
    ['near_miss', 'high', 'verified', 'Цахилгааны самбар ил, оч гарсан', 'Цех №2', 'Цех №2', 'EMP-006', 'Б. Энхбат', 10],
    ['near_miss', 'low', 'reported', 'Гарцад хайрцаг тавьсан, замыг хааж байна', 'Агуулах', 'Цех №1', 'EMP-002', 'Б. Туяа', 2],
    ['near_miss', 'mid', 'rejected', 'Давхардсан мэдээлэл', 'Цех №2', 'Цех №2', 'EMP-006', 'Б. Энхбат', 200]
  ];
  function _seedPts(type, risk) { return type === 'near_miss' ? ({ low: 3, mid: 6, high: 10 }[risk] || 3) : 5; }
  var reports = rp.map(function (r, i) {
    var verified = r[2] === 'verified';
    return {
      id: 'RP-' + pad(i + 1), type: r[0], risk_level: r[1], status: r[2], desc: r[3],
      location: r[4], dept: r[5], reporterId: r[6], reporterName: r[7], reporterUid: '',
      photo: '', verifiedBy: (verified ? 'Д. Ариунаа' : ''), verified_by: (verified ? 'Д. Ариунаа' : ''),
      points_awarded: (verified ? _seedPts(r[0], r[1]) : null),
      createdAt: hoursAgoISO(r[8]), verifiedAt: (verified ? hoursAgoISO(r[8] - 4) : '')
    };
  });

  /* Анхны тусламжийн хайрцгийн шалгалт (эрүүл ахуйч, алба бүрээр) */
  var fa = [
    // [dept, complete, missingItems[], hoursAgo]
    ['Цех №1', true, [], 240], ['Цех №2', false, ['Боолт', 'Антисептик'], 72],
    ['Цех №3', true, [], 480], ['Захиргаа', true, [], 360], ['Тээвэр', false, ['Гэмтлийн тэвш'], 24]
  ];
  var FA_TOTAL = 12;
  var firstAidChecks = fa.map(function (c, i) {
    return {
      id: 'FA-' + pad(i + 1), dept: c[0], totalItems: FA_TOTAL, complete: c[1],
      missing: c[2], checkedBy: 'Эрүүл ахуйч', restockedAt: (c[1] ? hoursAgoISO(c[3]) : ''),
      createdAt: hoursAgoISO(c[3])
    };
  });

  /* PPE мөрдөлтийн ажиглалт (ХАБ ажилтан) — зөрчлийн тоо биш, мөрдөлтийн % */
  var pp = [
    // [dept, total, compliant, hoursAgo]
    ['Цех №1', 50, 47, 96], ['Цех №2', 40, 33, 48], ['Цех №3', 45, 42, 120],
    ['Захиргаа', 20, 20, 168], ['Тээвэр', 30, 26, 36]
  ];
  var ppeObservations = pp.map(function (o, i) {
    return {
      id: 'PP-' + pad(i + 1), dept: o[0], total: o[1], compliant: o[2],
      observedBy: 'ХАБ ажилтан', photo: '', createdAt: hoursAgoISO(o[3])
    };
  });

  return {
    settings: {
      org: { name: 'Үндэсний Үйлдвэрлэл ХХК', regNo: '6021234', sector: 'Хөнгөн үйлдвэр', headcount: 142, riskClass: 'Дунд' },
      weights: { training: 20, participation: 30, discipline: 25, health: 15, leadership: 10 },
      /* ====== Шинэ KPI арга зүйн тохиргоо — бүгд эндээс өөрчлөгдөнө ====== */
      kpi: {
        weights: { video: 50, exam: 22, improvement: 8, firstTry: 5, bonus: 15 }, // нийлбэр = 100
        baseThreshold: 75,   // албаны coverage-д тооцох суурь оноо (бонусгүй) босго
        bonusTarget: 30,     // энэ хэмжээний бонус оноо = бонус жингийн 100%
        bonus: {
          hazard: 5,                                  // баталгаажсан аюул бүрт
          nearMiss: { low: 3, mid: 6, high: 10 },     // near-miss эрсдэлийн зэргээр
          monthlyCap: 3                               // нэг хүн нэг сард авах дээд тоо
        },
        dept: { coverage: 55, bonus: 15, firstAid: 15, ppe: 15 } // албаны онооны жин, нийлбэр = 100
      }
    },
    employees: [],
    hazards: [],
    suggestions: [],
    incidents: [],
    notifications: [],
    reports: reports,
    firstAidChecks: firstAidChecks,
    ppeObservations: ppeObservations,
    videoViews: [],
    examResults: [],
    externalTrainings: []
  };
}

/* ===== ХАБЭА шалгалтын систем (habea-shalgalt project) — cross-project унших ===== */
var _habeaDb = null;
function getHabeaDb() {
  if (_habeaDb !== null) return _habeaDb;
  try {
    var cfg = { apiKey: "AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E", authDomain: "habea-shalgalt.firebaseapp.com", projectId: "habea-shalgalt", storageBucket: "habea-shalgalt.firebasestorage.app", messagingSenderId: "910170773266", appId: "1:910170773266:web:38c7af5f7d0c352a5bc5cb" };
    var app = (firebase.apps || []).filter(function (a) { return a.name === 'habea'; })[0] || firebase.initializeApp(cfg, 'habea');
    _habeaDb = app.firestore();
  } catch (e) { _habeaDb = false; }
  return _habeaDb;
}
/* ХАБЭА шалгалтын дүнг имэйлээр индекслэнэ: { email: {pre, post, anyPassed} } */
async function readHabeaExamsByEmail() {
  var map = {};
  try {
    var hdb = getHabeaDb(); if (!hdb) return map;
    var snap = await hdb.collection('habea_exam_results').get();
    snap.forEach(function (d) {
      var x = d.data() || {};
      var email = String(x.email || '').toLowerCase().trim();
      if (!email) return;
      var rec = map[email] || (map[email] = { pre: null, post: null, anyPassed: false, list: [] });
      var pct = num(x.percent);
      if (x.examType === 'pre') { if (rec.pre == null) rec.pre = pct; }
      else { if (rec.post == null) rec.post = pct; }
      if (x.passed) rec.anyPassed = true;
      rec.list.push({ title: x.examTitle || 'ХАБЭА шалгалт', type: x.examType || '', percent: pct, passed: !!x.passed, ts: (x.timestamp && x.timestamp.seconds) ? x.timestamp.seconds : 0 });
    });
    Object.keys(map).forEach(function (k) { map[k].list.sort(function (a, b) { return b.ts - a.ts; }); });
  } catch (e) {}
  return map;
}

/* ===== Жинхэнэ ажилчид + сургалт/шалгалтаас KPI автоматаар бодох ===== */
async function buildEmployeesFromRealData() {
  if (!fbReady) return null;
  try {
    var usersSnap = await fdb.collection('users').get();
    var examByUser = {}, progByUser = {};
    try {
      var examSnap = await fdb.collection('exam_results').get();
      examSnap.forEach(function (d) { var x = d.data() || {}; if (!x.userId) return; (examByUser[x.userId] = examByUser[x.userId] || []).push(x); });
    } catch (e) {}
    try {
      var progSnap = await fdb.collection('training_progress').get();
      progSnap.forEach(function (d) { var x = d.data() || {}; if (!x.userId) return; (progByUser[x.userId] = progByUser[x.userId] || []).push(x); });
    } catch (e) {}
    var habeaByEmail = await readHabeaExamsByEmail(); // ХАБЭА шалгалтын дүн (имэйлээр)

    // Эрсдэл/санал тоо (KPI системд тухайн ажилтны оруулсан) — оролцоонд нэмнэ
    var reportByUid = {};
    (DB.hazards || []).forEach(function (h) { if (h.reporterUid) reportByUid[h.reporterUid] = (reportByUid[h.reporterUid] || 0) + 1; });
    (DB.suggestions || []).forEach(function (s) { if (s.authorUid) reportByUid[s.authorUid] = (reportByUid[s.authorUid] || 0) + 1; });

    var out = [];
    usersSnap.forEach(function (d) {
      var u = d.data() || {}; var uid = u.uid || d.id;
      if (u.role === 'admin' && !(u.firstName || u.lastName)) return; // нэргүй админ системийн бүртгэл алгасна
      var ln = u.lastName ? (String(u.lastName).charAt(0) + '. ') : '';
      var name = (ln + (u.firstName || '')).trim() || (u.email || '').split('@')[0] || 'Ажилтан';
      var exams = examByUser[uid] || [], progs = progByUser[uid] || [];
      var examAvg = exams.length ? avg(exams.map(function (e) { return num(e.score); })) : null;
      var progAvg = progs.length ? avg(progs.map(function (p) { return num(p.watchProgress); })) : null;
      var training = 0;
      if (examAvg != null && progAvg != null) training = Math.round(examAvg * 0.7 + progAvg * 0.3);
      else if (examAvg != null) training = Math.round(examAvg);
      else if (progAvg != null) training = Math.round(progAvg);
      var passed = exams.filter(function (e) { return e.passed; }).length;
      var reports = reportByUid[uid] || 0;
      var participation = clamp(Math.round(passed * 20 + progs.length * 8 + reports * 12), 0, 100);
      /* ===== Шинэ KPI загвар: видео үзэлт %, шалгалт, ахиц, эхний удаа тэнцсэн ===== */
      var examsSorted = exams.slice().sort(function (a, b) {
        return new Date(a.completedAt || a.date || a.createdAt || 0) - new Date(b.completedAt || b.date || b.createdAt || 0);
      });
      var firstTry = examsSorted.length ? (examsSorted[0].passed ? 1 : 0) : 0;
      var video = progAvg != null ? Math.round(progAvg) : training;
      var examScore = examAvg != null ? Math.round(examAvg) : training;
      var examPrev = null;
      if (examsSorted.length >= 2) { // сүүлийн хагасыг өмнөх хагастай харьцуулж ахицыг тооцно
        var half = Math.floor(examsSorted.length / 2);
        examPrev = Math.round(avg(examsSorted.slice(0, half).map(function (e) { return num(e.score); })));
        examScore = Math.round(avg(examsSorted.slice(half).map(function (e) { return num(e.score); })));
      }
      // ХАБЭА шалгалтын систем (имэйлээр тааруулж) — байвал давамгайлна
      var hx = habeaByEmail[String(u.email || '').toLowerCase().trim()];
      if (hx) {
        if (hx.post != null && hx.pre != null) { examPrev = hx.pre; examScore = hx.post; }
        else if (hx.post != null) { examScore = hx.post; }
        else if (hx.pre != null) { examScore = hx.pre; examPrev = null; }
        if (hx.anyPassed) firstTry = 1;
      }
      out.push({
        id: uid, uid: uid, initials: makeInitials(name), name: name,
        role: u.position || 'Ажилтан', dept: u.department || 'Тодорхойгүй', email: u.email || '',
        training: training, participation: participation,
        video: video, examScore: examScore, examPrev: examPrev, firstTry: firstTry,
        habeaExams: (hx && hx.list) ? hx.list : [],
        discipline: 100, health: 75, leadership: 60, // хуучин үзүүлэлт — нийцлийн төлөө хадгална
        onLeave: u.isActive === false
      });
    });
    return out;
  } catch (e) { return null; }
}

// Жинхэнэ датаг DB.employees руу нэгтгэнэ: training/participation автомат, гар засвар (health/sahilga)-ыг хадгална
async function syncEmployeesWithRealData() {
  var real = await buildEmployeesFromRealData();
  if (!real || !real.length) return false;
  var prevByUid = {};
  (DB.employees || []).forEach(function (e) { if (e.uid) prevByUid[e.uid] = e; });
  DB.employees = real.map(function (r) {
    var prev = prevByUid[r.uid];
    if (prev) {
      return Object.assign({}, prev, {
        name: r.name, dept: r.dept, role: r.role, email: r.email, initials: r.initials,
        training: r.training, participation: r.participation, onLeave: r.onLeave,
        video: r.video, examScore: r.examScore, examPrev: r.examPrev, firstTry: r.firstTry, habeaExams: r.habeaExams
      });
    }
    return r;
  });
  return true;
}

async function loadDB() {
  var fresh = false;
  if (DEMO) { // Локал жишээ горим — Firebase-гүй, localStorage-д хадгална
    try { var rawD = localStorage.getItem(LSKEY); DB = rawD ? JSON.parse(rawD) : null; } catch (e) { DB = null; }
    if (!DB || !DB.settings) { DB = seedDB(); fresh = true; }
    if (!DB.employees || !DB.employees.length) DB.employees = seedEmployees(); // жишээ 142 ажилтан (зөвхөн DEMO)
    try { migrateDB(); } catch (e) {}
    try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
    return fresh;
  }
  if (fbReady) {
    try {
      var snap = await KPI_DOC().get();
      var d = snap.exists ? snap.data() : null;
      if (d && (d.settings || d.hazards || d.suggestions || d.incidents)) {
        DB = d;
        if (!DB.settings) DB.settings = seedDB().settings;
        migrateDB();
      } else {
        DB = seedDB(); fresh = true;
        if (isAdmin()) { try { await KPI_DOC().set(DB); } catch (e) {} }
      }
    } catch (e) {
      try { var raw = localStorage.getItem(LSKEY); DB = raw ? JSON.parse(raw) : seedDB(); } catch (e2) { DB = seedDB(); }
      if (!DB || !DB.settings) { DB = seedDB(); }
    }
    // employees-г жинхэнэ ажилчид + сургалт/шалгалтаас автоматаар барина
    try { await syncEmployeesWithRealData(); } catch (e) {}
    // Ажилтан бол DB-г зөвхөн өөрийнхөөр шүүнэ (admin бүгдийг хардаг)
    try { scopeDataForEmployee(); } catch (e) {}
  } else {
    try { var raw2 = localStorage.getItem(LSKEY); if (raw2) { DB = JSON.parse(raw2); if (!DB || !DB.settings) { DB = seedDB(); fresh = true; } } else { DB = seedDB(); fresh = true; } }
    catch (e) { DB = seedDB(); fresh = true; }
  }
  try { migrateDB(); } catch (e) {}
  try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
  return fresh;
}

/* Хуучин (шинэ талбаргүй) DB-г шинэ загварт нийцүүлэх — алдагдсан массив/тохиргоог нөхнө */
function migrateDB() {
  if (!DB) return;
  ['employees', 'hazards', 'suggestions', 'incidents', 'notifications',
   'reports', 'firstAidChecks', 'ppeObservations', 'videoViews', 'examResults', 'externalTrainings'].forEach(function (k) {
    if (!Array.isArray(DB[k])) DB[k] = [];
  });
  if (!DB.settings) DB.settings = seedDB().settings;
  if (!DB.settings.kpi) DB.settings.kpi = seedDB().settings.kpi;
  // Дутуу дэд тохиргоог нөхөх (хэрэглэгчийн өөрчилснийг хадгална)
  var def = seedDB().settings.kpi, k = DB.settings.kpi;
  if (!k.weights) k.weights = def.weights;
  if (k.baseThreshold == null) k.baseThreshold = def.baseThreshold;
  if (k.bonusTarget == null) k.bonusTarget = def.bonusTarget;
  if (!k.bonus) k.bonus = def.bonus;
  else if (!k.bonus.nearMiss) k.bonus.nearMiss = def.bonus.nearMiss;
  if (!k.dept) k.dept = def.dept;
}

/* Ажилтны хувьд зөвхөн өөрийн датаг харуулна. ХАБЭА (admin) бол бүгдийг хэвээр. */
var _empHazIds = null, _empSugIds = null, _empRepIds = null;
function _sameEmail(a, b) { return !!(a && b && String(a).toLowerCase() === String(b).toLowerCase()); }
function scopeDataForEmployee() {
  _empHazIds = null; _empSugIds = null; _empRepIds = null;
  if (isAdmin() || !SESSION) return;
  // Албаны дарга — өөрийн албаны бүх ажилтныг харна (доор Phase 5-д тусгайлан зохицуулна)
  if (SESSION.role === 'depthead') { scopeDataForDeptHead(); return; }
  var uid = SESSION.uid, email = SESSION.email, eid = SESSION.empId;
  DB.employees = (DB.employees || []).filter(function (e) { return e.uid === uid || _sameEmail(e.email, email) || (eid && e.id === eid); });
  DB.hazards = (DB.hazards || []).filter(function (h) { return h.reporterUid === uid; });
  DB.suggestions = (DB.suggestions || []).filter(function (s) { return s.authorUid === uid; });
  DB.incidents = (DB.incidents || []).filter(function (n) { return n.uid === uid || _sameEmail(n.email, email); });
  DB.reports = (DB.reports || []).filter(function (r) { return r.reporterUid === uid || _sameEmail(r.reporterEmail, email) || (eid && r.reporterId === eid); });
  DB.notifications = (DB.notifications || []).filter(function (n) { return n.uid === uid; });
  _empHazIds = {}; DB.hazards.forEach(function (h) { _empHazIds[h.id] = 1; });
  _empSugIds = {}; DB.suggestions.forEach(function (s) { _empSugIds[s.id] = 1; });
  _empRepIds = {}; DB.reports.forEach(function (r) { _empRepIds[r.id] = 1; });
}

/* Албаны дарга — зөвхөн өөрийн албаны бүх ажилтан, мэдээлэл, PPE, хайрцаг */
function scopeDataForDeptHead() {
  var dept = SESSION && SESSION.dept;
  if (!dept) return; // алба тодорхойгүй бол шүүхгүй (админ Firestore дээр department талбар тааруулна)
  var uids = {}, ids = {};
  DB.employees = (DB.employees || []).filter(function (e) { return e.dept === dept; });
  DB.employees.forEach(function (e) { if (e.uid) uids[e.uid] = 1; if (e.id) ids[e.id] = 1; });
  DB.reports = (DB.reports || []).filter(function (r) { return r.dept === dept || uids[r.reporterUid] || ids[r.reporterId]; });
  DB.firstAidChecks = (DB.firstAidChecks || []).filter(function (c) { return c.dept === dept; });
  DB.ppeObservations = (DB.ppeObservations || []).filter(function (o) { return o.dept === dept; });
  DB.suggestions = (DB.suggestions || []).filter(function (s) { return s.dept === dept; });
}

var _saveTimer = null;
function saveDB() {
  try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
  if (!fbReady) return;
  if (isAdmin()) {
    // Admin — бүтэн датаг хадгална (бүгдийг харж, удирдана)
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      KPI_DOC().set(DB).catch(function () { toast('Cloud-д хадгалахад алдаа гарлаа', 'error'); });
    }, 700);
  } else {
    // Ажилтан — зөвхөн өөрийн ШИНЭ эрсдэл/санал/мэдээллийг бусдын датаг эвдэлгүйгээр нэмнэ (arrayUnion)
    try {
      var newHaz = (DB.hazards || []).filter(function (h) { return _empHazIds && !_empHazIds[h.id]; });
      var newSug = (DB.suggestions || []).filter(function (s) { return _empSugIds && !_empSugIds[s.id]; });
      var newRep = (DB.reports || []).filter(function (r) { return _empRepIds && !_empRepIds[r.id]; });
      if (!newHaz.length && !newSug.length && !newRep.length) return;
      var upd = {};
      if (newHaz.length) upd.hazards = firebase.firestore.FieldValue.arrayUnion.apply(null, newHaz);
      if (newSug.length) upd.suggestions = firebase.firestore.FieldValue.arrayUnion.apply(null, newSug);
      if (newRep.length) upd.reports = firebase.firestore.FieldValue.arrayUnion.apply(null, newRep);
      KPI_DOC().set(upd, { merge: true }).then(function () {
        if (_empHazIds) newHaz.forEach(function (h) { _empHazIds[h.id] = 1; });
        if (_empSugIds) newSug.forEach(function (s) { _empSugIds[s.id] = 1; });
        if (_empRepIds) newRep.forEach(function (r) { _empRepIds[r.id] = 1; });
      }).catch(function () { toast('Хадгалахад алдаа гарлаа', 'error'); });
    } catch (e) {}
  }
}

/* ============ KPI тооцоо (шинэ арга зүй: суурь + нэмэгдэх бонус) ============ */
function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
function kpiCfg() { return (DB.settings && DB.settings.kpi) || seedDB().settings.kpi; }
function _f(v, fb) { var n = parseFloat(v); return isNaN(n) ? (fb || 0) : n; }

/* — Гадны (бүлэг) сургалт: ажилтан өөрийн хамрагдсан сургалтын тоогоор оноо авна — */
function etHasAttendee(t, e) {
  return (t.attendees || []).some(function (a) {
    return (a.uid && e.uid && a.uid === e.uid) || (a.id && e.id && a.id === e.id) ||
      _sameEmail(a.email, e.email) || (a.name && e.name && String(a.name).toLowerCase() === String(e.name).toLowerCase());
  });
}
/* Тухайн ажилтны гадны сургалтын хамрах % (зөвхөн өөрийнх нь хамрагдсанаар). Сургалт алга бол null */
function empTrainingCoverage(e) {
  var all = DB.externalTrainings || [];
  if (!all.length) return null;
  var done = all.filter(function (t) { return etHasAttendee(t, e); }).length;
  return Math.round(done / all.length * 100);
}

/* — Суурь үзүүлэлтүүд (хувь хүн, 0–100). Юу ч хасахгүй — — */
function kpiVideo(e) {
  var cov = empTrainingCoverage(e);                          // гадны сургалтын хамрах %
  var vid = clamp(Math.round(_f(e.video, e.training)), 0, 100); // видео үзэлтийн импорт / fallback
  if (cov == null) return vid;                                // гадны сургалт алга → видео импорт
  return Math.max(cov, vid);                                  // хоёулаа сургалтын дүн — өндрийг нь авна
}
function kpiExam(e) { return clamp(Math.round(_f(e.examScore, e.training)), 0, 100); }
function kpiImprovement(e) {
  if (!e.examScore) return 0;                 // шалгалт өгөөгүй — ахиц хэмжих юм алга → 0
  if (e.examPrev == null) return 50;          // эхний шалгалт — суурь (өсөлт/бууралтыг хэмжих өмнөх дата алга)
  return clamp(Math.round(50 + (_f(e.examScore) - _f(e.examPrev)) * 4), 0, 100); // эерэг ахиц → өндөр оноо
}
function kpiFirstTry(e) { return e.firstTry ? 100 : 0; }

/* Суурь оноо (бонусгүй, 0–100). Албаны coverage үүн дээр тооцогдоно */
function empBase(e) {
  var w = kpiCfg().weights, bw = w.video + w.exam + w.improvement + w.firstTry;
  if (bw <= 0) return 0;
  return Math.round((kpiVideo(e) * w.video + kpiExam(e) * w.exam +
    kpiImprovement(e) * w.improvement + kpiFirstTry(e) * w.firstTry) / bw);
}

/* — Бонус (нэмэгдэх, зөвхөн баталгаажсан мэдээллээс, сарын cap-тай) — */
function reportPoints(r) {
  if (r.points_awarded != null) return r.points_awarded; // баталгаажихад түгжсэн оноо (тохиргоо дараа өөрчлөгдөхөд хуучин оноо хэвээр)
  var b = kpiCfg().bonus;
  if (r.type === 'near_miss') return (b.nearMiss && b.nearMiss[r.risk_level]) || (b.nearMiss && b.nearMiss.low) || 3;
  return b.hazard;
}
function reportBelongsTo(r, e) {
  if (r.reporterUid && e.uid) return r.reporterUid === e.uid;
  if (r.reporterId && e.id) return r.reporterId === e.id;
  return _sameEmail(r.reporterEmail, e.email);
}
function monthKey(iso) { var d = new Date(iso || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1); }

/* Ажилтны бонус оноо: сар бүр дээд тоо (cap), өндөр оноотойг нь эхэлж тооцно */
function empBonusPoints(e) {
  var cap = kpiCfg().bonus.monthlyCap || 99, byMonth = {};
  (DB.reports || []).forEach(function (r) {
    if (r.status !== 'verified' || !reportBelongsTo(r, e)) return;
    (byMonth[monthKey(r.verifiedAt || r.createdAt)] = byMonth[monthKey(r.verifiedAt || r.createdAt)] || []).push(reportPoints(r));
  });
  var total = 0;
  Object.keys(byMonth).forEach(function (mk) {
    var pts = byMonth[mk].sort(function (a, b) { return b - a; });
    for (var i = 0; i < pts.length && i < cap; i++) total += pts[i];
  });
  return total;
}
function empBonusScore(e) { return clamp(Math.round(empBonusPoints(e) / (kpiCfg().bonusTarget || 30) * 100), 0, 100); }

/* Нийт оноо (0–100): суурь хувь + бонус хувь. Бонус зөвхөн НЭМНЭ, хэзээ ч хасахгүй */
function empTotal(e) {
  var w = kpiCfg().weights, bw = w.video + w.exam + w.improvement + w.firstTry;
  return Math.round((empBase(e) * bw + empBonusScore(e) * w.bonus) / 100);
}
function avgKpi() { return avg(DB.employees.map(empTotal)); }

/* Суурь үзүүлэлт + бонусын дундаж (KPI хуудсанд) */
function categoryAverages() {
  var e = DB.employees;
  return {
    video: Math.round(avg(e.map(kpiVideo))), exam: Math.round(avg(e.map(kpiExam))),
    improvement: Math.round(avg(e.map(kpiImprovement))), firstTry: Math.round(avg(e.map(kpiFirstTry))),
    bonus: Math.round(avg(e.map(empBonusScore)))
  };
}

/* — Албаны түвшний оноо (coverage + бонус + анхны тусламж + PPE) — */
function deptList() {
  var s = {}; (DB.employees || []).forEach(function (e) { if (e.dept) s[e.dept] = 1; });
  return Object.keys(s);
}
function deptMembers(dept) { return (DB.employees || []).filter(function (e) { return e.dept === dept && !e.onLeave; }); }
function deptCoverage(dept) {
  var m = deptMembers(dept); if (!m.length) return 0;
  var th = kpiCfg().baseThreshold, ok = m.filter(function (e) { return empBase(e) >= th; }).length;
  return Math.round(ok / m.length * 100);
}
function deptBonusScore(dept) { var m = deptMembers(dept); return m.length ? Math.round(avg(m.map(empBonusScore))) : 0; }
function deptFirstAid(dept) {
  var c = (DB.firstAidChecks || []).filter(function (x) { return x.dept === dept; })
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
  if (!c) return null;
  if (c.complete) return 100;
  var tot = c.totalItems || 12;
  return clamp(Math.round((tot - (c.missing || []).length) / tot * 100), 0, 100);
}
function deptPpe(dept) {
  var obs = (DB.ppeObservations || []).filter(function (o) { return o.dept === dept; });
  if (!obs.length) return null;
  var tot = obs.reduce(function (a, o) { return a + _f(o.total); }, 0);
  var comp = obs.reduce(function (a, o) { return a + _f(o.compliant); }, 0);
  return tot ? Math.round(comp / tot * 100) : null;
}
function deptScore(dept) {
  var dw = kpiCfg().dept;
  var parts = [
    { v: deptCoverage(dept), w: dw.coverage }, { v: deptBonusScore(dept), w: dw.bonus },
    { v: deptFirstAid(dept), w: dw.firstAid }, { v: deptPpe(dept), w: dw.ppe }
  ].filter(function (p) { return p.v != null; });
  var ws = parts.reduce(function (a, p) { return a + p.w; }, 0);
  return ws ? Math.round(parts.reduce(function (a, p) { return a + p.v * p.w; }, 0) / ws) : 0;
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
  // Эрхийн түвшнээс хамаарч хязгаарлагдсан хуудас руу орохыг хориглоно
  if (blockedPages().indexOf(pageId) >= 0) { pageId = 'dashboard'; }
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
  // Динамикаар зурагддаг хуудсуудыг шинэчилнэ
  if (pageId === 'reportflow') renderReportflow();
  else if (pageId === 'myresults') renderMyResults();
  else if (pageId === 'daatgal') renderDaatgal();
  else if (pageId === 'adminpanel') renderAdminPanel();
  else if (pageId === 'examadmin') renderExamAdmin();
  else if (pageId === 'kpi') renderKpiPage();
  else if (pageId === 'ppe') renderPpe();
  else if (pageId === 'inspections') renderInspections();
  else if (pageId === 'dataflow') renderDataflow();
  else if (pageId === 'settings') renderSettings();
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
/* Ажилтны өөрийн ажилтны бүртгэлийг олох (scope хийгдсэн DB дотроос) */
function myEmployeeRecord() {
  if (!SESSION) return null;
  var me = (DB.employees || []).filter(function (e) { return (SESSION.uid && e.uid === SESSION.uid) || _sameEmail(e.email, SESSION.email) || (SESSION.empId && e.id === SESSION.empId); })[0];
  return me || (DB.employees || [])[0] || null;
}
function kpiLevel(total) {
  if (total >= 90) return { name: 'Алтан', icon: 'ti-trophy', color: '#D97706', next: null, min: 90 };
  if (total >= 75) return { name: 'Мөнгөн', icon: 'ti-medal', color: '#0EA5E9', next: 90, min: 75 };
  if (total >= 60) return { name: 'Хүрэл', icon: 'ti-award', color: '#B45309', next: 75, min: 60 };
  return { name: 'Эхлэгч', icon: 'ti-seedling', color: '#16A34A', next: 60, min: 0 };
}

/* Шалгалт тус бүрийн дүнг (нэр + Урьдчилсан/Дараах) тусад нь харуулах HTML */
function habeaExamsHTML(e) {
  var list = (e && e.habeaExams) || [];
  if (!list.length) return '';
  function tl(t) { return t === 'pre' ? 'Урьдчилсан' : (t === 'post' ? 'Сургалтын дараах' : 'Шалгалт'); }
  return '<div class="card" style="padding:18px;margin-bottom:18px"><h3 style="margin:0 0 4px">Шалгалтын дүнгүүд</h3>' +
    '<div style="font-size:12px;color:#8A94A6;margin-bottom:6px">Өгсөн шалгалт тус бүрийн дүн</div>' +
    list.map(function (x) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #F1F5F9">' +
        '<div style="min-width:0"><div style="font-weight:600;font-size:14px">' + esc(x.title) + '</div>' +
        '<div style="font-size:12px;color:#8A94A6">' + tl(x.type) + ' · ' + (x.passed ? '<span style="color:#0e8e59">тэнцсэн ✓</span>' : '<span style="color:#dc2626">тэнцээгүй</span>') + '</div></div>' +
        '<span class="score-pill ' + scoreClass(x.percent) + '">' + x.percent + '%</span></div>';
    }).join('') + '</div>';
}

/* Эерэг ажилтны дашбоард — "би өсч байна", бусадтай харьцуулахгүй */
function renderEmployeeDashboard() {
  var sec = pageEl('dashboard'); if (!sec) return;
  var e = myEmployeeRecord();
  if (!e) { sec.innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-user-question"></i><div>Таны мэдээлэл олдсонгүй. ХАБЭА ажилтантай холбогдоно уу.</div></div>'; return; }
  var total = empTotal(e), bonus = empBonusPoints(e), lvl = kpiLevel(total);
  var toNext = lvl.next != null ? Math.max(0, lvl.next - total) : 0;
  var progPct = lvl.next != null ? clamp(Math.round((total - lvl.min) / (lvl.next - lvl.min) * 100), 0, 100) : 100;
  var improved = (e.examPrev != null && e.examScore != null) ? (num(e.examScore) - num(e.examPrev)) : null;
  var myReports = (DB.reports || []).filter(function (r) { return reportBelongsTo(r, e); });
  var verifiedCnt = myReports.filter(function (r) { return r.status === 'verified'; }).length;
  var bars = [
    ['Видео сургалтын үзэлт', kpiVideo(e), 'ti-player-play'], ['Шалгалтын дүн', kpiExam(e), 'ti-clipboard-check'],
    ['Шалгалтын ахиц', kpiImprovement(e), 'ti-trending-up'], ['Дахин шалгалтгүй тэнцсэн', kpiFirstTry(e), 'ti-medal']
  ];
  var firstName = (e.name || '').split(/\s+/).pop();
  sec.innerHTML =
    '<div style="margin-bottom:18px"><h1 style="margin:0">Сайн байна уу, ' + esc(firstName) + '! 👋</h1>' +
    '<p class="page-subtitle" style="margin-top:4px">Энэ бол зөвхөн таны өөрийн ахиц — бусадтай харьцуулахгүй, өөртэйгөө л өрсөлдөнө.</p></div>' +
    '<div class="card" style="padding:22px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:18px;background:linear-gradient(135deg,#F0FDF4,#fff)">' +
    '<div style="width:78px;height:78px;border-radius:20px;background:' + lvl.color + '1A;color:' + lvl.color + ';display:flex;align-items:center;justify-content:center;font-size:38px"><i class="ti ' + lvl.icon + '"></i></div>' +
    '<div style="flex:1;min-width:200px"><div style="font-size:13px;color:#64748B">Таны түвшин</div>' +
    '<div style="font-size:26px;font-weight:800;font-family:\'Bricolage Grotesque\',sans-serif">' + lvl.name + ' · ' + total + '/100</div>' +
    (lvl.next != null ? '<div style="margin-top:8px;display:flex;align-items:center;gap:10px">' + miniBar(progPct, lvl.color) + '</div><div style="font-size:12px;color:#64748B;margin-top:4px">Дараагийн түвшин хүртэл <strong>' + toNext + '</strong> оноо</div>' : '<div style="color:#16A34A;font-weight:600;margin-top:6px">Хамгийн дээд түвшинд хүрсэн! 🎉</div>') +
    '</div></div>' +
    '<div class="card" style="padding:18px;margin-bottom:18px"><h3 style="margin:0 0 14px">Миний суурь үзүүлэлт</h3>' +
    bars.map(function (b) {
      return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:13px"><i class="ti ' + b[2] + '" style="color:#64748B;width:20px;text-align:center"></i>' +
        '<div style="width:180px;font-size:13px">' + b[0] + '</div>' + miniBar(b[1]) + '<div style="width:36px;text-align:right;font-weight:700">' + b[1] + '</div></div>';
    }).join('') + '</div>' +
    habeaExamsHTML(e) +
    '<div style="display:flex;gap:18px;flex-wrap:wrap">' +
    '<div class="card" style="flex:1;min-width:240px;padding:18px">' +
    '<div style="display:flex;align-items:center;gap:10px"><i class="ti ti-gift" style="font-size:28px;color:#16A34A"></i>' +
    '<div><div style="font-size:26px;font-weight:800;color:#16A34A;font-family:\'Bricolage Grotesque\',sans-serif">+' + bonus + '</div><div style="font-size:13px;color:#64748B">Нэмэгдэх бонус оноо</div></div></div>' +
    '<div style="font-size:13px;color:#64748B;margin-top:10px">Та ' + verifiedCnt + ' баталгаажсан мэдээлэл оруулсан. Аюул/near-miss мэдээлэх тусам бонус нэмэгдэнэ — хэзээ ч хасагдахгүй.</div>' +
    '<button class="btn btn-primary btn-sm" data-goreport="1" style="margin-top:12px"><i class="ti ti-flag-2"></i> Мэдээлэх</button></div>' +
    (improved != null ? '<div class="card" style="flex:1;min-width:240px;padding:18px">' +
      '<div style="display:flex;align-items:center;gap:10px"><i class="ti ' + (improved >= 0 ? 'ti-trending-up' : 'ti-arrow-down') + '" style="font-size:28px;color:' + (improved >= 0 ? '#16A34A' : '#64748B') + '"></i>' +
      '<div><div style="font-size:26px;font-weight:800;color:' + (improved >= 0 ? '#16A34A' : '#64748B') + ';font-family:\'Bricolage Grotesque\',sans-serif">' + (improved >= 0 ? '+' : '') + improved + '</div><div style="font-size:13px;color:#64748B">Шалгалтын ахиц</div></div></div>' +
      '<div style="font-size:13px;color:#64748B;margin-top:10px">' + (improved > 0 ? 'Гайхалтай! Та өмнөх үеэсээ сайжирсан. 👏' : (improved === 0 ? 'Тогтвортой байна. Дараагийн шалгалтад ахихыг зорь!' : 'Зүгээр ээ — дараагийн удаа сайжруулъя. Бид тусална.')) + '</div></div>' : '') +
    '</div>';
  if (!sec._empWired) { sec._empWired = true; sec.addEventListener('click', function (ev) { if (ev.target.closest('[data-goreport]')) switchPage('reportflow'); }); }
}

function renderDashboard() {
  if (isEmp()) { renderEmployeeDashboard(); return; }
  var a = avgKpi();
  var hero = $('.page[data-page="dashboard"] .kpi-hero .kpi-value');
  if (hero) hero.innerHTML = a.toFixed(1) + '<span class="kpi-unit">/100</span>';
  var fill = $('.page[data-page="dashboard"] .kpi-hero .kpi-bar-fill');
  if (fill) fill.style.width = a.toFixed(1) + '%';

  var cards = $$('.page[data-page="dashboard"] .kpi-grid .kpi-card');
  if (cards[2]) {
    var v2 = cards[2].querySelector('.kpi-value');
    var pendCnt = (DB.reports || []).filter(function (r) { return r.status === 'reported'; }).length;
    if (v2) v2.textContent = (DB.reports || []).length;
    var lbl2 = cards[2].querySelector('.kpi-label');
    if (lbl2) lbl2.innerHTML = '<i class="ti ti-flag-2"></i> Аюул/near-miss мэдээлэл';
    var sub2 = cards[2].querySelector('.kpi-sub');
    if (sub2) sub2.textContent = pendCnt + ' хүлээгдэж буй';
  }
  if (cards[3]) {
    var v3 = cards[3].querySelector('.kpi-value');
    if (v3) v3.textContent = dayCounter();
  }
  /* Видео сургалтын хамрах — DB.employees-ээс динамикаар */
  cards.forEach(function (card) {
    var label = card.querySelector('.kpi-label');
    if (label && /хамрах/i.test(label.textContent)) {
      var total = DB.employees.length;
      var trained = DB.employees.filter(function (e) { return kpiVideo(e) >= 60; }).length;
      var pct = total ? Math.round(trained / total * 100) : 0;
      var vv = card.querySelector('.kpi-value');
      if (vv) vv.innerHTML = pct + '<span class="kpi-unit">%</span>';
      var sub = card.querySelector('.kpi-sub');
      if (sub) sub.textContent = trained + '/' + total + ' ажилтан';
    }
  });

  /* Радар легенд — шинэ үзүүлэлтээр динамик */
  var cat = categoryAverages();
  var legVals = [cat.video, cat.exam, cat.improvement, cat.firstTry, cat.bonus];
  var legLabels = ['Видео', 'Шалгалт', 'Ахиц', 'Анх тэнцсэн', 'Бонус'];
  $$('.page[data-page="dashboard"] .legend-item').forEach(function (li, i) {
    if (legVals[i] == null) return;
    var dot = li.querySelector('.dot') ? li.querySelector('.dot').outerHTML : '';
    li.innerHTML = dot + legLabels[i] + ' <strong>' + legVals[i] + '</strong>';
  });

  /* Албадын оноо (coverage + бонус + анхны тусламж + PPE) */
  var deptListEl = $('.page[data-page="dashboard"] .dept-list');
  if (deptListEl) {
    var rows = deptList().map(function (d) {
      return { dept: d, score: deptScore(d), n: DB.employees.filter(function (e) { return e.dept === d; }).length };
    }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.score - a.score; });
    deptListEl.innerHTML = rows.map(function (r) {
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
        '<td><span class="score-pill ' + scoreClass(kpiVideo(e)) + '">' + kpiVideo(e) + '</span></td>' +
        '<td><span class="score-pill ' + scoreClass(kpiExam(e)) + '">' + kpiExam(e) + '</span></td>' +
        '<td><span class="score-pill ' + scoreClass(kpiImprovement(e)) + '">' + kpiImprovement(e) + '</span></td>' +
        '<td><span class="score-pill score-bonus" title="' + empBonusPoints(e) + ' оноо">+' + empBonusPoints(e) + '</span></td>' +
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

/* ============ KPI хуудас (шинэ арга зүй: суурь + нэмэгдэх бонус) ============ */
var KPI_BASE_META = [
  { key: 'video', label: 'Видео сургалтын үзэлт', icon: 'ti-player-play', color: ['#FEF3C7', '#92400E'], desc: 'Гадаад платформоос импортолсон үзэлтийн %', fn: kpiVideo },
  { key: 'exam', label: 'Танхим шалгалтын дүн', icon: 'ti-clipboard-check', color: ['#D1FAE5', '#065F46'], desc: 'QR кодоор өгсөн шалгалтын дундаж дүн', fn: kpiExam },
  { key: 'improvement', label: 'Шалгалтын дүнгийн ахиц', icon: 'ti-trending-up', color: ['#DBEAFE', '#1E40AF'], desc: 'Өмнөх улирлаас дээшилсэн нь урамшина', fn: kpiImprovement },
  { key: 'firstTry', label: 'Дахин шалгалтгүй тэнцсэн', icon: 'ti-medal', color: ['#E0E7FF', '#3730A3'], desc: 'Анхны шалгалтаа дан тэнцсэн (жижиг бонус)', fn: kpiFirstTry }
];
function scoreTone(v) { return v >= 88 ? '' : (v >= 75 ? ' warn' : ' danger'); }
function badgeTone(v) { return v >= 88 ? 'success' : (v >= 75 ? 'warn' : 'danger'); }
function miniBar(v, color) {
  return '<div style="flex:1;height:7px;border-radius:4px;background:#EEF1F4;overflow:hidden">' +
    '<div style="height:100%;width:' + clamp(v, 0, 100) + '%;background:' + (color || '#16A34A') + '"></div></div>';
}

function renderKpiPage() {
  var w = kpiCfg().weights, b = kpiCfg().bonus, emps = DB.employees || [];
  var sub = $('.page[data-page="kpi"] .page-subtitle');
  if (sub) sub.textContent = 'Суурь үзүүлэлт + нэмэгдэх бонус · leading indicator загвар';

  // page-actions товчнуудыг утга оноох
  var editBtn = $('.page[data-page="kpi"] .page-actions .btn-primary');
  if (editBtn) { editBtn.innerHTML = '<i class="ti ti-adjustments"></i> Жин тохируулах'; editBtn.onclick = function () { switchPage('settings'); }; }
  var infoBtn = $('.page[data-page="kpi"] .page-actions .btn-secondary');
  if (infoBtn) { infoBtn.innerHTML = '<i class="ti ti-info-circle"></i> Арга зүй'; infoBtn.onclick = function () { infoModal('Үнэлгээний арга зүй', kpiMethodologyHtml(), '560px'); }; }

  // Динамик томьёо
  var fr = $('.page[data-page="kpi"] .formula');
  if (fr) {
    var terms = [['f-amber', 'Видео', w.video], ['f-teal', 'Шалгалт', w.exam], ['f-emerald', 'Ахиц', w.improvement],
      ['f-blue', 'Анх тэнцсэн', w.firstTry], ['f-coral', 'Бонус', w.bonus]];
    fr.innerHTML = '<span>Нийт =</span>' + terms.map(function (t, i) {
      return (i ? '<span>+</span>' : '') + '<span class="f-term ' + t[0] + '">' + t[1] + ' × <strong>' + (t[2] / 100).toFixed(2) + '</strong></span>';
    }).join('') + '<span style="margin-left:8px;font-size:12px;color:#16A34A;font-weight:600">бонус зөвхөн нэмнэ ↑</span>';
  }

  var grid = $('.page[data-page="kpi"] .kpi-cat-grid');
  if (!grid) return;
  var html = '';

  // — 4 суурь үзүүлэлт —
  KPI_BASE_META.forEach(function (m) {
    var v = emps.length ? Math.round(avg(emps.map(m.fn))) : 0;
    html += '<div class="kpi-cat-card"><div class="kpi-cat-head">' +
      '<div class="kpi-cat-icon" style="background:' + m.color[0] + ';color:' + m.color[1] + '"><i class="ti ' + m.icon + '"></i></div>' +
      '<div><h3>' + m.label + '</h3><p>Жин: ' + w[m.key] + '%</p></div>' +
      '<div class="kpi-cat-score' + scoreTone(v) + '">' + v + '</div></div>' +
      '<ul class="kpi-cat-items"><li><span>' + m.desc + '</span></li>' +
      '<li><span>Байгууллагын дундаж</span><span class="badge badge-' + badgeTone(v) + '">' + v + '</span></li></ul></div>';
  });

  // — Нэмэгдэх бонус карт —
  var bonusAvg = emps.length ? Math.round(avg(emps.map(empBonusScore))) : 0;
  var vNm = (DB.reports || []).filter(function (r) { return r.type === 'near_miss' && r.status === 'verified'; }).length;
  var vHz = (DB.reports || []).filter(function (r) { return r.type === 'hazard' && r.status === 'verified'; }).length;
  var pend = (DB.reports || []).filter(function (r) { return r.status === 'reported'; }).length;
  html += '<div class="kpi-cat-card" style="border:1.5px solid #BBF7D0"><div class="kpi-cat-head">' +
    '<div class="kpi-cat-icon" style="background:#DCFCE7;color:#166534"><i class="ti ti-gift"></i></div>' +
    '<div><h3>Нэмэгдэх бонус</h3><p>Жин: ' + w.bonus + '% · зөвхөн нэмнэ</p></div>' +
    '<div class="kpi-cat-score' + scoreTone(bonusAvg) + '">' + bonusAvg + '</div></div>' +
    '<ul class="kpi-cat-items">' +
    '<li><span>Баталгаажсан near-miss</span><span class="badge badge-success">' + vNm + '</span></li>' +
    '<li><span>Баталгаажсан аюул</span><span class="badge badge-success">' + vHz + '</span></li>' +
    '<li><span>Хүлээгдэж буй мэдээлэл</span><span class="badge badge-warn">' + pend + '</span></li>' +
    '<li><span>Near-miss оноо (эрсдэлээр)</span><span style="font-size:12px">бага ' + b.nearMiss.low + ' · дунд ' + b.nearMiss.mid + ' · өндөр ' + b.nearMiss.high + '</span></li>' +
    '<li><span>Сарын дээд хязгаар</span><span class="badge">' + b.monthlyCap + ' мэдээлэл</span></li></ul></div>';

  // — Албадын оноо (full width) —
  var depts = deptList().sort(function (a, b2) { return deptScore(b2) - deptScore(a); });
  var deptRows = depts.map(function (d) {
    var s = deptScore(d), cov = deptCoverage(d), bn = deptBonusScore(d), fa = deptFirstAid(d), pp = deptPpe(d);
    function cell(label, val, unit) {
      return '<div style="min-width:96px"><div style="font-size:11px;color:#8A94A6">' + label + '</div>' +
        '<div style="font-weight:700;font-size:14px">' + (val == null ? '—' : val + (unit || '')) + '</div></div>';
    }
    return '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #EEF1F4;flex-wrap:wrap">' +
      '<div style="width:120px;font-weight:700">' + esc(d) + '</div>' +
      '<div class="kpi-cat-score' + scoreTone(s) + '" style="font-size:22px;width:54px;text-align:center">' + s + '</div>' +
      '<div style="flex:1;min-width:140px;display:flex;align-items:center;gap:8px">' + miniBar(s) + '</div>' +
      cell('Coverage', cov, '%') + cell('Бонус', bn, '') + cell('Анхны тусламж', fa, fa == null ? '' : '%') + cell('PPE', pp, pp == null ? '' : '%') +
      '</div>';
  }).join('');
  html += '<div class="kpi-cat-card" style="grid-column:1/-1"><div class="kpi-cat-head" style="margin-bottom:6px">' +
    '<div class="kpi-cat-icon" style="background:#F1F5F9;color:#334155"><i class="ti ti-building-community"></i></div>' +
    '<div><h3>Албадын оноо</h3><p>Coverage % + бонус + анхны тусламж + PPE мөрдөлт</p></div></div>' +
    '<div style="margin-top:6px">' + (deptRows || '<div class="empty-state" style="padding:18px"><i class="ti ti-info-circle"></i><div>Дата алга</div></div>') + '</div></div>';

  // — Үнэлгээний түвшин (эерэг хүрээ) —
  html += '<div class="kpi-cat-card threshold-card" style="grid-column:1/-1"><h3>Үнэлгээний түвшин</h3>' +
    '<div class="threshold-list">' +
    '<div class="threshold-row threshold-excellent"><div class="threshold-range">90–100</div><div class="threshold-label">Маш сайн</div><div class="threshold-action">Цалингийн урамшуулал</div></div>' +
    '<div class="threshold-row threshold-good"><div class="threshold-range">75–89</div><div class="threshold-label">Сайн (суурь хангалттай)</div><div class="threshold-action">Тогтмол үргэлжлүүлэх</div></div>' +
    '<div class="threshold-row threshold-ok"><div class="threshold-range">60–74</div><div class="threshold-label">Дунд</div><div class="threshold-action">Дэмжих, чиглүүлэх</div></div>' +
    '<div class="threshold-row threshold-low"><div class="threshold-range">&lt;60</div><div class="threshold-label">Эхэлж байгаа</div><div class="threshold-action">Нэмэлт сургалт санал болгох</div></div>' +
    '</div></div>';

  grid.innerHTML = html;
}

function kpiMethodologyHtml() {
  var c = kpiCfg();
  return '<div style="line-height:1.6;font-size:14px">' +
    '<p><strong>Зарчим:</strong> Энэ систем "осол болоогүй"-г биш, ажилтан <strong>идэвхтэй оролцож байгааг</strong> хэмжинэ (leading indicator). Бонус зөвхөн <strong>нэмэгдэнэ</strong>, хэзээ ч хасагдахгүй. KPI урамшуулдаг — шийтгэдэггүй.</p>' +
    '<p style="margin-top:10px"><strong>Хувь хүний оноо</strong> = Суурь (видео ' + c.weights.video + '% + шалгалт ' + c.weights.exam + '% + ахиц ' + c.weights.improvement + '% + анх тэнцсэн ' + c.weights.firstTry + '%) + Бонус (' + c.weights.bonus + '%).</p>' +
    '<p style="margin-top:10px"><strong>Бонус</strong> зөвхөн ХАБ ажилтан <strong>баталгаажуулсны дараа</strong> тооцогдоно. Аюул +' + c.bonus.hazard + '. Near-miss эрсдэлээр: бага ' + c.bonus.nearMiss.low + ', дунд ' + c.bonus.nearMiss.mid + ', өндөр ' + c.bonus.nearMiss.high + '. Нэг хүн сард дээд тал нь ' + c.bonus.monthlyCap + ' мэдээллээр бонус авна (тоо биш чанарыг урамшуулна).</p>' +
    '<p style="margin-top:10px"><strong>Албаны оноо</strong> = босго (' + c.baseThreshold + ') давсан гишүүдийн хувь (coverage) + албаны бонус + анхны тусламжийн хайрцгийн бүрэн бүтэн байдал + PPE мөрдөлтийн %. <em>Нэг хүний хоцрогдол бүхэл албыг унагаахгүй.</em></p>' +
    '<p style="margin-top:10px;color:#64748B;font-size:13px">Бүх жин, босго, бонус оноо, cap-ыг <strong>Тохиргоо</strong> хэсгээс өөрчилж болно — кодонд хатуу бичээгүй.</p>' +
    '</div>';
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

/* ============ Аюул / Near-miss мэдээлэл → баталгаажуулалт → бонус ============ */
var REPORT_RISK = [['low', 'Бага', '#16A34A'], ['mid', 'Дунд', '#D97706'], ['high', 'Өндөр', '#DC2626']];

function downscaleImage(file, maxDim, quality, cb) {
  try {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var sc = Math.min(1, maxDim / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { cb(c.toDataURL('image/jpeg', quality)); } catch (e) { cb(''); }
      };
      img.onerror = function () { cb(''); };
      img.src = ev.target.result;
    };
    reader.onerror = function () { cb(''); };
    reader.readAsDataURL(file);
  } catch (e) { cb(''); }
}

function currentReporter() {
  if (SESSION && (SESSION.uid || SESSION.email)) {
    var me = (DB.employees || []).filter(function (e) { return (SESSION.uid && e.uid === SESSION.uid) || _sameEmail(e.email, SESSION.email); })[0];
    if (me) return { id: me.id, uid: me.uid || SESSION.uid || '', name: me.name, dept: me.dept || '', email: me.email || SESSION.email || '' };
    return { id: '', uid: SESSION.uid || '', name: USER.name, dept: '', email: SESSION.email || '' };
  }
  var e0 = (DB.employees || [])[0];
  return e0 ? { id: e0.id, uid: e0.uid || '', name: e0.name, dept: e0.dept || '', email: e0.email || '' } : { id: '', uid: '', name: USER.name, dept: '', email: '' };
}

function riskTag(r) {
  var m = { low: ['Бага эрсдэл', 'tag-emerald'], mid: ['Дунд эрсдэл', 'tag-warn'], high: ['Өндөр эрсдэл', 'tag-coral'] };
  var x = m[r] || m.low; return '<span class="tag ' + x[1] + '">' + x[0] + '</span>';
}
function reportTypeLabel(t) { return t === 'near_miss' ? 'Осолд дөхсөн' : 'Аюул/эрсдэл'; }
function reportStatusTag(s) {
  if (s === 'verified') return '<span class="tag tag-emerald">Баталгаажсан</span>';
  if (s === 'rejected') return '<span class="tag tag-coral">Татгалзсан</span>';
  return '<span class="tag tag-warn">Хүлээгдэж буй</span>';
}
function statCard(label, val, icon, color) {
  return '<div style="flex:1;min-width:128px;background:#fff;border:1px solid #EEF1F4;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px">' +
    '<div style="width:36px;height:36px;border-radius:9px;background:' + color + '1A;color:' + color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ' + icon + '"></i></div>' +
    '<div><div style="font-size:20px;font-weight:700;font-family:\'Bricolage Grotesque\',sans-serif;line-height:1.1">' + val + '</div>' +
    '<div style="font-size:12px;color:#8A94A6">' + label + '</div></div></div>';
}
function emptyBox(msg) { return '<div class="empty-state" style="padding:24px"><i class="ti ti-inbox"></i><div>' + esc(msg) + '</div></div>'; }

function reportCard(r, withActions) {
  var photo = r.photo ? '<img src="' + r.photo + '" style="width:54px;height:54px;border-radius:8px;object-fit:cover;flex-shrink:0">' :
    '<div style="width:54px;height:54px;border-radius:8px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;color:#94A3B8;flex-shrink:0"><i class="ti ti-photo"></i></div>';
  var pts = reportPoints(r), actions = '';
  if (withActions && r.status === 'reported') {
    actions = '<div style="display:flex;gap:8px;margin-top:8px">' +
      '<button class="btn btn-primary btn-sm" data-verify="' + r.id + '"><i class="ti ti-check"></i> Батлах (+' + pts + ')</button>' +
      '<button class="btn btn-secondary btn-sm" data-reject="' + r.id + '">Татгалзах</button></div>';
  }
  return '<div class="report-card" data-report="' + r.id + '">' + photo +
    '<div style="flex:1;min-width:0">' +
    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + reportStatusTag(r.status) +
    '<span class="tag">' + reportTypeLabel(r.type) + '</span>' + riskTag(r.risk_level) +
    (r.status === 'verified' ? '<span class="tag tag-emerald">+' + pts + ' бонус</span>' : '') + '</div>' +
    '<div style="font-weight:600;margin-top:5px">' + esc(r.desc) + '</div>' +
    '<div style="font-size:12px;color:#8A94A6;margin-top:2px">' + esc(r.location) + ' · ' + esc(r.reporterName || '—') + ' · ' + timeAgo(r.createdAt) + '</div>' +
    actions + '</div></div>';
}

function actionReportNew(presetType) {
  var sel = { type: presetType || 'near_miss', risk: 'mid', photo: '' };
  var node = elc('div', 'report-form');
  function chips(items, cur, key) {
    return '<div class="rf-chips" data-chipgroup="' + key + '">' + items.map(function (it) {
      return '<button type="button" class="rf-chip' + (it[0] === cur ? ' active' : '') + '" data-val="' + it[0] + '"' +
        (it[2] ? ' style="--c:' + it[2] + '"' : '') + '>' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  node.innerHTML =
    '<div class="rf-field"><label>1. Зураг (заавал биш)</label>' +
    '<label class="rf-photo" id="rfPhotoLbl"><input type="file" accept="image/*" id="rfPhoto" hidden>' +
    '<i class="ti ti-camera"></i><span>Зураг авах / хавсаргах</span></label>' +
    '<img id="rfPreview" style="display:none;max-width:100%;border-radius:10px;margin-top:8px"></div>' +
    '<div class="rf-field"><label>2. Төрөл</label>' + chips([['near_miss', 'Осолд дөхсөн (near-miss)'], ['hazard', 'Аюул / эрсдэл']], sel.type, 'type') + '</div>' +
    '<div class="rf-field"><label>3. Эрсдэлийн зэрэг</label>' + chips(REPORT_RISK, sel.risk, 'risk') + '</div>' +
    '<div class="rf-field"><label>4. Байршил</label><select id="rfLoc" class="rf-input">' + AREAS.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select></div>' +
    '<div class="rf-field"><label>5. Нэг өгүүлбэрээр тайлбарла</label><textarea id="rfDesc" class="rf-input" rows="2" placeholder="Юу болсон / болж болзошгүй вэ?"></textarea></div>' +
    '<div class="rf-hint"><i class="ti ti-clock"></i> 1 минутын дотор. ХАБ ажилтан баталгаажуулсны дараа бонус оноо автоматаар нэмэгдэнэ.</div>' +
    '<button class="btn btn-primary btn-block" id="rfSubmit"><i class="ti ti-send"></i> Илгээх</button>';

  node.addEventListener('click', function (ev) {
    var chip = ev.target.closest('.rf-chip');
    if (chip) {
      var grp = chip.closest('[data-chipgroup]');
      $$('.rf-chip', grp).forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      sel[grp.getAttribute('data-chipgroup')] = chip.getAttribute('data-val');
      return;
    }
    if (ev.target.closest('#rfSubmit')) {
      var desc = $('#rfDesc', node).value.trim();
      if (!desc) { toast('Тайлбар оруулна уу', 'warn'); return; }
      createReport(sel.type, sel.risk, $('#rfLoc', node).value, desc, sel.photo);
      closeModal();
    }
  });
  $('#rfPhoto', node).addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    downscaleImage(f, 240, 0.45, function (durl) {
      sel.photo = durl || '';
      if (durl) { var pv = $('#rfPreview', node); pv.src = durl; pv.style.display = 'block'; $('#rfPhotoLbl span', node).textContent = 'Зураг солих'; }
    });
  });
  buildModal(presetType === 'hazard' ? 'Аюул / эрсдэл мэдээлэх' : 'Осолд дөхсөн мэдээлэх', node, { width: '440px' });
}

function createReport(type, risk, location, desc, photo) {
  var who = currentReporter();
  var r = {
    id: nextId('RP', DB.reports), type: type, risk_level: risk, status: 'reported',
    desc: desc, location: location, dept: who.dept || '',
    reporterId: who.id || '', reporterUid: who.uid || '', reporterName: who.name || '', reporterEmail: who.email || '',
    photo: photo || '', verifiedBy: '', verifiedAt: '', createdAt: new Date().toISOString()
  };
  DB.reports.unshift(r);
  addNotification((type === 'near_miss' ? 'Осолд дөхсөн' : 'Аюул') + ' мэдээлэл ирлээ — ' + location + ' (' + who.name + ')', 'reportflow');
  saveDB();
  renderReportflow(); renderNotifBadge(); renderDashboard();
  toast('Мэдээлэл илгээгдлээ. Баталгаажсаны дараа бонус нэмэгдэнэ.', 'success');
}

function verifyReport(id, decision, newRisk) {
  var r = (DB.reports || []).filter(function (x) { return x.id === id; })[0];
  if (!r || r.status !== 'reported') return;
  r.verifiedAt = new Date().toISOString();
  r.verifiedBy = (SESSION && SESSION.email) || USER.name;
  r.verified_by = r.verifiedBy; // спекийн талбарын нэр
  if (decision === 'verify') {
    if (newRisk) r.risk_level = newRisk;
    r.status = 'verified';
    r.points_awarded = reportPoints(r); // баталгаажихад оноог түгжиж хадгална
    addNotification('Таны мэдээлэл баталгаажлаа (+' + r.points_awarded + ' бонус) — ' + r.location, 'reportflow', r.reporterUid);
    toast('Баталгаажлаа. +' + r.points_awarded + ' бонус оноо тооцогдлоо.', 'success');
  } else {
    r.status = 'rejected';
    addNotification('Таны мэдээлэл баталгаажсангүй — ' + r.location, 'reportflow', r.reporterUid);
    toast('Татгалзлаа', 'info');
  }
  saveDB();
  renderReportflow(); renderKpiPage(); renderEmployees(); renderDashboard(); renderNotifBadge();
}

function openReportDetail(id) {
  var r = (DB.reports || []).filter(function (x) { return x.id === id; })[0];
  if (!r) return;
  var admin = isAdmin();
  var photo = r.photo ? '<img src="' + r.photo + '" style="width:100%;border-radius:12px;margin-bottom:12px">' : '';
  var html = photo + '<div class="detail-grid">' +
    '<div class="detail-row"><span>Төрөл</span><b>' + reportTypeLabel(r.type) + '</b></div>' +
    '<div class="detail-row"><span>Эрсдэл</span><b>' + riskTag(r.risk_level) + '</b></div>' +
    '<div class="detail-row"><span>Байршил</span><b>' + esc(r.location) + '</b></div>' +
    '<div class="detail-row"><span>Мэдээлсэн</span><b>' + esc(r.reporterName || '—') + '</b></div>' +
    '<div class="detail-row"><span>Огноо</span><b>' + new Date(r.createdAt).toLocaleString('mn-MN') + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + reportStatusTag(r.status) + '</b></div>' +
    (r.verifiedBy ? '<div class="detail-row"><span>Шийдвэрлэсэн</span><b>' + esc(r.verifiedBy) + '</b></div>' : '') + '</div>' +
    '<p style="margin:12px 2px;font-size:14px;line-height:1.5"><strong>Тайлбар:</strong> ' + esc(r.desc) + '</p>';
  if (admin && r.status === 'reported') {
    var nm = kpiCfg().bonus.nearMiss;
    html += '<div style="margin:12px 0"><label style="font-size:13px;color:#64748B">Эрсдэлийн зэргийг тогтоо (бонус оноо)</label>' +
      '<div class="rf-chips" id="rdRisk" style="margin-top:6px">' + REPORT_RISK.map(function (x) {
        return '<button type="button" class="rf-chip' + (x[0] === r.risk_level ? ' active' : '') + '" data-val="' + x[0] + '" style="--c:' + x[2] + '">' + x[1] + ' (+' + (r.type === 'near_miss' ? nm[x[0]] : kpiCfg().bonus.hazard) + ')</button>';
      }).join('') + '</div></div>' +
      '<div class="detail-actions"><button class="btn btn-secondary" data-rdreject="1">Татгалзах</button>' +
      '<button class="btn btn-primary" data-rdverify="1">Баталгаажуулах</button></div>';
  }
  var node = elc('div', 'modal-info', html), pickedRisk = r.risk_level;
  node.addEventListener('click', function (ev) {
    var chip = ev.target.closest('#rdRisk .rf-chip');
    if (chip) { $$('#rdRisk .rf-chip', node).forEach(function (c) { c.classList.remove('active'); }); chip.classList.add('active'); pickedRisk = chip.getAttribute('data-val'); return; }
    if (ev.target.closest('[data-rdverify]')) { closeModal(); verifyReport(r.id, 'verify', pickedRisk); return; }
    if (ev.target.closest('[data-rdreject]')) { closeModal(); verifyReport(r.id, 'reject'); return; }
  });
  buildModal('Мэдээллийн дэлгэрэнгүй', node, { width: '460px' });
}

function renderReportflow() {
  var sec = pageEl('reportflow');
  if (!sec) return;
  var reports = DB.reports || [];
  var pending = reports.filter(function (r) { return r.status === 'reported'; });
  var verified = reports.filter(function (r) { return r.status === 'verified'; });
  var rejected = reports.filter(function (r) { return r.status === 'rejected'; });
  var thisMonth = verified.filter(function (r) { return monthKey(r.verifiedAt || r.createdAt) === monthKey(); }).length;
  var admin = isAdmin();
  var myBonus = 0;
  if (!admin) { var me = currentReporter(); var meEmp = (DB.employees || []).filter(function (e) { return (me.uid && e.uid === me.uid) || (me.id && e.id === me.id); })[0]; if (meEmp) myBonus = empBonusPoints(meEmp); }

  var html = '<div class="page-header"><div><h1>Аюул / Near-miss мэдээлэл</h1>' +
    '<p class="page-subtitle">Зураг → байршил → нэг өгүүлбэр → эрсдэл. Баталгаажсаны дараа бонус нэмэгдэнэ.</p></div>' +
    '<div class="page-actions">' +
    '<button class="btn btn-secondary" data-newreport="near_miss"><i class="ti ti-alert-hexagon"></i> Осолд дөхсөн</button>' +
    '<button class="btn btn-primary" data-newreport="hazard"><i class="ti ti-flag-2"></i> Аюул мэдээлэх</button></div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
    statCard('Хүлээгдэж буй', pending.length, 'ti-clock', '#D97706') +
    statCard('Энэ сар баталгаажсан', thisMonth, 'ti-circle-check', '#16A34A') +
    statCard('Татгалзсан', rejected.length, 'ti-x', '#DC2626') +
    (admin ? statCard('Нийт мэдээлэл', reports.length, 'ti-flag', '#334155')
      : isDeptHead() ? statCard('Албаны бонус (дундаж)', deptBonusScore(SESSION.dept), 'ti-gift', '#16A34A')
        : statCard('Миний бонус', '+' + myBonus, 'ti-gift', '#16A34A')) + '</div>';

  if (admin) {
    html += '<div class="card" style="padding:18px;margin-bottom:18px"><h3 style="margin:0 0 4px">Баталгаажуулах дараалал <span class="badge badge-warn">' + pending.length + '</span></h3>' +
      '<p style="font-size:13px;color:#8A94A6;margin:0 0 12px">Тоо биш чанарыг урамшуул — эрсдэлийн зэргийг зөв тогтоо.</p>' +
      (pending.length ? pending.map(function (r) { return reportCard(r, true); }).join('') : emptyBox('Хүлээгдэж буй мэдээлэл алга')) + '</div>';
    var hist = verified.concat(rejected).sort(function (a, b) { return new Date(b.verifiedAt || b.createdAt) - new Date(a.verifiedAt || a.createdAt); });
    html += '<div class="card" style="padding:18px"><h3 style="margin:0 0 12px">Шийдвэрлэсэн түүх</h3>' +
      (hist.length ? hist.slice(0, 30).map(function (r) { return reportCard(r, false); }).join('') : emptyBox('Түүх алга')) + '</div>';
  } else {
    var sorted = reports.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    html += '<div class="card" style="padding:18px"><h3 style="margin:0 0 12px">' + (isDeptHead() ? 'Албаны мэдээлэл' : 'Миний мэдээлэл') + '</h3>' +
      (sorted.length ? sorted.map(function (r) { return reportCard(r, false); }).join('') : emptyBox(isDeptHead() ? 'Албанд мэдээлэл алга' : 'Та одоогоор мэдээлэл оруулаагүй байна. Дээрх товчоор эхэл!')) + '</div>';
  }

  sec.innerHTML = html;
  var dot = $('.nav-item[data-page="reportflow"] .nav-dot');
  if (dot) dot.style.display = (admin && pending.length) ? 'inline-block' : 'none';

  if (!sec._wired) {
    sec._wired = true;
    sec.addEventListener('click', function (ev) {
      var nb = ev.target.closest('[data-newreport]');
      if (nb) { actionReportNew(nb.getAttribute('data-newreport')); return; }
      var vb = ev.target.closest('[data-verify]');
      if (vb) { ev.stopPropagation(); verifyReport(vb.getAttribute('data-verify'), 'verify'); return; }
      var rb = ev.target.closest('[data-reject]');
      if (rb) { ev.stopPropagation(); verifyReport(rb.getAttribute('data-reject'), 'reject'); return; }
      var card = ev.target.closest('[data-report]');
      if (card) openReportDetail(card.getAttribute('data-report'));
    });
  }
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
  var body = $('.page[data-page="settings"] .settings-body');
  if (!body) return;
  if (!isAdmin()) { body.innerHTML = '<div class="card"><div class="empty-state" style="padding:30px"><i class="ti ti-lock"></i><div>Тохиргоог зөвхөн ХАБЭА ажилтан өөрчилнө.</div></div></div>'; return; }
  var o = DB.settings.org || {}, c = kpiCfg(), w = c.weights, b = c.bonus, dw = c.dept;
  function inp(label, id, val, type, attrs) {
    return '<div class="form-group flex-grow"><label>' + label + '</label><input class="cfg-input" type="' + (type || 'number') + '" id="' + id + '" value="' + esc(val) + '" ' + (attrs || 'min="0" max="100"') + '></div>';
  }
  var wsum = w.video + w.exam + w.improvement + w.firstTry + w.bonus;
  var dsum = dw.coverage + dw.bonus + dw.firstAid + dw.ppe;
  function sumBox(id, sum) {
    return '<div id="' + id + '" class="weight-total" style="background:' + (sum === 100 ? 'var(--emerald-light)' : 'var(--amber-light)') + ';color:' + (sum === 100 ? 'var(--emerald-dark)' : 'var(--amber-dark)') + '">Нийт: <strong>' + sum + '%</strong>' + (sum === 100 ? ' ✓' : ' (100 байх ёстой)') + '</div>';
  }
  body.innerHTML =
    '<div class="card"><h3>Байгууллагын мэдээлэл</h3><div class="form">' +
    '<div class="form-group"><label>Байгууллагын нэр</label><input type="text" id="setOrgName" value="' + esc(o.name || '') + '"></div>' +
    '<div class="form-row">' + inp('Регистрийн дугаар', 'setOrgReg', o.regNo || '', 'text', '') + inp('Ажилтны тоо', 'setOrgHc', o.headcount || 0, 'number', 'min="0" max="100000"') + '</div>' +
    '<div class="form-actions"><button class="btn btn-primary" data-saveorg="1">Хадгалах</button></div></div></div>' +

    '<div class="card"><h3>KPI үнэлгээний жин</h3><p class="card-subtitle">Суурь үзүүлэлт + бонусын жин. Нийт 100% байх ёстой. Бонус зөвхөн нэмнэ, хэзээ ч хасахгүй.</p><div class="form">' +
    '<div class="form-row">' + inp('Видео үзэлт', 'wVideo', w.video) + inp('Шалгалт', 'wExam', w.exam) + inp('Ахиц', 'wImp', w.improvement) + '</div>' +
    '<div class="form-row">' + inp('Анх тэнцсэн', 'wFt', w.firstTry) + inp('Бонус', 'wBonus', w.bonus) + '</div>' +
    sumBox('wsum', wsum) +
    '<div class="form-actions"><button class="btn btn-primary" data-savekpi="1">Хадгалах</button></div></div></div>' +

    '<div class="card"><h3>Босго ба бонус оноо</h3><p class="card-subtitle">Near-miss эрсдэлийн зэргээр өөр оноо. Сарын дээд хязгаар (cap) — тоо биш чанарыг урамшуулна.</p><div class="form">' +
    '<div class="form-row">' + inp('Албаны coverage босго', 'tBase', c.baseThreshold) + inp('Бонус 100%-ийн оноо', 'tTarget', c.bonusTarget, 'number', 'min="1" max="200"') + '</div>' +
    '<div class="form-row">' + inp('Аюул мэдээллийн бонус', 'bHaz', b.hazard, 'number', 'min="0" max="50"') + inp('Сарын дээд хязгаар (cap)', 'bCap', b.monthlyCap, 'number', 'min="1" max="20"') + '</div>' +
    '<div class="form-row">' + inp('Near-miss: бага', 'bLow', b.nearMiss.low, 'number', 'min="0" max="50"') + inp('Near-miss: дунд', 'bMid', b.nearMiss.mid, 'number', 'min="0" max="50"') + inp('Near-miss: өндөр', 'bHigh', b.nearMiss.high, 'number', 'min="0" max="50"') + '</div>' +
    '<div class="form-actions"><button class="btn btn-primary" data-savekpi="1">Хадгалах</button></div></div></div>' +

    '<div class="card"><h3>Албаны онооны жин</h3><p class="card-subtitle">Coverage % + бонус + анхны тусламж + PPE. Нийт 100%. Нэг хүний хоцрогдол бүхэл албыг унагаахгүй.</p><div class="form">' +
    '<div class="form-row">' + inp('Coverage (босго давсан %)', 'dCov', dw.coverage) + inp('Албаны бонус', 'dBon', dw.bonus) + '</div>' +
    '<div class="form-row">' + inp('Анхны тусламжийн хайрцаг', 'dFa', dw.firstAid) + inp('PPE мөрдөлт', 'dPpe', dw.ppe) + '</div>' +
    sumBox('dsum', dsum) +
    '<div class="form-actions"><button class="btn btn-secondary" data-resetkpi="1">Анхдагч руу буцаах</button><button class="btn btn-primary" data-savekpi="1">Хадгалах</button></div></div></div>' +

    '<div class="card"><h3>Дата импорт</h3><p class="card-subtitle">Гадаад платформоос видео сургалтын үзэлтийг CSV файлаар оруулна. Ажилтныг имэйл/кодоор тааруулж, давхар бичилтийг автоматаар шүүнэ.</p>' +
    '<div class="form-actions"><button class="btn btn-primary" data-import="1"><i class="ti ti-upload"></i> Видео үзэлт импорт</button></div></div>';
}
function updateConfigSums() {
  function gv(id) { var el = $('#' + id); return el ? num(el.value) : 0; }
  [['wsum', gv('wVideo') + gv('wExam') + gv('wImp') + gv('wFt') + gv('wBonus')], ['dsum', gv('dCov') + gv('dBon') + gv('dFa') + gv('dPpe')]].forEach(function (p) {
    var el = $('#' + p[0]); if (!el) return; var s = p[1];
    el.innerHTML = 'Нийт: <strong>' + s + '%</strong>' + (s === 100 ? ' ✓' : ' (100 байх ёстой)');
    el.style.background = s === 100 ? 'var(--emerald-light)' : 'var(--amber-light)';
    el.style.color = s === 100 ? 'var(--emerald-dark)' : 'var(--amber-dark)';
  });
}
function saveOrgConfig() {
  var o = DB.settings.org || (DB.settings.org = {});
  function gv(id) { var el = $('#' + id); return el ? el.value : ''; }
  o.name = gv('setOrgName').trim(); o.regNo = gv('setOrgReg').trim(); o.headcount = num(gv('setOrgHc'), 0);
  saveDB(); toast('Байгууллагын мэдээлэл хадгалагдлаа');
}
function saveKpiConfig() {
  var c = kpiCfg();
  function gv(id, d) { var el = $('#' + id); return el ? clamp(num(el.value, d), 0, 100000) : d; }
  var nw = { video: gv('wVideo', 50), exam: gv('wExam', 22), improvement: gv('wImp', 8), firstTry: gv('wFt', 5), bonus: gv('wBonus', 15) };
  var wsum = nw.video + nw.exam + nw.improvement + nw.firstTry + nw.bonus;
  if (wsum !== 100) { toast('KPI жингийн нийлбэр 100% байх ёстой (одоо ' + wsum + '%)', 'warn'); return; }
  var nd = { coverage: gv('dCov', 55), bonus: gv('dBon', 15), firstAid: gv('dFa', 15), ppe: gv('dPpe', 15) };
  var dsum = nd.coverage + nd.bonus + nd.firstAid + nd.ppe;
  if (dsum !== 100) { toast('Албаны жингийн нийлбэр 100% байх ёстой (одоо ' + dsum + '%)', 'warn'); return; }
  c.weights = nw; c.dept = nd;
  c.baseThreshold = gv('tBase', 75); c.bonusTarget = Math.max(1, gv('tTarget', 30));
  c.bonus = { hazard: gv('bHaz', 5), nearMiss: { low: gv('bLow', 3), mid: gv('bMid', 6), high: gv('bHigh', 10) }, monthlyCap: Math.max(1, gv('bCap', 3)) };
  DB.settings.kpi = c;
  saveDB();
  renderSettings(); renderKpiPage(); renderEmployees(); renderDashboard(); renderPpe(); renderReportflow();
  if (charts.radar) renderCharts();
  toast('KPI тохиргоо хадгалагдлаа ✓');
}
function resetKpiConfig() {
  DB.settings.kpi = seedDB().settings.kpi;
  saveDB(); renderSettings(); renderKpiPage(); renderEmployees(); renderDashboard(); renderPpe();
  if (charts.radar) renderCharts();
  toast('Анхдагч KPI тохиргоо сэргээгдлээ');
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
function addNotification(text, page, uid) {
  DB.notifications.push({ id: 'N' + Date.now() + '-' + Math.floor(Math.random() * 1000), text: text, time: new Date().toISOString(), read: false, page: page, uid: uid || '' });
}

/* ============ PPE мөрдөлт + Анхны тусламжийн хайрцаг (албаны түвшний оноо) ============ */
var FIRST_AID_ITEMS = ['Боолт', 'Антисептик', 'Наалт', 'Гэмтлийн тэвш', 'Хайч', 'Бээлий', 'Эмийн хавчаар', 'Дулаан хучлага', 'Ариутгагч', 'Гар ариутгагч', 'Өвчин намдаах', 'Заавар хуудас'];

function renderPpe() {
  var sec = pageEl('ppe');
  if (!sec) return;
  var admin = isAdmin(), depts = deptList();

  var html = '<div class="page-header"><div><h1>ХХХ мөрдөлт ба анхны тусламж</h1>' +
    '<p class="page-subtitle">Албаны түвшний эерэг үзүүлэлт — зөрчлийн тоо биш, мөрдөлтийн %</p></div>';
  if (admin) html += '<div class="page-actions">' +
    '<button class="btn btn-secondary" data-addcheck="1"><i class="ti ti-first-aid-kit"></i> Хайрцаг шалгах</button>' +
    '<button class="btn btn-primary" data-addppe="1"><i class="ti ti-eye-check"></i> PPE ажиглалт нэмэх</button></div>';
  html += '</div>';

  // PPE мөрдөлтийн хувь
  html += '<div class="card" style="padding:18px;margin-bottom:18px"><h3 style="margin:0 0 4px">PPE мөрдөлтийн хувь</h3>' +
    '<p style="font-size:13px;color:#8A94A6;margin:0 0 14px"><i class="ti ti-info-circle"></i> ХАБ ажилтан ажиглалт хийнэ. 100 ажиглалтаас хэд нь зөв мөрдсөнийг эерэгээр хэмжинэ — зөрчигчийг шийтгэх нотолгоо биш.</p>';
  html += depts.map(function (d) {
    var pp = deptPpe(d);
    var obs = (DB.ppeObservations || []).filter(function (o) { return o.dept === d; });
    var tot = obs.reduce(function (a, o) { return a + _f(o.total); }, 0), comp = obs.reduce(function (a, o) { return a + _f(o.compliant); }, 0);
    return '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #F1F5F9;flex-wrap:wrap">' +
      '<div style="width:110px;font-weight:600">' + esc(d) + '</div>' +
      '<div style="flex:1;min-width:140px">' + miniBar(pp == null ? 0 : pp, pp >= 90 ? '#16A34A' : (pp >= 75 ? '#D97706' : '#DC2626')) + '</div>' +
      '<div style="width:50px;text-align:right;font-weight:700">' + (pp == null ? '—' : pp + '%') + '</div>' +
      '<div style="width:118px;font-size:12px;color:#8A94A6;text-align:right">' + (tot ? comp + '/' + tot + ' ажиглалт' : 'дата алга') + '</div></div>';
  }).join('') + '</div>';

  // Анхны тусламжийн хайрцаг
  html += '<div class="card" style="padding:18px"><h3 style="margin:0 0 4px">Анхны тусламжийн хайрцаг</h3>' +
    '<p style="font-size:13px;color:#8A94A6;margin:0 0 14px">Эрүүл ахуйч алба бүрээр шалгана. Хайрцаг бүрэн эсэх + дутууг хэр хурдан нөхсөнийг тооцно.</p>';
  html += depts.map(function (d) {
    var fa = deptFirstAid(d);
    var c = (DB.firstAidChecks || []).filter(function (x) { return x.dept === d; }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
    var status = !c ? '<span class="tag">шалгаагүй</span>' : (c.complete ? '<span class="tag tag-emerald">Бүрэн</span>' : '<span class="tag tag-warn">Дутуу: ' + esc((c.missing || []).join(', ')) + '</span>');
    return '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #F1F5F9;flex-wrap:wrap">' +
      '<div style="width:110px;font-weight:600">' + esc(d) + '</div>' +
      '<div style="flex:1;min-width:160px">' + status + (c ? ' <span style="font-size:12px;color:#8A94A6">· ' + timeAgo(c.createdAt) + '</span>' : '') + '</div>' +
      '<div style="width:50px;text-align:right;font-weight:700">' + (fa == null ? '—' : fa + '%') + '</div>' +
      (admin ? '<button class="btn btn-secondary btn-sm" data-checkdept="' + esc(d) + '">Шалгах</button>' : '') + '</div>';
  }).join('') + '</div>';

  sec.innerHTML = html;

  if (!sec._wired) {
    sec._wired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-addppe]')) { actionAddPpe(); return; }
      if (ev.target.closest('[data-addcheck]')) { actionCheckFirstAid(); return; }
      var cd = ev.target.closest('[data-checkdept]');
      if (cd) { actionCheckFirstAid(cd.getAttribute('data-checkdept')); return; }
    });
  }
}

function actionAddPpe() {
  formModal({
    title: 'PPE ажиглалт нэмэх',
    fields: [
      { name: 'dept', label: 'Алба', type: 'select', options: deptList() },
      { name: 'total', label: 'Нийт ажиглалт', type: 'number', value: 20, min: 1, max: 100000, hint: 'Хэдэн ажилтныг ажигласан' },
      { name: 'compliant', label: 'ХХХ зөв мөрдсөн', type: 'number', value: 18, min: 0, max: 100000 }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      var tot = clamp(num(v.total), 1, 100000), comp = clamp(num(v.compliant), 0, tot);
      DB.ppeObservations.unshift({ id: nextId('PP', DB.ppeObservations), dept: v.dept, total: tot, compliant: comp, observedBy: (SESSION && SESSION.email) || USER.name, photo: '', createdAt: new Date().toISOString() });
      saveDB(); renderPpe(); renderKpiPage(); renderDashboard();
      toast('PPE ажиглалт нэмэгдлээ — ' + Math.round(comp / tot * 100) + '% мөрдөлт');
    }
  });
}

function actionCheckFirstAid(presetDept) {
  formModal({
    title: 'Анхны тусламжийн хайрцаг шалгах',
    fields: [
      { name: 'dept', label: 'Алба', type: 'select', value: presetDept || '', options: deptList() },
      { name: 'complete', label: 'Бүрэн бүтэн эсэх', type: 'select', value: 'yes', options: [{ value: 'yes', label: 'Бүрэн — бүх зүйл байгаа' }, { value: 'no', label: 'Дутуу зүйл байна' }] },
      { name: 'missing', label: 'Дутуу зүйлс (таслалаар)', type: 'text', placeholder: 'ж: Боолт, Антисептик', hint: 'Зөвхөн дутуу үед бөглөнө' }
    ],
    submitLabel: 'Бүртгэх',
    onSubmit: function (v) {
      var complete = v.complete === 'yes';
      var missing = complete ? [] : (v.missing || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      DB.firstAidChecks.unshift({ id: nextId('FA', DB.firstAidChecks), dept: v.dept, totalItems: FIRST_AID_ITEMS.length, complete: complete, missing: missing, checkedBy: (SESSION && SESSION.email) || USER.name, restockedAt: complete ? new Date().toISOString() : '', createdAt: new Date().toISOString() });
      saveDB(); renderPpe(); renderKpiPage(); renderDashboard();
      toast('Хайрцгийн шалгалт бүртгэгдлээ');
    }
  });
}

/* ============ QR шалгалт (прототип) ============ */
var EXAMS = [
  { id: 'EX-FIRE', title: 'Гал түймрийн аюулгүй байдал', pass: 60, questions: [
    { q: 'Гал гарвал юуны өмнө юу хийх вэ?', opts: ['Үнэт зүйлсээ цуглуулах', 'Дохио өгч, хүмүүсийг сэрэмжлүүлэх', 'Зураг авах'], a: 1 },
    { q: 'Гар гал унтраагуурыг хаанаас барих вэ?', opts: ['Дээд үзүүрээс', 'Хоолойн доод бариулаас', 'Дунд хэсгээс'], a: 1 },
    { q: 'Утаа дунд хэрхэн нүүлгэх вэ?', opts: ['Гүйх', 'Бөхийж, доогуур явах', 'Зогсож хүлээх'], a: 1 },
    { q: 'Цахилгааны гал дээр юу цацаж болохгүй вэ?', opts: ['Хуурай нунтаг', 'Ус', 'CO2'], a: 1 }
  ] },
  { id: 'EX-PPE', title: 'Хувийн хамгаалах хэрэгсэл (ХХХ)', pass: 60, questions: [
    { q: 'ХХХ-ийг хэзээ өмсөх вэ?', opts: ['Зөвхөн шалгалт ирэхэд', 'Эрсдэлтэй ажил эхлэхээс өмнө', 'Хүсвэл'], a: 1 },
    { q: 'Дуу шуугиантай бүсэд юу хэрэглэх вэ?', opts: ['Бээлий', 'Чихэвч/бэтэг', 'Малгай'], a: 1 },
    { q: 'Гэмтэлтэй ХХХ-ийг яах вэ?', opts: ['Үргэлжлүүлэн хэрэглэх', 'Солиулах хүсэлт гаргах', 'Засаад хэрэглэх'], a: 1 }
  ] },
  { id: 'EX-ELEC', title: 'Цахилгааны аюулгүй ажиллагаа', pass: 60, questions: [
    { q: 'Ил гарсан кабель харвал?', opts: ['Гараар хүрч шалгах', 'Хүрэлгүй, ХАБ-д мэдэгдэх', 'Орхих'], a: 1 },
    { q: 'Чийгтэй гараар цахилгаан тоног барьж болох уу?', opts: ['Болно', 'Болохгүй', 'Заримдаа'], a: 1 },
    { q: 'Засвар хийхээс өмнө юу хийх вэ?', opts: ['Тэжээлийг таслах, түгжих', 'Шууд эхлэх', 'Гэрэл асаах'], a: 0 }
  ] }
];

function examById(id) { return EXAMS.filter(function (e) { return e.id === id; })[0]; }
function examResultFor(examId, who) {
  return (DB.examResults || []).filter(function (r) {
    return r.examId === examId && ((who.uid && r.uid === who.uid) || (who.id && r.empId === who.id) || _sameEmail(r.email, who.email));
  })[0];
}

function takeExam(examId) {
  var ex = examById(examId); if (!ex) { toast('Шалгалт олдсонгүй', 'error'); return; }
  var who = currentReporter();
  var prev = examResultFor(examId, who);
  if (prev) { infoModal('Шалгалт өгсөн', '<p>Та «' + esc(ex.title) + '» шалгалтыг аль хэдийн өгсөн байна.</p><p style="margin-top:8px"><strong>Дүн: ' + prev.score + '</strong> (' + (prev.passed ? 'тэнцсэн' : 'тэнцээгүй') + ') · ' + new Date(prev.createdAt).toLocaleDateString('mn-MN') + '</p><p style="margin-top:8px;color:#64748B;font-size:13px">Нэг ажилтан нэг шалгалтыг зөвхөн нэг удаа өгнө (давхар бүртгэлээс хамгаална).</p>'); return; }

  var answers = {};
  var node = elc('div', 'exam-runner');
  node.innerHTML = '<p style="font-size:13px;color:#64748B;margin:0 0 14px">' + ex.questions.length + ' асуулт · тэнцэх босго ' + ex.pass + '. Нэг л удаа өгнө.</p>' +
    ex.questions.map(function (q, qi) {
      return '<div class="exam-q" style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:8px">' + (qi + 1) + '. ' + esc(q.q) + '</div>' +
        q.opts.map(function (o, oi) {
          return '<label class="exam-opt"><input type="radio" name="q' + qi + '" value="' + oi + '"> <span>' + esc(o) + '</span></label>';
        }).join('') + '</div>';
    }).join('') + '<button class="btn btn-primary btn-block" id="examSubmit"><i class="ti ti-check"></i> Шалгалт дуусгах</button>';
  node.addEventListener('change', function (ev) {
    var r = ev.target.closest('input[type=radio]'); if (r) answers[r.name] = parseInt(r.value, 10);
  });
  node.addEventListener('click', function (ev) {
    if (!ev.target.closest('#examSubmit')) return;
    if (Object.keys(answers).length < ex.questions.length) { toast('Бүх асуултад хариулна уу', 'warn'); return; }
    var correct = 0;
    ex.questions.forEach(function (q, qi) { if (answers['q' + qi] === q.a) correct++; });
    var score = Math.round(correct / ex.questions.length * 100);
    recordExamResult(ex, who, score);
    closeModal();
    infoModal(score >= ex.pass ? '🎉 Тэнцлээ!' : 'Дахин оролдоорой', '<p style="font-size:15px">Таны дүн: <strong style="font-size:22px;color:' + (score >= ex.pass ? '#16A34A' : '#D97706') + '">' + score + '</strong> / 100</p><p style="margin-top:8px;color:#64748B">' + (score >= ex.pass ? 'Баяр хүргэе! Энэ дүн таны KPI-д тооцогдлоо.' : 'Босго (' + ex.pass + ') хүрсэнгүй ч KPI-д тооцогдлоо. Дараагийн улиралд ахихыг зорь!') + '</p>');
  });
  buildModal('Шалгалт: ' + ex.title, node, { width: '500px' });
}

function recordExamResult(ex, who, score) {
  var passed = score >= ex.pass;
  DB.examResults.unshift({ id: nextId('ER', DB.examResults), examId: ex.id, examTitle: ex.title, uid: who.uid || '', empId: who.id || '', email: who.email || '', name: who.name || '', score: score, passed: passed, attempt: 1, createdAt: new Date().toISOString() });
  // Холбогдох ажилтны шалгалтын дүнг шинэчилнэ (ахиц бодоход өмнөхийг хадгална)
  var emp = (DB.employees || []).filter(function (e) { return (who.uid && e.uid === who.uid) || (who.id && e.id === who.id) || _sameEmail(e.email, who.email); })[0];
  if (emp) {
    if (emp.examScore != null) emp.examPrev = emp.examScore;
    emp.examScore = score;
    if (emp.firstTry == null || emp.firstTry === '') emp.firstTry = passed ? 1 : 0;
  }
  addNotification('Шалгалт өглөө: ' + ex.title + ' — ' + score + ' оноо', 'inspections', who.uid);
  saveDB();
  renderInspections(); renderEmployees(); renderKpiPage(); renderDashboard();
  toast('Шалгалтын дүн бүртгэгдлээ: ' + score);
}

function showExamQR(examId) {
  var ex = examById(examId); if (!ex) return;
  var base = '';
  try { base = location.origin + location.pathname; } catch (e) { base = ''; }
  var url = base + '?qrexam=' + encodeURIComponent(examId);
  var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(url);
  var html = '<div style="text-align:center">' +
    '<img src="' + qrSrc + '" alt="QR" style="width:240px;height:240px;border:1px solid #EEF1F4;border-radius:12px" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">' +
    '<div style="display:none;padding:20px;color:#64748B">QR зураг ачаалж чадсангүй (интернэт шаардлагатай). Доорх кодыг ашиглана уу.</div>' +
    '<p style="margin-top:12px;font-weight:600">' + esc(ex.title) + '</p>' +
    '<p style="font-size:13px;color:#64748B">Ажилтан гар утсаараа уншуулж шалгалтаа өгнө. Дүн автоматаар бүртгэгдэнэ.</p>' +
    '<div style="margin-top:10px;font-size:11px;color:#94A3B8;word-break:break-all;background:#F8FAFC;padding:8px;border-radius:8px">' + esc(url) + '</div>' +
    '<button class="btn btn-secondary btn-sm" data-copyqr="' + esc(url) + '" style="margin-top:10px"><i class="ti ti-copy"></i> Холбоос хуулах</button></div>';
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-copyqr]'); if (!c) return;
    try { navigator.clipboard.writeText(c.getAttribute('data-copyqr')); toast('Холбоос хуулагдлаа'); } catch (e) { toast('Хуулж чадсангүй', 'warn'); }
  });
  buildModal('QR — Шалгалт өгөх', node, { width: '340px' });
}

function renderInspections() {
  var sec = pageEl('inspections'); if (!sec) return;
  var admin = isAdmin(), who = currentReporter();
  var results = DB.examResults || [];

  var html = '<div class="page-header"><div><h1>Танхим шалгалт — QR</h1>' +
    '<p class="page-subtitle">QR кодоор шалгалт өгнө — дүн автоматаар, гараар оруулахгүй. Нэг хүн нэг удаа.</p></div></div>';

  html += '<div class="kpi-cat-grid">' + EXAMS.map(function (ex) {
    var taken = examResultFor(ex.id, who);
    var cnt = results.filter(function (r) { return r.examId === ex.id; }).length;
    return '<div class="kpi-cat-card"><div class="kpi-cat-head">' +
      '<div class="kpi-cat-icon" style="background:#D1FAE5;color:#065F46"><i class="ti ti-clipboard-check"></i></div>' +
      '<div><h3>' + esc(ex.title) + '</h3><p>' + ex.questions.length + ' асуулт · босго ' + ex.pass + '</p></div></div>' +
      '<div style="font-size:12px;color:#8A94A6;margin:8px 0">' + cnt + ' ажилтан өгсөн</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (taken ? '<span class="tag tag-emerald">✓ Та өгсөн: ' + taken.score + '</span>' :
        '<button class="btn btn-primary btn-sm" data-take="' + ex.id + '"><i class="ti ti-pencil"></i> Шалгалт өгөх</button>') +
      (admin ? '<button class="btn btn-secondary btn-sm" data-qr="' + ex.id + '"><i class="ti ti-qrcode"></i> QR үүсгэх</button>' : '') +
      '</div></div>';
  }).join('') + '</div>';

  if (admin) {
    var recent = results.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 40);
    html += '<div class="card" style="padding:18px;margin-top:18px"><h3 style="margin:0 0 12px">Шалгалтын дүнгийн бүртгэл <span class="badge">' + results.length + '</span></h3>' +
      (recent.length ? '<table class="data-table" style="width:100%"><thead><tr><th>Огноо</th><th>Ажилтан</th><th>Шалгалт</th><th>Дүн</th><th>Төлөв</th></tr></thead><tbody>' +
        recent.map(function (r) {
          return '<tr><td>' + new Date(r.createdAt).toLocaleDateString('mn-MN') + '</td><td>' + esc(r.name || '—') + '</td><td>' + esc(r.examTitle) + '</td>' +
            '<td><span class="score-pill ' + scoreClass(r.score) + '">' + r.score + '</span></td><td>' + (r.passed ? '<span class="tag tag-emerald">Тэнцсэн</span>' : '<span class="tag tag-warn">Тэнцээгүй</span>') + '</td></tr>';
        }).join('') + '</tbody></table>' : emptyBox('Одоогоор шалгалтын дүн алга')) + '</div>';
  }

  sec.innerHTML = html;
  if (!sec._wired) {
    sec._wired = true;
    sec.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-take]'); if (t) { takeExam(t.getAttribute('data-take')); return; }
      var q = ev.target.closest('[data-qr]'); if (q) { showExamQR(q.getAttribute('data-qr')); return; }
    });
  }
}

/* ============ CSV видео үзэлт импорт ============ */
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  var rows = [], row = [], cur = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
}

function matchVideoEmp(key) {
  key = String(key || '').trim().toLowerCase(); if (!key) return null;
  return (DB.employees || []).filter(function (e) {
    return _sameEmail(e.email, key) || String(e.id).toLowerCase() === key || (e.uid && String(e.uid).toLowerCase() === key) || String(e.name).toLowerCase() === key;
  })[0];
}
function recomputeVideoFromImports(emp) {
  var vs = (DB.videoViews || []).filter(function (v) { return v.empId === emp.id || (emp.uid && v.uid === emp.uid) || _sameEmail(v.email, emp.email); });
  if (vs.length) emp.video = clamp(Math.round(avg(vs.map(function (v) { return num(v.percent); }))), 0, 100);
}

function applyVideoImport(rows) {
  // Толгой мөр илрүүлэх
  var header = rows[0].map(function (x) { return String(x).toLowerCase(); });
  var hasHeader = header.some(function (h) { return /имэйл|email|код|code|видео|video|нэр|title|үзэлт|percent|%|огноо|date/.test(h); });
  var idxKey = 0, idxTitle = 1, idxPct = 2, idxDate = 3;
  if (hasHeader) {
    header.forEach(function (h, i) {
      if (/имэйл|email|код|code|нэр\b/.test(h)) idxKey = i;
      else if (/видео|title|сэдэв/.test(h)) idxTitle = i;
      else if (/үзэлт|percent|%|progress/.test(h)) idxPct = i;
      else if (/огноо|date/.test(h)) idxDate = i;
    });
  }
  var data = hasHeader ? rows.slice(1) : rows;
  var imported = 0, dups = 0, unmatched = [], affected = {};
  data.forEach(function (r) {
    var key = (r[idxKey] || '').trim(), title = (r[idxTitle] || '').trim();
    var pct = clamp(num(r[idxPct]), 0, 100), date = (r[idxDate] || todayISO()).trim();
    if (!key) return;
    var emp = matchVideoEmp(key);
    if (!emp) { unmatched.push(key); return; }
    var dkey = (emp.id || emp.uid || emp.email) + '|' + title + '|' + date;
    var exists = (DB.videoViews || []).some(function (v) { return ((v.empId || v.uid || v.email) + '|' + v.title + '|' + v.date) === dkey; });
    if (exists) { dups++; return; }
    DB.videoViews.push({ id: nextId('VV', DB.videoViews), empId: emp.id || '', uid: emp.uid || '', email: emp.email || '', title: title, percent: pct, date: date, batch: todayISO() });
    affected[emp.id] = emp; imported++;
  });
  Object.keys(affected).forEach(function (k) { recomputeVideoFromImports(affected[k]); });
  if (imported) { saveDB(); renderEmployees(); renderKpiPage(); renderDashboard(); renderDataflow(); }
  return { imported: imported, dups: dups, unmatched: unmatched, total: data.length };
}

function importVideoCSV() {
  var node = elc('div', 'modal-info');
  node.innerHTML = '<p style="font-size:14px;line-height:1.5">Гадаад видео платформоос татсан <strong>CSV</strong> файлыг оруулна. Баганууд: <code>имэйл/код, видео нэр, үзэлт %, огноо</code>.</p>' +
    '<label class="rf-photo" id="vcsvLbl" style="margin-top:10px"><input type="file" accept=".csv,text/csv" id="vcsv" hidden><i class="ti ti-file-spreadsheet"></i><span>CSV файл сонгох</span></label>' +
    '<div class="rf-hint" style="margin-top:10px"><i class="ti ti-shield-check"></i> Давхар бичилт автоматаар шүүгдэнэ. Тохирохгүй мөрийг анхааруулна.</div>' +
    '<button class="btn btn-secondary btn-sm" id="vcsvTemplate" style="margin-top:6px"><i class="ti ti-download"></i> Загвар татах</button>';
  node.addEventListener('click', function (ev) {
    if (ev.target.closest('#vcsvTemplate')) {
      var tpl = '﻿имэйл/код,видео нэр,үзэлт %,огноо\nEMP-002,Галын аюулгүй байдал,95,2026-06-01\nEMP-003,ХХХ сургалт,80,2026-06-02\n';
      download('video-import-zagvar.csv', tpl, 'text/csv;charset=utf-8'); return;
    }
  });
  $('#vcsv', node).addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function (ev) {
      try {
        var rows = parseCSV(ev.target.result);
        if (!rows.length) { toast('Файл хоосон байна', 'warn'); return; }
        var res = applyVideoImport(rows);
        closeModal();
        infoModal('Импортын дүн', '<div style="font-size:14px;line-height:1.7">' +
          '<div>✅ Шинээр орсон: <strong>' + res.imported + '</strong></div>' +
          '<div>🔁 Давхардсан (алгассан): <strong>' + res.dups + '</strong></div>' +
          '<div>⚠️ Тохирохгүй (ажилтан олдоогүй): <strong>' + res.unmatched.length + '</strong>' + (res.unmatched.length ? ' <span style="color:#94A3B8;font-size:12px">(' + esc(res.unmatched.slice(0, 8).join(', ')) + (res.unmatched.length > 8 ? '…' : '') + ')</span>' : '') + '</div>' +
          '<div style="margin-top:8px;color:#64748B;font-size:13px">Нийт ' + res.total + ' мөр боловсруулагдлаа. Видео оноо автоматаар шинэчлэгдсэн.</div></div>');
      } catch (e) { toast('Файл уншихад алдаа: ' + e.message, 'error'); }
    };
    rd.readAsText(f, 'UTF-8');
  });
  buildModal('Видео үзэлт импорт (CSV)', node, { width: '440px' });
}

function renderDataflow() {
  var sec = pageEl('dataflow'); if (!sec) return;
  var vv = DB.videoViews || [], er = DB.examResults || [], rp = DB.reports || [];
  var lastImport = vv.length ? vv.map(function (v) { return v.batch; }).sort().pop() : null;
  var html = '<div class="page-header"><div><h1>Дата урсгал ба импорт</h1>' +
    '<p class="page-subtitle">Эх үүсвэр бүр: импорт (видео) · QR (шалгалт) · ажилтан (мэдээлэл) · ХАБ (баталгаажуулалт)</p></div>' +
    '<div class="page-actions"><button class="btn btn-primary" data-import="1"><i class="ti ti-upload"></i> Видео үзэлт импорт</button></div></div>';

  var sources = [
    ['Видео сургалт (импорт)', 'ti-player-play', vv.length + ' бичлэг', lastImport ? 'Сүүлд: ' + lastImport : 'Импорт хийгээгүй', '#92400E', '#FEF3C7'],
    ['QR шалгалт (автомат)', 'ti-qrcode', er.length + ' дүн', 'Гараар оруулдаггүй', '#065F46', '#D1FAE5'],
    ['Ажилтны мэдээлэл', 'ti-flag-2', rp.length + ' мэдээлэл', rp.filter(function (r) { return r.status === 'reported'; }).length + ' хүлээгдэж буй', '#1E40AF', '#DBEAFE'],
    ['ХАБ баталгаажуулалт', 'ti-shield-check', rp.filter(function (r) { return r.status === 'verified'; }).length + ' баталгаажсан', 'Бонус автомат', '#3730A3', '#E0E7FF']
  ];
  html += '<div class="kpi-cat-grid">' + sources.map(function (s) {
    return '<div class="kpi-cat-card"><div class="kpi-cat-head"><div class="kpi-cat-icon" style="background:' + s[5] + ';color:' + s[4] + '"><i class="ti ' + s[1] + '"></i></div>' +
      '<div><h3>' + s[0] + '</h3><p>' + s[2] + '</p></div></div><div style="font-size:13px;color:#8A94A6;margin-top:6px">' + s[3] + '</div></div>';
  }).join('') + '</div>';

  html += '<div class="card" style="padding:18px;margin-top:18px"><h3 style="margin:0 0 6px">Импортын зарчим</h3>' +
    '<ul style="font-size:13.5px;line-height:1.8;color:#475569;margin:0;padding-left:18px">' +
    '<li>Ажилтныг <strong>имэйл эсвэл код</strong>-оор тааруулна.</li>' +
    '<li>Давхар бичилт (нэг ажилтан+видео+огноо) автоматаар <strong>шүүгдэнэ</strong>.</li>' +
    '<li>Тохирох ажилтан олдоогүй мөрийг <strong>анхааруулна</strong>.</li>' +
    '<li>Импортын дараа видео оноо <strong>автоматаар</strong> шинэчлэгдэнэ.</li></ul></div>';

  sec.innerHTML = html;
  if (!sec._wired) { sec._wired = true; sec.addEventListener('click', function (ev) { if (ev.target.closest('[data-import]')) importVideoCSV(); }); }
}

/* ============ Миний сургалт + Шалгалтын дүн (апп дотор — нэг код) ============ */
function renderMyResults() {
  var sec = pageEl('myresults'); if (!sec) return;
  sec.style.padding = '';
  // Шалгалтын сайт Firebase-тэй тул iframe дотор нэвтрэлт ажиллахгүй → шинэ цонхонд нээнэ
  sec.innerHTML = '<div class="page-header"><div><h1>Дотоод сургалтын шалгалт</h1>' +
    '<p class="page-subtitle">ХАБЭА онлайн шалгалт</p></div></div>' +
    '<div class="card" style="padding:40px;text-align:center;max-width:560px;margin:24px auto 0">' +
    '<div style="width:74px;height:74px;border-radius:20px;background:#D1FAE5;color:#065F46;display:flex;align-items:center;justify-content:center;font-size:38px;margin:0 auto 16px"><i class="ti ti-clipboard-check"></i></div>' +
    '<h2 style="margin:0 0 8px;font-family:\'Bricolage Grotesque\',sans-serif">ХАБЭА Шалгалт</h2>' +
    '<p style="color:#64748B;margin:0 0 22px;line-height:1.55">Шалгалт өгөхийн тулд доорх товчийг дарна уу. Шалгалт шинэ цонхонд нээгдэж, бүрэн ажиллана.</p>' +
    '<button class="btn btn-primary" onclick="window.open(\'https://habea-deploy.vercel.app/habea-shalgalt.html\',\'_blank\',\'noopener\')" style="padding:13px 30px;font-size:15px"><i class="ti ti-external-link"></i> Шалгалт эхлүүлэх</button>' +
    '</div>';
}
function mrFmt(ts) {
  try { if (ts && ts.toDate) { var d = ts.toDate(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); } } catch (e) {}
  if (ts) { try { var d2 = new Date(ts); if (!isNaN(d2.getTime())) return d2.toLocaleDateString('mn-MN'); } catch (e) {} }
  return '—';
}
function sampleMyResults() {
  return {
    progress: [
      { trainingTitle: 'Гал түймрийн аюулгүй байдал', watchProgress: 1, score: 90, status: 'passed' },
      { trainingTitle: 'Хувийн хамгаалах хэрэгсэл', watchProgress: 1, score: 80, status: 'passed' },
      { trainingTitle: 'Цахилгааны аюулгүй ажиллагаа', watchProgress: 0.6, score: null, status: 'in_progress' }
    ],
    results: [
      { trainingTitle: 'Гал түймрийн аюулгүй байдал', score: 90, passed: true, correct: 9, total: 10, passingScore: 60, timestamp: null },
      { trainingTitle: 'Хувийн хамгаалах хэрэгсэл', score: 80, passed: true, correct: 8, total: 10, passingScore: 60, timestamp: null }
    ]
  };
}
async function loadMyResults() {
  var statsEl = $('#mrStats'), progEl = $('#mrProgress'), resEl = $('#mrResults');
  if (DEMO || !fbReady || !SESSION || !SESSION.uid || SESSION.uid === 'demo') {
    renderMyResultsData(sampleMyResults(), statsEl, progEl, resEl, true); return;
  }
  try {
    var uid = SESSION.uid;
    var rSnap = await fdb.collection('exam_results').where('userId', '==', uid).get();
    var results = rSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    var pSnap = await fdb.collection('training_progress').where('userId', '==', uid).get();
    var progress = pSnap.docs.map(function (d) { return d.data(); });
    var ids = {}; results.forEach(function (r) { if (r.trainingId) ids[r.trainingId] = 1; });
    progress.forEach(function (p) { if (p.trainingId) ids[p.trainingId] = 1; });
    var idList = Object.keys(ids), tMap = {};
    for (var i = 0; i < idList.length; i += 30) {
      var chunk = idList.slice(i, i + 30);
      try { var tSnap = await fdb.collection('trainings').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get(); tSnap.forEach(function (d) { tMap[d.id] = d.data(); }); } catch (e) {}
    }
    results.forEach(function (r) { r.trainingTitle = (tMap[r.trainingId] && tMap[r.trainingId].title) || 'Сургалт'; r.passingScore = (tMap[r.trainingId] && tMap[r.trainingId].passingScore) || 70; });
    progress.forEach(function (p) { p.trainingTitle = (tMap[p.trainingId] && tMap[p.trainingId].title) || 'Сургалт'; });
    results.sort(function (a, b) { var ta = (a.timestamp && a.timestamp.toMillis && a.timestamp.toMillis()) || 0, tb = (b.timestamp && b.timestamp.toMillis && b.timestamp.toMillis()) || 0; return tb - ta; });
    renderMyResultsData({ results: results, progress: progress }, statsEl, progEl, resEl, false);
  } catch (e) {
    if (resEl) resEl.innerHTML = emptyBox('Дата ачаалахад алдаа гарлаа');
    if (progEl) progEl.innerHTML = '';
  }
}
function renderMyResultsData(data, statsEl, progEl, resEl, isDemo) {
  var results = data.results || [], progress = data.progress || [];
  var total = results.length, passed = results.filter(function (r) { return r.passed; }).length;
  var scores = results.map(function (r) { return r.score; }).filter(function (s) { return s != null; });
  var avg = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : null;
  var completed = progress.filter(function (p) { return p.status === 'passed'; }).length;
  if (statsEl) statsEl.innerHTML =
    statCard('Өгсөн шалгалт', total, 'ti-clipboard-check', '#0EA5E9') +
    statCard('Тэнцсэн' + (total ? ' (' + Math.round(passed / total * 100) + '%)' : ''), passed, 'ti-circle-check', '#16A34A') +
    statCard('Дундаж оноо', avg != null ? avg + '%' : '—', 'ti-chart-bar', '#D97706') +
    statCard('Дүүргэсэн сургалт' + (progress.length ? ' /' + progress.length : ''), completed, 'ti-school', '#7C3AED');
  if (progEl) {
    if (!progress.length) progEl.innerHTML = emptyBox('Одоогоор сургалтын явц алга');
    else {
      var order = { passed: 0, failed: 1, in_progress: 2 };
      var rows = progress.slice().sort(function (a, b) { return (order[a.status] || 3) - (order[b.status] || 3); });
      var stLabel = { passed: 'Тэнцсэн', failed: 'Тэнцсэнгүй', in_progress: 'Явцтай' }, stTag = { passed: 'tag-emerald', failed: 'tag-coral', in_progress: 'tag-warn' };
      progEl.innerHTML = '<table class="data-table" style="width:100%"><thead><tr><th>Сургалт</th><th>Явц</th><th>Оноо</th><th>Төлөв</th></tr></thead><tbody>' +
        rows.map(function (p) {
          var wpct = Math.round((p.watchProgress || 0) * 100), st = p.status || 'in_progress';
          return '<tr><td style="font-weight:600">' + esc(p.trainingTitle || 'Сургалт') + '</td>' +
            '<td><div style="display:flex;align-items:center;gap:8px;min-width:120px">' + miniBar(wpct, st === 'passed' ? '#16A34A' : '#0EA5E9') + '<span style="font-size:12px;color:#8A94A6">' + wpct + '%</span></div></td>' +
            '<td style="font-weight:700">' + (p.score != null ? p.score + '%' : '—') + '</td>' +
            '<td><span class="tag ' + (stTag[st] || 'tag-warn') + '">' + (stLabel[st] || 'Явцтай') + '</span></td></tr>';
        }).join('') + '</tbody></table>';
    }
  }
  if (resEl) {
    if (!results.length) resEl.innerHTML = emptyBox('Одоохондоо шалгалт өгөөгүй байна');
    else resEl.innerHTML = results.map(function (r) {
      var sc = r.score != null ? r.score : 0, ps = r.passed;
      return '<div style="display:flex;align-items:center;gap:14px;padding:12px;border:1px solid #EEF1F4;border-radius:12px;margin-bottom:10px">' +
        '<div style="width:52px;height:52px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;background:' + (ps ? '#DCFCE7' : '#FEE2E2') + ';color:' + (ps ? '#166534' : '#991B1B') + '"><span style="font-size:18px;line-height:1">' + sc + '</span><span style="font-size:10px">%</span></div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600">' + esc(r.trainingTitle || 'Шалгалт') + '</div>' +
        '<div style="font-size:12px;color:#8A94A6;margin-top:2px">' + mrFmt(r.timestamp) + ' · ' + (r.correct != null ? r.correct : '—') + '/' + (r.total != null ? r.total : '—') + ' зөв · тэнцэх ' + (r.passingScore || 70) + '%</div></div>' +
        '<span class="tag ' + (ps ? 'tag-emerald' : 'tag-coral') + '">' + (ps ? '✓ Тэнцсэн' : '✗ Тэнцсэнгүй') + '</span></div>';
    }).join('');
  }
  if (isDemo && resEl) resEl.insertAdjacentHTML('afterbegin', '<div class="rf-hint" style="margin-bottom:10px"><i class="ti ti-info-circle"></i> DEMO жишээ дата. Жинхэнэ системд таны бодит шалгалтын дүн гарна.</div>');
}

/* ============ Даатгал (Нөхөн төлбөрийн гарын авлага — апп дотор) ============ */
function renderDaatgal() {
  var sec = pageEl('daatgal'); if (!sec) return;
  if (DEMO) {
    sec.style.padding = '';
    sec.innerHTML = '<div class="page-header"><div><h1>Даатгал — Нөхөн төлбөрийн гарын авлага</h1>' +
      '<p class="page-subtitle">AI туслахтай даатгалын гарын авлага</p></div></div>' +
      '<div class="card" style="padding:34px"><div class="empty-state" style="padding:30px"><i class="ti ti-shield-heart"></i>' +
      '<div>Даатгалын хэсэг амьд систем дээр (Netlify/Vercel) ажиллана. Локал DEMO дээр харагдахгүй.</div></div></div>';
    return;
  }
  if (sec._loaded) return;
  sec._loaded = true;
  sec.style.padding = '0';
  sec.innerHTML = '<iframe src="/nohon-tulbur.html" title="Даатгал — Нөхөн төлбөрийн гарын авлага" ' +
    'style="width:100%;height:calc(100vh - 64px);border:0;display:block"></iframe>';
}

/* ============ Контент удирдлага (admin.html — апп дотор шингээсэн) ============ */
function renderAdminPanel() {
  var sec = pageEl('adminpanel'); if (!sec) return;
  if (!isAdmin()) { sec.style.padding = ''; sec.innerHTML = '<div class="card"><div class="empty-state" style="padding:30px"><i class="ti ti-lock"></i><div>Зөвхөн ХАБЭА ажилтан хандана.</div></div></div>'; return; }
  if (DEMO) {
    sec.style.padding = '';
    sec.innerHTML = '<div class="page-header"><div><h1>Контент удирдлага</h1><p class="page-subtitle">Сургалт, хэрэглэгч, контент удирдах</p></div></div>' +
      '<div class="card" style="padding:34px"><div class="empty-state" style="padding:30px"><i class="ti ti-settings-cog"></i><div>Контент удирдлагын хэсэг амьд систем дээр ажиллана. Локал DEMO дээр харагдахгүй.</div></div></div>';
    return;
  }
  if (sec._loaded) return;
  sec._loaded = true;
  sec.style.padding = '0';
  sec.innerHTML = '<iframe src="/admin.html" title="Контент удирдлага" ' +
    'style="width:100%;height:calc(100vh - 64px);border:0;display:block"></iframe>';
}

/* ============ Шалгалтын админ (habea-admin — апп дотор шингээсэн) ============ */
function renderExamAdmin() {
  var sec = pageEl('examadmin'); if (!sec) return;
  if (!isAdmin()) { sec.style.padding = ''; sec.innerHTML = '<div class="card"><div class="empty-state" style="padding:30px"><i class="ti ti-lock"></i><div>Зөвхөн ХАБЭА ажилтан хандана.</div></div></div>'; return; }
  sec.style.padding = '';
  sec.innerHTML = '<div class="page-header"><div><h1>Шалгалтын удирдлага</h1>' +
    '<p class="page-subtitle">ХАБЭА шалгалтын админ — асуулт, дүн, тохиргоо</p></div></div>' +
    '<div class="card" style="padding:40px;text-align:center;max-width:560px;margin:24px auto 0">' +
    '<div style="width:74px;height:74px;border-radius:20px;background:#E0E7FF;color:#3730A3;display:flex;align-items:center;justify-content:center;font-size:38px;margin:0 auto 16px"><i class="ti ti-clipboard-text"></i></div>' +
    '<h2 style="margin:0 0 8px;font-family:\'Bricolage Grotesque\',sans-serif">ХАБЭА Шалгалтын админ</h2>' +
    '<p style="color:#64748B;margin:0 0 22px;line-height:1.55">Шалгалт үүсгэх, дүн харах зэрэг удирдлагыг шинэ цонхонд нээж хийнэ (бүрэн ажиллана).</p>' +
    '<button class="btn btn-primary" onclick="window.open(\'https://habea-deploy.vercel.app/habea-admin.html\',\'_blank\',\'noopener\')" style="padding:13px 30px;font-size:15px"><i class="ti ti-external-link"></i> Шалгалтын админ нээх</button>' +
    '</div>';
}

/* ============ Бүлэг (гадны) сургалт нэмэх — Excel/CSV-ээр хамрагдалт ============ */
function loadSheetJS(cb) {
  if (typeof XLSX !== 'undefined') { cb(true); return; }
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  s.onload = function () { cb(true); };
  s.onerror = function () { cb(false); };
  document.head.appendChild(s);
}
function parseSpreadsheet(file, cb) {
  var name = (file.name || '').toLowerCase();
  if (/\.csv$/.test(name) || file.type === 'text/csv') {
    var rd = new FileReader();
    rd.onload = function (ev) { try { cb(parseCSV(ev.target.result)); } catch (e) { cb(null); } };
    rd.onerror = function () { cb(null); };
    rd.readAsText(file, 'UTF-8'); return;
  }
  loadSheetJS(function (ok) {
    if (!ok) { cb(null, 'Excel уншигч ачаалж чадсангүй (интернэт шалгана уу). Файлаа CSV болгож оруулж болно.'); return; }
    var rd = new FileReader();
    rd.onload = function (ev) {
      try {
        var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        cb(rows.map(function (r) { return (r || []).map(function (c) { return c == null ? '' : String(c); }); }));
      } catch (e) { cb(null, e.message); }
    };
    rd.onerror = function () { cb(null); };
    rd.readAsArrayBuffer(file);
  });
}
function etSameAttendee(a, b) {
  return (a.uid && b.uid && a.uid === b.uid) || (a.id && b.id && a.id === b.id) || _sameEmail(a.email, b.email) ||
    (a.name && b.name && String(a.name).toLowerCase() === String(b.name).toLowerCase());
}
function applyBatchTraining(rows, fallbackTitle) {
  var res = { trainings: 0, mergedTo: 0, enrolled: 0, unmatched: [] };
  if (!rows || !rows.length) return res;
  var header = (rows[0] || []).map(function (x) { return String(x).toLowerCase().trim(); });
  var hasHeader = header.some(function (h) { return /сургалт|training|курс|ажилтан|нэр|имэйл|email|код|code|name/.test(h); });
  var iTitle = -1, iEmp = -1;
  if (hasHeader) {
    header.forEach(function (h, i) {
      if (iTitle < 0 && /сургалт|training|курс/.test(h)) iTitle = i;
      else if (iEmp < 0 && /ажилтан|нэр|имэйл|email|код|code|name/.test(h)) iEmp = i;
    });
  }
  if (iEmp < 0) iEmp = (iTitle === 0 ? 1 : 0);
  var data = hasHeader ? rows.slice(1) : rows;
  var groups = {};
  data.forEach(function (r) {
    if (!r || !r.length) return;
    var title = (iTitle >= 0 ? String(r[iTitle] || '').trim() : '') || (fallbackTitle || '').trim() || 'Гадны сургалт';
    var key = String(r[iEmp] != null ? r[iEmp] : '').trim();
    if (!key) return;
    (groups[title] = groups[title] || []).push(key);
  });
  Object.keys(groups).forEach(function (title) {
    var attendees = [];
    groups[title].forEach(function (k) {
      var emp = matchVideoEmp(k);
      if (emp) {
        var a = { id: emp.id || '', uid: emp.uid || '', email: emp.email || '', name: emp.name };
        if (!attendees.some(function (x) { return etSameAttendee(x, a); })) attendees.push(a);
      } else res.unmatched.push(k);
    });
    var existing = (DB.externalTrainings || []).filter(function (t) { return String(t.title).toLowerCase() === title.toLowerCase(); })[0];
    if (existing) {
      attendees.forEach(function (a) { if (!existing.attendees.some(function (x) { return etSameAttendee(x, a); })) existing.attendees.push(a); });
      res.mergedTo++;
    } else {
      DB.externalTrainings.push({ id: nextId('ET', DB.externalTrainings), title: title, date: todayISO(), attendees: attendees });
      res.trainings++;
    }
    res.enrolled += attendees.length;
  });
  if (res.trainings || res.mergedTo) { saveDB(); renderEmployees(); renderKpiPage(); renderDashboard(); }
  return res;
}
function actionBatchTraining() {
  if (!isAdmin()) { toast('Зөвхөн ХАБЭА ажилтан энэ үйлдэл хийнэ', 'warn'); return; }
  var node = elc('div', 'modal-info');
  var existing = DB.externalTrainings || [];
  node.innerHTML =
    '<p style="font-size:14px;line-height:1.5">Гадны (бүлэг) сургалтад хамрагдсан ажилтнуудыг <strong>Excel/CSV</strong>-ээр оруулна. Файл доторх ажилтнууд тухайн сургалтад автоматаар хамрагдсан болж, KPI-ийн сургалтын оноо нь нэмэгдэнэ.</p>' +
    '<div class="rf-field" style="margin-top:10px"><label>Сургалтын нэр (файлд багана байхгүй бол)</label><input type="text" id="btTitle" class="rf-input" placeholder="ж: Галын аюулгүй байдлын сургалт"></div>' +
    '<label class="rf-photo" id="btLbl" style="margin-top:6px"><input type="file" accept=".csv,.xlsx,.xls" id="btFile" hidden><i class="ti ti-file-spreadsheet"></i><span>Excel/CSV файл сонгох</span></label>' +
    '<div class="rf-hint" style="margin-top:10px"><i class="ti ti-info-circle"></i> Багана: <strong>ажилтан</strong> (нэр/имэйл/код). Олон сургалт бол <strong>сургалт, ажилтан</strong> гэсэн 2 баганатай байж болно.</div>' +
    '<button class="btn btn-secondary btn-sm" id="btTpl" style="margin-top:4px"><i class="ti ti-download"></i> Загвар татах</button>' +
    (existing.length ? '<div style="margin-top:14px;border-top:1px solid #EEF1F4;padding-top:10px"><div style="font-size:12px;color:#8A94A6;margin-bottom:6px">Нэмэгдсэн сургалтууд (' + existing.length + ')</div>' +
      existing.slice(0, 10).map(function (t) { return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>' + esc(t.title) + '</span><span style="color:#8A94A6">' + (t.attendees || []).length + ' ажилтан</span></div>'; }).join('') + '</div>' : '');
  node.addEventListener('click', function (ev) {
    if (ev.target.closest('#btTpl')) {
      var tpl = '﻿сургалт,ажилтан\nГалын аюулгүй байдлын сургалт,EMP-002\nГалын аюулгүй байдлын сургалт,tuya@mn\nӨндөрт ажиллах сургалт,EMP-004\n';
      download('buleg-surgalt-zagvar.csv', tpl, 'text/csv;charset=utf-8');
    }
  });
  $('#btFile', node).addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var lbl = $('#btLbl span', node); if (lbl) lbl.textContent = f.name + ' — боловсруулж байна…';
    parseSpreadsheet(f, function (rows, err) {
      if (!rows) { toast(err || 'Файл уншиж чадсангүй', 'error'); if (lbl) lbl.textContent = 'Excel/CSV файл сонгох'; return; }
      var res = applyBatchTraining(rows, $('#btTitle', node).value);
      closeModal();
      infoModal('Бүлэг сургалт нэмэгдлээ', '<div style="font-size:14px;line-height:1.7">' +
        '<div>📚 Шинэ сургалт: <strong>' + res.trainings + '</strong>' + (res.mergedTo ? ' · нэмж нэгтгэсэн: ' + res.mergedTo : '') + '</div>' +
        '<div>✅ Хамрагдсан гэж тэмдэглэсэн: <strong>' + res.enrolled + '</strong> ажилтан</div>' +
        '<div>⚠️ Тохирохгүй (ажилтан олдоогүй): <strong>' + res.unmatched.length + '</strong>' + (res.unmatched.length ? ' <span style="color:#94A3B8;font-size:12px">(' + esc(res.unmatched.slice(0, 8).join(', ')) + (res.unmatched.length > 8 ? '…' : '') + ')</span>' : '') + '</div>' +
        '<div style="margin-top:8px;color:#64748B;font-size:13px">Эдгээр ажилтны KPI-ийн сургалтын оноо автоматаар шинэчлэгдлээ.</div></div>');
    });
  });
  buildModal('Бүлэг сургалт нэмэх (Excel/CSV)', node, { width: '470px' });
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
    var cur = [cat.video, cat.exam, cat.improvement, cat.firstTry, cat.bonus];
    var prev = cur.map(function (v) { return Math.max(0, v - 3 - Math.round(Math.random() * 2)); });
    charts.radar = new Chart(radarEl.getContext('2d'), {
      type: 'radar',
      data: {
        labels: [['Видео'], ['Шалгалт'], ['Ахиц'], ['Анх', 'тэнцсэн'], ['Бонус']],
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
  renderReportflow();
  renderSuggestions();
  renderSettings();
  renderNotifBadge();
  renderPpe();
  renderInspections();
  renderDataflow();
}

/* ============ Үйлдлүүд: Эрсдэл мэдээлэх ============ */
function createHazard(data) {
  var h = {
    id: nextHazardId(), title: data.title, type: data.type || 'Бусад',
    location: data.location || AREAS[0], severity: data.severity || 3,
    status: 'open', source: data.source || 'web', reporter: USER.name,
    reporterUid: (SESSION && SESSION.uid) || null,
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
        authorUid: (SESSION && SESSION.uid) || null,
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
  var w = kpiCfg().weights;
  var cats = [
    ['Видео сургалтын үзэлт', kpiVideo(e), w.video],
    ['Танхим шалгалтын дүн', kpiExam(e), w.exam],
    ['Шалгалтын ахиц', kpiImprovement(e), w.improvement],
    ['Дахин шалгалтгүй тэнцсэн', kpiFirstTry(e), w.firstTry]
  ];
  var bp = empBonusPoints(e);
  var html = '<div class="detail-grid">' +
    '<div class="detail-row"><span>Албан тушаал</span><b>' + esc(e.role) + '</b></div>' +
    '<div class="detail-row"><span>Алба</span><b>' + esc(e.dept) + '</b></div>' +
    '<div class="detail-row"><span>Код</span><b>' + esc(e.id) + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + (e.onLeave ? 'Чөлөөтэй' : 'Идэвхтэй') + '</b></div></div>' +
    '<div style="font-size:12px;color:#8A94A6;margin:12px 2px 4px;font-weight:600">СУУРЬ ҮЗҮҮЛЭЛТ · ' + empBase(e) + '/100</div>' +
    '<div class="kpi-breakdown">' + cats.map(function (c) {
      return '<div class="kb-row"><div class="kb-name">' + esc(c[0]) + ' <small>· жин ' + c[2] + '%</small></div>' +
        '<div class="kb-bar"><div class="kb-fill" style="width:' + c[1] + '%"></div></div>' +
        '<div class="kb-val">' + c[1] + '</div></div>';
    }).join('') + '</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;background:#F0FDF4;border-radius:10px">' +
    '<i class="ti ti-gift" style="color:#16A34A;font-size:18px"></i>' +
    '<div style="flex:1"><div style="font-weight:600">Нэмэгдэх бонус</div>' +
    '<div style="font-size:12px;color:#64748B">Баталгаажсан аюул / near-miss мэдээллээс</div></div>' +
    '<div style="font-weight:700;color:#16A34A;font-size:18px">+' + bp + '</div></div>' +
    habeaExamsHTML(e) +
    '<div class="kb-total">Нийт KPI оноо: <strong>' + empTotal(e) + ' / 100</strong></div>' +
    '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-emp-leave="' + e.id + '">' +
    (e.onLeave ? 'Идэвхтэй болгох' : 'Чөлөө олгох') + '</button>' +
    '<button class="btn btn-primary" data-emp-edit="' + e.id + '">Суурь дата засах</button></div>';
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
    title: 'Суурь дата засах — ' + e.name,
    fields: [
      { name: 'video', label: 'Видео сургалтын үзэлт %', type: 'number', value: _f(e.video, e.training), min: 0, max: 100, hint: 'Ердийн нөхцөлд гадаад платформоос автоматаар импортолно' },
      { name: 'examScore', label: 'Танхим шалгалтын дүн (сүүлийн)', type: 'number', value: _f(e.examScore, e.training), min: 0, max: 100, hint: 'Ердийн нөхцөлд QR шалгалтаас автоматаар орно' },
      { name: 'examPrev', label: 'Өмнөх улирлын дүн (ахиц бодоход)', type: 'number', value: (e.examPrev == null ? '' : e.examPrev), min: 0, max: 100 },
      { name: 'firstTry', label: 'Дахин шалгалтгүй тэнцсэн эсэх', type: 'select', value: (e.firstTry ? '1' : '0'),
        options: [{ value: '1', label: 'Тийм — анхны удаа тэнцсэн' }, { value: '0', label: 'Үгүй' }] }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      e.video = clamp(num(v.video), 0, 100);
      e.examScore = clamp(num(v.examScore), 0, 100);
      e.examPrev = (v.examPrev === '' || v.examPrev == null) ? null : clamp(num(v.examPrev), 0, 100);
      e.firstTry = v.firstTry === '1' ? 1 : 0;
      saveDB();
      renderEmployees(); renderDashboard(); renderKpiPage();
      if (charts.radar) renderCharts();
      toast('Ажилтны суурь дата шинэчлэгдлээ');
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
  var head = ['Код', 'Нэр', 'Албан тушаал', 'Алба', 'Видео %', 'Шалгалт', 'Ахиц', 'Анх тэнцсэн', 'Суурь оноо', 'Бонус оноо', 'Нийт оноо'];
  var lines = [head];
  filteredEmployees().forEach(function (e) {
    lines.push([e.id, e.name, e.role, e.dept, kpiVideo(e), kpiExam(e), kpiImprovement(e), kpiFirstTry(e), empBase(e), empBonusPoints(e), empTotal(e)]);
  });
  var csv = '﻿' + lines.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  download('SafeWork-ajiltnuud-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
  toast('Excel файл (CSV) татагдлаа');
}
function downloadReport() {
  var a = avgKpi(), cat = categoryAverages();
  var deptRows = deptList().map(function (d) {
    var emps = DB.employees.filter(function (e) { return e.dept === d; });
    return { d: d, n: emps.length, s: deptScore(d), cov: deptCoverage(d) };
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
    '<h2>Суурь үзүүлэлтийн дундаж</h2><table><tr><th>Үзүүлэлт</th><th>Оноо</th></tr>' +
    '<tr><td>Видео сургалтын үзэлт</td><td>' + cat.video + '</td></tr>' +
    '<tr><td>Танхим шалгалтын дүн</td><td>' + cat.exam + '</td></tr>' +
    '<tr><td>Шалгалтын ахиц</td><td>' + cat.improvement + '</td></tr>' +
    '<tr><td>Дахин шалгалтгүй тэнцсэн</td><td>' + cat.firstTry + '</td></tr>' +
    '<tr><td>Нэмэгдэх бонус (дундаж)</td><td>' + cat.bonus + '</td></tr></table>' +
    '<h2>Албадын оноо</h2><table><tr><th>Алба</th><th>Ажилтан</th><th>Coverage %</th><th>Нийт оноо</th></tr>' +
    deptRows.map(function (r) { return '<tr><td>' + esc(r.d) + '</td><td>' + r.n + '</td><td>' + r.cov + '%</td><td>' + r.s + '</td></tr>'; }).join('') +
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
    if (el.hasAttribute('data-batch-training')) { e.preventDefault(); actionBatchTraining(); return; }
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
  if (el.hasAttribute('data-saveorg')) { saveOrgConfig(); return; }
  if (el.hasAttribute('data-savekpi')) { saveKpiConfig(); return; }
  if (el.hasAttribute('data-resetkpi')) { resetKpiConfig(); return; }
  if (el.hasAttribute('data-import')) { importVideoCSV(); return; }
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
  /* Жингийн слайдер (хуучин) */
  if (el.matches('.page[data-page="settings"] .weight-row input[type="range"]')) {
    var row = el.closest('.weight-row');
    var v = row.querySelector('.weight-val');
    if (v) v.textContent = el.value + '%';
    updateWeightTotal();
    return;
  }
  /* KPI тохиргооны жингийн нийлбэрийг шууд шинэчлэх */
  if (el.classList && el.classList.contains('cfg-input')) { updateConfigSums(); return; }
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

/* ============ Апп доторх нэвтрэх дэлгэц ============ */
function showLoginScreen() {
  var s = document.getElementById('loginScreen');
  if (!s) { try { location.replace('/index.html'); } catch (e) {} return; } // fallback
  s.style.display = 'flex';
  var btn = document.getElementById('loginBtn'),
      em = document.getElementById('loginEmail'),
      pw = document.getElementById('loginPass'),
      err = document.getElementById('loginErr');
  function fail(m) { if (err) err.textContent = m; if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-login"></i> Нэвтрэх'; } }
  function doLogin() {
    var email = ((em && em.value) || '').trim().toLowerCase(), pass = (pw && pw.value) || '';
    if (!email || !pass) { fail('Gmail хаяг болон нууц үгээ оруулна уу'); return; }
    if (!fbReady) { fail('Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Нэвтэрч байна...'; }
    if (err) err.textContent = '';
    fauth.signInWithEmailAndPassword(email, pass).then(function (cred) {
      // Имэйл+нууц үг зөв бол ОРУУЛНА. Эрх (admin/depthead/employee)-ийг establishSession
      // нь users/{uid}-ээс уншиж тодорхойлно (баримт байхгүй бол ажилтан). Хатуу хааж гаргахгүй.
      try { localStorage.setItem('monos_user', JSON.stringify({ email: email, uid: cred.user.uid })); } catch (e) {}
      location.reload();
    }).catch(function (e) {
      var code = (e && e.code) || '';
      if (code.indexOf('wrong-password') > -1 || code.indexOf('invalid-credential') > -1 || code.indexOf('invalid-login') > -1) fail('Нууц үг буруу байна.');
      else if (code.indexOf('user-not-found') > -1) fail('Ийм бүртгэлтэй хэрэглэгч олдсонгүй.');
      else if (code.indexOf('invalid-email') > -1) fail('Gmail хаяг буруу байна.');
      else if (code.indexOf('too-many-requests') > -1) fail('Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.');
      else fail('Нэвтрэхэд алдаа гарлаа. Дахин оролдоно уу.');
    });
  }
  if (btn && !btn._wired) {
    btn._wired = true;
    btn.addEventListener('click', doLogin);
    if (pw) pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    if (em) em.addEventListener('keydown', function (e) { if (e.key === 'Enter' && pw) pw.focus(); });
  }
  if (em) setTimeout(function () { em.focus(); }, 60);
}

/* ============ Нэвтрэлт + эрх (үндсэн системтэй нэгдсэн) ============ */
function establishSession() {
  return new Promise(function (resolve) {
    if (DEMO) {
      var dr = 'admin', dd = 'Цех №1', dEmp = null;
      try { var dsp = new URLSearchParams(location.search); dr = dsp.get('demorole') || 'admin'; dd = dsp.get('demodept') || 'Цех №1'; } catch (e) {}
      if (dr === 'employee') dEmp = 'EMP-004'; // жишээ ажилтан (О. Бат — баталгаажсан мэдээлэлтэй)
      SESSION = { role: dr, email: 'demo@local', uid: 'demo', dept: dd, empId: dEmp };
      resolve(); return;
    }
    var u = null;
    try { u = JSON.parse(localStorage.getItem('monos_user') || 'null'); } catch (e) {}

    function proceed(uid, email) {
      try { localStorage.setItem('monos_user', JSON.stringify({ email: email, uid: uid })); } catch (e) {}
      if (!fbReady) { SESSION = { role: 'admin', email: email, uid: uid, dept: '' }; resolve(); return; }
      fdb.collection('users').doc(uid).get().then(function (snap) {
        var data = (snap.exists && snap.data()) || {};
        var role = data.role === 'admin' ? 'admin' : (data.role === 'depthead' ? 'depthead' : 'employee');
        SESSION = { role: role, email: email, uid: uid, empId: null, dept: data.department || '' };
        resolve();
      }).catch(function () {
        SESSION = { role: 'employee', email: email, uid: uid, empId: null, dept: '' };
        resolve();
      });
    }

    // Firebase бэлэн биш — monos_user-т түшиглэнэ
    if (!fbReady) {
      if (u && u.uid) { proceed(u.uid, u.email); } else { SESSION = null; resolve(); }
      return;
    }

    // Firebase auth сесси-г ХАМГИЙН ТҮРҮҮНД шалгана (localStorage түр хоосон байсан ч loop болохгүй)
    var settled = false;
    var unsub = fauth.onAuthStateChanged(function (fbUser) {
      if (settled) return; settled = true;
      try { unsub(); } catch (e) {}
      if (fbUser) { proceed(fbUser.uid, fbUser.email || (u && u.email) || ''); }
      else if (u && u.uid) { proceed(u.uid, u.email); }
      else { SESSION = null; resolve(); } // нэвтрээгүй — апп доторх login гарна
    });
    setTimeout(function () {
      if (settled) { return; } settled = true;
      if (u && u.uid) { proceed(u.uid, u.email); } else { SESSION = null; resolve(); }
    }, 6000);
  });
}

function applyRole() {
  try {
    if (SESSION) {
      USER.name = (SESSION.email || '').split('@')[0] || USER.name;
      USER.initials = makeInitials(USER.name);
      USER.role = isAdmin() ? 'ХАБЭА-н мэргэжилтэн'
        : (isDeptHead() ? ('Албаны дарга' + (SESSION.dept ? ' · ' + SESSION.dept : '')) : 'Ажилтан');
    }
    var nmeEl = document.querySelector('.user-name');
    var roleEl = document.querySelector('.user-role');
    var avEl = document.querySelector('.sidebar .avatar') || document.querySelector('.user-card .avatar');
    if (nmeEl) nmeEl.textContent = USER.name;
    if (roleEl) roleEl.textContent = USER.role;
    if (avEl) avEl.textContent = USER.initials;
  } catch (e) {}
  // Шалгалтын холбоост нэвтэрсэн ажилтны имэйл/нэрийг дамжуулна (дүнг буцааж тааруулна)
  try {
    var exLink = document.querySelector('a[data-exam-link]');
    if (exLink && SESSION) exLink.href = '/shalgalt/habea-exam.html?email=' + encodeURIComponent(SESSION.email || '') + '&name=' + encodeURIComponent(USER.name || '') + (SESSION.empId ? '&eid=' + encodeURIComponent(SESSION.empId) : '');
  } catch (e) {}
  if (isAdmin()) return; // ХАБЭА ажилтанд бүх хэсэг харагдана
  blockedPages().forEach(function (pg) {
    var nav = document.querySelector('.nav-item[data-page="' + pg + '"]');
    if (nav) nav.style.display = 'none';
    var pe = document.querySelector('.page[data-page="' + pg + '"]');
    if (pe) pe.setAttribute('data-locked', '1');
  });
  // Зөвхөн админд зориулсан холбоосуудыг нуух
  $$('.nav-item[data-admin]').forEach(function (el) { el.style.display = 'none'; });
  var active = document.querySelector('.nav-item.active');
  if (active && blockedPages().indexOf(active.getAttribute('data-page')) >= 0) { switchPage('dashboard'); }
}

async function init() {
  await establishSession();
  // Нэвтрээгүй бол апп доторх нэвтрэх дэлгэцийг гаргана (тусдаа хуудас руу үсрэхгүй)
  if (!SESSION) { showLoginScreen(); return; }
  var loginEl = document.getElementById('loginScreen'); if (loginEl) loginEl.style.display = 'none';
  var fresh = await loadDB();
  injectControls();
  applyRole();
  renderAll();

  // URL-аас тодорхой хэсэг нээх (жишээ: /kpi/?page=hazards)
  try {
    var sp = new URLSearchParams(location.search);
    var qp = sp.get('page');
    if (qp) switchPage(qp);
    // QR кодоор шалгалт нээх (?qrexam=EX-FIRE)
    var qx = sp.get('qrexam');
    if (qx) { switchPage('inspections'); setTimeout(function () { takeExam(qx); }, 300); }
  } catch (e) {}

  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput);

  /* Сургалтын ангилал (мод цэс) дээр дарахад тухайн хуудсыг харуулна */
  document.addEventListener('click', function (e) {
    var leaf = e.target.closest('.nav-item.leaf[data-cat]');
    if (!leaf) return;
    e.preventDefault();
    var cat = leaf.getAttribute('data-cat');
    $$('[data-cat-title]').forEach(function (el) { el.textContent = cat; });
    $$('[data-cat-title2]').forEach(function (el) { el.textContent = cat; });
    $$('.nav-item.leaf').forEach(function (el) { el.classList.remove('active'); });
    leaf.classList.add('active');
    switchPage('trn-cat');
    try { closeMenu(); } catch (e2) {}
  });

  /* Гарах товч */
  var _logoutBtn = document.getElementById('kpiLogoutBtn');
  if (_logoutBtn) {
    _logoutBtn.addEventListener('click', function () {
      try { if (fauth) fauth.signOut(); } catch (e) {}
      try { localStorage.removeItem('monos_user'); } catch (e) {}
      location.reload(); // апп доторх нэвтрэх дэлгэц рүү буцна
    });
  }

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
