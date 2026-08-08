/* ============================================================
   SafeWork — ХАБЭА удирдлагын систем  v2
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
/* Системийн эзэн админ(ууд) — Firestore дахь role ямар ч байсан ҮРГЭЛЖ админ эрхтэй (цоожлогдохоос сэргийлнэ) */
var ADMIN_EMAILS = ['buynt666@gmail.com'];
function isAdmin() { return SESSION && SESSION.role === 'admin'; }
function isDeptHead() { return SESSION && SESSION.role === 'depthead'; }
function isEmp() { return SESSION && SESSION.role === 'employee'; }
function myEmp() { return SESSION && SESSION.empId ? DB.employees.filter(function (e) { return e.id === SESSION.empId; })[0] : null; }

/* Нэвтрэх эрхийн 3 түвшин:
   - admin (ХАБЭА ажилтан): бүгдийг хардаг, удирддаг
   - depthead (Албаны дарга): зөвхөн өөрийн алба
   - employee (Ажилтан): зөвхөн өөрийн мэдээлэл, эерэг прогресс */
var ADMIN_ONLY_PAGES = ['employees', 'incidents', 'teams', 'reports', 'dataflow', 'settings', 'adminpanel', 'examadmin', 'violations'];
var DEPTHEAD_HIDDEN_PAGES = ['settings', 'teams', 'dataflow', 'adminpanel', 'examadmin'];
var EMPLOYEE_HIDDEN_PAGES = ['employees', 'incidents', 'teams', 'reports', 'dataflow', 'settings', 'adminpanel', 'examadmin', 'kpi', 'inspections', 'suggestions', 'health', 'ppe', 'violations'];
function blockedPages() {
  if (isAdmin()) return [];
  if (isDeptHead()) return DEPTHEAD_HIDDEN_PAGES;
  return EMPLOYEE_HIDDEN_PAGES;
}
function rand4() { return String(Math.floor(1000 + Math.random() * 9000)); }

var pageLabels = {
  dashboard: 'Хяналтын самбар', employees: 'Ажилтнууд', kpi: 'KPI үнэлгээ',
  reportflow: 'Аюул/Near-miss мэдээлэл', hazards: 'Эрсдэлийн үнэлгээ', incidents: 'Осол, гэмтэл', inspections: 'Шалгалт',
  suggestions: 'Сайжруулалтын санал', training: 'Сургалт', health: 'Эрүүл мэндийн үзлэг',
  ppe: 'ХХХ хяналт', teams: 'Teams интеграц',
  chatbot: 'Чат бот', reports: 'Тайлан', dataflow: 'Дата урсгал', settings: 'Тохиргоо',
  'video-track': 'Видео сургалт (MiSkill)', tasks: 'Даалгавар', 'trn-mod': 'Дотоод сургалт', myexams: 'ХАБЭА Шалгалт'
};

/* Албуудыг ХАТУУ бичихгүй — зөвхөн бүртгэлтэй ажилтнуудаас гарна (deptList) */
var DEPTS = [];
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
        // Босго(осол/зөрчилгүй) + давтан+шалгалт + видео(LMS, давтангүй сард 0.45) + даалгавар + аюул бонус
        weights: { bosgo: 30, davtan: 20, video: 25, task: 20, bonus: 15 },
        baseThreshold: 75,   // албаны coverage-д тооцох суурь оноо (бонусгүй) босго
        bonusTarget: 30,     // энэ хэмжээний бонус оноо = бонус жингийн 100%
        bonus: {
          hazard: 5,                                  // баталгаажсан аюул бүрт
          nearMiss: { low: 3, mid: 6, high: 10 },     // near-miss эрсдэлийн зэргээр
          monthlyCap: 3                               // нэг хүн нэг сард авах дээд тоо
        },
        dept: { coverage: 55, bonus: 15, firstAid: 15, ppe: 15 } // албаны онооны жин, нийлбэр = 100
      },
      examOpen: {}, // { [courseKey]: false } = хаалттай. Missing/true = нээлттэй
      firstAidBoxCounts: {} // { dept: N } — алба тус бүрийн хайрцгийн тоо (admin тохируулна)
    },
    employees: [],
    extTrainings: [],
    extAttendance: {},
    davtanMonths: {},   // { 'YYYY-M': ['Алба1', ...] } — тухайн цалингийн сард давтантай албад
    violations: [],     // [{ id, empId, date, desc, points, by }] — босго онооноос хасагдах зөрчлүүд
    hazards: [],
    suggestions: [],
    incidents: [],
    notifications: [],
    reports: [],
    firstAidChecks: [],
    ppeObservations: [],
    videoViews: [],
    examResults: [],
    externalTrainings: [],
    tasks: [],
    miskillStats: []
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
    var hdb = getHabeaDb(); if (!hdb) return null;
    var snap = await hdb.collection('habea_exam_results').get();
    snap.forEach(function (d) {
      var x = d.data() || {};
      var email = String(x.email || '').toLowerCase().trim();
      if (!email) return;
      var rec = map[email] || (map[email] = { pre: null, post: null, anyPassed: false, list: [] });
      var pct = num(x.percent);
      if (x.passed) rec.anyPassed = true;
      rec.list.push({ title: x.examTitle || 'ХАБЭА шалгалт', key: x.examKey || '', type: x.examType || '', percent: pct, passed: !!x.passed, ts: (x.timestamp && x.timestamp.seconds) ? x.timestamp.seconds : 0 });
    });
    Object.keys(map).forEach(function (k) {
      var rec = map[k];
      rec.list.sort(function (a, b) { return b.ts - a.ts; }); // сүүлийнх нь эхэнд
      for (var i = 0; i < rec.list.length; i++) { // pre/post — СҮҮЛИЙН оролдлогоор
        var it = rec.list[i];
        if (it.type === 'pre') { if (rec.pre == null) rec.pre = it.percent; }
        else if (it.type === 'post') { if (rec.post == null) rec.post = it.percent; }
      }
    });
    return map;
  } catch (e) { return null; } // алдаа — null (дуудагч өгөгдлийг арилгахгүй)
}

/* habea exam дүнг KPI-ийн empProgress-д бичих (examKey → training module key тааруулна) */
function syncHabeaToModProgress(habeaByEmail, employees) {
  if (!habeaByEmail) return false;
  var modKeys = Object.keys(TRAINING_MODULES);
  var changed = false;
  (employees || []).forEach(function (emp) {
    var email = String(emp.email || '').toLowerCase().trim();
    var hx = habeaByEmail[email];
    if (!hx || !hx.list) return;
    // Модуль тус бүрийн ХАМГИЙН СҮҮЛИЙН оролдлогыг олно (ts max)
    var latest = {}, counts = {};
    hx.list.forEach(function (item) {
      var mkey = item.key;
      if (!mkey || modKeys.indexOf(mkey) === -1) return;
      counts[mkey] = (counts[mkey] || 0) + 1; // оролдлогын тоо
      if (!latest[mkey] || (item.ts || 0) > (latest[mkey].ts || 0)) latest[mkey] = item;
    });
    Object.keys(latest).forEach(function (mkey) {
      var item = latest[mkey];
      var progKey = emp.id + '_' + mkey;
      DB.empProgress = DB.empProgress || {};
      var cur = DB.empProgress[progKey] || {};
      var pct = Math.round(item.percent || 0);
      var cnt = counts[mkey] || 1;
      // Зөвхөн сүүлийн дүнгээр — өөрчлөгдсөн үед л бичнэ (илүү зураалт/фликер саармагжуулна)
      if (!cur.examTaken || cur.examScore !== pct || cur.examPassed !== !!item.passed || cur.examAttemptCount !== cnt) {
        DB.empProgress[progKey] = _merge(cur, { examTaken: true, examScore: pct, examPassed: !!item.passed, examAttemptCount: cnt, examTakenAt: item.ts ? new Date(item.ts * 1000).toISOString() : new Date().toISOString() });
        changed = true;
      }
    });
  });
  return changed;
}

/* Нэвтэрсэн ажилтны шалгалтын дүнг шинээр татаж, өөрийнх нь KPI-г шинэчилнэ (шалгалт өгөөд буцахад) */
async function refreshMyExams() {
  try {
    if (!fbReady || isAdmin() || !SESSION) return false;
    var me = (DB.employees || []).filter(function (e) {
      return (SESSION.uid && e.uid === SESSION.uid) || _sameEmail(e.email, SESSION.email) || (SESSION.empId && e.id === SESSION.empId);
    })[0];
    if (!me || !me.email) return false;
    var map = await readHabeaExamsByEmail();
    if (!map) return false; // унших алдаа — өгөгдлийг арилгахгүй (фликерээс сэргийлнэ)
    // Модуль шалгалтын дүнг empProgress-д синк — "ХАБЭА Шалгалт" карт болон модуль хуудас эндээс уншина
    try { syncHabeaToModProgress(map, DB.employees); } catch (e) {}
    var hx = map[String(me.email).toLowerCase().trim()];
    var newList = (hx && hx.list) ? hx.list : [];
    // Өгөгдөл үнэхээр өөрчлөгдсөн эсэхийг шалгаж, өөрчлөгдсөн үед л дахин зурна (фликер саармагжуулна)
    var sig = newList.map(function (x) { return (x.key || '') + ':' + (x.type || '') + ':' + x.percent + ':' + (x.ts || 0); }).join('|');
    var changed = (sig !== me._examSig);
    me._examSig = sig;
    me.habeaExams = newList;
    if (hx) {
      if (hx.post != null && hx.pre != null) { me.examPrev = hx.pre; me.examScore = hx.post; }
      else if (hx.post != null) { me.examScore = hx.post; }
      else if (hx.pre != null) { me.examScore = hx.pre; me.examPrev = null; }
      if (hx.anyPassed) me.firstTry = 1;
    }
    return changed;
  } catch (e) { return false; }
}

/* ===== Жинхэнэ ажилчид + сургалт/шалгалтаас KPI автоматаар бодох ===== */
/* Ажилтан ачаалалтын оношлогоо — дашбоард дээр шалтгааныг харуулна */
var EMP_LOAD = { state: 'idle', users: 0, error: '' };

async function buildEmployeesFromRealData() {
  if (!fbReady) { EMP_LOAD = { state: 'nofb', users: 0, error: 'Сервертэй холбогдоогүй' }; return null; }
  try {
    var usersSnap = await fdb.collection('users').get();
    EMP_LOAD = { state: 'ok', users: usersSnap.size, error: '' };
    var examByUser = {}, progByUser = {};
    try {
      var examSnap = await fdb.collection('exam_results').get();
      examSnap.forEach(function (d) { var x = d.data() || {}; if (!x.userId) return; (examByUser[x.userId] = examByUser[x.userId] || []).push(x); });
    } catch (e) {}
    try {
      var progSnap = await fdb.collection('training_progress').get();
      progSnap.forEach(function (d) { var x = d.data() || {}; if (!x.userId) return; (progByUser[x.userId] = progByUser[x.userId] || []).push(x); });
    } catch (e) {}
    var habeaByEmail = await readHabeaExamsByEmail() || {}; // ХАБЭА шалгалтын дүн (имэйлээр)

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
    EMP_LOAD.built = out.length;
    return out;
  } catch (e) {
    EMP_LOAD = { state: 'error', users: 0, error: (e && (e.code || e.message)) || 'уншиж чадсангүй' };
    console.error('[buildEmployeesFromRealData]', e);
    return null;
  }
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
  try {
    var habeaMap = await readHabeaExamsByEmail();
    if (habeaMap && syncHabeaToModProgress(habeaMap, DB.employees)) saveDB();
  } catch (e) {}
  return true;
}

/* Хуучин прототипийн жишээ (демо) датаг НЭГ УДАА цэвэрлэнэ.
   Зөвхөн админ ажиллуулна. DB.settings.demoCleaned туг тавьснаар дахин ажиллахгүй.
   Жинхэнэ ажилтнууд бүртгэлээс автоматаар нэмэгддэг тул энд хамаарахгүй. */
async function cleanupDemoData() {
  if (DEMO || !fbReady || !DB || !isAdmin()) return;
  if (DB.settings && DB.settings.demoCleaned) return; // аль хэдийн цэвэрлэсэн
  // Жишээ дата агуулсан массивуудыг хоослоно (employees-г дараа нь syncEmployeesWithRealData дүүргэнэ)
  ['employees', 'hazards', 'suggestions', 'incidents', 'reports', 'firstAidChecks',
   'ppeObservations', 'notifications'].forEach(function (k) { DB[k] = []; });
  if (!DB.settings) DB.settings = seedDB().settings;
  DB.settings.demoCleaned = true;
  try { await KPI_DOC().set(DB); } catch (e) {}
  try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
}

/* Жишээ (демо) датаны тоо — dashboard анхааруулгад ашиглана */
function demoDataCount() {
  if (!DB) return 0;
  return ['hazards', 'suggestions', 'incidents', 'reports', 'firstAidChecks', 'ppeObservations']
    .reduce(function (s, k) { return s + ((DB[k] || []).length); }, 0);
}

/* Админ ГАРААР дарж бүх жишээ датаг устгана — fbReady эсэхээс үл хамааран ажиллана.
   Ажилтныг ч цэвэрлээд, жинхэнэ бүртгэлтэй хэрэглэгчдээс эргэн татна. */
async function clearAllDemoData() {
  if (!DB) return;
  var btn = document.getElementById('clearDemoBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Цэвэрлэж байна...'; }
  ['employees', 'hazards', 'suggestions', 'incidents', 'reports', 'firstAidChecks',
   'ppeObservations', 'notifications'].forEach(function (k) { DB[k] = []; });
  if (!DB.settings) DB.settings = seedDB().settings;
  DB.settings.demoCleaned = true;
  // Жинхэнэ бүртгэлтэй ажилтнуудыг эргэн татна (байвал)
  try { await syncEmployeesWithRealData(); } catch (e) {}
  try { saveDB(); } catch (e) {}
  if (fbReady && fdb) { try { await KPI_DOC().set(DB); } catch (e) {} }
  try { localStorage.setItem(LSKEY, JSON.stringify(DB)); } catch (e) {}
  try { renderAll(); } catch (e) {}
  toast('Жишээ (демо) дата бүрэн цэвэрлэгдлээ', 'success');
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
    // Хуучин прототипийн жишээ (демо) датаг нэг удаа цэвэрлэнэ — зөвхөн админ
    try { await cleanupDemoData(); } catch (e) {}
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
   'reports', 'firstAidChecks', 'ppeObservations', 'videoViews', 'examResults', 'externalTrainings', 'miskillStats'].forEach(function (k) {
    if (!Array.isArray(DB[k])) DB[k] = [];
  });
  if (!DB.trainingModules) DB.trainingModules = {};
  if (!DB.moduleReleases) DB.moduleReleases = {};
  if (!DB.empReleases) DB.empReleases = {};   // ажилтан тус бүрийн нээлт
  if (!DB.userRoles) DB.userRoles = {};
  if (!DB.empProgress) DB.empProgress = {};
  if (!Array.isArray(DB.extTrainings)) DB.extTrainings = [];
  if (!DB.extAttendance || typeof DB.extAttendance !== 'object') DB.extAttendance = {};
  if (!DB.davtanMonths || typeof DB.davtanMonths !== 'object') DB.davtanMonths = {};
  if (!Array.isArray(DB.violations)) DB.violations = [];
  if (!DB.settings) DB.settings = seedDB().settings;
  if (!DB.settings.kpi) DB.settings.kpi = seedDB().settings.kpi;
  // Дутуу дэд тохиргоог нөхөх (хэрэглэгчийн өөрчилснийг хадгална)
  var def = seedDB().settings.kpi, k = DB.settings.kpi;
  if (!k.weights) k.weights = def.weights;
  // Хуучин жингийн бүтцүүдийг шинэ (bosgo/davtan/video/task/bonus) руу шилжүүлнэ
  if (k.weights && (k.weights.improvement != null || k.weights.firstTry != null || k.weights.exam != null || k.weights.bosgo == null || k.weights.task == null)) {
    k.weights = { bosgo: def.weights.bosgo, davtan: def.weights.davtan, video: def.weights.video, task: def.weights.task, bonus: (k.weights.bonus != null ? k.weights.bonus : def.weights.bonus) };
  }
  if (k.baseThreshold == null) k.baseThreshold = def.baseThreshold;
  if (k.bonusTarget == null) k.bonusTarget = def.bonusTarget;
  if (!k.bonus) k.bonus = def.bonus;
  else if (!k.bonus.nearMiss) k.bonus.nearMiss = def.bonus.nearMiss;
  if (!k.dept) k.dept = def.dept;
  // Давхардсан report ID арилгах — arrayUnion-оос үүссэн олон copy-г нэг болгоно
  // (verified/rejected > reported; дараа нь хамгийн сүүлийн createdAt)
  if (DB.reports && DB.reports.length > 1) {
    var byId = {};
    DB.reports.forEach(function (r) {
      if (!r || !r.id) return;
      var prev = byId[r.id];
      if (!prev) { byId[r.id] = r; return; }
      var rDone = r.status === 'verified' || r.status === 'rejected';
      var pDone = prev.status === 'verified' || prev.status === 'rejected';
      if (rDone && !pDone) { byId[r.id] = r; }
      else if (!rDone && pDone) { /* keep prev */ }
      else if ((r.createdAt || '') > (prev.createdAt || '')) { byId[r.id] = r; }
    });
    DB.reports = Object.keys(byId).map(function (id) { return byId[id]; });
  }
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

/* ============================================================
   KPI АРГА ЗҮЙ (2026-07, цалингийн сар дээр суурилсан):
   Цалингийн сар = өмнөх сарын 25-наас энэ сарын 24 хүртэл.
   1) Босго оноо (0.30) — осол/зөрчилгүй бол автоматаар 100; өөрийн буруутай
      холбогдол бүрт хасагдана (DB.violations).
   2) Давтан+шалгалт (0.20) — ЗӨВХӨН тухайн албанд энэ цалингийн сард давтан
      товлогдсон бол (DB.davtanMonths). Дотроо: суусан 1/3 + шалгалтын дүн 2/3.
   3) Видео сургалт (0.25) — давтангүй сард давтангийн жин нэмэгдэж 0.45 болно.
   4) Даалгавар (0.20). + Аюул/NM бонус (0.15, зөвхөн нэмнэ).
   Урьдчилсан/анхан зааварчилгаа KPI-д ОРОХГҮЙ.
   ============================================================ */
var KPI_DAVTAN_KEYS = ['davtan_eeljit', 'davtan_eeljit_bus', 'davtan_odor_tutmiin'];

/* Цалингийн сарын түлхүүр: 25-наас эхлэн ДАРААГИЙН сарын тооцоонд орно */
function salaryMonthKey(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  var y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() >= 25) { m++; if (m > 11) { m = 0; y++; } }
  return y + '-' + (m + 1);
}
function currentSalaryKey() { return salaryMonthKey(); }
function salaryKeyLabel(key) {
  var p = String(key || '').split('-');
  return p.length === 2 ? p[0] + ' оны ' + p[1] + '-р сар (' + p[1] + '/24 хүртэл)' : key;
}
/* Тухайн алба энэ цалингийн сард давтан зааварчилгаатай эсэх (админ урьдчилан тэмдэглэнэ) */
function deptHasDavtan(dept, key) {
  var m = (DB.davtanMonths || {})[key || currentSalaryKey()];
  return !!(m && m.indexOf(dept) > -1);
}

/* 1) БОСГО ОНОО: осол/зөрчилгүй бол 100. Буруутай холбогдол бүрийн оноог хасна */
function kpiBosgo(e) {
  var key = currentSalaryKey(), ded = 0;
  (DB.violations || []).forEach(function (v) {
    if (v.empId === e.id && salaryMonthKey(v.date || v.createdAt) === key) ded += _f(v.points, 50);
  });
  return clamp(100 - ded, 0, 100);
}
/* Ажилтны энэ цалингийн сарын зөрчлүүд (дэлгэрэнгүйд харуулна) */
function empViolations(e, key) {
  key = key || currentSalaryKey();
  return (DB.violations || []).filter(function (v) {
    return v.empId === e.id && salaryMonthKey(v.date || v.createdAt) === key;
  });
}

/* 2) ДАВТАН+ШАЛГАЛТ (нэг үзүүлэлт дотроо: суусан 1/3 + шалгалтын дүн 2/3).
   Алба энэ сард давтангүй бол null → жин нь видео руу шилжинэ */
function kpiDavtan(e) {
  var key = currentSalaryKey();
  if (!deptHasDavtan(e.dept, key)) return null;
  var attended = false, scores = [];
  KPI_DAVTAN_KEYS.forEach(function (k) {
    var p = getEmpProg(e.id, k) || {};
    if (p.trainingCompletedAt && salaryMonthKey(p.trainingCompletedAt) === key) attended = true;
    if (p.examTakenAt && salaryMonthKey(p.examTakenAt) === key) {
      attended = true;
      if (p.examScore != null) scores.push(_f(p.examScore));
    }
  });
  var att = attended ? 100 : 0;
  var ex = scores.length ? avg(scores) : 0;
  return clamp(Math.round(att / 3 + ex * 2 / 3), 0, 100);
}
/* Шалгалтын дүн (лавлагаанд — давтан модулиудын дундаж, KPI-д тусдаа жингүй) */
function kpiExam(e) {
  var scores = [];
  KPI_DAVTAN_KEYS.forEach(function (k) {
    var p = getEmpProg(e.id, k);
    if (p && p.examTaken && p.examScore != null) scores.push(_f(p.examScore));
  });
  if (!scores.length) return null;
  return clamp(Math.round(avg(scores)), 0, 100);
}
/* 3) Видео сургалт (LMS): тэнцсэн/оногдсон. Сургалт оногдоогүй/ачаалаагүй бол null */
function kpiVideo(e) {
  if (DEMO || !fbReady || !LMS.loaded) return null;
  var s = empLmsStats(e);
  if (!s.total) return null;
  return Math.round(s.passed / s.total * 100);
}
/* 4) Даалгаврын биелэлт: биелүүлсэн/оногдсон. Оногдоогүй бол null */
function kpiTask(e) {
  var t = empTaskStats(e);
  if (!t.total) return null;
  return Math.round(t.scoreSum / t.total);   // "хийсэн эсэх" биш — ҮНЭЛГЭЭГЭЭР
}

/* KPI-ийн хүчин зүйлс. Давтангүй сард давтангийн жин ВИДЕО руу автоматаар шилжинэ.
   Дата байхгүй үзүүлэлтийг алгасаж жинг дахин хуваарилна */
function empKpiFactors(e) {
  var w = kpiCfg().weights;
  var hasDavtan = deptHasDavtan(e.dept, currentSalaryKey());
  var videoW = _f(w.video) + (hasDavtan ? 0 : _f(w.davtan)); // 0.25 → 0.45
  return [
    { key: 'bosgo',  label: 'Босго оноо',        v: kpiBosgo(e),  w: _f(w.bosgo) },
    { key: 'davtan', label: 'Давтан + шалгалт',  v: hasDavtan ? kpiDavtan(e) : null, w: hasDavtan ? _f(w.davtan) : 0 },
    { key: 'video',  label: 'Видео сургалт',     v: kpiVideo(e),  w: videoW },
    { key: 'task',   label: 'Даалгавар',         v: kpiTask(e),   w: _f(w.task) }
  ];
}

/* Суурь оноо (бонусгүй, 0–100). Албаны coverage үүн дээр тооцогдоно */
function empBase(e) {
  var parts = empKpiFactors(e).filter(function (p) { return p.v != null && p.w > 0; });
  var ws = parts.reduce(function (a, p) { return a + p.w; }, 0);
  if (!ws) return 0;
  return Math.round(parts.reduce(function (a, p) { return a + p.v * p.w; }, 0) / ws);
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

/* Ажилтны бонус оноо: ЦАЛИНГИЙН сар бүр дээд тоо (cap), өндөр оноотойг нь эхэлж тооцно */
function empBonusPoints(e) {
  var cap = kpiCfg().bonus.monthlyCap || 99, byMonth = {};
  (DB.reports || []).forEach(function (r) {
    if (r.status !== 'verified' || !reportBelongsTo(r, e)) return;
    var mk2 = salaryMonthKey(r.verifiedAt || r.createdAt);
    (byMonth[mk2] = byMonth[mk2] || []).push(reportPoints(r));
  });
  var total = 0;
  Object.keys(byMonth).forEach(function (mk) {
    var pts = byMonth[mk].sort(function (a, b) { return b - a; });
    for (var i = 0; i < pts.length && i < cap; i++) total += pts[i];
  });
  return total;
}
function empBonusScore(e) { return clamp(Math.round(empBonusPoints(e) / (kpiCfg().bonusTarget || 30) * 100), 0, 100); }

/* Нийт оноо (0–100): СУУРЬ (0-100) + бонус НЭМЭГДЭНЭ (дээд тал нь бонусын жин),
   100-аас хэтрэхгүй. Бонус ЗӨВХӨН НЭМНЭ — байхгүй бол оноог бууруулахгүй. */
function empTotal(e) {
  var bonusW = _f(kpiCfg().weights.bonus);
  var boost = Math.round(empBonusScore(e) * bonusW / 100); // 0..bonusW нэмэгдэнэ
  return Math.min(100, empBase(e) + boost);
}
function avgKpi() { return avg(DB.employees.map(empTotal)); }

/* Хүчин зүйл тус бүрийн дундаж (зөвхөн дататай ажилтнаар). KPI хуудас/дашбоардад */
function _avgFactor(fn) {
  var vals = (DB.employees || []).map(fn).filter(function (v) { return v != null; });
  return vals.length ? Math.round(avg(vals)) : 0;
}
function categoryAverages() {
  return {
    bosgo: _avgFactor(kpiBosgo), davtan: _avgFactor(kpiDavtan),
    video: _avgFactor(kpiVideo), task: _avgFactor(kpiTask),
    bonus: _avgFactor(empBonusScore)
  };
}

/* — Албаны түвшний оноо (coverage + бонус + анхны тусламж + PPE) — */
function deptList() {
  // Ажилтан хамгийн олонтой албанаас эхлэн эрэмбэлнэ (жинхэнэ бүртгэлээр)
  var c = {}; (DB.employees || []).forEach(function (e) { if (e.dept) c[e.dept] = (c[e.dept] || 0) + 1; });
  return Object.keys(c).sort(function (a, b) {
    return (c[b] - c[a]) || a.localeCompare(b, 'mn');
  });
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
/* Албаны KPI = тухайн албаны идэвхтэй ажилтнуудын KPI-ийн дундаж (ажилтны онооны логиктой тохирно).
   ХХХ/анхны тусламж/coverage нь тусдаа дэлгэрэнгүй үзүүлэлт болж KPI хуудсанд харагдана. */
function deptScore(dept) {
  var m = deptMembers(dept);
  return m.length ? Math.round(avg(m.map(empTotal))) : 0;
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
// Ажилтны scoped view-д nextId давхардал үүсэх тул timestamp+random ID хэрэглэнэ
function newId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
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
  try { document.body.classList.remove('modal-open'); } catch (e) {}
}
function buildModal(title, contentNode, opts) {
  opts = opts || {};
  try { document.body.classList.add('modal-open'); } catch (e) {}
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
    } else if (f.type === 'file') {
      ctrl = elc('div');
      var fInp = elc('input'); fInp.type = 'file';
      if (f.accept) fInp.accept = f.accept;
      fInp.style.cssText = 'width:100%;font-size:13px;padding:9px;border:1px dashed #CBD5E1;border-radius:8px;background:#F8FAFC';
      var fHid = elc('input'); fHid.type = 'hidden'; fHid.className = 'file-url'; fHid.value = f.value || '';
      var fNam = elc('input'); fNam.type = 'hidden'; fNam.className = 'file-name'; fNam.value = f.fileName || '';
      var fSt = elc('div'); fSt.className = 'file-status';
      fSt.style.cssText = 'font-size:12px;color:#94A3B8;margin-top:5px';
      if (f.value) { fSt.textContent = 'Хавсаргасан ✓'; fSt.style.color = '#16A34A'; }
      fInp.addEventListener('change', function () {
        if (fInp.files && fInp.files[0]) { fNam.value = fInp.files[0].name; taskUpload(fInp.files[0], fSt, fHid); }
      });
      ctrl.appendChild(fInp); ctrl.appendChild(fHid); ctrl.appendChild(fNam); ctrl.appendChild(fSt);
    } else if (f.type === 'checkboxlist') {
      ctrl = elc('div', 'chk-list');
      ctrl.style.cssText = 'max-height:180px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:8px;padding:6px 8px';
      (f.options || []).forEach(function (o) {
        var val = (o && o.value != null) ? o.value : o;
        var lbl = (o && o.label != null) ? o.label : o;
        var row = elc('label', 'chk-row');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer;font-size:13px';
        row.setAttribute('data-lbl', String(lbl).toLowerCase());
        var cb = elc('input'); cb.type = 'checkbox'; cb.value = val;
        if (f.value && f.value.indexOf(val) > -1) cb.checked = true;
        row.appendChild(cb); row.appendChild(document.createTextNode(lbl));
        ctrl.appendChild(row);
      });

      /* ── Нэрээр хайх нүд (searchable: true үед) ── */
      if (f.searchable) {
        var listEl = ctrl;                 // ⚠ жагсаалтыг тусад нь барина
        var box = elc('div');
        var sInp = elc('input');
        sInp.type = 'text';
        sInp.placeholder = f.searchPlaceholder || '🔍 Нэрээр хайх...';
        sInp.style.cssText = 'width:100%;padding:9px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;margin-bottom:6px;font-family:inherit';
        var cnt = elc('div');
        cnt.style.cssText = 'font-size:11.5px;color:#94A3B8;margin-bottom:6px';
        var _refresh = function () {
          var q = (sInp.value || '').trim().toLowerCase();
          var shown = 0, sel = 0;
          Array.prototype.forEach.call(listEl.children, function (r) {
            var cbx = r.querySelector('input[type=checkbox]');
            if (cbx && cbx.checked) sel++;
            var hit = !q || (r.getAttribute('data-lbl') || '').indexOf(q) > -1;
            r.style.display = hit ? 'flex' : 'none';
            if (hit) shown++;
          });
          cnt.textContent = 'Харагдаж буй: ' + shown + ' · Сонгосон: ' + sel;
        };
        sInp.addEventListener('input', _refresh);
        listEl.addEventListener('change', _refresh);
        box.appendChild(sInp); box.appendChild(cnt); box.appendChild(listEl);
        ctrl = box;
        setTimeout(_refresh, 0);
      }
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
  submit.type = 'button';
  submit.addEventListener('click', function(e) { e.stopPropagation(); form.dispatchEvent(new Event('submit', { cancelable: true })); });
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
      } else if (f.type === 'checkboxlist') {
        v = Array.prototype.slice.call(grp.querySelectorAll('.chk-list input[type=checkbox]:checked')).map(function (c) { return c.value; });
      } else if (f.type === 'file') {
        var _fu = grp.querySelector('.file-url'), _fn = grp.querySelector('.file-name');
        v = _fu ? _fu.value : '';
        vals[f.name + 'Name'] = _fn ? _fn.value : '';
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
  // Урт жагсаалтыг цэс дотроо гүйлгэдэг болгоно (хуудсаар гүйлгэхэд хаагдахаас сэргийлнэ)
  menu.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 16) + 'px';
  menu.style.overflowY = 'auto';
  activeMenu = menu;
}

/* ============ Хуудас солих ============ */
function switchPage(pageId) {
  // Эрхийн түвшнээс хамаарч хязгаарлагдсан хуудас руу орохыг хориглоно
  if (blockedPages().indexOf(pageId) >= 0) { pageId = 'dashboard'; }
  try { rememberPage(pageId); } catch (e) {}   // refresh хийхэд энэ хуудсандаа үлдэнэ
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
  else if (pageId === 'violations') renderViolationsPage();
  else if (pageId === 'myresults') renderMyResults();
  else if (pageId === 'daatgal') renderDaatgal();
  else if (pageId === 'adminpanel') renderAdminPanel();
  else if (pageId === 'examadmin') renderExamAdmin();
  else if (pageId === 'kpi') renderKpiPage();
  else if (pageId === 'ppe') renderPpe();
  else if (pageId === 'inspections') renderInspections();
  else if (pageId === 'dataflow') renderDataflow();
  else if (pageId === 'settings') renderSettings();
  else if (pageId === 'video-track') renderVideoTracking();
  else if (pageId === 'hazards') renderHazards();
  else if (pageId === 'tasks') renderTasks();
  else if (pageId === 'myexams') renderMyExams();
  else if (pageId === 'trn-mod') { try { renderTrainingModule(CURRENT_MOD); } catch (e2) {} }
}

/* ============ Sidebar badge-ууд ============ */
/* ============ ХАБЭА Шалгалт — ажилтны шалгалт сонголтын хуудас ============ */
var EXAM_PAGES = [
  { key: 'urdchilsan',       label: 'Урьдчилсан зааварчилгааны шалгалт',       url: '/habea-urdchilsan.html', icon: 'ti-clipboard-list', color: '#4F46E5', bg: '#EEF2FF' },
  { key: 'ankhan',           label: 'Анхан шатны зааварчилгааны шалгалт',      url: '/habea-ankhan.html',     icon: 'ti-school',         color: '#059669', bg: '#D1FAE5' },
  { key: 'davtan_eeljit',    label: 'Ээлжит давтан зааварчилгааны шалгалт',    url: '/habea-eeljit.html',     icon: 'ti-refresh',        color: '#0891B2', bg: '#E0F2FE' },
  { key: 'davtan_eeljit_bus',label: 'Ээлжит бус давтан зааварчилгааны шалгалт',url: '/habea-eeljit-bus.html', icon: 'ti-bolt',           color: '#7C3AED', bg: '#F5F3FF' }
];
function renderMyExams() {
  var sec = pageEl('myexams'); if (!sec) return;

  // Ажилтан шалгалт өгөөд буцахад дүнг Firebase-ээс дахин татаж шинэчилнэ
  if (!isAdmin() && fbReady && (Date.now() - (renderMyExams._lastRefresh || 0) > 4000)) {
    renderMyExams._lastRefresh = Date.now();
    refreshMyExams().then(function (ch) { if (ch) renderMyExams(); });
  }

  if (isAdmin()) {
    var adminCards = EXAM_PAGES.map(function (ep) {
      var taken = 0, passed = 0;
      (DB.employees || []).forEach(function (emp) {
        var p = getEmpProg(emp.id, ep.key);
        if (p.examTaken) { taken++; if (p.examPassed) passed++; }
      });
      var total = (DB.employees || []).length;
      var pct = taken ? Math.round(passed / taken * 100) : 0;
      var adminUrl = '/habea-admin.html?exam=' + encodeURIComponent(ep.key);
      return '<div class="card" style="padding:22px;border:1.5px solid #E2E8F0">' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
        '<div style="width:48px;height:48px;border-radius:13px;background:' + ep.bg + ';color:' + ep.color + ';display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0"><i class="ti ' + ep.icon + '"></i></div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:#1E293B">' + esc(ep.label) + '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:2px">' + taken + '/' + total + ' өгсөн' + (taken ? ' · Тэнцсэн ' + passed + ' (' + pct + '%)' : '') + '</div></div></div>' +
        '<div style="display:flex;gap:8px">' +
        '<a href="' + adminUrl + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="flex:1;text-align:center"><i class="ti ti-pencil"></i> Асуулт засах</a>' +
        '<a href="' + adminUrl + '&tab=results" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1;text-align:center;background:#F1F5F9;color:#475569;border:1.5px solid #E2E8F0"><i class="ti ti-chart-bar"></i> Дүн харах</a>' +
        '</div></div>';
    }).join('');
    sec.innerHTML =
      '<div style="padding:26px 28px 14px"><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 4px">ХАБЭА Шалгалт — Удирдлага</h1>' +
      '<p style="font-size:13px;color:#64748B;margin:0">Шалгалт бүрийн асуулт, тохиргоог тусад нь засна. Дүн автоматаар KPI-д бүртгэгдэнэ.</p></div>' +
      '<div style="padding:0 28px 28px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">' +
      adminCards + '</div>';
    return;
  }

  var me = myEmployeeRecord();
  var email = encodeURIComponent((SESSION && SESSION.email) || '');
  var name = encodeURIComponent((me && me.name) || '');
  var cards = EXAM_PAGES.filter(function (ep) {
    return isModExamUnlocked(me, ep.key);
  }).map(function (ep) {
    var prog = me ? getEmpProg(me.id, ep.key) : {};
    var canTake = canTakeExam(ep.key, prog);
    var scoreHtml = (prog.examTaken
      ? '<div style="margin-top:10px;display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;background:' + (prog.examPassed ? '#D1FAE5' : '#FEE2E2') + ';color:' + (prog.examPassed ? '#065F46' : '#991B1B') + '">' + (prog.examScore || 0) + '% · ' + (prog.examPassed ? 'Тэнцсэн ✓' : 'Тэнцээгүй') + '</div>'
      : '<div style="margin-top:10px;font-size:12px;color:#94A3B8">Шалгалт өгөөгүй</div>') +
      (examAttemptLabel(ep.key, prog) ? '<div style="margin-top:6px;font-size:11px">' + examAttemptLabel(ep.key, prog) + '</div>' : '');
    var cardInner =
      '<div style="width:52px;height:52px;border-radius:14px;background:' + ep.bg + ';color:' + ep.color + ';display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:14px"><i class="ti ' + ep.icon + '"></i></div>' +
      '<div style="font-size:16px;font-weight:700;color:#1E293B;margin-bottom:4px">' + esc(ep.label) + '</div>' +
      '<div style="font-size:12px;color:#64748B">' + (canTake ? 'Шалгалт өгөх · Дүн автоматаар бүртгэгдэнэ' : 'Боломжит оролдлого дууссан') + '</div>' +
      scoreHtml;
    if (!canTake) {
      return '<div class="card" style="padding:24px;border:1.5px solid #E2E8F0;opacity:.75">' + cardInner + '</div>';
    }
    var url = '/habea-exam.html?exam=' + encodeURIComponent(ep.key) + '&title=' + encodeURIComponent(ep.label) +
      '&email=' + email + '&name=' + name + (me ? '&eid=' + encodeURIComponent(me.id) : '') +
      (me && me.dept ? '&dept=' + encodeURIComponent(me.dept) : '') +
      (me && (me.pos || me.role) ? '&pos=' + encodeURIComponent(me.pos || me.role) : '');
    url = examBust(url);
    return '<a href="' + url + '" target="_blank" rel="noopener" style="text-decoration:none">' +
      '<div class="card" style="padding:24px;cursor:pointer;transition:box-shadow .15s;border:1.5px solid #E2E8F0" onmouseover="this.style.boxShadow=\'0 4px 20px rgba(0,0,0,.10)\'" onmouseout="this.style.boxShadow=\'\'">' +
      cardInner +
      '</div></a>';
  }).join('');
  sec.innerHTML =
    '<div style="padding:26px 28px 14px"><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 4px">ХАБЭА Шалгалт</h1>' +
    '<p style="font-size:13px;color:#64748B;margin:0">Тохирох шалгалтаа сонгоод өгнө үү. Дүн автоматаар бүртгэгдэнэ.</p></div>' +
    '<div style="padding:0 28px 28px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">' +
    (cards || '<div class="empty-state" style="padding:40px"><i class="ti ti-lock"></i><div>Нээлттэй шалгалт байхгүй.<br><span style="font-size:12px;color:#94A3B8">Сургалтаа дуусгасны дараа шалгалтын товч гарч ирнэ.</span></div></div>') +
    '</div>';
}

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

/* ============================================================
   TRAINING MODULE SYSTEM  (5 тогтмол модуль · 3 роль)
   ============================================================ */
var TRAINING_MODULES = {
  urdchilsan:          'Урьдчилсан зааварчилгаа',
  ankhan:              'Анхан шатны зааварчилгаа',
  davtan_eeljit:       'Ээлжит давтан зааварчилгаа',
  davtan_eeljit_bus:   'Ээлжит бус давтан зааварчилгаа',
  davtan_odor_tutmiin: 'Өдөр дутмын зааварчилгаа'
};
var CURRENT_MOD = '';

/* ---- DB читэгч / бичигч ---- */
function getMod(key) { return ((DB.trainingModules || {})[key]) || {}; }
function getModRel(key, dept) { return ((DB.moduleReleases || {})[key + '_' + (dept || '')]) || {}; }
function getEmpProg(empId, key) { return ((DB.empProgress || {})[empId + '_' + key]) || {}; }

/* ---- Ажилтан ТУС БҮРИЙН нээлт (албанаас хамаарахгүй, нэмэлт эрх) ---- */
function getEmpRel(empId, key) { return ((DB.empReleases || {})[empId + '_' + key]) || {}; }
function setEmpRelData(empId, key, data) {
  DB.empReleases = DB.empReleases || {};
  var k = empId + '_' + key;
  DB.empReleases[k] = _merge(DB.empReleases[k] || {}, _merge({ updatedAt: new Date().toISOString() }, data));
  saveDB();
}

/* ---- Шалгалт өгөх оролдлогын тоо (админ тохируулна) ---- */
var EXAM_ATTEMPT_OPTS = [
  { v: 1, label: '1 удаа' },
  { v: 2, label: '2 удаа' },
  { v: 3, label: '3 удаа' },
  { v: 0, label: 'Хязгааргүй' }
];
function modMaxAttempts(key) {
  var n = getMod(key).examAttempts;
  if (n == null) return 0;            // анхдагч: хязгааргүй
  n = parseInt(n, 10);
  return (isNaN(n) || n < 0) ? 0 : n; // 0 = хязгааргүй
}
function examAttemptsUsed(prog) {
  if (prog && prog.examAttemptCount != null) return prog.examAttemptCount;
  return (prog && prog.examTaken) ? 1 : 0;
}
function canTakeExam(key, prog) {
  var max = modMaxAttempts(key);
  if (max === 0) return true;         // хязгааргүй
  return examAttemptsUsed(prog) < max;
}
function examAttemptLabel(key, prog) {
  var max = modMaxAttempts(key);
  if (max === 0) return '';           // хязгааргүй бол мэдээлэл харуулахгүй
  var used = examAttemptsUsed(prog);
  var left = Math.max(0, max - used);
  if (left <= 0) return '<span style="color:#DC2626;font-weight:600">Боломжит оролдлого дууссан (' + used + '/' + max + ')</span>';
  return '<span style="color:#64748B">Үлдсэн оролдлого: ' + left + ' (' + used + '/' + max + ')</span>';
}

function _merge(target, src) {
  var ks = Object.keys(src); for (var i = 0; i < ks.length; i++) target[ks[i]] = src[ks[i]]; return target;
}
function setEmpProgData(empId, key, data) {
  DB.empProgress = DB.empProgress || {};
  var k = empId + '_' + key;
  DB.empProgress[k] = _merge(DB.empProgress[k] || {}, data);
  saveDB();
}
function setModRelData(key, dept, data) {
  DB.moduleReleases = DB.moduleReleases || {};
  var k = key + '_' + dept;
  DB.moduleReleases[k] = _merge(DB.moduleReleases[k] || {}, data);
  DB.moduleReleases[k].updatedAt = new Date().toISOString();
  DB.moduleReleases[k].updatedBy = (SESSION && SESSION.email) || '';
  saveDB();
}
function setModData(key, data) {
  DB.trainingModules = DB.trainingModules || {};
  DB.trainingModules[key] = _merge(DB.trainingModules[key] || {}, data);
  saveDB();
}

/* ---- Харагдах байдлын туслахууд ---- */
function isModTrainingVisible(emp, key) {
  var mod = getMod(key);
  if (mod.releasedToAll) return true;
  if (!emp) return false;
  // Ажилтанд ТУСГАЙЛАН нээсэн бол — алба нээгээгүй ч харагдана
  if (getEmpRel(emp.id, key).trainingReleased) return true;
  if (!emp.dept) return false;
  return !!(getModRel(key, emp.dept).trainingReleased);
}
function isModExamUnlocked(emp, key) {
  if (!emp) return false;
  // Ажилтанд тусгайлан "Шалгалт нээх" хийсэн бол — шууд нээгдэнэ
  if (getEmpRel(emp.id, key).examForceUnlocked) return true;
  // Админ албаар "Шалгалт нээх" дарсан бол — сургалт нээгээгүй/дуусгаагүй ч шалгалт шууд нээгдэнэ
  if (emp.dept && getModRel(key, emp.dept).examForceUnlocked) return true;
  // Байгалийн урсгал: сургалт нээгдсэн + ажилтан үзэж дуусгасан үед шалгалт нээгдэнэ
  if (!isModTrainingVisible(emp, key)) return false;
  return !!getEmpProg(emp.id, key).trainingCompleted;
}

/* ---- Toggle товч ---- */
function modTog(isOn, disabled, attrs) {
  var col = isOn ? '#16A34A' : '#64748B';
  var bg = isOn ? col : '#F1F5F9';
  var fg = isOn ? '#fff' : col;
  var icon = isOn ? 'ti-toggle-right' : 'ti-toggle-left';
  return '<button class="mod-tog-btn" style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:20px;border:1.5px solid ' + col + ';background:' + bg + ';color:' + fg + ';font-size:12px;font-weight:600;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';opacity:' + (disabled ? '.45' : '1') + '" ' + (disabled ? 'disabled' : '') + ' ' + (attrs || '') + '><i class="ti ' + icon + '" style="font-size:16px"></i>' + (isOn ? 'Нээлттэй' : 'Хаалттай') + '</button>';
}

/* ---- Агуулга HTML хэлбэрт буулгах (бүх ролид нийтлэг) ---- */
function renderModContentHtml(mod) {
  var html = '';
  if (mod.videoUrl) {
    var emb = toEmbed(mod.videoUrl);
    html += emb
      ? '<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;margin-bottom:14px"><iframe src="' + emb + '" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>'
      : '<a href="' + esc(mod.videoUrl) + '" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-bottom:12px;display:inline-flex;align-items:center;gap:6px"><i class="ti ti-player-play"></i> Видео үзэх</a>';
  }
  if (mod.pptUrl) {
    html += '<button class="btn btn-secondary" style="margin-bottom:12px;margin-left:8px;display:inline-flex;align-items:center;gap:6px" data-ppt-view="' + esc(mod.pptUrl) + '"><i class="ti ti-presentation"></i> Слайд харах</button>';
  }
  if (mod.desc) {
    html += '<div style="font-size:14px;line-height:1.85;white-space:pre-wrap;color:#475569;margin-top:8px">' + esc(mod.desc) + '</div>';
  }
  return html || '<div style="color:#94A3B8;padding:8px 0;font-size:13px">Агуулга байхгүй байна.</div>';
}

/* ---- Хаалттай байдлын хуудас ---- */
function renderModLockedPage(title, msg, color) {
  color = color || '#DC2626';
  var bg = color === '#DC2626' ? '#FEF2F2' : '#FFFBEB';
  var bdr = color === '#DC2626' ? '#FECACA' : '#FDE68A';
  var ibg = color === '#DC2626' ? '#FEE2E2' : '#FEF3C7';
  return '<div style="padding:24px"><div class="page-header"><div><h1>' + esc(title) + '</h1></div></div>' +
    '<div class="card" style="padding:36px;text-align:center;background:' + bg + ';border:1.5px solid ' + bdr + '">' +
    '<div style="width:60px;height:60px;border-radius:16px;background:' + ibg + ';color:' + color + ';display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px"><i class="ti ti-lock"></i></div>' +
    '<h3 style="margin:0 0 8px;color:' + color + '">Нээгдээгүй байна</h3>' +
    '<p style="color:#64748B;margin:0;font-size:14px">' + esc(msg) + '</p></div></div>';
}

/* Ажилтан тус бүрийн нээлтийн мөрүүд (сургалт/шалгалтыг ХУВИЙН эрхээр нээнэ) */
function buildModEmpRows(key, mod, emps) {
  if (!emps.length) return '';
  return emps.map(function (e) {
    var prog = getEmpProg(e.id, key);
    var er = getEmpRel(e.id, key);
    var dr = getModRel(key, e.dept);
    // Албаар эсвэл бүх хэлтэст нээгдсэн эсэх (тайлбар харуулна)
    var byDeptTrain = !!(mod.releasedToAll || dr.trainingReleased);
    var byDeptExam = !!dr.examForceUnlocked;
    var scoreHtml = prog.examTaken
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;background:' + (prog.examPassed ? '#D1FAE5' : '#FEE2E2') + ';color:' + (prog.examPassed ? '#065F46' : '#991B1B') + '">' + (prog.examScore || 0) + '%</span>'
      : '<span style="color:#CBD5E1;font-size:12px">—</span>';
    function cell(on, byDept, act) {
      if (byDept) {
        return '<td style="text-align:center"><span title="Албаар нээгдсэн" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#16A34A;background:#ECFDF5;border:1px solid #A7F3D0;padding:3px 9px;border-radius:20px"><i class="ti ti-building"></i> Албаар</span></td>';
      }
      return '<td style="text-align:center">' +
        modTog(on, false, 'data-modact="' + act + '" data-modkey="' + esc(key) + '" data-empid="' + esc(e.id) + '"') + '</td>';
    }
    return '<tr data-emprow="1" data-empname="' + esc((e.name || '').toLowerCase()) + '" data-empdept="' + esc((e.dept || '').toLowerCase()) + '">' +
      '<td style="font-size:13px;font-weight:500">' + esc(e.name) + '</td>' +
      '<td style="font-size:12px;color:#64748B">' + esc(e.dept || '') + '</td>' +
      cell(!!er.trainingReleased, byDeptTrain, 'emptrain') +
      cell(!!er.examForceUnlocked, byDeptExam, 'empexam') +
      '<td style="text-align:center">' + (prog.trainingCompleted ? '<span style="color:#16A34A;font-size:12px">✓ ' + (prog.completedAt ? timeAgo(prog.completedAt) : '') + '</span>' : '<span style="color:#CBD5E1">—</span>') + '</td>' +
      '<td style="text-align:center">' + scoreHtml + '</td></tr>';
  }).join('');
}

/* ========== SUPER ADMIN дэлгэц ========== */
function renderModAdmin(sec, key, mod, title) {
  var hasContent = !!(mod.videoUrl || mod.pptUrl || mod.desc);
  var examQs = mod.examQuestions || [];
  var hasExam = examQs.length > 0;

  var deptRows = deptList().map(function (dept) {
    var rel = getModRel(key, dept);
    var dEmps = (DB.employees || []).filter(function (e) { return e.dept === dept; });
    var dDone = dEmps.filter(function (e) { return getEmpProg(e.id, key).trainingCompleted; }).length;
    return '<tr>' +
      '<td style="font-weight:500;font-size:13px">' + esc(dept) + ' <span style="color:#94A3B8;font-weight:400;font-size:11px">' + dEmps.length + ' хүн</span></td>' +
      '<td style="text-align:center">' + modTog(!!(mod.releasedToAll || rel.trainingReleased), !hasContent, 'data-modact="train" data-modkey="' + esc(key) + '" data-moddept="' + esc(dept) + '"') + '</td>' +
      '<td style="text-align:center">' + modTog(!!(rel.examForceUnlocked), false, 'data-modact="exam" data-modkey="' + esc(key) + '" data-moddept="' + esc(dept) + '"') + '</td>' +
      '<td style="text-align:center;font-size:13px"><span style="color:#16A34A;font-weight:600">' + dDone + '</span><span style="color:#94A3B8">/' + dEmps.length + '</span></td>' +
      '<td style="font-size:11px;color:#94A3B8">' + (rel.updatedAt ? timeAgo(rel.updatedAt) : '—') + '</td>' +
      '</tr>';
  }).join('');

  var empRows = buildModEmpRows(key, mod, DB.employees || []);

  sec.innerHTML =
    '<div style="padding:22px 26px 14px">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
    '<div><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 3px">' + esc(title) + '</h1>' +
    '<p style="font-size:12px;color:#64748B;margin:0">Дотоод сургалт · Ерөнхий админ</p></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn btn-secondary btn-sm" id="mBtnContent"><i class="ti ti-edit"></i> Агуулга засах</button>' +
    '<button class="btn btn-secondary btn-sm" id="mBtnExam"><i class="ti ti-clipboard-list"></i> Шалгалтын асуулт засах</button>' +
    '<button class="btn btn-sm" style="background:#D1FAE5;color:#065F46;border:1.5px solid #6EE7B7" id="mBtnOpenAll"><i class="ti ti-lock-open"></i> Бүх сургалт нэгдэж нээх</button>' +
    '</div></div>' +

    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
    '<div class="card" style="padding:12px 16px;flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-size:13px;font-weight:600;color:#1E293B">Туслах админд харуулах</div>' +
    '<div style="font-size:11px;color:#64748B">Цех дарга READ-ONLY харна</div></div>' +
    modTog(!!(mod.visibleToSubadmin), false, 'data-modact="subvis" data-modkey="' + esc(key) + '"') + '</div>' +
    '<div class="card" style="padding:12px 16px;flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-size:13px;font-weight:600;color:#1E293B">Бүх хэлтэст нэгэн зэрэг нээх</div>' +
    '<div style="font-size:11px;color:' + (!hasContent ? '#DC2626' : '#64748B') + '">' + (!hasContent ? '⚠ Эхлээд агуулга оруулна уу' : 'Нэг дор бүх ажилтнуудад нээнэ') + '</div></div>' +
    modTog(!!(mod.releasedToAll), !hasContent, 'data-modact="relall" data-modkey="' + esc(key) + '"') + '</div>' +
    '<div class="card" style="padding:12px 16px;flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-size:13px;font-weight:600;color:#1E293B"><i class="ti ti-repeat" style="color:#0891B2"></i> Шалгалт өгөх давтамж</div>' +
    '<div style="font-size:11px;color:#64748B">Ажилтан хэдэн удаа өгч болох вэ</div></div>' +
    '<select id="mExamAttempts" style="padding:7px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;color:#1E293B;cursor:pointer;background:#fff">' +
    EXAM_ATTEMPT_OPTS.map(function (o) { return '<option value="' + o.v + '"' + (modMaxAttempts(key) === o.v ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
    '</select></div>' +
    '</div></div>' +

    '<div style="padding:0 26px 26px">' +
    '<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">' +
    '<div style="padding:11px 16px;border-bottom:1px solid #F1F5F9;font-weight:600;font-size:13px;color:#1E293B"><i class="ti ti-building" style="color:#3B82F6"></i> Хэлтэс бүрийн нээлт</div>' +
    '<div style="overflow-x:auto"><table class="data-table" style="width:100%;min-width:520px"><thead><tr>' +
    '<th>Хэлтэс</th><th style="text-align:center">Сургалт нээх</th><th style="text-align:center">Шалгалт нээх</th><th style="text-align:center">Явц</th><th>Сүүлд</th>' +
    '</tr></thead><tbody>' + deptRows + '</tbody></table></div></div>' +

    (hasContent ? '<div class="card" style="padding:18px;margin-bottom:14px"><div style="font-weight:600;font-size:13px;color:#64748B;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;font-size:11px">Агуулгын урьдчилан харах</div>' + renderModContentHtml(mod) + '</div>' : '') +

    '<div class="card" style="padding:0;overflow:hidden">' +
    '<div style="padding:11px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
    '<div style="font-weight:600;font-size:13px;color:#1E293B"><i class="ti ti-user-check" style="color:#8B5CF6"></i> Ажилтан бүрээр нээх · явц</div>' +
    '<div class="search-box" style="min-width:200px;flex:1;max-width:320px"><i class="ti ti-search"></i>' +
    '<input type="text" id="modEmpSearch" placeholder="Ажилтан, хэлтсээр хайх..."></div></div>' +
    '<div style="padding:9px 16px;background:#F8FAFF;border-bottom:1px solid #F1F5F9;font-size:11.5px;color:#64748B">' +
    'Албаар нээгдсэн ажилтанд <b style="color:#16A34A">Албаар</b> гэж харагдана. Тухайн ажилтанд <b>дангаар</b> нээхийг хүсвэл доорх товчийг ашиглана.</div>' +
    '<div style="overflow-x:auto"><table class="data-table" style="width:100%;min-width:640px"><thead><tr>' +
    '<th>Ажилтан</th><th>Хэлтэс</th>' +
    '<th style="text-align:center">Сургалт нээх</th><th style="text-align:center">Шалгалт нээх</th>' +
    '<th style="text-align:center">Үзсэн</th><th style="text-align:center">Дүн</th></tr></thead>' +
    '<tbody id="modEmpTbody">' + (empRows || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;padding:20px;font-size:13px">Ажилтан бүртгэгдээгүй</td></tr>') + '</tbody></table></div></div>' +
    '</div>';

  if (!sec._mAdminWired) {
    sec._mAdminWired = true;
    sec.addEventListener('change', function (ev) {
      var iv = ev.target.closest && ev.target.closest('#mExamAttempts');
      if (iv) {
        var n = parseInt(iv.value, 10) || 0;
        setModData(CURRENT_MOD, { examAttempts: n });
        toast('Шалгалт өгөх давтамж: ' + (n === 0 ? 'Хязгааргүй' : n + ' удаа'), 'success');
        renderTrainingModule(CURRENT_MOD);
      }
    });
    /* Ажилтны хайлт — хүснэгтийн мөрийг шүүнэ */
    sec.addEventListener('input', function (ev) {
      var box = ev.target.closest && ev.target.closest('#modEmpSearch');
      if (!box) return;
      var q = (box.value || '').toLowerCase().trim();
      $$('#modEmpTbody tr[data-emprow]').forEach(function (tr) {
        var hit = !q || (tr.getAttribute('data-empname') || '').indexOf(q) > -1 ||
          (tr.getAttribute('data-empdept') || '').indexOf(q) > -1;
        tr.style.display = hit ? '' : 'none';
      });
    });
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('#mBtnContent')) { actionModEditContent(CURRENT_MOD); }
      if (ev.target.closest('#mBtnExam')) { window.open('/habea-admin.html?exam=' + encodeURIComponent(CURRENT_MOD), '_blank'); }
      if (ev.target.closest('#mBtnOpenAll')) {
        DB.trainingModules = DB.trainingModules || {};
        Object.keys(TRAINING_MODULES).forEach(function (k) {
          DB.trainingModules[k] = _merge(DB.trainingModules[k] || {}, { releasedToAll: true });
        });
        saveDB();
        toast('Бүх сургалт нэгдэж нээгдлаа', 'success');
        renderTrainingModule(CURRENT_MOD);
      }
    });
  }
}

/* ========== ТУСЛАХ АДМИН (depthead) дэлгэц ========== */
function renderModSubadmin(sec, key, mod, title, myDept) {
  var rel = getModRel(key, myDept);
  var hasContent = !!(mod.videoUrl || mod.pptUrl || mod.desc);
  var hasExam = !!(mod.examQuestions && mod.examQuestions.length);
  var dEmps = (DB.employees || []).filter(function (e) { return e.dept === myDept; });
  var dDone = dEmps.filter(function (e) { return getEmpProg(e.id, key).trainingCompleted; }).length;

  var empRows = buildModEmpRows(key, mod, dEmps);

  sec.innerHTML =
    '<div style="padding:22px 26px 14px">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
    '<div><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 3px">' + esc(title) + '</h1>' +
    '<p style="font-size:12px;color:#64748B;margin:0">Дотоод сургалт · ' + esc(myDept) + ' · Туслах админ</p></div></div>' +

    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
    '<div class="card" style="padding:12px 16px;flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-size:13px;font-weight:600">Сургалт нээх</div>' +
    '<div style="font-size:11px;color:' + (!hasContent ? '#DC2626' : '#64748B') + '">' + (!hasContent ? '⚠ Агуулга ороогүй байна' : esc(myDept) + ' ажилтнуудад харагдана') + '</div></div>' +
    modTog(!!(rel.trainingReleased), !hasContent, 'data-modact="train" data-modkey="' + esc(key) + '" data-moddept="' + esc(myDept) + '"') + '</div>' +
    '<div class="card" style="padding:12px 16px;flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-size:13px;font-weight:600">Шалгалт нээх</div>' +
    '<div style="font-size:11px;color:#64748B">Сургалт дүүргэлгүйгээр шууд нээнэ</div></div>' +
    modTog(!!(rel.examForceUnlocked), false, 'data-modact="exam" data-modkey="' + esc(key) + '" data-moddept="' + esc(myDept) + '"') + '</div>' +
    '</div></div>' +

    '<div style="padding:0 26px 26px">' +
    '<div class="card" style="padding:18px;margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Сургалтын агуулга (читэх эрхтэй)</div>' +
    renderModContentHtml(mod) + '</div>' +
    (dEmps.length ? '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:11px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:600;font-size:13px">' + esc(myDept) + ' — ажилтан бүрээр нээх (<span style="color:#16A34A;font-weight:700">' + dDone + '</span>/' + dEmps.length + ' үзсэн)</div>' +
      '<div class="search-box" style="min-width:180px;flex:1;max-width:300px"><i class="ti ti-search"></i>' +
      '<input type="text" id="modEmpSearch" placeholder="Ажилтнаар хайх..."></div></div>' +
      '<div style="overflow-x:auto"><table class="data-table" style="width:100%;min-width:640px"><thead><tr>' +
      '<th>Ажилтан</th><th>Хэлтэс</th><th style="text-align:center">Сургалт нээх</th><th style="text-align:center">Шалгалт нээх</th>' +
      '<th style="text-align:center">Үзсэн</th><th style="text-align:center">Дүн</th></tr></thead>' +
      '<tbody id="modEmpTbody">' + empRows + '</tbody></table></div></div>' : '') +
    '</div>';

  if (!sec._mSubWired) {
    sec._mSubWired = true;
    sec.addEventListener('input', function (ev) {
      var box = ev.target.closest && ev.target.closest('#modEmpSearch');
      if (!box) return;
      var q = (box.value || '').toLowerCase().trim();
      $$('#modEmpTbody tr[data-emprow]').forEach(function (tr) {
        var hit = !q || (tr.getAttribute('data-empname') || '').indexOf(q) > -1;
        tr.style.display = hit ? '' : 'none';
      });
    });
  }
}

/* ========== АЖИЛТАН дэлгэц ========== */
function renderModEmployee(sec, key, mod, title, me) {
  var prog = getEmpProg(me.id, key);
  var examUnlocked = isModExamUnlocked(me, key);
  var hasContent = !!(mod.videoUrl || mod.pptUrl || mod.desc);
  var canTake = canTakeExam(key, prog);

  var examSection;
  if (examUnlocked) {
    examSection =
      '<div class="card" style="padding:24px;text-align:center;background:linear-gradient(135deg,#F0FDF4,#ECFDF5)">' +
      '<div style="width:56px;height:56px;border-radius:14px;background:#D1FAE5;color:#065F46;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px"><i class="ti ti-clipboard-check"></i></div>' +
      '<h3 style="margin:0 0 6px;color:#065F46">Шалгалт нээлттэй байна</h3>' +
      (prog.examTaken ?
        '<div style="margin:8px 0 14px"><div style="display:inline-block;padding:6px 20px;border-radius:14px;font-size:22px;font-weight:800;background:' + (prog.examPassed ? '#D1FAE5' : '#FEE2E2') + ';color:' + (prog.examPassed ? '#065F46' : '#991B1B') + '">' + (prog.examScore || 0) + '%</div>' +
        '<div style="font-size:13px;margin-top:6px;color:' + (prog.examPassed ? '#16A34A' : '#DC2626') + '">' + (prog.examPassed ? '✓ Тэнцсэн' : '✗ Тэнцээгүй' + (canTake ? ' — дахин оролдоно уу' : '')) + '</div>' +
        (examAttemptLabel(key, prog) ? '<div style="font-size:12px;margin-top:6px">' + examAttemptLabel(key, prog) + '</div>' : '') + '</div>' :
        '<p style="color:#64748B;font-size:14px;margin:0 0 14px">Сургалтыг үзэж дуусаад шалгалтаа өгнө үү.' + (examAttemptLabel(key, prog) ? '<br>' + examAttemptLabel(key, prog) : '') + '</p>') +
      (canTake
        ? '<button class="btn btn-primary" style="padding:10px 28px" data-modact="takeexam" data-modkey="' + esc(key) + '" data-empid="' + esc(me.id) + '"><i class="ti ti-pencil"></i> ' + (prog.examTaken ? 'Дахин шалгалт өгөх' : 'Шалгалт өгөх') + '</button>'
        : '<button class="btn" disabled style="padding:10px 28px;background:#F1F5F9;color:#94A3B8;border:1.5px solid #E2E8F0;cursor:not-allowed"><i class="ti ti-lock"></i> Боломжит оролдлого дууссан</button>') +
      '</div>';
  } else {
    examSection =
      '<div class="card" style="padding:24px;text-align:center;background:#F8FAFC;border:1.5px dashed #CBD5E1">' +
      '<div style="width:56px;height:56px;border-radius:14px;background:#F1F5F9;color:#94A3B8;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px"><i class="ti ti-lock"></i></div>' +
      '<h3 style="margin:0 0 6px;color:#475569">Шалгалт хаалттай байна</h3>' +
      '<p style="color:#94A3B8;margin:0;font-size:13px">Сургалтыг бүрэн үзэж дуусгах эсвэл ХАБЭА мэргэжилтэн нээх үед шалгалт нээгдэнэ.</p>' +
      '</div>';
  }

  sec.innerHTML =
    '<div style="padding:22px 24px 0"><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 3px">' + esc(title) + '</h1>' +
    '<p style="font-size:12px;color:#64748B;margin:0 0 16px">Дотоод сургалт · ' + esc(me.dept || '') + '</p></div>' +
    '<div style="padding:0 24px 24px">' +

    '<div class="card" style="padding:20px;margin-bottom:14px">' +
    (prog.trainingCompleted ? '<div style="background:#D1FAE5;color:#065F46;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;margin-bottom:14px"><i class="ti ti-check"></i> Сургалт дуусгасан</div><br>' : '') +
    renderModContentHtml(mod) +
    (!prog.trainingCompleted && hasContent ?
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #F1F5F9">' +
      '<button class="btn btn-primary" data-modact="markdone" data-modkey="' + esc(key) + '" data-empid="' + esc(me.id) + '"><i class="ti ti-check"></i> Үзэж дуусгасан тэмдэглэх</button>' +
      '<div style="font-size:11px;color:#94A3B8;margin-top:6px">Сургалтыг бүрэн үзсэний дараа дараасаа шалгалт нээгдэнэ</div></div>' : '') +
    '</div>' +

    examSection +
    '</div>';
}

/* ========== Үндсэн dispatcher ========== */
var _trnSyncInProgress = false;
function renderTrainingModule(key) {
  CURRENT_MOD = key;
  var sec = pageEl('trn-mod'); if (!sec) return;
  sec.style.padding = '0';
  var mod = getMod(key);
  var title = TRAINING_MODULES[key] || key;

  if (isAdmin()) {
    renderModAdmin(sec, key, mod, title);
  } else if (isDeptHead()) {
    if (!mod.visibleToSubadmin) {
      sec.innerHTML = renderModLockedPage(title, 'ХАБЭА мэргэжилтэн энэ сургалтыг туслах админд нээгээгүй байна.', '#92400E');
    } else {
      renderModSubadmin(sec, key, mod, title, SESSION && SESSION.dept);
    }
  } else {
    var me = myEmployeeRecord();
    if (!isModTrainingVisible(me, key)) {
      sec.innerHTML = renderModLockedPage(title, 'ХАБЭА мэргэжилтэн эсвэл цехийн дарга нээх хүртэл хүлээнэ үү.');
    } else {
      renderModEmployee(sec, key, mod, title, me);
    }
  }

  /* Auto-sync habea exam results in background (once per navigation) */
  if (!_trnSyncInProgress && !DEMO && fbReady) {
    _trnSyncInProgress = true;
    readHabeaExamsByEmail().then(function (habeaMap) {
      _trnSyncInProgress = false;
      if (habeaMap && syncHabeaToModProgress(habeaMap, DB.employees)) {
        saveDB();
        if (CURRENT_MOD === key) renderTrainingModule(key);
      }
    }).catch(function () { _trnSyncInProgress = false; });
  }
}

/* ---- Toggle дарах үйлдэл ---- */
function handleModToggle(act, key, dept, empId) {
  var mod = getMod(key);
  /* — Ажилтан тус бүрийн нээлт — */
  if (act === 'emptrain' || act === 'empexam') {
    if (!empId) return;
    var emp = (DB.employees || []).filter(function (x) { return x.id === empId; })[0];
    var nm = emp ? emp.name : 'Ажилтан';
    var er = getEmpRel(empId, key);
    if (act === 'emptrain') {
      if (!er.trainingReleased && !mod.videoUrl && !mod.pptUrl && !mod.desc) { toast('Эхлээд агуулга оруулна уу', 'warn'); return; }
      setEmpRelData(empId, key, { trainingReleased: !er.trainingReleased });
      toast(nm + (er.trainingReleased ? ' — сургалт хаагдлаа' : ' — сургалт нээгдлаа'), er.trainingReleased ? 'warn' : 'success');
    } else {
      setEmpRelData(empId, key, { examForceUnlocked: !er.examForceUnlocked });
      toast(nm + (er.examForceUnlocked ? ' — шалгалт хаагдлаа' : ' — шалгалт нээгдлаа'), er.examForceUnlocked ? 'warn' : 'success');
    }
    renderTrainingModule(CURRENT_MOD);
    return;
  }
  if (act === 'subvis') {
    setModData(key, { visibleToSubadmin: !mod.visibleToSubadmin });
    toast(mod.visibleToSubadmin ? 'Туслах админаас нуугдлаа' : 'Туслах админд нээгдлаа', mod.visibleToSubadmin ? 'warn' : 'success');
  } else if (act === 'relall') {
    if (!mod.videoUrl && !mod.pptUrl && !mod.desc) { toast('Эхлээд агуулга оруулна уу', 'warn'); return; }
    setModData(key, { releasedToAll: !mod.releasedToAll });
    toast(mod.releasedToAll ? 'Бүх хэлтсийн нээлт хаагдлаа' : 'Бүх ажилтнуудад нэгэн зэрэг нээгдлаа', mod.releasedToAll ? 'warn' : 'success');
  } else if (act === 'train') {
    var rel = getModRel(key, dept);
    if (!rel.trainingReleased && !mod.videoUrl && !mod.pptUrl && !mod.desc) { toast('Эхлээд агуулга оруулна уу', 'warn'); return; }
    setModRelData(key, dept, { trainingReleased: !rel.trainingReleased });
    toast(dept + (rel.trainingReleased ? ' — сургалт хаагдлаа' : ' — сургалт нээгдлаа'), rel.trainingReleased ? 'warn' : 'success');
  } else if (act === 'exam') {
    // Асуултууд гадаад habea-shalgalt project-д (questions_<key>) — локал шалгалт хийхгүй
    var rel2 = getModRel(key, dept);
    setModRelData(key, dept, { examForceUnlocked: !rel2.examForceUnlocked });
    toast(dept + (rel2.examForceUnlocked ? ' — шалгалт хаагдлаа' : ' — шалгалт нээгдлаа'), rel2.examForceUnlocked ? 'warn' : 'success');
  }
  renderTrainingModule(CURRENT_MOD);
}

/* ---- Агуулга засах модал (admin) ---- */
function actionModEditContent(key) {
  if (!isAdmin()) return;
  var mod = getMod(key);
  var node = elc('div', 'modal-info');
  var R2_WORKER = 'https://monos-upload.buynt666.workers.dev';
  var R2_KEY = 'monos2026';
  node.innerHTML =
    '<div class="rf-field"><label style="font-weight:600;font-size:13px">Видео файл байршуулах (R2)</label>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0"><i class="ti ti-upload"></i> Файл сонгох<input type="file" id="mVidFile" accept="video/*" style="display:none"></label>' +
    '<span id="mVidProgress" style="font-size:12px;color:#64748B"></span></div>' +
    '<div class="rf-field" style="margin-top:8px"><label style="font-weight:600;font-size:13px">Видео холбоос (YouTube эсвэл R2 URL)</label>' +
    '<input type="text" id="mVid" class="rf-input" placeholder="https://youtu.be/... эсвэл R2 URL" value="' + esc(mod.videoUrl || '') + '"></div></div>' +
    '<div class="rf-field" style="margin-top:12px"><label style="font-weight:600;font-size:13px">Материал файл байршуулах (PDF, PPT)</label>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0"><i class="ti ti-upload"></i> Файл сонгох<input type="file" id="mPptFile" accept=".pdf,.ppt,.pptx,.doc,.docx" style="display:none"></label>' +
    '<span id="mPptProgress" style="font-size:12px;color:#64748B"></span></div>' +
    '<div class="rf-field" style="margin-top:8px"><label style="font-weight:600;font-size:13px">Материал холбоос (Google Docs эсвэл R2 URL)</label>' +
    '<input type="text" id="mPpt" class="rf-input" placeholder="https://docs.google.com/... эсвэл R2 URL" value="' + esc(mod.pptUrl || '') + '"></div></div>' +
    '<div class="rf-field" style="margin-top:12px"><label style="font-weight:600;font-size:13px">Тайлбар / зааварчилгаа</label>' +
    '<textarea id="mDesc" class="rf-input" rows="4" placeholder="Сургалтын зорилго, агуулга...">' + esc(mod.desc || '') + '</textarea></div>' +
    '<button class="btn btn-primary btn-block" id="mSaveContent" style="margin-top:14px"><i class="ti ti-device-floppy"></i> Хадгалах</button>';

  function r2Upload(file, progressEl, inputEl) {
    if (!file) return;
    var fname = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    progressEl.textContent = 'Байршуулж байна...';
    progressEl.style.color = '#D97706';
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', R2_WORKER + '/' + fname);
    xhr.setRequestHeader('X-Key', R2_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) progressEl.textContent = Math.round(e.loaded / e.total * 100) + '%';
    };
    xhr.onload = function () {
      if (xhr.status === 200) {
        var res = JSON.parse(xhr.responseText);
        inputEl.value = res.url;
        progressEl.textContent = 'Амжилттай байршлаа ✓';
        progressEl.style.color = '#16A34A';
      } else {
        progressEl.textContent = 'Алдаа гарлаа';
        progressEl.style.color = '#DC2626';
      }
    };
    xhr.onerror = function () { progressEl.textContent = 'Холболтын алдаа'; progressEl.style.color = '#DC2626'; };
    xhr.send(file);
  }

  node.querySelector('#mVidFile').addEventListener('change', function () {
    r2Upload(this.files[0], node.querySelector('#mVidProgress'), node.querySelector('#mVid'));
  });
  node.querySelector('#mPptFile').addEventListener('change', function () {
    r2Upload(this.files[0], node.querySelector('#mPptProgress'), node.querySelector('#mPpt'));
  });

  node.addEventListener('click', function (ev) {
    if (!ev.target.closest('#mSaveContent')) return;
    setModData(key, {
      videoUrl: (node.querySelector('#mVid').value || '').trim(),
      pptUrl: (node.querySelector('#mPpt').value || '').trim(),
      desc: (node.querySelector('#mDesc').value || '').trim()
    });
    closeModal(); renderTrainingModule(key); toast('Агуулга хадгалагдлаа', 'success');
  });
  buildModal((TRAINING_MODULES[key] || key) + ' — агуулга засах', node, { width: '500px' });
}

/* ---- Шалгалтын асуулт засах модал (admin) ---- */
function actionModEditExam(key) {
  if (!isAdmin()) return;
  var mod = getMod(key);
  var qs = mod.examQuestions ? JSON.parse(JSON.stringify(mod.examQuestions)) : [];
  var node = elc('div', 'modal-info');

  function syncFromInputs() {
    node.querySelectorAll('[data-qfield]').forEach(function (inp) {
      var qi = +inp.getAttribute('data-qi');
      var f = inp.getAttribute('data-qfield');
      if (!qs[qi]) return;
      if (f === 'q') { qs[qi].question = inp.value; }
      else if (f === 'opt') { var oi = +inp.getAttribute('data-oi'); qs[qi].options = qs[qi].options || []; qs[qi].options[oi] = inp.value; }
      else if (f === 'correct' && inp.checked) { qs[qi].correctIndex = +inp.getAttribute('data-oi'); }
    });
  }

  function drawQs() {
    var html = '';
    qs.forEach(function (q, qi) {
      html += '<div class="card" style="padding:12px;margin-bottom:10px;border:1px solid #E2E8F0">' +
        '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<input type="text" class="rf-input" placeholder="Асуулт ' + (qi + 1) + '" data-qi="' + qi + '" data-qfield="q" value="' + esc(q.question || '') + '" style="flex:1">' +
        '<button class="btn btn-sm" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA;flex-shrink:0" data-delq="' + qi + '"><i class="ti ti-trash"></i></button></div>';
      for (var oi = 0; oi < 4; oi++) {
        html += '<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">' +
          '<input type="radio" name="cor_' + qi + '" data-qi="' + qi + '" data-oi="' + oi + '" data-qfield="correct" ' + (q.correctIndex === oi ? 'checked' : '') + ' title="Зөв хариулт">' +
          '<input type="text" class="rf-input" style="flex:1;padding:5px 9px;font-size:13px" placeholder="Хариулт ' + String.fromCharCode(65 + oi) + '" data-qi="' + qi + '" data-oi="' + oi + '" data-qfield="opt" value="' + esc((q.options || [])[oi] || '') + '"></div>';
      }
      html += '</div>';
    });
    html += '<div style="display:flex;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #F1F5F9">' +
      '<button class="btn btn-secondary btn-sm" id="mAddQ"><i class="ti ti-plus"></i> Асуулт нэмэх</button>' +
      '<div style="font-size:12px;color:#94A3B8;margin:auto 0">Радио товчоор зөв хариулт сонгоно</div>' +
      '<button class="btn btn-primary" id="mSaveExam" style="margin-left:auto"><i class="ti ti-device-floppy"></i> Хадгалах</button></div>';
    node.innerHTML = html;

    node.querySelectorAll('[data-delq]').forEach(function (el) {
      el.addEventListener('click', function () { syncFromInputs(); qs.splice(+el.getAttribute('data-delq'), 1); drawQs(); });
    });
    var addBtn = node.querySelector('#mAddQ');
    if (addBtn) addBtn.addEventListener('click', function () {
      syncFromInputs(); qs.push({ question: '', options: ['', '', '', ''], correctIndex: 0 }); drawQs();
    });
    var saveBtn = node.querySelector('#mSaveExam');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      syncFromInputs();
      var ok = qs.every(function (q) { return (q.question || '').trim() && (q.options || []).filter(function (o) { return o && o.trim(); }).length >= 2; });
      if (!ok && qs.length) { toast('Асуулт болон дор хаяж 2 хариулт бөглөнө үү', 'warn'); return; }
      setModData(key, { examQuestions: qs, passScore: mod.passScore || 70 });
      closeModal(); renderTrainingModule(key); toast('Шалгалт хадгалагдлаа (' + qs.length + ' асуулт)', 'success');
    });
  }
  drawQs();
  buildModal((TRAINING_MODULES[key] || key) + ' — шалгалтын асуулт', node, { width: '560px' });
}

/* ---- Ажилтны шалгалт өгөх inline модал ---- */
function actionTakeModExam(key, empId) {
  var me = myEmployeeRecord();
  var prog = me ? getEmpProg(me.id, key) : {};
  if (!canTakeExam(key, prog)) { toast('Энэ шалгалтын боломжит оролдлого дууссан байна', 'warn'); return; }
  var email = encodeURIComponent((SESSION && SESSION.email) || '');
  var name = encodeURIComponent((me && me.name) || (SESSION && SESSION.email) || '');
  var exam = encodeURIComponent(key);
  var title = encodeURIComponent(TRAINING_MODULES[key] || key);
  var eid = encodeURIComponent((me && me.id) || empId || '');
  var dept = encodeURIComponent((me && me.dept) || '');
  var pos = encodeURIComponent((me && (me.pos || me.role)) || '');
  window.open(examBust('/habea-exam.html?email=' + email + '&name=' + name + '&exam=' + exam + '&title=' + title + '&eid=' + eid + '&dept=' + dept + '&pos=' + pos), '_blank');
}

/* ============ Дотоод сургалт — сургалт бүрийн хуудас (агуулга + шалгалт) ============ */
var CURRENT_CAT = '';
function courseKey(cat) { var h = 0; for (var i = 0; i < cat.length; i++) { h = (h * 31 + cat.charCodeAt(i)) >>> 0; } return 'c' + h.toString(36); }
function getCourse(cat) { DB.courses = DB.courses || {}; return DB.courses[cat] || {}; }
function toEmbed(url) {
  var m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/.exec(url || '');
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  return '';
}
function renderCourse(cat, skipRefresh) {
  CURRENT_CAT = cat;
  var sec = pageEl('trn-cat'); if (!sec) return;
  sec.style.padding = '';
  var c = getCourse(cat), key = courseKey(cat), admin = isAdmin(), s = SESSION || {};
  var myResults = [];
  if (isEmp()) {
    var meRec = (DB.employees || []).filter(function (e) { return (s.uid && e.uid === s.uid) || _sameEmail(e.email, s.email) || (s.empId && e.id === s.empId); })[0];
    if (meRec) myResults = (meRec.habeaExams || []).filter(function (x) { return x.title === cat || x.key === key; });
  }
  var examOpen = DB.settings && DB.settings.examOpen ? DB.settings.examOpen[key] !== false : true;
  var examUrl = examBust('/shalgalt/habea-exam.html?exam=' + encodeURIComponent(key) + '&title=' + encodeURIComponent(cat) +
    '&email=' + encodeURIComponent(s.email || '') + '&name=' + encodeURIComponent(USER.name || ''));
  var videoHtml = '';
  if (c.video) {
    var emb = toEmbed(c.video);
    videoHtml = emb
      ? '<div style="position:relative;padding-top:56.25%;margin:14px 0;border-radius:14px;overflow:hidden;background:#000"><iframe src="' + emb + '" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>'
      : '<a href="' + esc(c.video) + '" target="_blank" rel="noopener" class="btn btn-secondary" style="margin:12px 0"><i class="ti ti-player-play"></i> Видео үзэх</a>';
  }
  sec.innerHTML =
    '<div class="page-header"><div><h1>' + esc(cat) + '</h1><p class="page-subtitle">Дотоод сургалт</p></div>' +
    (admin ? '<div class="page-actions"><button class="btn btn-secondary" data-editcourse="1"><i class="ti ti-edit"></i> Агуулга засах</button></div>' : '') +
    '</div>' +
    '<div class="card" style="padding:20px">' +
    (c.desc ? '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap">' + esc(c.desc) + '</div>'
      : (admin ? '<div class="empty-state" style="padding:24px"><i class="ti ti-file-text"></i><div>Агуулга оруулаагүй. "Агуулга засах" дарж видео/тайлбар нэмнэ үү.</div></div>'
        : '<div style="color:#8A94A6;padding:8px">Сургалтын агуулга удахгүй нэмэгдэнэ.</div>')) +
    videoHtml +
    '</div>' +
    (myResults.length ? '<div class="card" style="padding:18px;margin-top:16px"><h3 style="margin:0 0 8px">Таны шалгалтын дүн</h3>' +
      myResults.map(function (x) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid #F1F5F9">' +
          '<span style="font-size:14px">' + (x.type === 'pre' ? 'Урьдчилсан шалгалт' : (x.type === 'post' ? 'Сургалтын дараах шалгалт' : 'Шалгалт')) + ' · ' + (x.passed ? '<span style="color:#0e8e59">тэнцсэн ✓</span>' : '<span style="color:#dc2626">тэнцээгүй</span>') + '</span>' +
          '<span class="score-pill ' + scoreClass(x.percent) + '">' + x.percent + '%</span></div>';
      }).join('') + '</div>' : '') +
    (examOpen
      ? '<div class="card" style="padding:24px;text-align:center;margin-top:16px;background:linear-gradient(135deg,#F0FDF4,#fff)">' +
        '<div style="width:60px;height:60px;border-radius:16px;background:#D1FAE5;color:#065F46;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px"><i class="ti ti-clipboard-check"></i></div>' +
        '<h3 style="margin:0 0 6px">' + esc(cat) + 'ын шалгалт өгөх</h3>' +
        '<p style="color:#64748B;margin:0 0 16px;font-size:14px">Сургалтаа үзсэний дараа шалгалтаа өгнө үү. Дүн автоматаар KPI-д тооцогдоно.</p>' +
        '<a href="' + examUrl + '" target="_blank" rel="noopener" class="btn btn-primary" style="padding:12px 30px;font-size:15px"><i class="ti ti-external-link"></i> Шалгалт өгөх</a>' +
        (admin ? '<div style="margin-top:14px;border-top:1px solid #E2E8F0;padding-top:12px;font-size:13px;color:#64748B">Энэ сургалтын шалгалтын асуултыг удирдах: ' +
          '<a href="/shalgalt/habea-admin.html?exam=' + encodeURIComponent(key) + '" target="_blank" rel="noopener" style="color:var(--emerald,#0e8e59);font-weight:600">Асуулт оруулах →</a>' +
          '<div style="font-size:11px;color:#94A3B8;margin-top:4px">Энэ сургалтын түлхүүр: <code>' + key + '</code></div></div>' : '') +
        '</div>'
      : '<div class="card" style="padding:24px;text-align:center;margin-top:16px;background:#FEF2F2;border:1.5px solid #FECACA">' +
        '<div style="width:60px;height:60px;border-radius:16px;background:#FEE2E2;color:#991B1B;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px"><i class="ti ti-lock"></i></div>' +
        '<h3 style="margin:0 0 6px;color:#991B1B">Шалгалт түр хаалттай байна</h3>' +
        '<p style="color:#64748B;margin:0;font-size:14px">ХАБЭА мэргэжилтэн шалгалтыг нээх хүртэл хүлээнэ үү.</p>' +
        (admin ? '<div style="margin-top:14px;font-size:13px;color:#64748B"><button class="btn btn-secondary btn-sm" onclick="switchPage(\'examadmin\')"><i class="ti ti-lock-open"></i> Шалгалтын удирдлагад нээх</button></div>' : '') +
        '</div>');
  // Ажилтан шалгалт өгөөд буцахад дүнг шинээр татаж, хуудас + нийт KPI-г шинэчилнэ
  if (isEmp() && !skipRefresh && fbReady) {
    refreshMyExams().then(function () { if (CURRENT_CAT === cat) renderCourse(cat, true); try { renderDashboard(); } catch (e) {} });
  }
}
function actionEditCourse(cat) {
  if (!isAdmin()) return;
  var c = getCourse(cat);
  var node = elc('div', 'modal-info');
  node.innerHTML =
    '<div class="rf-field"><label>Видео холбоос (YouTube эсвэл бусад)</label><input type="text" id="cvVideo" class="rf-input" placeholder="https://youtu.be/... эсвэл https://..." value="' + esc(c.video || '') + '"></div>' +
    '<div class="rf-field" style="margin-top:10px"><label>Сургалтын тайлбар / агуулга</label><textarea id="cvDesc" class="rf-input" rows="6" placeholder="Сургалтын тухай тайлбар, заавар...">' + esc(c.desc || '') + '</textarea></div>' +
    '<button class="btn btn-primary btn-block" id="cvSave" style="margin-top:14px"><i class="ti ti-device-floppy"></i> Хадгалах</button>';
  node.addEventListener('click', function (ev) {
    if (ev.target.closest('#cvSave')) {
      DB.courses = DB.courses || {};
      DB.courses[cat] = { video: ($('#cvVideo', node).value || '').trim(), desc: ($('#cvDesc', node).value || '').trim() };
      saveDB(); closeModal(); renderCourse(cat); toast('Сургалтын агуулга хадгалагдлаа', 'success');
    }
  });
  buildModal(cat + ' — агуулга засах', node, { width: '480px' });
}

/* Модуль бүрийн өнгө/дүрс — зааварчилгаануудыг өнгөөр ялгана */
var MOD_STYLE = {
  urdchilsan:          { c: '#4F46E5', bg: '#EEF2FF', icon: 'ti-clipboard-list' },
  ankhan:              { c: '#059669', bg: '#ECFDF5', icon: 'ti-school' },
  davtan_eeljit:       { c: '#0891B2', bg: '#ECFEFF', icon: 'ti-refresh' },
  davtan_eeljit_bus:   { c: '#7C3AED', bg: '#F5F3FF', icon: 'ti-bolt' },
  davtan_odor_tutmiin: { c: '#EA580C', bg: '#FFF7ED', icon: 'ti-calendar-event' }
};
function modStyle(key) { return MOD_STYLE[key] || { c: '#64748B', bg: '#F8FAFC', icon: 'ti-clipboard-check' }; }

/* Шалгалтын дүнг МОДУЛИАР бүлэглэж, өнгөт хайрцаг бүрд урьдчилсан ба дараахын СҮҮЛИЙН дүнг харуулна */
function habeaExamsHTML(e) {
  var list = (e && e.habeaExams) || [];
  if (!list.length) return '';
  // Модуль тус бүрээр бүлэглэж, урьдчилсан(pre)/дараах(post)-ийн сүүлийн оролдлогыг авна
  var mods = {};
  list.forEach(function (x) {
    var k = x.key || x.title || '?';
    var m = mods[k] || (mods[k] = { key: x.key || '', title: x.title || 'ХАБЭА шалгалт', pre: null, post: null, other: null, lastTs: 0 });
    var slot = x.type === 'post' ? 'post' : (x.type === 'pre' ? 'pre' : 'other');
    if (!m[slot] || (x.ts || 0) > (m[slot].ts || 0)) m[slot] = x; // сүүлийн оролдлого ялна
    if ((x.ts || 0) > m.lastTs) m.lastTs = (x.ts || 0);
  });
  function fmtD(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function subRow(label, x) {
    if (!x) return '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px">' +
      '<div style="font-size:13px;color:#334155;font-weight:500">' + label +
      ' <span style="font-size:11px;color:#94A3B8;font-weight:400">· ' + (x.passed ? '<span style="color:#0e8e59">тэнцсэн ✓</span>' : '<span style="color:#dc2626">тэнцээгүй</span>') + (x.ts ? ' · ' + fmtD(x.ts) : '') + '</span></div>' +
      '<span class="score-pill ' + scoreClass(x.percent) + '">' + x.percent + '%</span></div>';
  }
  var groups = Object.keys(mods).map(function (k) { return mods[k]; }).sort(function (a, b) { return b.lastTs - a.lastTs; });
  return '<div class="card" style="padding:18px;margin-bottom:18px"><h3 style="margin:0 0 4px">Шалгалтын дүнгүүд</h3>' +
    '<div style="font-size:12px;color:#8A94A6;margin-bottom:12px">Шалгалт бүрийн сүүлийн дүн (сургалтын өмнөх ба дараах)</div>' +
    groups.map(function (m) {
      var st = modStyle(m.key);
      var impr = (m.pre && m.post) ? (m.post.percent - m.pre.percent) : null; // ахиц
      var imprHTML = (impr != null)
        ? '<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px;white-space:nowrap;background:' + (impr >= 0 ? '#ECFDF5' : '#FEF2F2') + ';color:' + (impr >= 0 ? '#0e8e59' : '#dc2626') + '">Ахиц ' + (impr >= 0 ? '+' : '') + impr + '%</span>'
        : '';
      var rows = [];
      if (m.pre) rows.push(subRow('Сургалтын өмнөх', m.pre));
      if (m.post) rows.push(subRow('Сургалтын дараах', m.post));
      if (!m.pre && !m.post && m.other) rows.push(subRow('Дүн', m.other));
      return '<div style="border:1px solid ' + st.c + '2E;border-left:4px solid ' + st.c + ';border-radius:12px;overflow:hidden;margin-bottom:12px;background:#fff">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;background:' + st.bg + '">' +
        '<div style="display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px;color:' + st.c + ';min-width:0"><i class="ti ' + st.icon + '" style="font-size:18px;flex-shrink:0"></i><span style="min-width:0">' + esc(m.title) + '</span></div>' +
        imprHTML +
        '</div>' +
        '<div style="padding:3px 14px 6px">' + rows.join('<div style="height:1px;background:#F1F5F9"></div>') + '</div>' +
        '</div>';
    }).join('') + '</div>';
}

/* Эерэг ажилтны дашбоард — "би өсч байна", бусадтай харьцуулахгүй */
function renderEmployeeDashboard() {
  var sec = pageEl('dashboard'); if (!sec) return;
  var e = myEmployeeRecord();
  if (!e) { sec.innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-user-question"></i><div>Таны мэдээлэл олдсонгүй. ХАБЭА ажилтантай холбогдоно уу.</div></div>'; return; }
  if (fbReady && (Date.now() - (renderEmployeeDashboard._lastRefresh || 0) > 8000)) {
    renderEmployeeDashboard._lastRefresh = Date.now();
    refreshMyExams().then(function (ch) { if (ch) renderEmployeeDashboard(); });
  }
  var total = empTotal(e), bonus = empBonusPoints(e), lvl = kpiLevel(total);
  var toNext = lvl.next != null ? Math.max(0, lvl.next - total) : 0;
  var progPct = lvl.next != null ? clamp(Math.round((total - lvl.min) / (lvl.next - lvl.min) * 100), 0, 100) : 100;
  var improved = (e.examPrev != null && e.examScore != null) ? (num(e.examScore) - num(e.examPrev)) : null;
  var myReports = (DB.reports || []).filter(function (r) { return reportBelongsTo(r, e); });
  var verifiedCnt = myReports.filter(function (r) { return r.status === 'verified'; }).length;

  /* ---- Байр эзлэлт тооцох ---- */
  var allEmps = DB.employees.slice().sort(function (a, b) { return empTotal(b) - empTotal(a); });
  var overallRank = allEmps.findIndex(function (x) { return x.id === e.id; }) + 1;
  var overallTotal = allEmps.length;

  var deptEmps = allEmps.filter(function (x) { return x.dept === e.dept; });
  var deptRank = deptEmps.findIndex(function (x) { return x.id === e.id; }) + 1;
  var deptTotal = deptEmps.length;

  /* Урд байгаа хүнээс хэдэн оноогоор хоцорч байгаа */
  function aheadInfo(list, myIdx) {
    if (myIdx <= 0 || !list[myIdx - 1]) return { name: '', diff: 0 };
    var ah = list[myIdx - 1];
    var d = empTotal(ah) - empTotal(e);
    return { name: ah.name || 'урдах ажилтан', diff: Math.max(0, d) };
  }
  var aheadOverall = aheadInfo(allEmps, overallRank - 1);
  var aheadDept = aheadInfo(deptEmps, deptRank - 1);

  var depts = deptList();
  var deptScores = depts.map(function (d) { return { dept: d, score: deptScore(d) }; }).filter(function (r) { return r.score > 0 || r.dept === e.dept; }).sort(function (a, b) { return b.score - a.score; });
  var deptRankAmongAll = deptScores.findIndex(function (r) { return r.dept === e.dept; }) + 1;
  var deptCountAll = deptScores.length;

  /* ══ БАЙР ЭЗЛЭЛТ — ямар ч хүн харангуут ойлгохоор ══
     Юуг юутай харьцуулж байгааг үг болгоноор нь тайлбарлана. */
  function rankBox(rank, total, groupLabel, explainTxt) {
    var pct = total > 1 ? (rank - 1) / (total - 1) : 0;   // 0 = хамгийн дээр
    var tone, state, ic;
    if (rank === 1)        { tone = '#D97706'; state = 'Хамгийн түрүүнд явж байна'; ic = '🥇'; }
    else if (rank === 2)   { tone = '#0891B2'; state = 'Хоёрдугаарт явж байна';     ic = '🥈'; }
    else if (rank === 3)   { tone = '#B45309'; state = 'Гуравдугаарт явж байна';    ic = '🥉'; }
    else if (pct <= 0.34)  { tone = '#16A34A'; state = 'Урд хэсэгт явж байна';      ic = '👍'; }
    else if (pct <= 0.67)  { tone = '#0891B2'; state = 'Дунд хэсэгт явж байна';     ic = '🙂'; }
    else                   { tone = '#DC2626'; state = 'Ард хэсэгт явж байна';      ic = '💪'; }

    return '<div style="background:' + tone + '0D;border:1.5px solid ' + tone + '2E;border-radius:16px;padding:16px 15px">' +
      '<div style="font-size:11.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.4px">' + groupLabel + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-top:7px">' +
      '<span style="font-size:34px;font-weight:900;font-family:\'Bricolage Grotesque\',sans-serif;line-height:1;color:' + tone + '">' + rank + '</span>' +
      '<span style="font-size:15px;font-weight:800;color:' + tone + '">-р байр</span>' +
      '<span style="font-size:13px;color:#94A3B8">/ ' + total + '-аас</span></div>' +
      '<div style="margin-top:9px;display:inline-block;background:' + tone + '1A;color:' + tone + ';border-radius:20px;padding:4px 11px;font-size:12px;font-weight:800">' + ic + ' ' + state + '</div>' +
      '<div style="font-size:12px;color:#8A94A6;margin-top:9px;line-height:1.45">' + explainTxt + '</div>' +
      '</div>';
  }

  /* Байр эзлэлтийн бүтэн хэсэг — тайлбартай.
     ⚠ Ямар ч тохиолдолд ХООСОН БУЦААХГҮЙ — алдаа гарвал ч гарчиг нь үлдэнэ. */
  function rankSectionHTML() {
    var boxes = '';
    try {
      var dn = esc(e.dept || 'Алба');
      if (overallRank >= 1 && overallTotal >= 1)
        boxes += rankBox(overallRank, overallTotal, 'Компани даяар',
          'Компанийн нийт <b>' + overallTotal + '</b> ажилтныг оноогоор эрэмбэлэхэд таны эзэлж буй байр.');
      if (deptRank >= 1 && deptTotal >= 1)
        boxes += rankBox(deptRank, deptTotal, 'Албандаа',
          '<b>' + dn + '</b>-ны <b>' + deptTotal + '</b> ажилтны дотор таны эзэлж буй байр.');
      if (deptRankAmongAll >= 1 && deptCountAll >= 1)
        boxes += rankBox(deptRankAmongAll, deptCountAll, 'Албуудын дунд',
          'Энэ нь таны биш, <b>албаныхаа</b> байр. ' + deptCountAll + ' албыг дундаж оноогоор нь эрэмбэлсэн.');
    } catch (err) { boxes = ''; }

    return '<div class="card" id="rankCard" style="padding:20px;margin-bottom:14px">' +
      '<h3 style="margin:0 0 3px">🏆 Байр эзлэлт — та хаана явж байна вэ?</h3>' +
      '<p style="font-size:12.5px;color:#8A94A6;margin:0 0 14px;line-height:1.5">' +
      'Бүх хүнийг <b>оноогоор нь</b> дээрээс доош эрэмбэлсэн жагсаалт. <b>1-р байр = хамгийн өндөр оноотой</b> хүн. ' +
      'Та оноогоо нэмэх бүрд байр нь дээшилнэ.</p>' +
      (boxes
        ? '<div class="rank-grid">' + boxes + '</div>' +
          (overallRank > 1 ? '<div style="margin-top:12px;padding:11px 14px;background:#F8FAFC;border-radius:12px;font-size:12.5px;color:#475569;line-height:1.5">' +
            '<b>Байраа дээшлүүлэх арга:</b> доорх «Хийх ёстой зүйлс» хэсгийг гүйцээх — сургалтаа үзэж шалгалтаа өгөх, даалгавраа биелүүлэх, аюул мэдээлэх.</div>' : '')
        : '<div style="padding:16px;background:#F8FAFC;border-radius:12px;font-size:13px;color:#64748B;line-height:1.5">' +
          'Байр эзлэлт тооцоолохын тулд ажилтнуудын жагсаалт ачаалагдах шаардлагатай. ' +
          'Хуудсыг дахин ачаална уу (Ctrl + Shift + R).</div>') +
      '</div>';
  }

  /* ---- KPI задаргаа (суурь үзүүлэлтүүд → суурь оноо, дээр нь бонус НЭМЭГДЭНЭ) ---- */
  var w = kpiCfg().weights;
  var _hasD = deptHasDavtan(e.dept, currentSalaryKey());
  var _vidW = _f(w.video) + (_hasD ? 0 : _f(w.davtan));
  // Зөвхөн ДАТАТАЙ суурь үзүүлэлт (оногдоогүйг харуулахгүй)
  var baseFactors = [
    { label: 'Босго оноо', desc: 'осол/зөрчилгүй', icon: 'ti-shield-check', score: kpiBosgo(e), weight: _f(w.bosgo), color: '#3730A3' },
    _hasD ? { label: 'Давтан + шалгалт', desc: 'энэ сарын давтан', icon: 'ti-refresh', score: kpiDavtan(e), weight: _f(w.davtan), color: '#0891B2' } : null,
    { label: 'Видео сургалт', desc: 'тэнцсэн хувь', icon: 'ti-player-play', score: kpiVideo(e), weight: _vidW, color: '#C2410C' },
    { label: 'Даалгавар', desc: 'биелэлт', icon: 'ti-checkbox', score: kpiTask(e), weight: _f(w.task), color: '#16A34A' }
  ].filter(function (c) { return c && c.score != null; });
  var baseWsum = baseFactors.reduce(function (a, c) { return a + c.weight; }, 0) || 1;
  var baseScore = empBase(e);
  var bonusScore = empBonusScore(e);
  var bonusBoost = Math.round(bonusScore * _f(w.bonus) / 100);
  var firstName = (e.name || '').split(/\s+/).pop();

  /* ══ Тоо бүрийн ЖИНХЭНЭ эх сурвалж — ажилтан "яагаад ийм оноотой вэ" гэдгээ ойлгоно ══ */
  var vid = empLmsStats(e);                 // видео сургалт: тэнцсэн/оногдсон
  var tsk = empTaskStats(e);                // даалгавар: биелүүлсэн/оногдсон
  var rep = empReportStats(e);              // аюул/NM: баталгаажсан/хүлээгдэж буй
  var salKey = currentSalaryKey();
  var hasDavtan = deptHasDavtan(e.dept, salKey);
  var myViol = (DB.violations || []).filter(function (v) {
    return v.empId === e.id && salaryMonthKey(v.date || v.createdAt) === salKey;
  });
  var salLbl = (function () { var p = salKey.split('-'); return p[0] + ' оны ' + parseInt(p[1], 10) + '-р сарын үе (25→24)'; })();

  /* Хүчин зүйл бүрийн НОТОЛГОО (жинхэнэ тоо) */
  function evidenceFor(key) {
    if (key === 'Босго оноо')
      return myViol.length
        ? myViol.length + ' зөрчил бүртгэгдсэн → ' + myViol.reduce(function (a, v) { return a + (v.points || 0); }, 0) + ' оноо хасагдсан'
        : 'Энэ сард осол/зөрчил бүртгэгдээгүй → бүтэн оноо';
    if (key === 'Давтан + шалгалт')
      return 'Энэ сард давтан зааварчилгаа товлогдсон (суусан 1/3 + шалгалтын дүн 2/3)';
    if (key === 'Видео сургалт')
      return vid.total
        ? vid.passed + ' / ' + vid.total + ' сургалт тэнцсэн'
        : 'Танд видео сургалт оногдоогүй байна';
    if (key === 'Даалгавар') {
      if (!tsk.total) return 'Танд даалгавар оногдоогүй байна';
      var _avg = Math.round(tsk.scoreSum / tsk.total);
      return tsk.done + ' / ' + tsk.total + ' баталгаажсан · дундаж үнэлгээ ' + _avg + '%'
        + (tsk.pending ? ' · ' + tsk.pending + ' хянагдаж байна' : '')
        + (tsk.returned ? ' · ' + tsk.returned + ' буцаагдсан' : '');
    }
    return '';
  }

  /* ══ ЭНГИЙН ЧАГТ ЖАГСААЛТ: юу сайн / юу дутуу — тоо, нэр томьёогүй ══
     Дутуу зүйл бүрд "хийвэл хэдэн оноо нэмэгдэхийг" шууд хэлнэ. */
  var goodList = [], todoList = [];
  function gainOf(weight, score) {   // энэ үзүүлэлт 100 болбол нийт оноонд нэмэгдэх
    return Math.max(0, Math.round((100 - score) * weight / baseWsum));
  }

  // 1) Осол/зөрчил
  var bosgoW = _f(w.bosgo), bosgoS = kpiBosgo(e);
  if (!myViol.length) goodList.push({ icon: 'ti-shield-check', txt: 'Осол, зөрчил гаргаагүй' });
  else todoList.push({ icon: 'ti-alert-triangle', color: '#DC2626',
    txt: myViol.length + ' зөрчил бүртгэгдсэн', sub: 'Дахин давтахгүй байвал дараа сард оноо сэргэнэ', page: 'violations', gain: 0 });

  // 2) Видео сургалт
  if (vid.total) {
    if (vid.passed >= vid.total) goodList.push({ icon: 'ti-player-play', txt: 'Бүх видео сургалтаа үзсэн (' + vid.total + '/' + vid.total + ')' });
    else todoList.push({ icon: 'ti-player-play', color: '#C2410C',
      txt: (vid.total - vid.passed) + ' видео сургалт үзээгүй байна',
      sub: 'Үзээд шалгалтаа өгнө үү', page: 'video-track',
      gain: gainOf(_vidW, kpiVideo(e) || 0) });
  }

  // 3) Даалгавар — гүйцэтгэлийн ҮНЭЛГЭЭГЭЭР тооцогдоно
  if (tsk.total) {
    var _notDone = tsk.total - tsk.done - tsk.pending;
    if (tsk.pending) goodList.push({ icon: 'ti-send', txt: tsk.pending + ' даалгавар хянагдаж байна' });
    if (tsk.returned) todoList.push({ icon: 'ti-arrow-back-up', color: '#DC2626',
      txt: tsk.returned + ' даалгавар буцаагдсан байна',
      sub: 'Хянагчийн тайлбарыг уншаад дахин гүйцэтгэнэ үү', page: 'tasks',
      gain: gainOf(_f(w.task), kpiTask(e) || 0) });
    if (_notDone > 0) todoList.push({ icon: 'ti-checkbox', color: '#16A34A',
      txt: _notDone + ' даалгавар хийгээгүй байна',
      sub: 'Гүйцэтгээд «Гүйцэтгэсэн» товч дарж хянуулна уу', page: 'tasks',
      gain: gainOf(_f(w.task), kpiTask(e) || 0) });
    if (tsk.done >= tsk.total) goodList.push({ icon: 'ti-checkbox', txt: 'Бүх даалгавар баталгаажсан (' + tsk.total + '/' + tsk.total + ')' });
  }

  // 4) Давтан зааварчилгаа
  if (hasDavtan) {
    var dv = kpiDavtan(e);
    if (dv != null && dv >= 90) goodList.push({ icon: 'ti-refresh', txt: 'Давтан зааварчилгаанд хамрагдсан' });
    else todoList.push({ icon: 'ti-refresh', color: '#0891B2',
      txt: 'Давтан зааварчилгаа дутуу', sub: 'Сургалтад суусны дараа шалгалтаа өгнө үү',
      page: 'myexams', gain: gainOf(_f(w.davtan), dv || 0) });
  }

  // 5) Бонус (үргэлж боломж)
  if (rep.verified) goodList.push({ icon: 'ti-flag-2', txt: rep.verified + ' аюул мэдээлж бонус авсан' });
  todoList.push({ icon: 'ti-flag-2', color: '#E11D48',
    txt: 'Аюул харвал мэдээлээрэй', sub: 'Мэдээлэл бүрт бонус нэмэгдэнэ — хэзээ ч хасагдахгүй',
    page: 'reportflow', gain: 0, isBonus: true });

  // Бүгдийг хийвэл оноо хэд болох
  var totalGain = todoList.reduce(function (a, t) { return a + (t.gain || 0); }, 0);
  var couldBe = Math.min(100, total + totalGain);

  var showRank = overallTotal > 1;   // ганцаараа бол байр эзлэлт утгагүй

  sec.innerHTML =
    '<div style="margin-bottom:16px"><h1 style="margin:0">Сайн байна уу, ' + esc(firstName) + '! 👋</h1>' +
    '<p class="page-subtitle" style="margin-top:4px">' + esc(e.dept || '') + (e.pos ? ' · ' + esc(e.pos) : '') +
    ' &nbsp;·&nbsp; <span style="color:#94A3B8">' + salLbl + '</span></p></div>' +

    /* ① Түвшин + нийт оноо */
    '<div class="card" style="padding:22px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:14px;background:linear-gradient(135deg,#F0FDF4,#fff)">' +
    '<div style="width:78px;height:78px;border-radius:20px;background:' + lvl.color + '1A;color:' + lvl.color + ';display:flex;align-items:center;justify-content:center;font-size:38px"><i class="ti ' + lvl.icon + '"></i></div>' +
    '<div style="flex:1;min-width:200px"><div style="font-size:13px;color:#64748B">Таны энэ сарын оноо</div>' +
    '<div style="font-size:40px;font-weight:900;font-family:\'Bricolage Grotesque\',sans-serif;line-height:1;color:' + lvl.color + '">' + total +
    '<span style="font-size:18px;font-weight:600;color:#94A3B8"> / 100</span></div>' +
    '<div style="display:inline-block;margin-top:7px;padding:3px 12px;border-radius:20px;background:' + lvl.color + '1A;color:' + lvl.color + ';font-size:12.5px;font-weight:800">' + lvl.name + ' түвшин</div>' +
    (lvl.next != null ? '<div style="margin-top:9px">' + miniBar(progPct, lvl.color) + '</div><div style="font-size:12.5px;color:#64748B;margin-top:5px">Дараагийн түвшинд хүрэхэд <strong>' + toNext + '</strong> оноо дутуу байна</div>' : '<div style="color:#16A34A;font-weight:700;margin-top:7px">Хамгийн дээд түвшинд хүрсэн! 🎉</div>') +
    '</div></div>' +

    /* ② Байр эзлэлт — оноон дор, бүтэн өргөнөөр (ҮРГЭЛЖ харагдана) */
    rankSectionHTML() +

    /* ══ 2 БАГАНА: зүүн = хийх ёстой + оноо, баруун = сайн хийсэн, бонус, дүн ══ */
    '<div class="emp-cols">' +
    '<div>' +    /* ── ЗҮҮН БАГАНА ── */

    /* ② ЮУ ДУТУУ БАЙНА — хийвэл хэдэн оноо нэмэгдэхийг шууд хэлнэ */
    (todoList.length ?
      '<div class="card" style="padding:18px;margin-bottom:14px;border:1.5px solid #FEE2E2">' +
      '<h3 style="margin:0 0 3px;color:#B91C1C">⚠ Хийх ёстой зүйлс</h3>' +
      '<p style="font-size:12.5px;color:#8A94A6;margin:0 0 13px">Доорхыг хийвэл таны оноо нэмэгдэнэ. Дарж шууд орно уу.</p>' +
      todoList.map(function (s) {
        return '<div class="emp-step" data-gopage="' + s.page + '" style="display:flex;align-items:center;gap:12px;padding:13px;border:1px solid #F1F5F9;border-radius:13px;margin-bottom:9px;cursor:pointer;background:#fff">' +
          '<div style="width:38px;height:38px;border-radius:11px;flex-shrink:0;background:' + s.color + '18;color:' + s.color + ';display:flex;align-items:center;justify-content:center"><i class="ti ' + s.icon + '" style="font-size:19px"></i></div>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:#1E293B;line-height:1.35">' + s.txt + '</div>' +
          '<div style="font-size:12px;color:#8A94A6;margin-top:2px">' + (s.sub || '') + '</div></div>' +
          (s.gain > 0
            ? '<div style="flex-shrink:0;text-align:center;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:11px;padding:6px 11px">' +
              '<div style="font-size:17px;font-weight:900;color:#059669;line-height:1">+' + s.gain + '</div>' +
              '<div style="font-size:9.5px;color:#059669;font-weight:600">оноо</div></div>'
            : (s.isBonus ? '<div style="flex-shrink:0;background:#FEF3C7;border:1px solid #FDE68A;border-radius:11px;padding:7px 11px;font-size:11px;font-weight:800;color:#92400E">БОНУС</div>' : '')) +
          '<i class="ti ti-chevron-right" style="color:#CBD5E1;flex-shrink:0;margin-left:2px"></i></div>';
      }).join('') +
      (totalGain > 0 ? '<div style="margin-top:4px;padding:12px 14px;background:linear-gradient(135deg,#ECFDF5,#F0FDF4);border-radius:12px;font-size:13.5px;color:#065F46;text-align:center">' +
        'Бүгдийг хийвэл таны оноо <b style="font-size:16px">' + total + '</b> → <b style="font-size:18px;color:#059669">' + couldBe + '</b> болно' +
        '</div>' : '') +
      '</div>' : '') +

    /* ③ Оноо хаанаас бүрдсэн — нягт */
    '<div class="card" style="padding:18px;margin-bottom:14px"><h3 style="margin:0 0 3px">Оноо хаанаас бүрдсэн бэ?</h3>' +
    '<p style="font-size:12.5px;color:#8A94A6;margin:0 0 10px">Хэсэг бүрээс хэдэн оноо авсан</p>' +
    (baseFactors.length ? baseFactors.map(function (c) {
      var contrib = Math.round(c.score * c.weight / baseWsum);
      var maxOf = Math.round(100 * c.weight / baseWsum);
      return '<div style="padding:9px 0;border-top:1px solid #F5F7FB">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">' +
        '<div style="width:30px;height:30px;border-radius:9px;background:' + c.color + '18;color:' + c.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ' + c.icon + '" style="font-size:15px"></i></div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:700;color:#1E293B">' + c.label + '</div>' +
        '<div style="font-size:11.5px;color:#8A94A6;margin-top:1px;line-height:1.35">' + evidenceFor(c.label) + '</div></div>' +
        '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-size:18px;font-weight:900;color:' + c.color + ';font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">' + contrib + '</div>' +
        '<div style="font-size:10px;color:#94A3B8">' + maxOf + '-аас</div></div></div>' +
        miniBar(c.score, c.color) + '</div>';
    }).join('') : '<div class="empty-state" style="padding:18px"><i class="ti ti-hourglass"></i><div>Танд сургалт, даалгавар хараахан оногдоогүй байна.</div></div>') +

    '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;color:#16A34A;border-top:1px solid #F5F7FB">' +
    '<span style="font-size:13px;font-weight:700"><i class="ti ti-gift"></i> Аюул мэдээлсний бонус</span>' +
    '<span style="font-size:17px;font-weight:800">+' + bonusBoost + '</span></div>' +
    '<div style="border-top:2px solid #EEF1F9;padding-top:11px;display:flex;justify-content:space-between;align-items:center">' +
    '<span style="font-weight:800;font-size:14.5px">Нийт</span>' +
    '<span style="font-size:24px;font-weight:900;font-family:\'Bricolage Grotesque\',sans-serif;color:' + lvl.color + '">' + total + ' / 100</span></div></div>' +

    '</div>' +   /* ← зүүн багана дуусав */

    '<div>' +    /* ── БАРУУН БАГАНА ── */

    /* ④ ЮУ САЙН БАЙНА — нягт чипс */
    (goodList.length ?
      '<div class="card" style="padding:16px 18px;margin-bottom:14px;border:1.5px solid #D1FAE5">' +
      '<h3 style="margin:0 0 10px;color:#047857;font-size:15px">✓ Сайн хийсэн зүйлс</h3>' +
      '<div style="display:flex;flex-direction:column;gap:7px">' +
      goodList.map(function (g) {
        return '<div style="display:flex;align-items:center;gap:9px;font-size:13px;color:#334155">' +
          '<i class="ti ti-circle-check" style="color:#059669;font-size:17px;flex-shrink:0"></i>' +
          '<span>' + g.txt + '</span></div>';
      }).join('') + '</div></div>' : '') +

    /* ⑤ Бонус */
    '<div class="card" style="padding:16px 18px;margin-bottom:14px">' +
    '<div style="display:flex;align-items:center;gap:11px"><i class="ti ti-gift" style="font-size:26px;color:#16A34A"></i>' +
    '<div><div style="font-size:24px;font-weight:800;color:#16A34A;font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">+' + bonus + '</div>' +
    '<div style="font-size:12.5px;color:#64748B;margin-top:2px">Цуглуулсан бонус</div></div></div>' +
    '<div style="font-size:12.5px;color:#64748B;margin-top:9px;line-height:1.5">' +
    (rep.verified ? '<b>' + rep.verified + '</b> мэдээлэл баталгаажсан' + (rep.pending ? ', <b>' + rep.pending + '</b> хүлээгдэж байна' : '') + '.' : 'Хараахан мэдээлэл оруулаагүй байна.') +
    ' Мэдээлэх тусам нэмэгдэнэ, <b>хэзээ ч хасагдахгүй</b>.</div>' +
    '<button class="btn btn-primary btn-sm" data-goreport="1" style="margin-top:11px"><i class="ti ti-flag-2"></i> Мэдээлэх</button></div>' +

    /* ⑥ Шалгалтын ахиц */
    (improved != null ? '<div class="card" style="padding:16px 18px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:11px"><i class="ti ' + (improved >= 0 ? 'ti-trending-up' : 'ti-arrow-down') + '" style="font-size:26px;color:' + (improved >= 0 ? '#16A34A' : '#64748B') + '"></i>' +
      '<div><div style="font-size:24px;font-weight:800;color:' + (improved >= 0 ? '#16A34A' : '#64748B') + ';font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">' + (improved >= 0 ? '+' : '') + improved + '</div>' +
      '<div style="font-size:12.5px;color:#64748B;margin-top:2px">Шалгалтын ахиц</div></div></div>' +
      '<div style="font-size:12.5px;color:#64748B;margin-top:9px">Өмнөх <b>' + e.examPrev + '%</b> → дараах <b>' + e.examScore + '%</b>' +
      (improved > 0 ? ' — мэдлэг ахисан 👏' : '') + '</div></div>' : '') +

    /* ⑦ Шалгалтын дүн */
    habeaExamsHTML(e) +

    '</div></div>';   /* ← баруун багана + emp-cols дуусав */

  if (!sec._empWired) {
    sec._empWired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-goreport]')) { switchPage('reportflow'); return; }
      var st = ev.target.closest('[data-gopage]');
      if (st) switchPage(st.getAttribute('data-gopage'));
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ХЯНАЛТЫН САМБАР — ХАБЭА менежерийн бүрэн зураглал
   Бүх цэсний өгөгдлийг нэг дэлгэцэд, шийдвэр гаргахад хэрэгтэй хэлбэрээр.
   Дэс дараалал: юу хийх ёстой → нийт байдал → хаана алдагдаж байна → задаргаа
   ══════════════════════════════════════════════════════════════════════ */

function dashNum(v, unit) { return '<span style="font-family:\'Bricolage Grotesque\',sans-serif;font-weight:900">' + v + '</span>' + (unit ? '<span style="font-size:.6em;font-weight:600;color:#94A3B8">' + unit + '</span>' : ''); }

function dashBar(pct, color, h) {
  var v = clamp(Math.round(pct || 0), 0, 100);
  return '<div style="height:' + (h || 7) + 'px;background:#EEF1F9;border-radius:99px;overflow:hidden">' +
    '<div style="height:100%;width:' + v + '%;background:' + color + ';border-radius:99px"></div></div>';
}

function dashCard(inner, pad) {
  return '<div class="card" style="padding:' + (pad || '20px') + ';margin-bottom:14px">' + inner + '</div>';
}

function dashH(title, sub) {
  return '<h3 style="margin:0 0 3px;font-size:15.5px">' + title + '</h3>' +
    (sub ? '<p style="font-size:12.5px;color:#8A94A6;margin:0 0 14px;line-height:1.5">' + sub + '</p>' : '<div style="height:10px"></div>');
}

/* Өнгө: өндөр = сайн */
function dashTone(v) {
  if (v == null) return '#94A3B8';
  if (v >= 85) return '#16A34A';
  if (v >= 70) return '#0891B2';
  if (v >= 55) return '#D97706';
  return '#DC2626';
}

/* ⚠ Эрсдэлийн үнэлгээ нь DB-д БИШ, Firestore (kpi_risk_dashboards)-д байдаг.
   Нэг удаа татаж кэшлэнэ. null = хараахан мэдэгдэхгүй → "—" гэж үзүүлнэ. */
var RISK_DEPTS = null;
function loadRiskDepts(cb) {
  if (RISK_DEPTS) { if (cb) cb(RISK_DEPTS); return; }
  if (loadRiskDepts._busy) return;
  loadRiskDepts._busy = true;
  try {
    if (typeof fbReady === 'undefined' || !fbReady || !fdb) {
      RISK_DEPTS = []; loadRiskDepts._busy = false; if (cb) cb(RISK_DEPTS); return;
    }
    fdb.collection(RISK_COL).get().then(function (s) {
      RISK_DEPTS = s.docs.map(function (d) { return d.id; });
      loadRiskDepts._busy = false; if (cb) cb(RISK_DEPTS);
    }).catch(function () { RISK_DEPTS = []; loadRiskDepts._busy = false; if (cb) cb(RISK_DEPTS); });
  } catch (e) { RISK_DEPTS = []; loadRiskDepts._busy = false; if (cb) cb(RISK_DEPTS); }
}

/* Мэдээллийг аль алба гаргасныг тодорхойлох (r.dept байхгүй байж болно) */
function reportDept(r) {
  if (r && r.dept) return r.dept;
  var e = (DB.employees || []).filter(function (x) { return reportBelongsTo(r, x); })[0];
  return e ? (e.dept || '') : '';
}

/* ══════════════════════════════════════════════════════════════
   ҮЙЛДЛИЙН КАРТ ДЭЭР ДАРАХАД — ЯГ ХЭН, ЯМАР БИЧЛЭГ БОЛОХЫГ ХАРУУЛНА
   ══════════════════════════════════════════════════════════════ */
var DASH_DRILL = {};

function dashDrillRow(main, sub, right, rightColor) {
  return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid #F1F5F9">' +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:13.5px;font-weight:700;color:#1E293B">' + main + '</div>' +
    (sub ? '<div style="font-size:12px;color:#94A3B8;margin-top:2px">' + sub + '</div>' : '') + '</div>' +
    (right ? '<div style="flex-shrink:0;font-size:13px;font-weight:800;color:' + (rightColor || '#64748B') + '">' + right + '</div>' : '') +
    '</div>';
}

function dashEmpName(id) {
  var e = (DB.employees || []).filter(function (x) { return x.id === id; })[0];
  return e ? esc(e.name) + (e.dept ? ' · ' + esc(e.dept) : '') : esc(id);
}

function dashTaskWho(t) {
  var ids = (t.empIds && t.empIds.length) ? t.empIds : (t.empId ? [t.empId] : []);
  if (!ids.length) return t.dept === 'all' ? 'Бүх алба' : esc(t.dept || '');
  return ids.map(dashEmpName).join(', ');
}

function dashOpenDrill(kind) {
  var d = DASH_DRILL[kind];
  if (!d || !d.rows || !d.rows.length) { toast('Жагсаалт хоосон байна', 'info'); return; }

  var body = '<div style="max-height:60vh;overflow-y:auto;margin:-4px -4px 0">' + d.rows.join('') + '</div>';
  var node = elc('div', 'modal-info',
    (d.hint ? '<div style="font-size:12.5px;color:#64748B;line-height:1.5;margin-bottom:12px">' + d.hint + '</div>' : '') +
    body +
    '<div style="display:flex;gap:10px;margin-top:16px">' +
    '<button class="btn btn-secondary" data-drillclose="1" style="flex:1">Хаах</button>' +
    (d.page ? '<button class="btn btn-primary" data-drillgo="' + d.page + '" style="flex:1"><i class="ti ti-arrow-right"></i> ' + esc(d.pageLabel || 'Цэс рүү очих') + '</button>' : '') +
    '</div>');

  node.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-drillclose]')) { closeModal(); return; }
    var g = ev.target.closest('[data-drillgo]');
    if (g) { closeModal(); switchPage(g.getAttribute('data-drillgo')); return; }
    var rv = ev.target.closest('[data-drillreview]');
    if (rv) { closeModal(); switchPage('tasks'); setTimeout(function () { actionReviewTask(rv.getAttribute('data-drillreview')); }, 120); return; }
  });
  buildModal(d.title + ' — ' + d.rows.length, node, { width: '560px' });
}

/* Дарж болох элемент болгох туслах */
function dashReg(key, title, rows, opts) {
  if (!rows || !rows.length) return '';
  DASH_DRILL[key] = {
    title: title, rows: rows,
    page: (opts && opts.page) || '', pageLabel: (opts && opts.pageLabel) || '',
    hint: (opts && opts.hint) || ''
  };
  return key;
}
function dashClick(key) { return key ? ' data-drill="' + key + '" class="dash-click"' : ''; }

/* Ажилтны жагсаалтыг мөр болгох */
function dashEmpRows(list, valueFn, unit) {
  return list.map(function (e) {
    var v = valueFn ? valueFn(e) : empTotal(e);
    return dashDrillRow(esc(e.name), esc(e.dept || '') + (e.pos ? ' · ' + esc(e.pos) : ''),
      (v == null ? '—' : v + (unit || '')), dashTone(v));
  });
}
function dashTaskRows(list) {
  return list.map(function (x) {
    var od = taskOverdueDays(x);
    return dashDrillRow(esc(x.title), dashTaskWho(x) +
      (x.dueDate ? ' · дуусах ' + esc(x.dueDate) : '') +
      (x.status === 'approved' && x.score != null ? ' · үнэлгээ ' + x.score + '%' : ''),
      od ? od + ' хоног хэтэрсэн' : '', '#DC2626');
  });
}
function dashReportRows(list) {
  return list.map(function (r) {
    var who = (DB.employees || []).filter(function (x) { return reportBelongsTo(r, x); })[0];
    return dashDrillRow(esc(r.desc || r.title || 'Мэдээлэл'),
      (who ? esc(who.name) : esc(r.reporterName || '')) +
      (reportDept(r) ? ' · ' + esc(reportDept(r)) : '') +
      (r.date ? ' · ' + esc(String(r.date).slice(0, 10)) : ''),
      r.type === 'near_miss' ? 'Near-miss' : 'Аюул',
      r.status === 'verified' ? '#16A34A' : '#E11D48');
  });
}

function renderAdminDashboard() {
  var page = pageEl('dashboard'); if (!page) return;

  /* Эрсдэлийн үнэлгээний жагсаалтыг нэг удаа татаад дахин зурна */
  if (RISK_DEPTS === null) loadRiskDepts(function () { try { renderAdminDashboard(); } catch (e) {} });

  var host = document.getElementById('dashPro');
  if (!host) { host = document.createElement('div'); host.id = 'dashPro'; page.appendChild(host); }

  var emps = (DB.employees || []).slice();
  if (!emps.length) {
    host.innerHTML = '<div class="card" style="padding:40px"><div class="empty-state">' +
      '<i class="ti ti-users"></i><div>Ажилтны мэдээлэл ачаалагдаагүй байна.</div>' +
      '<div style="font-size:12.5px;color:#94A3B8;margin-top:6px">Хуудсыг дахин ачаална уу (Ctrl+Shift+R). Асуудал үргэлжилвэл Контент удирдлага цэснээс ажилтнуудаа шалгана уу.</div>' +
      '</div></div>';
    return;
  }

  var dh = isDeptHead() && SESSION && SESSION.dept ? SESSION.dept : '';
  if (dh) emps = emps.filter(function (e) { return e.dept === dh; });

  var salKey = currentSalaryKey();
  var w = kpiCfg().weights;
  var depts = deptList().filter(function (d) { return !dh || d === dh; });
  var H = '';

  /* ═══════════ 1. ШААРДЛАГАТАЙ АРГА ХЭМЖЭЭ ═══════════ */
  var acts = [];
  DASH_DRILL = {};

  var pendingReview = (DB.tasks || []).filter(function (t) { return t.status === 'submitted' && canReviewTask(t); });
  if (pendingReview.length) {
    acts.push({ n: pendingReview.length, t: 'даалгавар хянаж үнэлгээ өгөх', c: '#7C3AED', i: 'ti-eye-search', k: 'review' });
    DASH_DRILL.review = {
      title: 'Хянаж үнэлгээ өгөх даалгавар', page: 'tasks', pageLabel: 'Даалгавар цэс',
      hint: 'Мөр дээрх «Хянах» товчийг дарж шууд үнэлгээ өгнө.',
      rows: pendingReview.map(function (x) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid #F1F5F9">' +
          '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:700;color:#1E293B">' + esc(x.title) + '</div>' +
          '<div style="font-size:12px;color:#94A3B8;margin-top:2px">' + dashTaskWho(x) +
          (x.submittedAt ? ' · илгээсэн ' + esc(String(x.submittedAt).slice(0, 10)) : '') + '</div></div>' +
          '<button class="btn btn-sm btn-primary" data-drillreview="' + esc(x.id) + '">Хянах</button></div>';
      })
    };
  }

  var pendingReports = (DB.reports || []).filter(function (r) {
    if (dh && reportDept(r) !== dh) return false;
    return r.status === 'reported';
  });
  if (pendingReports.length) {
    acts.push({ n: pendingReports.length, t: 'аюул/near-miss баталгаажуулах', c: '#E11D48', i: 'ti-flag-2', k: 'reports' });
    DASH_DRILL.reports = {
      title: 'Баталгаажуулах хүлээж буй мэдээлэл', page: 'reportflow', pageLabel: 'Аюул мэдээлэл цэс',
      hint: 'Баталгаажуулсны дараа л ажилтанд бонус оноо тооцогдоно.',
      rows: pendingReports.map(function (r) {
        var who = (DB.employees || []).filter(function (x) { return reportBelongsTo(r, x); })[0];
        return dashDrillRow(
          esc(r.desc || r.title || 'Мэдээлэл'),
          (who ? esc(who.name) : esc(r.reporterName || '')) + (reportDept(r) ? ' · ' + esc(reportDept(r)) : '') +
          (r.date ? ' · ' + esc(String(r.date).slice(0, 10)) : ''),
          r.type === 'near_miss' ? 'Near-miss' : 'Аюул', '#E11D48');
      })
    };
  }

  var overdueT = (DB.tasks || []).filter(function (t) {
    if (dh && t.dept !== dh && t.dept !== 'all') return false;
    return taskOverdueDays(t) > 0;
  });
  if (overdueT.length) {
    acts.push({ n: overdueT.length, t: 'даалгаврын хугацаа хэтэрсэн', c: '#DC2626', i: 'ti-alarm', k: 'overdue' });
    DASH_DRILL.overdue = {
      title: 'Хугацаа хэтэрсэн даалгавар', page: 'tasks', pageLabel: 'Даалгавар цэс',
      rows: overdueT.slice().sort(function (a, b) { return taskOverdueDays(b) - taskOverdueDays(a); }).map(function (x) {
        return dashDrillRow(esc(x.title), dashTaskWho(x) + (x.dueDate ? ' · дуусах ' + esc(x.dueDate) : ''),
          taskOverdueDays(x) + ' хоног', '#DC2626');
      })
    };
  }

  /* Шалгалт нээлттэй боловч өгөөгүй ажилтан */
  var examRows = [];
  emps.forEach(function (e) {
    Object.keys(TRAINING_MODULES).forEach(function (k) {
      try {
        if (isModExamUnlocked(e, k) && !getEmpProg(e.id, k).examTaken) {
          examRows.push(dashDrillRow(esc(e.name), esc(e.dept || '') + (e.pos ? ' · ' + esc(e.pos) : ''),
            esc(TRAINING_MODULES[k]), '#0891B2'));
        }
      } catch (err) {}
    });
  });
  if (examRows.length) {
    acts.push({ n: examRows.length, t: 'шалгалт нээлттэй ч өгөөгүй', c: '#0891B2', i: 'ti-pencil-check', k: 'exam' });
    DASH_DRILL.exam = {
      title: 'Шалгалт өгөөгүй ажилтан', page: 'employees', pageLabel: 'Ажилтнууд цэс',
      hint: 'Эдгээр ажилтанд шалгалт нээлттэй боловч хараахан өгөөгүй байна.',
      rows: examRows
    };
  }

  var lowEmps = emps.filter(function (e) { return empTotal(e) < 60; }).sort(function (a, b) { return empTotal(a) - empTotal(b); });
  if (lowEmps.length) {
    acts.push({ n: lowEmps.length, t: 'ажилтан 60-аас доош оноотой', c: '#D97706', i: 'ti-user-exclamation', k: 'low' });
    DASH_DRILL.low = {
      title: '60-аас доош оноотой ажилтан', page: 'employees', pageLabel: 'Ажилтнууд цэс',
      rows: lowEmps.map(function (e) {
        return dashDrillRow(esc(e.name), esc(e.dept || '') + (e.pos ? ' · ' + esc(e.pos) : ''),
          empTotal(e) + ' оноо', '#DC2626');
      })
    };
  }

  var noRisk = (RISK_DEPTS === null) ? [] : depts.filter(function (d) { return RISK_DEPTS.indexOf(d) < 0; });
  if (noRisk.length) {
    acts.push({ n: noRisk.length, t: 'албанд эрсдэлийн үнэлгээ байршуулаагүй', c: '#7C3AED', i: 'ti-chart-pie-2', k: 'risk' });
    DASH_DRILL.risk = {
      title: 'Эрсдэлийн үнэлгээ байхгүй алба', page: 'hazards', pageLabel: 'Эрсдэлийн үнэлгээ цэс',
      hint: 'Эдгээр албанд эрсдэлийн үнэлгээний дашбоард байршуулаагүй байна.',
      rows: noRisk.map(function (d) {
        var m = deptMembers(d);
        return dashDrillRow(esc(d), m.length + ' ажилтан', 'байхгүй', '#DC2626');
      })
    };
  }

  H += dashCard(
    dashH('⚡ Шаардлагатай арга хэмжээ', acts.length ? 'Эдгээр нь таны шийдвэр хүлээж байна. Дарж шууд орно уу.' : '') +
    (acts.length
      ? '<div class="dash-acts">' + acts.map(function (a) {
        return '<div class="dash-act" data-drill="' + a.k + '" style="border-color:' + a.c + '33;background:' + a.c + '0A">' +
          '<div style="width:38px;height:38px;border-radius:11px;background:' + a.c + '18;color:' + a.c + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ' + a.i + '" style="font-size:19px"></i></div>' +
          '<div style="flex:1;min-width:0"><div style="font-size:22px;font-weight:900;color:' + a.c + ';line-height:1;font-family:\'Bricolage Grotesque\',sans-serif">' + a.n + '</div>' +
          '<div style="font-size:12.5px;color:#475569;line-height:1.35;margin-top:3px">' + a.t + '</div></div>' +
          '<i class="ti ti-chevron-right" style="color:#CBD5E1"></i></div>';
      }).join('') + '</div>'
      : '<div style="display:flex;align-items:center;gap:12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:14px 16px">' +
        '<i class="ti ti-circle-check" style="font-size:26px;color:#16A34A"></i>' +
        '<div style="font-size:13.5px;color:#047857;font-weight:700">Хүлээгдэж буй ажил алга — бүх зүйл хяналтад байна.</div></div>')
  );

  /* ═══════════ 2. ЕРӨНХИЙ БАЙДАЛ ═══════════ */
  var totals = emps.map(empTotal);
  var avgAll = totals.length ? Math.round(avg(totals)) : 0;
  var lv = { 'Алтан': 0, 'Мөнгөн': 0, 'Хүрэл': 0, 'Эхлэгч': 0 };
  emps.forEach(function (e) { var L = kpiLevel(empTotal(e)); if (lv[L.name] != null) lv[L.name]++; });
  var lvColor = { 'Алтан': '#D97706', 'Мөнгөн': '#0EA5E9', 'Хүрэл': '#B45309', 'Эхлэгч': '#16A34A' };
  var salLbl = (function () { var q = salKey.split('-'); return q[0] + ' оны ' + parseInt(q[1], 10) + '-р сарын үе (25→24)'; })();

  H += dashCard(
    '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">' +
    '<div style="min-width:180px">' +
    '<div style="font-size:12.5px;color:#64748B">' + (dh ? esc(dh) + ' — дундаж KPI' : 'Компанийн дундаж KPI') + '</div>' +
    '<div style="font-size:46px;line-height:1.05;color:' + dashTone(avgAll) + '">' + dashNum(avgAll, ' / 100') + '</div>' +
    '<div style="font-size:12px;color:#94A3B8;margin-top:2px">' + salLbl + '</div></div>' +
    '<div style="flex:1;min-width:260px">' +
    '<div style="font-size:12.5px;color:#64748B;margin-bottom:8px">Түвшний тархалт — ' + emps.length + ' ажилтан</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    Object.keys(lv).map(function (k) {
      var pc = emps.length ? Math.round(lv[k] / emps.length * 100) : 0;
      var lvList = emps.filter(function (e) { return kpiLevel(empTotal(e)).name === k; })
        .sort(function (a, b) { return empTotal(b) - empTotal(a); });
      var lvKey = dashReg('lv_' + k, k + ' түвшний ажилтан', dashEmpRows(lvList, null, ' оноо'),
        { page: 'employees', pageLabel: 'Ажилтнууд цэс' });
      return '<div' + dashClick(lvKey) + ' style="flex:1;min-width:96px;background:' + lvColor[k] + '0F;border:1px solid ' + lvColor[k] + '30;border-radius:12px;padding:10px 12px">' +
        '<div style="font-size:20px;font-weight:900;color:' + lvColor[k] + ';font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">' + lv[k] + '</div>' +
        '<div style="font-size:11.5px;color:' + lvColor[k] + ';font-weight:700">' + k + '</div>' +
        '<div style="font-size:10.5px;color:#94A3B8">' + pc + '%</div></div>';
    }).join('') + '</div></div>' +
    '<div style="min-width:120px">' +
    '<div style="font-size:12.5px;color:#64748B">Алба</div>' +
    '<div style="font-size:30px;line-height:1.1;color:#334155">' + dashNum(depts.length) + '</div>' +
    '</div></div>'
  );

  /* ═══════════ 2b. ӨГӨГДЛИЙН БҮРЭН БҮТЭН БАЙДАЛ ═══════════
     ⚠ KPI нь ДАТАТАЙ үзүүлэлтүүдийн дунджаар бодогддог. Хэрэв зөвхөн
     "Босго оноо" л дататай бол бүгд 100 болж, "бүх ажилтан Алтан" гэсэн
     ХУУРАМЧ дүр зураг гарна. Үүнийг нуухгүй, ил хэлнэ. */
  var covDefs = [
    { k: 'Босго оноо', fn: kpiBosgo, why: 'осол, зөрчил бүртгэгдээгүй бол автоматаар 100' },
    { k: 'Давтан + шалгалт', fn: kpiDavtan, why: 'энэ сард давтан зааварчилгаа товлогдоогүй бол тооцогдохгүй' },
    { k: 'Видео сургалт', fn: kpiVideo, why: 'ажилтанд видео хичээл оногдуулаагүй бол тооцогдохгүй' },
    { k: 'Даалгавар', fn: kpiTask, why: 'нэрлэн даалгавар өгөөгүй бол тооцогдохгүй' },
    { k: 'Аюул мэдээлэл (бонус)', fn: empBonusScore, why: 'мэдээлэл ирээгүй бол 0' }
  ];
  var cov = covDefs.map(function (c) {
    var n = 0;
    emps.forEach(function (e) { var v = null; try { v = c.fn(e); } catch (err) {} if (v != null) n++; });
    return { k: c.k, n: n, pct: emps.length ? Math.round(n / emps.length * 100) : 0, why: c.why };
  });
  var covOk = cov.filter(function (c) { return c.pct >= 50; }).length;

  if (covOk < 3) {
    H += '<div class="card" style="padding:20px;margin-bottom:14px;border:1.5px solid #FDE68A;background:#FFFBEB">' +
      '<h3 style="margin:0 0 3px;font-size:15.5px;color:#92400E">⚠ Анхаар — оноо бодит гүйцэтгэлийг харуулахгүй байна</h3>' +
      '<p style="font-size:12.5px;color:#B45309;margin:0 0 14px;line-height:1.55">' +
      'KPI нь <b>өгөгдөлтэй</b> үзүүлэлтүүдийн дунджаар бодогддог. Одоогоор ' + covOk + ' үзүүлэлт л бодит дататай тул ' +
      'ихэнх ажилтан автоматаар өндөр оноотой харагдаж байна. Доорх дутуу үзүүлэлтүүдийг бөглөснөөр оноо жинхэнэ утгатай болно.</p>' +
      cov.map(function (c) {
        var okc = c.pct >= 50 ? '#16A34A' : (c.pct > 0 ? '#D97706' : '#DC2626');
        return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #FDE68A">' +
          '<span style="font-size:16px">' + (c.pct >= 50 ? '✅' : (c.pct > 0 ? '⚠️' : '❌')) + '</span>' +
          '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#78350F">' + c.k + '</div>' +
          '<div style="font-size:11.5px;color:#B45309;line-height:1.4">' + c.why + '</div></div>' +
          '<div style="text-align:right;flex-shrink:0"><div style="font-size:14px;font-weight:900;color:' + okc + '">' + c.n + ' / ' + emps.length + '</div>' +
          '<div style="font-size:10.5px;color:#B45309">' + c.pct + '%</div></div></div>';
      }).join('') +
      '</div>';
  }

  /* ═══════════ 3. ОНОО ХААНА АЛДАГДАЖ БАЙНА ═══════════ */
  var hasDavtanAny = depts.some(function (d) { return deptHasDavtan(d, salKey); });
  var factors = [
    { k: 'Босго оноо', d: 'осол, зөрчилгүй байдал', fn: kpiBosgo, w: _f(w.bosgo), c: '#3730A3', p: 'violations' },
    { k: 'Давтан + шалгалт', d: 'энэ сард товлогдсон албад', fn: kpiDavtan, w: _f(w.davtan), c: '#0891B2', p: 'employees' },
    { k: 'Видео сургалт', d: 'оногдсоноос тэнцсэн хувь', fn: kpiVideo, w: _f(w.video), c: '#C2410C', p: 'video-track' },
    { k: 'Даалгавар', d: 'хянагчийн үнэлгээгээр', fn: kpiTask, w: _f(w.task), c: '#16A34A', p: 'tasks' },
    { k: 'Аюул мэдээлэл (бонус)', d: 'баталгаажсан мэдээллээр', fn: empBonusScore, w: _f(w.bonus), c: '#059669', p: 'reportflow' }
  ];
  var wsum = factors.reduce(function (a, f) { return a + f.w; }, 0) || 1;

  H += dashCard(
    dashH('Оноо хаанаас бүрдэж, хаана алдагдаж байна', 'Хүчин зүйл бүрийн компанийн дундаж. Улаан мөр нь хамгийн их оноо алддаг цэг.') +
    factors.map(function (f) {
      var vals = emps.map(f.fn).filter(function (v) { return v != null; });
      if (!vals.length) return '';
      var v = Math.round(avg(vals));
      var maxPts = Math.round(100 * f.w / wsum);
      var got = Math.round(v * f.w / wsum);
      var lost = maxPts - got;
      var fList = emps.filter(function (e) { return f.fn(e) != null; })
        .sort(function (a, b) { return (f.fn(a) || 0) - (f.fn(b) || 0); });
      var fKey = dashReg('fac_' + f.k, f.k + ' — ажилтан тус бүрээр', dashEmpRows(fList, f.fn, '%'),
        { page: f.p, hint: 'Хамгийн бага оноотойгоос эхлэн эрэмбэлсэн.' });
      return '<div class="dash-fac dash-click"' + (fKey ? ' data-drill="' + fKey + '"' : ' data-gopage="' + f.p + '"') + '>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">' +
        '<span style="font-size:13.5px;font-weight:700;color:#1E293B">' + f.k + '</span>' +
        '<span style="font-size:12px;color:' + dashTone(v) + ';font-weight:800">' + v + '%</span></div>' +
        '<div style="font-size:11.5px;color:#94A3B8;margin:2px 0 6px">' + f.d + ' · ' + vals.length + ' ажилтан</div>' +
        dashBar(v, f.c) + '</div>' +
        '<div style="text-align:right;min-width:96px">' +
        '<div style="font-size:17px;font-weight:900;color:#334155;font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">' + got + '<span style="font-size:11px;color:#94A3B8">/' + maxPts + '</span></div>' +
        (lost > 0 ? '<div style="font-size:11px;color:#DC2626;font-weight:700">−' + lost + ' алдсан</div>' : '<div style="font-size:11px;color:#16A34A;font-weight:700">бүтэн</div>') +
        '</div></div>';
    }).join('')
  );

  /* ═══════════ 4. АЛБА ТУС БҮРИЙН ЗУРАГЛАЛ ═══════════ */
  var deptRows = depts.map(function (d) {
    var m = deptMembers(d);
    function av(fn) { var v = m.map(fn).filter(function (x) { return x != null; }); return v.length ? Math.round(avg(v)) : null; }
    var viol = (DB.violations || []).filter(function (x) {
      var e = (DB.employees || []).filter(function (y) { return y.id === x.empId; })[0];
      return e && e.dept === d && salaryMonthKey(x.date || x.createdAt) === salKey;
    }).length;
    return {
      d: d, n: m.length, kpi: deptScore(d),
      bosgo: av(kpiBosgo), video: av(kpiVideo), task: av(kpiTask), bonus: av(empBonusScore),
      viol: viol, risk: (RISK_DEPTS === null) ? null : (RISK_DEPTS.indexOf(d) > -1)
    };
  }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.kpi - a.kpi; });

  H += dashCard(
    dashH('Алба тус бүрийн зураглал', 'Аль алба юугаараа хоцорч байгааг нэг харцаар. Мөр дээр дарж ажилтнуудыг үзнэ.') +
    '<div style="overflow-x:auto"><table class="dash-tbl"><thead><tr>' +
    '<th style="text-align:left">Алба</th><th>Хүн</th><th>KPI</th><th>Босго</th><th>Видео</th><th>Даалгавар</th><th>Бонус</th><th>Зөрчил</th><th>Эрсдэл</th>' +
    '</tr></thead><tbody>' +
    deptRows.map(function (r) {
      function cell(v) { return v == null ? '<td style="color:#CBD5E1">—</td>' : '<td style="color:' + dashTone(v) + ';font-weight:700">' + v + '</td>'; }
      var dList = deptMembers(r.d).sort(function (a, b) { return empTotal(b) - empTotal(a); });
      var dKey = dashReg('dept_' + r.d, r.d + ' — ажилтнууд', dashEmpRows(dList, null, ' оноо'),
        { page: 'employees', pageLabel: 'Ажилтнууд цэс' });
      return '<tr' + (dKey ? ' data-drill="' + dKey + '"' : '') + '>' +
        '<td style="text-align:left;font-weight:600">' + esc(r.d) + '</td>' +
        '<td style="color:#64748B">' + r.n + '</td>' +
        '<td><span style="background:' + dashTone(r.kpi) + '18;color:' + dashTone(r.kpi) + ';border-radius:8px;padding:3px 9px;font-weight:800">' + r.kpi + '</span></td>' +
        cell(r.bosgo) + cell(r.video) + cell(r.task) + cell(r.bonus) +
        '<td style="color:' + (r.viol ? '#DC2626' : '#CBD5E1') + ';font-weight:' + (r.viol ? '800' : '400') + '">' + (r.viol || '—') + '</td>' +
        '<td>' + (r.risk === null ? '<span style="color:#CBD5E1">…</span>' : (r.risk ? '<span style="color:#16A34A">✓</span>' : '<span style="color:#DC2626">✕</span>')) + '</td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>'
  );

  /* ═══════════ 5. ДОТООД СУРГАЛТ — МОДУЛЬ ТУС БҮР ═══════════ */
  var modRows = Object.keys(TRAINING_MODULES).map(function (k) {
    var vis = 0, trained = 0, taken = 0, passed = 0, sum = 0, cnt = 0;
    emps.forEach(function (e) {
      var visible = false;
      try { visible = isModTrainingVisible(e, k); } catch (err) {}
      if (!visible) return;
      vis++;
      var pg = {};
      try { pg = getEmpProg(e.id, k) || {}; } catch (err) {}
      if (pg.trainingCompleted) trained++;
      if (pg.examTaken) { taken++; if (pg.examPassed) passed++; if (pg.examScore != null) { sum += _f(pg.examScore); cnt++; } }
    });
    return { k: k, label: TRAINING_MODULES[k], vis: vis, trained: trained, taken: taken, passed: passed, avg: cnt ? Math.round(sum / cnt) : null };
  }).filter(function (r) { return r.vis > 0; });

  if (modRows.length) {
    H += dashCard(
      dashH('Дотоод зааварчилгааны явц', 'Нээгдсэн ажилтнуудаас хэд нь сургалтаа дуусгаж, шалгалтаа өгч, тэнцсэн бэ.') +
      modRows.map(function (r) {
        var pTr = r.vis ? Math.round(r.trained / r.vis * 100) : 0;
        var pEx = r.vis ? Math.round(r.taken / r.vis * 100) : 0;
        var pPa = r.taken ? Math.round(r.passed / r.taken * 100) : 0;
        /* Модуль бүрийн 3 багана — дарахад ямар ажилтнууд болохыг харуулна */
        function modList(test) {
          return emps.filter(function (e) {
            try { if (!isModTrainingVisible(e, r.k)) return false; return test(getEmpProg(e.id, r.k) || {}); }
            catch (err) { return false; }
          });
        }
        var kTr = dashReg('mod_tr_' + r.k, r.label + ' — сургалт ДУУСГААГҮЙ',
          dashEmpRows(modList(function (pg) { return !pg.trainingCompleted; }), null, ' оноо'),
          { page: 'employees', hint: 'Эдгээр ажилтан сургалтаа хараахан дуусгаагүй байна.' });
        var kEx = dashReg('mod_ex_' + r.k, r.label + ' — шалгалт ӨГӨӨГҮЙ',
          dashEmpRows(modList(function (pg) { return !pg.examTaken; }), null, ' оноо'),
          { page: 'employees' });
        var kPa = dashReg('mod_pa_' + r.k, r.label + ' — шалгалтад ТЭНЦЭЭГҮЙ',
          dashEmpRows(modList(function (pg) { return pg.examTaken && !pg.examPassed; }), null, ' оноо'),
          { page: 'employees', hint: 'Шалгалт өгсөн боловч тэнцээгүй ажилтнууд.' });
        return '<div style="padding:11px 0;border-top:1px solid #F5F7FB">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;margin-bottom:7px">' +
          '<span style="font-size:13.5px;font-weight:700;color:#1E293B">' + esc(r.label) + '</span>' +
          '<span style="font-size:11.5px;color:#94A3B8">' + r.vis + ' ажилтанд нээгдсэн' + (r.avg != null ? ' · дундаж дүн ' + r.avg + '%' : '') + '</span></div>' +
          '<div class="dash-3col">' +
          '<div' + dashClick(kTr) + '><div style="font-size:11px;color:#94A3B8">Сургалт дуусгасан' + (kTr ? ' ›' : '') + '</div>' + dashBar(pTr, '#4F46E5', 6) + '<div style="font-size:11.5px;color:#4F46E5;font-weight:700;margin-top:3px">' + r.trained + ' / ' + r.vis + ' · ' + pTr + '%</div></div>' +
          '<div' + dashClick(kEx) + '><div style="font-size:11px;color:#94A3B8">Шалгалт өгсөн' + (kEx ? ' ›' : '') + '</div>' + dashBar(pEx, '#0891B2', 6) + '<div style="font-size:11.5px;color:#0891B2;font-weight:700;margin-top:3px">' + r.taken + ' / ' + r.vis + ' · ' + pEx + '%</div></div>' +
          '<div' + dashClick(kPa) + '><div style="font-size:11px;color:#94A3B8">Тэнцсэн' + (kPa ? ' ›' : '') + '</div>' + dashBar(pPa, dashTone(pPa), 6) + '<div style="font-size:11.5px;color:' + dashTone(pPa) + ';font-weight:700;margin-top:3px">' + r.passed + ' / ' + (r.taken || 0) + ' · ' + pPa + '%</div></div>' +
          '</div></div>';
      }).join('')
    );
  }

  /* ═══════════ 6. ВИДЕО СУРГАЛТ + ШАЛГАЛТЫН АХИЦ ═══════════ */
  var vTot = 0, vPass = 0, vView = 0, vEmp = 0;
  emps.forEach(function (e) {
    var s = null; try { s = empLmsStats(e); } catch (err) {}
    if (!s || !s.total) return;
    vEmp++; vTot += s.total; vPass += s.passed; vView += s.viewed;
  });
  var pre = [], post = [];
  emps.forEach(function (e) {
    if (e.examPrev != null) pre.push(_f(e.examPrev));
    if (e.examScore != null) post.push(_f(e.examScore));
  });
  var preAvg = pre.length ? Math.round(avg(pre)) : null;
  var postAvg = post.length ? Math.round(avg(post)) : null;

  H += '<div class="dash-2col">' +
    dashCard(
      dashH('Видео сургалт (MiSkill)',
        (typeof LMS !== 'undefined' && !LMS.loaded) ? 'Мэдээлэл ачаалж байна…'
          : (vEmp ? vEmp + ' ажилтанд хичээл оногдсон' : 'Хичээл оногдоогүй байна')) +
      ((typeof LMS !== 'undefined' && !LMS.loaded)
        ? '<div style="font-size:13px;color:#94A3B8">Видео сургалтын мэдээлэл серверээс ачаалагдаж байна. Дээрх «Шинэчлэх» товчийг дарж болно.</div>'
        : vTot
        ? '<div class="dash-3col">' +
          '<div' + dashClick(dashReg('lms_all', 'Видео хичээл оногдсон ажилтан',
            emps.map(function (e) { var s = null; try { s = empLmsStats(e); } catch (er) {} if (!s || !s.total) return ''; return dashDrillRow(esc(e.name), esc(e.dept || ''), s.passed + ' / ' + s.total + ' тэнцсэн', dashTone(s.passed / s.total * 100)); }).filter(Boolean),
            { page: 'video-track' })) + '><div style="font-size:11px;color:#94A3B8">Оногдсон ›</div><div style="font-size:24px;color:#334155">' + dashNum(vTot) + '</div></div>' +
          '<div' + dashClick(dashReg('lms_no', 'Видео сургалтаа бүрэн ҮЗЭЭГҮЙ ажилтан',
            emps.map(function (e) { var s = null; try { s = empLmsStats(e); } catch (er) {} if (!s || !s.total || s.viewed >= s.total) return ''; return dashDrillRow(esc(e.name), esc(e.dept || ''), s.viewed + ' / ' + s.total + ' үзсэн', '#C2410C'); }).filter(Boolean),
            { page: 'video-track' })) + '><div style="font-size:11px;color:#94A3B8">Үзсэн ›</div><div style="font-size:24px;color:#C2410C">' + dashNum(vView) + '</div></div>' +
          '<div' + dashClick(dashReg('lms_fail', 'Видео сургалтад бүрэн ТЭНЦЭЭГҮЙ ажилтан',
            emps.map(function (e) { var s = null; try { s = empLmsStats(e); } catch (er) {} if (!s || !s.total || s.passed >= s.total) return ''; return dashDrillRow(esc(e.name), esc(e.dept || ''), s.passed + ' / ' + s.total + ' тэнцсэн', '#DC2626'); }).filter(Boolean),
            { page: 'video-track', hint: 'Оногдсон бүх хичээлдээ тэнцээгүй ажилтнууд.' })) + '><div style="font-size:11px;color:#94A3B8">Тэнцсэн ›</div><div style="font-size:24px;color:#16A34A">' + dashNum(vPass) + '</div></div>' +
          '</div><div style="margin-top:12px">' + dashBar(vTot ? vPass / vTot * 100 : 0, '#16A34A') +
          '<div style="font-size:12px;color:#64748B;margin-top:5px">Тэнцсэн хувь: <b>' + (vTot ? Math.round(vPass / vTot * 100) : 0) + '%</b></div></div>'
        : '<div style="font-size:13px;color:#94A3B8">Мэдээлэл алга</div>'),
      '18px'
    ) +
    dashCard(
      dashH('ХАБЭА шалгалтын ахиц', 'Урьдчилсан ба дараах шалгалтын дундаж') +
      (postAvg != null || preAvg != null
        ? '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div' + dashClick(dashReg('ex_pre', 'Урьдчилсан шалгалтын дүн',
            dashEmpRows(emps.filter(function (e) { return e.examPrev != null; }).sort(function (a, b) { return _f(a.examPrev) - _f(b.examPrev); }),
              function (e) { return Math.round(_f(e.examPrev)); }, '%'), { page: 'employees' })) + '><div style="font-size:11px;color:#94A3B8">Урьдчилсан<div style="font-size:26px;color:#64748B">' + dashNum(preAvg != null ? preAvg : '—', preAvg != null ? '%' : '') + '</div><div style="font-size:10.5px;color:#CBD5E1">' + pre.length + ' хүн</div></div>' +
          '<i class="ti ti-arrow-right" style="color:#CBD5E1;font-size:22px"></i>' +
          '<div' + dashClick(dashReg('ex_post', 'Дараах шалгалтын дүн',
            dashEmpRows(emps.filter(function (e) { return e.examScore != null; }).sort(function (a, b) { return _f(a.examScore) - _f(b.examScore); }),
              function (e) { return Math.round(_f(e.examScore)); }, '%'), { page: 'employees' })) + '><div style="font-size:11px;color:#94A3B8">Дараах ›</div><div style="font-size:26px;color:' + dashTone(postAvg) + '">' + dashNum(postAvg != null ? postAvg : '—', postAvg != null ? '%' : '') + '</div><div style="font-size:10.5px;color:#CBD5E1">' + post.length + ' хүн</div></div>' +
          (preAvg != null && postAvg != null
            ? '<div style="margin-left:auto;background:' + (postAvg >= preAvg ? '#ECFDF5' : '#FEF2F2') + ';border-radius:12px;padding:10px 14px">' +
              '<div style="font-size:22px;font-weight:900;color:' + (postAvg >= preAvg ? '#16A34A' : '#DC2626') + ';font-family:\'Bricolage Grotesque\',sans-serif;line-height:1">' + (postAvg - preAvg >= 0 ? '+' : '') + (postAvg - preAvg) + '</div>' +
              '<div style="font-size:11px;color:#64748B">мэдлэгийн ахиц</div></div>' : '') +
          '</div>'
        : '<div style="font-size:13px;color:#94A3B8">Шалгалтын дүн бүртгэгдээгүй байна</div>'),
      '18px'
    ) + '</div>';

  /* ═══════════ 7. ДААЛГАВАР + АЮУЛ МЭДЭЭЛЭЛ ═══════════ */
  var myTasks = (DB.tasks || []).filter(function (t) { return !dh || t.dept === dh || t.dept === 'all'; });
  var tOpen = myTasks.filter(function (t) { return t.status !== 'submitted' && !taskIsClosed(t); }).length;
  var tRev = myTasks.filter(function (t) { return t.status === 'submitted'; }).length;
  var tOk = myTasks.filter(taskIsClosed).length;
  var tScores = myTasks.filter(function (t) { return t.status === 'approved' && t.score != null; }).map(function (t) { return _f(t.score); });
  var tAvg = tScores.length ? Math.round(avg(tScores)) : null;

  var reps = (DB.reports || []).filter(function (r) { return !dh || reportDept(r) === dh; });
  var rVer = reps.filter(function (r) { return r.status === 'verified'; }).length;
  var rPend = reps.filter(function (r) { return r.status === 'reported'; }).length;
  var rHaz = reps.filter(function (r) { return r.type === 'hazard'; }).length;
  var rNm = reps.filter(function (r) { return r.type === 'near_miss'; }).length;
  var bonusPts = emps.reduce(function (a, e) { return a + (empBonusPoints(e) || 0); }, 0);

  H += '<div class="dash-2col">' +
    dashCard(
      dashH('Даалгаврын байдал', myTasks.length + ' даалгавар' + (tAvg != null ? ' · дундаж үнэлгээ ' + tAvg + '%' : '')) +
      '<div class="dash-3col">' +
      '<div' + dashClick(dashReg('t_open', 'Хийгдэх даалгавар', dashTaskRows(myTasks.filter(function (x) { return x.status !== 'submitted' && !taskIsClosed(x); })), { page: 'tasks' })) + '><div style="font-size:11px;color:#94A3B8">Хийгдэх ›</div><div style="font-size:24px;color:#D97706">' + dashNum(tOpen) + '</div></div>' +
      '<div' + dashClick(dashReg('t_rev', 'Хянагдаж буй даалгавар', dashTaskRows(myTasks.filter(function (x) { return x.status === 'submitted'; })), { page: 'tasks' })) + '><div style="font-size:11px;color:#94A3B8">Хянагдаж буй ›</div><div style="font-size:24px;color:#7C3AED">' + dashNum(tRev) + '</div></div>' +
      '<div' + dashClick(dashReg('t_ok', 'Баталгаажсан даалгавар', dashTaskRows(myTasks.filter(taskIsClosed)), { page: 'tasks' })) + '><div style="font-size:11px;color:#94A3B8">Баталгаажсан ›</div><div style="font-size:24px;color:#16A34A">' + dashNum(tOk) + '</div></div>' +
      '</div>' +
      (overdueT.length ? '<div style="margin-top:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:9px 12px;font-size:12.5px;color:#B91C1C;font-weight:700">⏰ ' + overdueT.length + ' даалгаврын хугацаа хэтэрсэн</div>' : '') +
      (tAvg != null ? '<div style="margin-top:12px">' + dashBar(tAvg, dashTone(tAvg)) + '</div>' : ''),
      '18px'
    ) +
    dashCard(
      dashH('Аюул / Near-miss мэдээлэл', reps.length + ' мэдээлэл · олгосон бонус ' + bonusPts + ' оноо') +
      '<div class="dash-3col">' +
      '<div' + dashClick(dashReg('r_ver', 'Баталгаажсан мэдээлэл', dashReportRows(reps.filter(function (r) { return r.status === 'verified'; })), { page: 'reportflow' })) + '><div style="font-size:11px;color:#94A3B8">Баталгаажсан ›</div><div style="font-size:24px;color:#16A34A">' + dashNum(rVer) + '</div></div>' +
      '<div' + dashClick(dashReg('r_pend', 'Хүлээгдэж буй мэдээлэл', dashReportRows(reps.filter(function (r) { return r.status === 'reported'; })), { page: 'reportflow' })) + '><div style="font-size:11px;color:#94A3B8">Хүлээгдэж буй ›</div><div style="font-size:24px;color:' + (rPend ? '#DC2626' : '#94A3B8') + '">' + dashNum(rPend) + '</div></div>' +
      '<div' + dashClick(dashReg('r_all', 'Бүх мэдээлэл', dashReportRows(reps), { page: 'reportflow' })) + '><div style="font-size:11px;color:#94A3B8">Аюул / NM ›</div><div style="font-size:24px;color:#7C3AED">' + dashNum(rHaz + ' / ' + rNm) + '</div></div>' +
      '</div>' +
      (rPend ? '<div style="margin-top:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:9px 12px;font-size:12.5px;color:#B91C1C;font-weight:700">' + rPend + ' мэдээлэл баталгаажуулалт хүлээж байна — ажилтны бонус хойшилж байна</div>' : ''),
      '18px'
    ) + '</div>';

  /* ═══════════ 8. ОСОЛ / ЗӨРЧИЛ ═══════════ */
  var viols = (DB.violations || []).filter(function (v) {
    if (salaryMonthKey(v.date || v.createdAt) !== salKey) return false;
    if (!dh) return true;
    var e = (DB.employees || []).filter(function (y) { return y.id === v.empId; })[0];
    return e && e.dept === dh;
  });
  var lostPts = viols.reduce(function (a, v) { return a + (_f(v.points) || 0); }, 0);
  H += dashCard(
    dashH('Осол, зөрчлийн бүртгэл — ' + salLbl,
      viols.length ? viols.length + ' зөрчил бүртгэгдсэн, нийт ' + lostPts + ' оноо хасагдсан' : 'Энэ цалингийн сард зөрчил бүртгэгдээгүй ✓') +
    (viols.length
      ? '<div style="display:flex;flex-direction:column;gap:7px">' +
        viols.slice(0, 8).map(function (v) {
          var e = (DB.employees || []).filter(function (y) { return y.id === v.empId; })[0] || {};
          return '<div style="display:flex;align-items:center;gap:10px;background:#FEF2F2;border-radius:10px;padding:9px 12px">' +
            '<span style="font-size:13px;font-weight:700;color:#991B1B;min-width:120px">' + esc(e.name || v.empId) + '</span>' +
            '<span style="flex:1;min-width:0;font-size:12.5px;color:#7F1D1D">' + esc(v.desc || '') + '</span>' +
            '<span style="font-size:13px;font-weight:900;color:#DC2626">−' + (_f(v.points) || 0) + '</span></div>';
        }).join('') +
        (viols.length > 8 ? '<div style="font-size:12px;color:#94A3B8;text-align:center;margin-top:4px">…бас ' + (viols.length - 8) + ' зөрчил</div>' : '') +
        '</div>'
      : '')
  );

  /* ═══════════ 9. АНХААРАХ БА ТЭРГҮҮЛЭХ АЖИЛТНУУД ═══════════ */
  var sorted = emps.slice().sort(function (a, b) { return empTotal(b) - empTotal(a); });
  function empRow(e, rank, bad) {
    var tv = empTotal(e), L = kpiLevel(tv);
    var rows = factors.map(function (f) {
      var v = null; try { v = f.fn(e); } catch (err) {}
      return dashDrillRow(f.k, f.d, v == null ? 'дата алга' : v + '%', v == null ? '#CBD5E1' : dashTone(v));
    });
    var ek = dashReg('emp_' + e.id, esc(e.name) + ' — оноо хаанаас бүрдсэн', rows,
      { page: 'employees', hint: esc(e.dept || '') + (e.pos ? ' · ' + esc(e.pos) : '') + ' · нийт ' + tv + ' оноо' });
    return '<div class="dash-emp dash-click"' + (ek ? ' data-drill="' + ek + '"' : '') + '>' +
      '<span style="width:26px;font-size:12px;color:#94A3B8;font-weight:700">' + rank + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.name) + '</div>' +
      '<div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.dept || '') + '</div></div>' +
      '<span style="font-size:16px;font-weight:900;color:' + (bad ? '#DC2626' : L.color) + ';font-family:\'Bricolage Grotesque\',sans-serif">' + tv + '</span></div>';
  }
  H += '<div class="dash-2col">' +
    dashCard(dashH('⚠ Анхаарах ажилтнууд', 'Хамгийн бага оноотой — тэдэнтэй ярилцах шаардлагатай') +
      sorted.slice(-8).reverse().map(function (e, i) { return empRow(e, sorted.length - i, true); }).join(''), '18px') +
    dashCard(dashH('🏆 Тэргүүлэгчид', 'Хамгийн өндөр оноотой ажилтнууд') +
      sorted.slice(0, 8).map(function (e, i) { return empRow(e, i + 1, false); }).join(''), '18px') +
    '</div>';

  host.innerHTML = H;

  if (!host._wired) {
    host._wired = true;
    host.addEventListener('click', function (ev) {
      var dr = ev.target.closest('[data-drill]');
      if (dr) { dashOpenDrill(dr.getAttribute('data-drill')); return; }
      var g = ev.target.closest('[data-gopage]');
      if (g) { switchPage(g.getAttribute('data-gopage')); return; }
      var d = ev.target.closest('[data-godept]');
      if (d) { switchPage('employees'); return; }
      var e2 = ev.target.closest('[data-goemp]');
      if (e2) { switchPage('employees'); return; }
    });
  }
}

function renderDashboard() {
  if (isEmp()) { renderEmployeeDashboard(); return; }

  /* Дэд гарчиг — цалингийн сар ба шинэчлэгдсэн цаг */
  try {
    var ds = document.getElementById('dashSubtitle');
    if (ds) {
      var key = currentSalaryKey(), q = key.split('-');
      var now = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
      ds.textContent = q[0] + ' оны ' + parseInt(q[1], 10) + '-р сарын цалингийн үе (25→24) · шинэчлэгдсэн ' +
        pad(now.getHours()) + ':' + pad(now.getMinutes());
    }
  } catch (e) {}

  /* Демо дата үлдсэн бол цэвэрлэх санал (зөвхөн админд) */
  try {
    var page = document.querySelector('.page[data-page="dashboard"]');
    var bn = document.getElementById('demoBanner');
    var show = isAdmin() && !(DB.settings && DB.settings.demoCleaned) && demoDataCount() > 0;
    if (show && page) {
      if (!bn) {
        bn = document.createElement('div'); bn.id = 'demoBanner';
        var hostEl = document.getElementById('dashPro');
        if (hostEl) page.insertBefore(bn, hostEl); else page.appendChild(bn);
      }
      bn.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:12px 16px;margin-bottom:16px';
      bn.innerHTML = '<i class="ti ti-alert-triangle" style="color:#D97706;font-size:20px"></i>' +
        '<div style="flex:1;min-width:200px"><div style="font-weight:700;color:#92400E;font-size:14px">Жишээ (демо) дата илэрлээ — ' + demoDataCount() + ' бичлэг</div>' +
        '<div style="font-size:12px;color:#B45309">Прототипийн жишээ мэдээллийг устгаж, цэвэр эхлүүлнэ үү.</div></div>' +
        '<button class="btn btn-primary btn-sm" id="demoClearBtn" style="background:#D97706;border-color:#D97706"><i class="ti ti-trash"></i> Бүгдийг цэвэрлэх</button>';
      var cb = document.getElementById('demoClearBtn');
      if (cb) cb.onclick = function () { if (confirm('Бүх жишээ (демо) датаг бүрмөсөн устгах уу?')) clearAllDemoData(); };
    } else if (bn) { bn.remove(); }
  } catch (e) {}

  /* Толгойн товчнуудыг АЖИЛЛУУЛАХ — өмнө нь зүгээр чимэглэл байсан */
  try {
    var rb = document.getElementById('dashRefresh');
    if (rb && !rb._w) {
      rb._w = true;
      rb.addEventListener('click', function () {
        rb.disabled = true;
        var old = rb.innerHTML;
        rb.innerHTML = '<i class="ti ti-loader-2"></i> Шинэчилж байна…';
        Promise.resolve()
          .then(function () { return (typeof loadDB === 'function') ? loadDB() : null; })
          .then(function (fresh) { if (fresh && fresh !== '__timeout__' && fresh.employees) DB = fresh; })
          .then(function () { return (typeof loadLmsData === 'function') ? loadLmsData() : null; })
          .catch(function (e) { console.error('[refresh]', e); })
          .then(function () {
            rb.disabled = false; rb.innerHTML = old;
            try { renderAll(); } catch (e) {}
            toast('Мэдээлэл шинэчлэгдлээ', 'success');
          });
      });
    }
    var eb = document.getElementById('dashExport');
    if (eb && !eb._w) {
      eb._w = true;
      eb.addEventListener('click', function () {
        try { downloadReport(); } catch (e) { toast('Тайлан татахад алдаа гарлаа', 'error'); }
      });
    }
  } catch (e) {}

  /* Үндсэн самбар */
  try { renderAdminDashboard(); }
  catch (e) {
    console.error('[dashPro]', e);
    var hostErr = document.getElementById('dashPro');
    if (hostErr) hostErr.innerHTML = '<div class="card" style="padding:30px"><div class="empty-state">' +
      '<i class="ti ti-alert-triangle"></i><div>Хяналтын самбар зурахад алдаа гарлаа.</div>' +
      '<div style="font-size:12px;color:#94A3B8;margin-top:6px">' + esc(String((e && e.message) || e)) + '</div></div></div>';
  }
}
function renderDashEmployees() {
  var wrap = $('#dashEmpList'); if (!wrap) return;
  // Алба сонгох dropdown бөглөх
  var deptSel = $('#dashEmpDept');
  if (deptSel) {
    var opts = '<option value="">Бүх алба</option>' + deptList().map(function (d) {
      return '<option value="' + esc(d) + '"' + (d === dashEmpState.dept ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');
    if (deptSel.innerHTML !== opts) deptSel.innerHTML = opts;
    deptSel.value = dashEmpState.dept;
  }
  // Input-уудыг нэг удаа wire хийх
  var page = $('.page[data-page="dashboard"]');
  if (page && !page._dashEmpWired) {
    page._dashEmpWired = true;
    var si = $('#dashEmpSearch'); if (si) si.addEventListener('input', function () { dashEmpState.q = this.value; renderDashEmployees(); });
    var ds = $('#dashEmpDept'); if (ds) ds.addEventListener('change', function () { dashEmpState.dept = this.value; renderDashEmployees(); });
    var so = $('#dashEmpSort'); if (so) so.addEventListener('change', function () { dashEmpState.sort = this.value; renderDashEmployees(); });
    wrap.addEventListener('click', function (ev) {
      var row = ev.target.closest('[data-emp-detail]');
      if (row) openEmployeeDetail(row.getAttribute('data-emp-detail'));
    });
  }

  var q = (dashEmpState.q || '').toLowerCase().trim();
  var list = (DB.employees || []).filter(function (e) {
    if (dashEmpState.dept && e.dept !== dashEmpState.dept) return false;
    if (!q) return true;
    return (e.name || '').toLowerCase().indexOf(q) > -1 || (e.dept || '').toLowerCase().indexOf(q) > -1 ||
      (e.role || '').toLowerCase().indexOf(q) > -1 || (e.email || '').toLowerCase().indexOf(q) > -1;
  });
  if (dashEmpState.sort === 'name') list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'mn'); });
  else if (dashEmpState.sort === 'kpilow') list.sort(function (a, b) { return empTotal(a) - empTotal(b); });
  else list.sort(function (a, b) { return empTotal(b) - empTotal(a); });

  function kcol(v) { return v == null ? '#CBD5E1' : v >= 85 ? '#16A34A' : v >= 60 ? '#D97706' : '#DC2626'; }
  function chip(lbl, v) {
    return '<span style="font-size:10.5px;font-weight:600;color:' + kcol(v) + ';background:#F8FAFC;border:1px solid #EEF1F4;border-radius:6px;padding:1px 7px;white-space:nowrap">' + lbl + ' ' + (v == null ? '—' : v) + '</span>';
  }
  wrap.innerHTML = list.length ? list.map(function (e) {
    var tot = empTotal(e), tc = kcol(tot);
    return '<div data-emp-detail="' + e.id + '" style="display:flex;align-items:center;gap:12px;padding:11px 8px;border-bottom:1px solid #F1F5F9;cursor:pointer;border-radius:8px" onmouseover="this.style.background=\'#F8FAFC\'" onmouseout="this.style.background=\'\'">' +
      '<div class="avatar avatar-sm" style="width:36px;height:36px;flex-shrink:0">' + esc(e.initials || '') + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13.5px;font-weight:600;color:#1E293B">' + esc(e.name) +
      (e.onLeave ? ' <span class="tag tag-warn" style="font-size:9px">Чөлөөтэй</span>' : '') + '</div>' +
      '<div style="font-size:11.5px;color:#94A3B8;margin-bottom:5px">' + esc(e.dept || '') + (e.role ? ' · ' + esc(e.role) : '') + '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
      chip('Босго', kpiBosgo(e)) + chip('Давтан', kpiDavtan(e)) + chip('Видео', kpiVideo(e)) +
      chip('Даалг', kpiTask(e)) + chip('Аюул/NM', empBonusScore(e)) + '</div></div>' +
      '<div style="text-align:center;flex-shrink:0"><div style="font-size:20px;font-weight:800;font-family:\'Bricolage Grotesque\',sans-serif;color:' + tc + '">' + tot + '</div>' +
      '<div style="font-size:10px;color:#94A3B8">KPI</div></div>' +
      '<i class="ti ti-chevron-right" style="color:#CBD5E1;flex-shrink:0"></i></div>';
  }).join('') : '<div class="empty-state" style="padding:30px"><i class="ti ti-search-off"></i><div>Ажилтан олдсонгүй</div></div>';

  var cnt = $('#dashEmpCount');
  if (cnt) cnt.textContent = list.length + ' ажилтан';
}

/* Дашбоардын блокууд HTML дээр НУУГДМАЛ (display:none) эхэлдэг.
   Энэ функц зөвхөн ЖИНХЭНЭ ДАТАТАЙ хэсгийг харуулна — алдаа гарсан ч
   хоосон карт, утгагүй тэмдэг хэрэглэгчид харагдахгүй. */
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
  /* Ажилтны тооны badge — жинхэнэ тоо */
  try {
    var eb = document.getElementById('empBadge');
    if (eb) {
      var n = (DB.employees || []).length;
      eb.textContent = n;
      eb.style.display = n ? '' : 'none';
    }
  } catch (e) {}
  if (!items.length) {
    list.innerHTML = '<li style="justify-content:center"><div class="empty-state" style="padding:22px 12px">' +
      '<i class="ti ti-inbox"></i><div>Одоогоор мэдээлэл алга</div></div></li>';
    return;
  }
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
    if (isDeptHead() && SESSION && SESSION.dept && e.dept !== SESSION.dept) return false;
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

/* ---- Видео сургалт (MiSkill/LMS) — ажилтан бүрийн явцыг Firestore-оос уншина ---- */
var LMS = { loaded: false, loading: false, trainings: [], progByUser: {} };
function loadLmsData() {
  if (DEMO || !fbReady) return Promise.resolve();
  return fdb.collection('trainings').get().then(function (trSnap) {
    LMS.trainings = trSnap.docs
      .map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .filter(function (t) { return t.isActive !== false; });
    return fdb.collection('training_progress').get();
  }).then(function (pgSnap) {
    LMS.progByUser = {};
    pgSnap.forEach(function (d) {
      var x = d.data() || {};
      if (!x.userId || !x.trainingId) return;
      (LMS.progByUser[x.userId] = LMS.progByUser[x.userId] || {})[x.trainingId] = x;
    });
    LMS.loaded = true;
  }).catch(function (e) { console.warn('[LMS] load:', e && e.message); });
}
function empLmsStats(emp) {
  var uid = emp.uid || emp.id;
  var inv = LMS.trainings.filter(function (t) { return (t.invitedEmployees || []).indexOf(uid) > -1; });
  var progs = LMS.progByUser[uid] || {};
  var passed = 0, inProg = 0, viewed = 0;
  inv.forEach(function (t) {
    var p = progs[t.id];
    var st = p && p.status;
    if (st === 'passed') passed++;
    else if (st === 'in_progress' || st === 'failed') inProg++;
    // "Үзсэн" = ямар нэг байдлаар нээж эхэлсэн (тэнцсэн ч мөн үзсэнд тооцно)
    if (st === 'passed' || st === 'in_progress' || st === 'failed' || (p && (p.watchProgress || 0) > 0)) viewed++;
  });
  return { invited: inv, progs: progs, total: inv.length, passed: passed, inProg: inProg, viewed: viewed };
}

/* ---- Аюул/Near-miss мэдээллийн ажилтан тус бүрийн дүн ---- */
function empReportStats(e) {
  var verified = 0, pending = 0;
  (DB.reports || []).forEach(function (r) {
    if (!reportBelongsTo(r, e)) return;
    if (r.status === 'verified') verified++;
    else if (r.status === 'reported') pending++;
  });
  return { verified: verified, pending: pending, points: empBonusPoints(e), score: empBonusScore(e) };
}

/* ---- Даалгавар: ажилтанд ЗААВЧИЛЖ өгсөн бол ажилтанд тооцно (албаны даалгавар энд ОРОХГҮЙ) ---- */
/* ══════════════════════════════════════════════════════════════
   ДААЛГАВРЫН ТӨЛӨВ БА ҮНЭЛГЭЭ
   open/''    — хийгдээгүй
   submitted  — ажилтан гүйцэтгээд ХЯНУУЛАХААР илгээсэн
   approved   — хянагч ҮНЭЛГЭЭ өгч баталгаажуулсан (t.score 0–100)
   returned   — хянагч буцаасан, дахин хийнэ
   done       — хуучин хувилбарын бүртгэл (үнэлгээгүй, бүтэн тооцно)

   KPI-д даалгаврын оноо нь "хийсэн эсэх" биш, ҮНЭЛГЭЭГЭЭР тооцогдоно.
   Хянагч муу дүн тавьбал тухайн ажилтны оноо тэр хэмжээгээр буурна.
   ══════════════════════════════════════════════════════════════ */
function taskScoreOf(t) {
  if (!t) return 0;
  if (t.status === 'approved') {
    var s = _f(t.score);
    return isNaN(s) ? 100 : clamp(Math.round(s), 0, 100);
  }
  if (t.status === 'submitted') return 100;   // хянагдаж байгаа — түр бүтэн
  if (t.status === 'done') return 100;        // хуучин бүртгэл
  return 0;                                    // хийгээгүй / буцаагдсан
}
function taskIsClosed(t) { return !!t && (t.status === 'approved' || t.status === 'done'); }

/* ── Ач холбогдол, ангилал, давтамж ── */
var TASK_PRIO = {
  urgent: { label: 'Яаралтай', color: '#DC2626', rank: 0 },
  high:   { label: 'Өндөр',    color: '#EA580C', rank: 1 },
  normal: { label: 'Энгийн',   color: '#0891B2', rank: 2 },
  low:    { label: 'Бага',     color: '#94A3B8', rank: 3 }
};
var TASK_CAT = {
  inspection: 'Шалгалт, хяналт',
  repair:     'Засвар, арчилгаа',
  training:   'Сургалт, зааварчилгаа',
  report:     'Тайлан, бичиг баримт',
  ppe:        'ХХХ хэрэгсэл',
  hazard:     'Аюул арилгах',
  other:      'Бусад'
};
var TASK_REPEAT = { daily: 'Өдөр бүр', weekly: '7 хоног тутам', monthly: 'Сар бүр', quarterly: 'Улирал тутам' };
function taskPrio(x) { return TASK_PRIO[(x && x.priority) || 'normal'] || TASK_PRIO.normal; }

/* ⚠ Огноог ХУАНЛИЙН ӨДРӨӨР харьцуулна (цагийн бүсээс болж 1 хоног зөрөхөөс сэргийлнэ) */
function _dayNum(v) {
  var d = (typeof v === 'string') ? new Date(v + 'T00:00:00') : new Date(v);
  if (isNaN(d.getTime())) return NaN;
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}
/* Огноог YYYY-MM-DD болгох — toISOString цагийн бүсээр гулсдаг тул ашиглахгүй */
function _ymd(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/* Хугацаа хэтэрсэн хоног (хаагдаагүй даалгаварт) */
function taskOverdueDays(x) {
  if (!x || !x.dueDate || taskIsClosed(x)) return 0;
  var due = _dayNum(x.dueDate), today = _dayNum(new Date());
  if (isNaN(due) || isNaN(today)) return 0;
  var diff = today - due;
  return diff > 0 ? diff : 0;
}
/* Дуусах хугацаа 3 хоногийн дотор ойртсон эсэх */
function taskDueSoon(x) {
  if (!x || !x.dueDate || taskIsClosed(x)) return false;
  var due = _dayNum(x.dueDate), today = _dayNum(new Date());
  if (isNaN(due) || isNaN(today)) return false;
  var days = due - today;
  return days >= 0 && days <= 3;
}
/* Хугацаа хоцроож илгээсэн хоног */
function taskLateDays(x) {
  if (!x || !x.dueDate || !x.submittedAt) return 0;
  var due = _dayNum(x.dueDate), sub = _dayNum(new Date(x.submittedAt));
  if (isNaN(due) || isNaN(sub)) return 0;
  var diff = sub - due;
  return diff > 0 ? diff : 0;
}
/* Эрэмбэ: яаралтай → хугацаа хэтэрсэн → дуусах ойрхон → шинэ */
function taskSortFn(a, b) {
  var pa = taskPrio(a).rank, pb = taskPrio(b).rank;
  if (pa !== pb) return pa - pb;
  var oa = taskOverdueDays(a), ob = taskOverdueDays(b);
  if (oa !== ob) return ob - oa;
  var da = a.dueDate || '9999-12-31', db2 = b.dueDate || '9999-12-31';
  if (da !== db2) return da < db2 ? -1 : 1;
  return new Date(b.createdAt) - new Date(a.createdAt);
}

/* ── Файл байршуулах (R2) ── */
var TASK_R2 = 'https://monos-upload.buynt666.workers.dev';
var TASK_R2_KEY = 'monos2026';
function taskUpload(file, statusEl, hiddenEl) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    statusEl.textContent = 'Файл 12MB-аас их байна. Багасгана уу.';
    statusEl.style.color = '#DC2626'; return;
  }
  var fname = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  statusEl.textContent = 'Байршуулж байна...'; statusEl.style.color = '#D97706';
  var xhr = new XMLHttpRequest();
  xhr.open('PUT', TASK_R2 + '/' + fname);
  xhr.setRequestHeader('X-Key', TASK_R2_KEY);
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) statusEl.textContent = Math.round(e.loaded / e.total * 100) + '%';
  };
  xhr.onload = function () {
    if (xhr.status === 200) {
      try { var r = JSON.parse(xhr.responseText); hiddenEl.value = r.url || ''; } catch (e) {}
      statusEl.textContent = 'Хавсаргалаа ✓'; statusEl.style.color = '#16A34A';
    } else { statusEl.textContent = 'Алдаа ' + xhr.status; statusEl.style.color = '#DC2626'; }
  };
  xhr.onerror = function () { statusEl.textContent = 'Сүлжээний алдаа'; statusEl.style.color = '#DC2626'; };
  xhr.send(file);
}

/* Давтагдах даалгаврын дараагийн удаагийг автоматаар үүсгэх */
function taskRepeatNext(x) {
  if (!x || !x.repeat || !TASK_REPEAT[x.repeat]) return;
  function shift(ds) {
    var d = ds ? new Date(ds + 'T00:00:00') : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (x.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (x.repeat === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (x.repeat === 'weekly') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    return _ymd(d);
  }
  DB.tasks = DB.tasks || [];
  DB.tasks.unshift({
    id: nextId('TSK', DB.tasks),
    title: x.title, desc: x.desc || '', dept: x.dept || 'all',
    empId: x.empId || '', empIds: (x.empIds || []).slice(),
    startDate: shift(x.startDate || x.dueDate), dueDate: shift(x.dueDate || x.startDate),
    priority: x.priority || 'normal', category: x.category || 'other', repeat: x.repeat,
    refUrl: x.refUrl || '', refUrlName: x.refUrlName || '',
    status: 'open', createdBy: x.createdBy || USER.name,
    createdByEmail: x.createdByEmail || '',
    createdAt: new Date().toISOString(), completedBy: '', completedAt: '',
    repeatOf: x.id
  });
}

/* Хэн хянаж, үнэлгээ өгөх эрхтэй вэ */
function canReviewTask(t) {
  if (isAdmin()) return true;
  if (!isDeptHead()) return false;
  if (t && t.createdByEmail && SESSION && t.createdByEmail === SESSION.email) return true;
  var d = (SESSION && SESSION.dept) || '';
  return !!d && !!t && (t.dept === d || t.dept === 'all');
}

function empTaskStats(e) {
  var assigned = (DB.tasks || []).filter(function (t) {
    var ids = (t.empIds && t.empIds.length) ? t.empIds : (t.empId ? [t.empId] : []);
    return ids.indexOf(e.id) > -1; // зөвхөн нэрлэн оногдуулсан даалгавар
  });
  var done = 0, pending = 0, returned = 0, scoreSum = 0;
  assigned.forEach(function (t) {
    scoreSum += taskScoreOf(t);
    if (taskIsClosed(t)) done++;
    else if (t.status === 'submitted') pending++;
    else if (t.status === 'returned') returned++;
  });
  return { total: assigned.length, done: done, pending: pending, returned: returned, scoreSum: scoreSum };
}

/* ---- Даалгавар: албанд (эсвэл бүх албанд) өгсөн даалгаврын дүн — албаны мөрөнд ---- */
function deptTaskStats(dept) {
  var assigned = (DB.tasks || []).filter(function (t) {
    var ids = (t.empIds && t.empIds.length) ? t.empIds : (t.empId ? [t.empId] : []);
    if (ids.length) return false; // нэрлэсэн даалгавар албанд тооцогдохгүй
    return t.dept === 'all' || t.dept === dept;
  });
  var done = 0, scoreSum = 0;
  assigned.forEach(function (t) { scoreSum += taskScoreOf(t); if (taskIsClosed(t)) done++; });
  return { total: assigned.length, done: done, scoreSum: scoreSum };
}

/* ---- Гадны сургалтын туслах функцүүд ---- */
function getExtAtt(extId, empId) {
  return ((DB.extAttendance || {})[extId + '_' + empId]) || { status: '' };
}
var EXT_STATUS = {
  '':        { label: '—',        color: '#CBD5E1', bg: '#F8FAFC' },
  planned:   { label: 'Товлосон', color: '#6366F1', bg: '#EEF2FF' },
  attended:  { label: 'Суусан',   color: '#16A34A', bg: '#DCFCE7' },
  absent:    { label: 'Тасалсан', color: '#DC2626', bg: '#FEE2E2' },
  excused:   { label: 'Чөлөөтэй',color: '#D97706', bg: '#FEF3C7' }
};
var EXT_STATUS_CYCLE = ['', 'planned', 'attended', 'absent', 'excused'];

function renderEmployees() {
  var wrap = $('#empTableWrap');
  if (!wrap) return;
  // Видео сургалтын (LMS) явцыг нэг удаа ачаалаад дахин зурна
  if (!DEMO && fbReady && !LMS.loaded && !LMS.loading) {
    LMS.loading = true;
    loadLmsData().then(function () { LMS.loading = false; try { renderEmployees(); renderKpiPage(); renderDashboard(); if (charts.radar) renderCharts(); } catch (e) {} });
  }
  var list = filteredEmployees();
  var total = list.length;
  var extTrainings = DB.extTrainings || [];
  var intKeys = Object.keys(TRAINING_MODULES);
  var totalCols = 3 + intKeys.length + (extTrainings.length || 1) + 1 + 3 + 2;

  // --- thead ---
  var intColspan = intKeys.length;
  var extColspan = extTrainings.length || 1;
  var intHeadCells = intKeys.map(function (k) {
    var label = TRAINING_MODULES[k];
    var short = label.length > 12 ? label.slice(0, 10) + '…' : label;
    return '<th style="font-size:10px;font-weight:600;color:#1D4ED8;white-space:nowrap;padding:5px 8px;min-width:64px" title="' + esc(label) + '">' + esc(short) + '</th>';
  }).join('');
  var extHeadCells = extTrainings.length
    ? extTrainings.map(function (t) {
        var del = (isAdmin() || isDeptHead()) ? ' <button class="icon-btn-sm" style="font-size:9px;opacity:.5;vertical-align:middle" data-del-ext="' + esc(t.id) + '" title="Устгах">✕</button>' : '';
        return '<th style="font-size:10px;font-weight:600;color:#166534;white-space:nowrap;padding:5px 8px;min-width:70px">' + esc(t.name) + (t.date ? '<br><span style="font-weight:400;color:#64748B">' + esc(t.date) + '</span>' : '') + del + '</th>';
      }).join('')
    : '<th style="font-size:11px;color:#94A3B8;font-weight:400;padding:5px 8px">—</th>';

  var thead = '<thead>' +
    '<tr>' +
    '<th style="width:28px"></th>' +
    '<th>Ажилтан</th>' +
    '<th>Алба</th>' +
    '<th colspan="' + intColspan + '" style="background:#EFF6FF;color:#1D4ED8;text-align:center;font-size:11px;padding:6px 8px">Дотоод сургалт</th>' +
    '<th colspan="' + extColspan + '" style="background:#F0FDF4;color:#166534;text-align:center;font-size:11px;padding:6px 8px">Гадны сургалт</th>' +
    '<th style="background:#FFF7ED;color:#C2410C;text-align:center;font-size:11px;padding:6px 8px">Видео сургалт</th>' +
    '<th colspan="3" style="background:#FDF4FF;color:#A21CAF;text-align:center;font-size:11px;padding:6px 8px">Оролцоо ба бусад</th>' +
    '<th style="white-space:nowrap">Нийт KPI</th>' +
    '<th></th>' +
    '</tr>' +
    '<tr>' +
    '<th></th><th></th><th></th>' +
    intHeadCells + extHeadCells +
    '<th style="font-size:10px;font-weight:600;color:#C2410C;text-align:center;white-space:nowrap;padding:5px 8px;min-width:90px" title="Үзсэн ба тэнцсэн сургалтын тоо / нийт оногдсон">Үзсэн · Тэнцсэн</th>' +
    '<th style="font-size:10px;font-weight:600;color:#A21CAF;text-align:center;white-space:nowrap;padding:5px 8px;min-width:78px" title="Баталгаажсан аюул/near-miss мэдээлэл ба олсон бонус оноо">Аюул/NM</th>' +
    '<th style="font-size:10px;font-weight:600;color:#A21CAF;text-align:center;white-space:nowrap;padding:5px 8px;min-width:88px" title="Албаны ХХХ мөрдөлт ба анхны тусламжийн хайрцгийн бүрдэл">ХХХ · Тусламж</th>' +
    '<th style="font-size:10px;font-weight:600;color:#A21CAF;text-align:center;white-space:nowrap;padding:5px 8px;min-width:70px" title="Биелүүлсэн / оногдсон даалгавар">Даалгавар</th>' +
    '<th></th><th></th>' +
    '</tr>' +
    '</thead>';

  // --- employee row ---
  function empIntCells(e) {
    return intKeys.map(function (k) {
      var prog = getEmpProg(e.id, k);
      // Шалгалт өгсөн бол — оноог шууд харуулна (тэнцсэн=ногоон, тэнцээгүй=улаан)
      if (prog.examTaken) {
        var sc = Math.round(prog.examScore || 0);
        var col = prog.examPassed ? '#16A34A' : '#DC2626';
        var mk = prog.examPassed ? '✓' : '✗';
        return '<td style="text-align:center" title="Шалгалт: ' + sc + '% · ' + (prog.examPassed ? 'тэнцсэн' : 'тэнцээгүй') + '"><span style="color:' + col + ';font-size:12px;font-weight:800">' + mk + sc + '</span></td>';
      }
      var vis = isModTrainingVisible(e, k);
      var examOpen = !!(e.dept && getModRel(k, e.dept).examForceUnlocked);
      if (!vis && !examOpen) return '<td style="text-align:center;color:#E2E8F0">—</td>';
      if (prog.trainingCompleted) return '<td style="text-align:center" title="Сургалт дуусгасан · шалгалт өгөөгүй"><span style="color:#16A34A;font-size:15px">✓</span></td>';
      if (prog.trainingStarted)   return '<td style="text-align:center" title="Эхэлсэн"><span style="color:#F59E0B;font-size:13px">⌛</span></td>';
      if (examOpen)               return '<td style="text-align:center" title="Шалгалт нээлттэй · өгөөгүй"><span style="color:#6366F1;font-size:12px;font-weight:700">◔</span></td>';
      return '<td style="text-align:center" title="Эхлээгүй"><span style="color:#CBD5E1;font-size:13px">○</span></td>';
    }).join('');
  }
  function empExtCells(e) {
    if (!extTrainings.length) return '<td style="text-align:center;color:#94A3B8;font-size:11px">—</td>';
    return extTrainings.map(function (t) {
      var att = getExtAtt(t.id, e.id);
      var s = EXT_STATUS[att.status] || EXT_STATUS[''];
      var canEdit = isAdmin() || isDeptHead();
      var cursor = canEdit ? 'cursor:pointer' : '';
      var attr = canEdit ? 'data-ext-toggle="' + esc(t.id) + '_' + esc(e.id) + '"' : '';
      return '<td style="text-align:center"><span class="tag" style="font-size:10px;padding:2px 7px;background:' + s.bg + ';color:' + s.color + ';border-radius:20px;' + cursor + '" ' + attr + '>' + s.label + '</span></td>';
    }).join('');
  }
  function empVideoCell(e) {
    if (DEMO || !fbReady) return '<td style="text-align:center;color:#CBD5E1">—</td>';
    if (!LMS.loaded) return '<td style="text-align:center;color:#CBD5E1;font-size:11px" title="Ачаалж байна...">…</td>';
    var s = empLmsStats(e);
    if (!s.total) return '<td style="text-align:center;color:#94A3B8;font-size:11px" title="Сургалт оногдоогүй">—</td>';
    var vCol = s.viewed === s.total ? '#1D4ED8' : s.viewed > 0 ? '#1D4ED8' : '#94A3B8';
    var pCol = s.passed === s.total ? '#16A34A' : s.passed > 0 ? '#D97706' : '#DC2626';
    return '<td style="text-align:center;padding:6px 8px">' +
      '<div data-vt-detail="' + esc(e.id) + '" style="cursor:pointer;display:inline-flex;flex-direction:column;gap:3px;align-items:stretch;min-width:70px" title="Дэлгэрэнгүй харах — дарна уу">' +
      '<span style="font-size:11px;font-weight:700;color:' + vCol + ';background:#EFF6FF;border-radius:6px;padding:2px 8px;white-space:nowrap">▶ ' + s.viewed + '/' + s.total + ' үзсэн</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + pCol + ';background:' + (s.passed === s.total ? '#DCFCE7' : '#FEF3C7') + ';border-radius:6px;padding:2px 8px;white-space:nowrap">✓ ' + s.passed + '/' + s.total + ' тэнцсэн</span>' +
      '</div></td>';
  }
  // Аюул/Near-miss мэдээлэл — баталгаажсан тоо + бонус оноо
  function empReportCell(e) {
    var r = empReportStats(e);
    if (!r.verified && !r.pending && !r.points) return '<td style="text-align:center;color:#CBD5E1;font-size:11px">—</td>';
    return '<td style="text-align:center;padding:6px 8px">' +
      '<div style="font-size:13px;font-weight:700;color:#A21CAF">' + r.verified + '<span style="font-size:10px;font-weight:500;color:#94A3B8"> мэдээлэл</span></div>' +
      (r.points ? '<div style="font-size:11px;font-weight:600;color:#16A34A">+' + r.points + ' бонус</div>' : '') +
      (r.pending ? '<div style="font-size:10px;color:#D97706">' + r.pending + ' хүлээгдэж буй</div>' : '') +
      '</div></td>';
  }
  // ХХХ (PPE) ба анхны тусламж — албаны түвшний оноо
  function empSafetyCell(e) {
    var ppe = deptPpe(e.dept), fa = deptFirstAid(e.dept);
    if (ppe == null && fa == null) return '<td style="text-align:center;color:#CBD5E1;font-size:11px">—</td>';
    function pill(lbl, v) {
      if (v == null) return '<span style="font-size:10px;color:#CBD5E1">' + lbl + ' —</span>';
      var col = v >= 90 ? '#16A34A' : v >= 70 ? '#D97706' : '#DC2626';
      return '<span style="font-size:11px;font-weight:700;color:' + col + '">' + lbl + ' ' + v + '%</span>';
    }
    return '<td style="text-align:center;padding:6px 8px"><div style="display:flex;flex-direction:column;gap:2px">' +
      pill('ХХХ', ppe) + pill('Тус', fa) + '</div></td>';
  }
  // Даалгавар — биелүүлсэн / оногдсон
  function empTaskCell(e) {
    var t = empTaskStats(e);
    if (!t.total) return '<td style="text-align:center;color:#CBD5E1;font-size:11px">—</td>';
    var col = t.done === t.total ? '#16A34A' : t.done > 0 ? '#D97706' : '#DC2626';
    var bg  = t.done === t.total ? '#DCFCE7' : '#FEF3C7';
    return '<td style="text-align:center"><span style="font-size:12px;font-weight:700;color:' + col + ';background:' + bg + ';border-radius:20px;padding:3px 10px;white-space:nowrap">' + t.done + '/' + t.total + '</span></td>';
  }
  function rowHTML(e) {
    var tot = empTotal(e);
    return '<tr data-emp="' + e.id + '">' +
      '<td><input type="checkbox"></td>' +
      '<td><div class="emp-cell"><div class="avatar avatar-sm">' + esc(e.initials) + '</div>' +
      '<div class="emp-info"><div class="emp-name">' + esc(e.name) +
      (e.onLeave ? ' <span class="tag tag-warn" style="font-size:10px">Чөлөөтэй</span>' : '') +
      '</div><div class="emp-role">' + esc(e.role) + '</div></div></div></td>' +
      '<td style="font-size:12px">' + esc(e.dept) + '</td>' +
      empIntCells(e) + empExtCells(e) + empVideoCell(e) +
      empReportCell(e) + empSafetyCell(e) + empTaskCell(e) +
      '<td><strong style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:15px">' + tot + '</strong></td>' +
      '<td><button class="icon-btn-sm" data-emp-menu="' + e.id + '"><i class="ti ti-dots-vertical"></i></button></td>' +
      '</tr>';
  }

  // --- dept group row ---
  function deptRow(d, members) {
    var avgT = Math.round(avg(members.map(empTotal)));
    // Дотоод сургалт дүн
    var intSummary = intKeys.map(function (k) {
      var done = members.filter(function (e) { return getEmpProg(e.id, k).trainingCompleted; }).length;
      var vis  = members.filter(function (e) { return isModTrainingVisible(e, k); }).length;
      if (!vis) return '<span style="color:#CBD5E1;font-size:11px">—</span>';
      var pct = Math.round(done / vis * 100);
      var col = pct === 100 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';
      return '<span style="color:' + col + ';font-weight:600;font-size:11px">' + done + '/' + vis + '</span>';
    }).join('<span style="color:#CBD5E1;margin:0 2px">·</span>');
    // Гадны сургалт дүн
    var extSummary = extTrainings.map(function (t) {
      var att = 0, abs = 0, exc = 0, plan = 0;
      members.forEach(function (e) {
        var s = getExtAtt(t.id, e.id).status;
        if (s === 'attended') att++;
        else if (s === 'absent') abs++;
        else if (s === 'excused') exc++;
        else if (s === 'planned') plan++;
      });
      return '<span style="font-size:11px;margin-right:8px"><span style="color:#475569;font-weight:600">' + esc(t.name) + ':</span> ' +
        (att ? '<span style="color:#16A34A">' + att + ' суусан</span> ' : '') +
        (abs ? '<span style="color:#DC2626">' + abs + ' тасалсан</span> ' : '') +
        (exc ? '<span style="color:#D97706">' + exc + ' чөлөөтэй</span> ' : '') +
        (plan ? '<span style="color:#6366F1">' + plan + ' товлосон</span>' : '') +
        '</span>';
    }).join('');
    // Видео сургалтын албаны дүн
    var vidSummary = '';
    if (LMS.loaded) {
      var vp = 0, vt = 0, vv = 0;
      members.forEach(function (e) { var vs = empLmsStats(e); vp += vs.passed; vt += vs.total; vv += vs.viewed; });
      if (vt) vidSummary = '<span style="color:#1D4ED8;font-weight:600">' + vv + '/' + vt + ' үзсэн</span> · ' +
        '<span style="font-weight:600;color:' + (vp === vt ? '#16A34A' : vp > 0 ? '#D97706' : '#DC2626') + '">' + vp + '/' + vt + ' тэнцсэн</span>';
    }
    // Аюул/Near-miss албаны дүн
    var repV = 0, repP = 0;
    members.forEach(function (e) { var rs = empReportStats(e); repV += rs.verified; repP += rs.points; });
    var repSummary = (repV || repP) ? '<span style="font-weight:600;color:#A21CAF">' + repV + ' мэдээлэл</span>' + (repP ? ' · <span style="color:#16A34A;font-weight:600">+' + repP + ' бонус</span>' : '') : '';
    // ХХХ/Тусламж (албаны түвшин)
    var dPpe = deptPpe(d), dFa = deptFirstAid(d);
    var safeSummary = (dPpe != null || dFa != null)
      ? (dPpe != null ? 'ХХХ ' + dPpe + '%' : 'ХХХ —') + ' · ' + (dFa != null ? 'Тус ' + dFa + '%' : 'Тус —') : '';
    // Албаны даалгавар
    var dts = deptTaskStats(d);
    var taskSummary = dts.total ? '<span style="font-weight:600;color:' + (dts.done === dts.total ? '#16A34A' : '#D97706') + '">' + dts.done + '/' + dts.total + ' биелсэн</span>' : '';
    return '<tr class="dept-group-row"><td colspan="' + totalCols + '" style="background:#F0FDF4;padding:10px 14px;border-top:2px solid #BBF7D0">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span style="font-weight:700;color:#065F46"><i class="ti ti-building" style="margin-right:5px"></i>' + esc(d) + '</span>' +
      '<span style="color:#16A34A;font-size:12px">' + members.length + ' ажилтан · KPI ' + avgT + '</span>' +
      (intSummary ? '<span style="font-size:11px;color:#475569;margin-left:6px"><span style="color:#1D4ED8;font-weight:600">Дотоод:</span> ' + intSummary + '</span>' : '') +
      (extSummary ? '<span style="font-size:11px;color:#475569"><span style="color:#166534;font-weight:600">Гадны:</span> ' + extSummary + '</span>' : '') +
      (vidSummary ? '<span style="font-size:11px;color:#475569"><span style="color:#C2410C;font-weight:600">Видео:</span> ' + vidSummary + '</span>' : '') +
      (repSummary ? '<span style="font-size:11px;color:#475569"><span style="color:#A21CAF;font-weight:600">Аюул/NM:</span> ' + repSummary + '</span>' : '') +
      (safeSummary ? '<span style="font-size:11px;color:#475569"><span style="color:#A21CAF;font-weight:600">ХХХ/Тус:</span> ' + safeSummary + '</span>' : '') +
      (taskSummary ? '<span style="font-size:11px;color:#475569"><span style="color:#A21CAF;font-weight:600">Албаны даалгавар:</span> ' + taskSummary + '</span>' : '') +
      '</div></td></tr>';
  }

  // --- Render ---
  var groups = {};
  list.forEach(function (e) { var d = e.dept || 'Тодорхойгүй'; (groups[d] = groups[d] || []).push(e); });
  var deptNames = Object.keys(groups).sort(function (a, b) { return deptScore(b) - deptScore(a); });

  var tbodyHtml = !total
    ? '<tr><td colspan="' + totalCols + '"><div class="empty-state"><i class="ti ti-search-off"></i><div>Илэрц олдсонгүй</div></div></td></tr>'
    : deptNames.map(function (d) {
        return deptRow(d, groups[d]) + groups[d].map(rowHTML).join('');
      }).join('');

  wrap.innerHTML = '<table class="data-table" style="min-width:700px">' + thead +
    '<tbody id="empTableBody">' + tbodyHtml + '</tbody></table>';

  // footer
  var fi = $('#empFooterInfo');
  if (fi) fi.innerHTML = total + ' ажилтан · ' + deptNames.length + ' алба' + (isDeptHead() && SESSION && SESSION.dept ? ' · <span style="color:#8B5CF6;font-weight:600">' + esc(SESSION.dept) + '</span>' : '');

  var psub = $('.page[data-page="employees"] .page-subtitle');
  if (psub) {
    if (isDeptHead() && SESSION && SESSION.dept) psub.textContent = esc(SESSION.dept) + ' · ' + total + ' ажилтан';
    else if (isAdmin()) psub.textContent = 'Нийт ' + total + ' ажилтан';
  }

  setStat('.page[data-page="employees"] .stat-strip', 0, DB.employees.length);
  setStat('.page[data-page="employees"] .stat-strip', 1, DB.employees.filter(function (e) { return !e.onLeave; }).length);
  setStat('.page[data-page="employees"] .stat-strip', 2, DB.employees.filter(function (e) { return e.onLeave; }).length);
  setStat('.page[data-page="employees"] .stat-strip', 3, avgKpi().toFixed(1));
  setStat('.page[data-page="employees"] .stat-strip', 4, DB.employees.filter(function (e) { return empTotal(e) < 75; }).length);
}

/* ---- Гадны сургалт нэмэх/устгах ---- */
function openAddExtTrainingModal() {
  var body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding:4px 0';
  body.innerHTML =
    '<div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:5px">Сургалтын нэр *</label>' +
    '<input id="extTName" class="form-control" placeholder="жишээ: Галын аюулгүй байдал" style="width:100%"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:5px">Огноо</label>' +
    '<input id="extTDate" class="form-control" placeholder="2026-07" style="width:100%"></div>' +
    '<div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:5px">Зохион байгуулагч</label>' +
    '<input id="extTOrg" class="form-control" placeholder="ОБЕГ, ХАСХОМ..." style="width:100%"></div>' +
    '</div>';
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px';
  footer.innerHTML = '<button class="btn btn-secondary" id="extTCancel">Болих</button>' +
    '<button class="btn btn-primary" id="extTSave"><i class="ti ti-plus"></i> Нэмэх</button>';
  var wrap = document.createElement('div');
  wrap.appendChild(body); wrap.appendChild(footer);
  buildModal('Гадны сургалт нэмэх', wrap, { width: '440px' });
  document.getElementById('extTCancel').onclick = function () { closeModal(); };
  document.getElementById('extTSave').onclick = function () {
    var name = (document.getElementById('extTName').value || '').trim();
    if (!name) { toast('Сургалтын нэр оруулна уу', 'warn'); return; }
    DB.extTrainings = DB.extTrainings || [];
    DB.extTrainings.push({ id: 'ext_' + Date.now(), name: name, date: (document.getElementById('extTDate').value || '').trim(), org: (document.getElementById('extTOrg').value || '').trim() });
    saveDB();
    closeModal();
    renderEmployees();
    toast('Гадны сургалт нэмэгдлээ', 'success');
  };
}

/* Ажилтны видео сургалтын дэлгэрэнгүй цонх */
function openEmpVideoDetail(empId) {
  var emp = (DB.employees || []).filter(function (e) { return e.id === empId; })[0];
  if (!emp) return;
  var s = empLmsStats(emp);
  var node = elc('div');
  if (!s.total) {
    node.innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-school-off"></i><div>Энэ ажилтанд видео сургалт оногдоогүй байна.</div></div>';
  } else {
    var rows = s.invited.map(function (t) {
      var p = s.progs[t.id];
      var st = (p && p.status) || 'not_viewed';
      var watchPct = p && p.watchProgress != null ? Math.round(p.watchProgress * 100) : 0;
      var score = p && p.score != null ? p.score : null;
      var badge;
      if (st === 'passed')          badge = '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">✓ Тэнцсэн' + (score != null ? ' · ' + score + '%' : '') + '</span>';
      else if (st === 'in_progress') badge = '<span style="background:#EFF6FF;color:#1D4ED8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">' + watchPct + '% үзсэн</span>';
      else if (st === 'failed')      badge = '<span style="background:#FEE2E2;color:#DC2626;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">Тэнцээгүй' + (score != null ? ' · ' + score + '%' : '') + '</span>';
      else                           badge = '<span style="background:#F1F5F9;color:#94A3B8;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;white-space:nowrap">Үзээгүй</span>';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F1F5F9">' +
        '<div style="width:30px;height:30px;border-radius:8px;background:#FFF7ED;color:#C2410C;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-player-play"></i></div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#1E293B">' + esc(t.title || '') + '</div>' +
        '<div style="font-size:11px;color:#94A3B8">' + (t.duration ? t.duration + 'мин · ' : '') + 'Тэнцэх: ' + (t.passingScore || 70) + '%' +
        '<span style="margin-left:8px">Үзэлт: ' + watchPct + '%</span></div>' +
        '<div style="height:4px;background:#E2E8F0;border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:' + watchPct + '%;background:' + (st === 'passed' ? '#16A34A' : '#1D4ED8') + ';border-radius:4px"></div></div></div>' +
        badge + '</div>';
    }).join('');
    node.innerHTML =
      '<div style="display:flex;gap:10px;margin-bottom:14px">' +
      '<div style="flex:1;text-align:center;background:#F8FAFC;border-radius:10px;padding:10px"><div style="font-size:20px;font-weight:800;color:#1E293B">' + s.total + '</div><div style="font-size:11px;color:#64748B">Оногдсон</div></div>' +
      '<div style="flex:1;text-align:center;background:#EFF6FF;border-radius:10px;padding:10px"><div style="font-size:20px;font-weight:800;color:#1D4ED8">' + s.viewed + '</div><div style="font-size:11px;color:#1E40AF">Үзсэн</div></div>' +
      '<div style="flex:1;text-align:center;background:#DCFCE7;border-radius:10px;padding:10px"><div style="font-size:20px;font-weight:800;color:#16A34A">' + s.passed + '</div><div style="font-size:11px;color:#166534">Тэнцсэн</div></div>' +
      '<div style="flex:1;text-align:center;background:#FEF3C7;border-radius:10px;padding:10px"><div style="font-size:20px;font-weight:800;color:#D97706">' + (s.total - s.passed) + '</div><div style="font-size:11px;color:#92400E">Дутуу</div></div>' +
      '</div>' +
      '<div style="border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;max-height:380px;overflow-y:auto">' + rows + '</div>';
  }
  buildModal('Видео сургалт — ' + esc(emp.name), node, { width: '600px' });
}

function wireEmployeesPage() {
  var page = $('.page[data-page="employees"]');
  if (!page || page._empWired) return;
  page._empWired = true;

  // Гадны сургалт нэмэх товч
  var addBtn = document.getElementById('addExtTrainingBtn');
  if (addBtn) addBtn.addEventListener('click', openAddExtTrainingModal);

  // Attendance toggle + ext delete (event delegation on page)
  page.addEventListener('click', function (ev) {
    // Видео сургалтын дэлгэрэнгүй
    var vtEl = ev.target.closest('[data-vt-detail]');
    if (vtEl) { openEmpVideoDetail(vtEl.getAttribute('data-vt-detail')); return; }
    // Attendance toggle
    var toggleEl = ev.target.closest('[data-ext-toggle]');
    if (toggleEl) {
      var key = toggleEl.getAttribute('data-ext-toggle');
      DB.extAttendance = DB.extAttendance || {};
      var cur = (DB.extAttendance[key] || {}).status || '';
      var idx = EXT_STATUS_CYCLE.indexOf(cur);
      var next = EXT_STATUS_CYCLE[(idx + 1) % EXT_STATUS_CYCLE.length];
      DB.extAttendance[key] = { status: next };
      saveDB();
      renderEmployees();
      return;
    }
    // Delete external training
    var delEl = ev.target.closest('[data-del-ext]');
    if (delEl) {
      var extId = delEl.getAttribute('data-del-ext');
      if (!confirm('Энэ гадны сургалтыг устгах уу? Бүх ажилтны бүртгэл арилна.')) return;
      DB.extTrainings = (DB.extTrainings || []).filter(function (t) { return t.id !== extId; });
      Object.keys(DB.extAttendance || {}).forEach(function (k) { if (k.indexOf(extId + '_') === 0) delete DB.extAttendance[k]; });
      saveDB();
      renderEmployees();
      toast('Устгагдлаа', 'success');
    }
  });
}

/* ============ KPI хуудас (шинэ арга зүй: суурь + нэмэгдэх бонус) ============ */
var KPI_BASE_META = [
  { key: 'bosgo', label: 'Босго оноо', icon: 'ti-shield-check', color: ['#E0E7FF', '#3730A3'], desc: 'Осол/зөрчилгүй ажилласан бол автоматаар бүтэн; буруутай холбогдвол хасагдана', fn: kpiBosgo },
  { key: 'davtan', label: 'Давтан + шалгалт', icon: 'ti-refresh', color: ['#D1FAE5', '#065F46'], desc: 'Давтантай сард: суусан 1/3 + шалгалтын дүн 2/3. Давтангүй сард жин нь видео руу шилжинэ', fn: kpiDavtan },
  { key: 'video', label: 'Видео сургалт (LMS)', icon: 'ti-player-play', color: ['#FFEDD5', '#9A3412'], desc: 'Оногдсон видео сургалтаас тэнцсэн хувь (давтангүй сард жин 0.45 болно)', fn: kpiVideo },
  { key: 'task', label: 'Даалгаврын биелэлт', icon: 'ti-checkbox', color: ['#DBEAFE', '#1E40AF'], desc: 'Ажилтанд оногдсон даалгаврын биелэлт', fn: kpiTask }
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
  if (sub) sub.textContent = 'Цалингийн сар (25→24) · Босго + давтан/видео + даалгавар + бонус';

  // page-actions товчнуудыг утга оноох
  var editBtn = $('.page[data-page="kpi"] .page-actions .btn-primary');
  if (editBtn) { editBtn.innerHTML = '<i class="ti ti-adjustments"></i> Жин тохируулах'; editBtn.onclick = function () { switchPage('settings'); }; }
  var infoBtn = $('.page[data-page="kpi"] .page-actions .btn-secondary');
  if (infoBtn) { infoBtn.innerHTML = '<i class="ti ti-info-circle"></i> Арга зүй'; infoBtn.onclick = function () { infoModal('Үнэлгээний арга зүй', kpiMethodologyHtml(), '560px'); }; }

  // Динамик томьёо
  var fr = $('.page[data-page="kpi"] .formula');
  if (fr) {
    var terms = [['f-blue', 'Босго', (w.bosgo / 100).toFixed(2)], ['f-teal', 'Давтан+шалгалт', (w.davtan / 100).toFixed(2) + '*'],
      ['f-amber', 'Видео', (w.video / 100).toFixed(2) + '~' + ((w.video + w.davtan) / 100).toFixed(2)],
      ['f-emerald', 'Даалгавар', (w.task / 100).toFixed(2)]];
    fr.innerHTML = '<span>Суурь =</span>' + terms.map(function (t, i) {
      return (i ? '<span>+</span>' : '') + '<span class="f-term ' + t[0] + '">' + t[1] + ' × <strong>' + t[2] + '</strong></span>';
    }).join('') + '<span style="margin:0 6px;font-weight:700">+</span><span class="f-term f-coral">Аюул/NM бонус (нэмэгдэнэ ↑)</span>' +
      '<span style="margin-left:8px;font-size:12px;color:#64748B;font-weight:600">* давтангүй сард жин нь видео руу шилжинэ · дүн 100-аас хэтрэхгүй</span>';
  }

  var grid = $('.page[data-page="kpi"] .kpi-cat-grid');
  if (!grid) return;
  var html = '';

  // — 4 суурь үзүүлэлт —
  KPI_BASE_META.forEach(function (m) {
    var v = _avgFactor(m.fn);
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
    '<div><h3>Албадын оноо</h3><p>Оноо = ажилтнуудын KPI дундаж · баруун талд албаны дэлгэрэнгүй үзүүлэлт</p></div></div>' +
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
    '<p><strong>Зарчим:</strong> Энэ систем ажилтан <strong>идэвхтэй оролцож байгааг</strong> хэмжинэ. <strong>Урьдчилсан ба анхан шатны зааварчилгаа KPI-д ОРОХГҮЙ</strong> (нэг удаагийн шинэ ажилтны танилцуулга тул). Бонус зөвхөн <strong>нэмэгдэнэ</strong>, хэзээ ч хасагдахгүй.</p>' +
    '<p style="margin-top:10px"><strong>Тооцооны хугацаа:</strong> Цалингийн сараар — өмнөх сарын <strong>25</strong>-наас энэ сарын <strong>24</strong> хүртэл.</p>' +
    '<p style="margin-top:10px"><strong>Хувь хүний оноо</strong> = <u>Суурь оноо</u> (Босго ' + c.weights.bosgo + '% + Давтан+шалгалт ' + c.weights.davtan + '% + Видео ' + c.weights.video + '% + Даалгавар ' + c.weights.task + '%) <strong>дээр Аюул/NM бонус нэмэгдэнэ</strong> (дээд тал нь +' + c.weights.bonus + ', 100-аас хэтрэхгүй). Оногдоогүй үзүүлэлт байвал үлдсэн үзүүлэлтээр дахин жинлэнэ.</p>' +
    '<p style="margin-top:10px"><strong>Босго оноо:</strong> Осол/зөрчилгүй ажилласан бол автоматаар бүтэн олгогдоно. Өөрийн буруутайгаас осол/зөрчилд холбогдвол бүртгэсэн оноогоор хасагдана (Ажилтнууд → ажилтны дэлгэрэнгүйгээс админ бүртгэнэ).</p>' +
    '<p style="margin-top:10px"><strong>Давтан + шалгалт:</strong> Тухайн албанд энэ цалингийн сард давтан зааварчилгаа товлогдсон бол л тооцогдоно (дотроо: суусан 1/3, шалгалтын дүн 2/3). Давтангүй сард энэ жин <strong>видео сургалт руу автоматаар шилжиж</strong>, видео ' + c.weights.video + '% → ' + (c.weights.video + c.weights.davtan) + '% болно. Аль алба давтантайг Тохиргооноос сар бүр тэмдэглэнэ.</p>' +
    '<p style="margin-top:10px"><strong>Бонус</strong> зөвхөн ХАБ ажилтан <strong>баталгаажуулсны дараа</strong> тооцогдоно. Аюул +' + c.bonus.hazard + '. Near-miss эрсдэлээр: бага ' + c.bonus.nearMiss.low + ', дунд ' + c.bonus.nearMiss.mid + ', өндөр ' + c.bonus.nearMiss.high + '. Нэг хүн сард дээд тал нь ' + c.bonus.monthlyCap + ' мэдээллээр бонус авна (тоо биш чанарыг урамшуулна).</p>' +
    '<p style="margin-top:10px"><strong>Албаны KPI</strong> = тухайн албаны ажилтнуудын KPI-ийн дундаж. ХХХ мөрдөлт, анхны тусламжийн хайрцаг, coverage зэрэг албаны түвшний үзүүлэлтийг дэлгэрэнгүйд тусдаа харуулна.</p>' +
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
/* ============ Эрсдэлийн үнэлгээ — HTML дашбоард байршуулалт ============ */
var RISK_COL = 'kpi_risk_dashboards';

function loadRiskDashboard(dept, cb) {
  if (DEMO) {
    try { cb(JSON.parse(localStorage.getItem('rdash_' + dept) || 'null')); } catch (e) { cb(null); }
    return;
  }
  if (!fbReady || !fdb) { cb(null); return; }
  fdb.collection(RISK_COL).doc(dept).get()
    .then(function (snap) {
      if (!snap.exists) { cb(null); return; }
      var d = snap.data();
      // Storage-т хадгалсан файл бол URL-ээс HTML татна
      if (d.htmlUrl) {
        // URL байгаа бол HTML татахгүй — харах үед л татна (CORS асуудлаас зайлсхийх)
        cb({ dept: dept, htmlUrl: d.htmlUrl, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy });
      } else if (d.html) {
        cb(d);
      } else {
        cb(null);
      }
    })
    .catch(function () { cb(null); });
}

function saveRiskDashboard(dept, html, cb) {
  if (DEMO) {
    var data = { dept: dept, html: html, uploadedBy: (SESSION && SESSION.email) || 'admin', uploadedAt: new Date().toISOString() };
    try { localStorage.setItem('rdash_' + dept, JSON.stringify(data)); cb(true); } catch (e) { cb(false); }
    return;
  }
  if (!fbReady || !fdb) { cb(false); return; }
  var R2W = 'https://monos-upload.buynt666.workers.dev';
  var R2K = 'monos2026';
  var fname = 'rdash_' + Date.now() + '_' + dept.replace(/[^a-zA-Z0-9]/g, '_') + '.html';
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var xhr = new XMLHttpRequest();
  xhr.open('PUT', R2W + '/' + fname);
  xhr.setRequestHeader('X-Key', R2K);
  xhr.setRequestHeader('Content-Type', 'text/html;charset=utf-8');
  xhr.onload = function () {
    var meta = { dept: dept, uploadedBy: (SESSION && SESSION.email) || 'admin', uploadedAt: new Date().toISOString() };
    if (xhr.status === 200) {
      try { meta.htmlUrl = JSON.parse(xhr.responseText).url; } catch (e) { meta.htmlUrl = R2W + '/' + fname; }
    } else {
      meta.html = html;
    }
    fdb.collection(RISK_COL).doc(dept).set(meta)
      .then(function () { cb(true); }).catch(function () { cb(false); });
  };
  xhr.onerror = function () {
    var meta = { dept: dept, html: html, uploadedBy: (SESSION && SESSION.email) || 'admin', uploadedAt: new Date().toISOString() };
    fdb.collection(RISK_COL).doc(dept).set(meta)
      .then(function () { cb(true); }).catch(function () { cb(false); });
  };
  xhr.send(blob);
}

function deleteRiskDashboard(dept, cb) {
  if (DEMO) { localStorage.removeItem('rdash_' + dept); cb(true); return; }
  if (!fbReady || !fdb) { cb(false); return; }
  fdb.collection(RISK_COL).doc(dept).delete()
    .then(function () { cb(true); }).catch(function () { cb(false); });
}

function renderHazards() {
  var sec = $$('.page[data-page="hazards"]')[0]; if (!sec) return;
  sec.style.padding = '0';
  if (isAdmin() || isDeptHead()) {
    renderRiskAdmin(sec);
  } else {
    var e = myEmp();
    var dept = (SESSION && SESSION.dept) || (e && e.dept) || '';
    renderRiskDept(sec, dept);
  }
}

function renderRiskAdmin(sec) {
  var depts = deptList();
  var html = '<div style="padding:24px 28px 0">' +
    '<h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 4px">Эрсдэлийн үнэлгээ</h1>' +
    '<p style="font-size:13px;color:#64748B;margin:0 0 20px">Алба бүрд интерактив эрсдэлийн үнэлгээний дашбоард HTML файл байршуулна. Ажилтнууд өөрийн албаны дашбоардыг автоматаар харна.</p></div>' +
    '<div style="padding:0 28px 28px" id="riskAdminCards">' +
    depts.map(function (d) {
      var key = d.replace(/[\s\/]+/g, '_');
      return '<div class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:10px" data-risk-dept="' + esc(d) + '">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:#EFF6FF;color:#1D4ED8;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-building" style="font-size:20px"></i></div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">' + esc(d) + '</div>' +
        '<div style="font-size:12px;color:#94A3B8;margin-top:2px" id="riskSt_' + key + '"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Уншиж байна...</div></div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0">' +
        '<label class="btn btn-primary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">' +
        '<input type="file" accept=".html,text/html" style="display:none" data-risk-upload="' + esc(d) + '">' +
        '<i class="ti ti-upload"></i> Байршуулах</label>' +
        '<button class="btn btn-sm" data-risk-view="' + esc(d) + '" style="display:none"><i class="ti ti-eye"></i> Харах</button>' +
        '<button class="btn btn-sm" data-risk-del="' + esc(d) + '" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA;display:none"><i class="ti ti-trash"></i></button>' +
        '</div></div>';
    }).join('') + '</div>';
  sec.innerHTML = html;

  // Алба бүрийн статусыг ачаалах
  depts.forEach(function (d) {
    var key = d.replace(/[\s\/]+/g, '_');
    loadRiskDashboard(d, function (data) {
      var stEl = document.getElementById('riskSt_' + key);
      var card = sec.querySelector('[data-risk-dept="' + d + '"]');
      if (!card) return;
      var viewBtn = card.querySelector('[data-risk-view]');
      var delBtn = card.querySelector('[data-risk-del]');
      if (data && (data.html || data.htmlUrl)) {
        var dt = data.uploadedAt ? new Date(data.uploadedAt).toLocaleDateString('mn-MN') : '';
        if (stEl) stEl.innerHTML = '<span style="color:#16A34A"><i class="ti ti-circle-check"></i> Байршуулсан' + (dt ? ' · ' + dt : '') + '</span>';
        if (viewBtn) viewBtn.style.display = '';
        if (delBtn) delBtn.style.display = '';
      } else {
        if (stEl) stEl.innerHTML = '<span style="color:#94A3B8">Дашбоард байршуулаагүй</span>';
      }
    });
  });

  // Файл upload + харах + устгах event
  if (sec._riskWired) return;
  sec._riskWired = true;
  sec.addEventListener('change', function (ev) {
    var inp = ev.target.closest('[data-risk-upload]');
    if (!inp || !inp.files || !inp.files[0]) return;
    var dept = inp.getAttribute('data-risk-upload');
    var file = inp.files[0];
    inp.value = '';
    if (file.size > 10000000) { toast('Файл хэт том (10MB дээд хязгаар)', 'warn'); return; }
    var rd = new FileReader();
    rd.onload = function (e) {
      var html = e.target.result;
      toast(esc(dept) + ' — байршуулж байна...', 'info');
      saveRiskDashboard(dept, html, function (ok) {
        if (ok) {
          toast(esc(dept) + ' — дашбоард амжилттай байршлаа', 'success');
          var key2 = dept.replace(/[\s\/]+/g, '_');
          var stEl2 = document.getElementById('riskSt_' + key2);
          var card2 = sec.querySelector('[data-risk-dept="' + dept + '"]');
          if (stEl2) stEl2.innerHTML = '<span style="color:#16A34A"><i class="ti ti-circle-check"></i> Байршуулсан · ' + new Date().toLocaleDateString('mn-MN') + '</span>';
          if (card2) {
            var vb2 = card2.querySelector('[data-risk-view]');
            var db2 = card2.querySelector('[data-risk-del]');
            if (vb2) vb2.style.display = '';
            if (db2) db2.style.display = '';
          }
        } else { toast('Хадгалахад алдаа гарлаа', 'error'); }
      });
    };
    rd.onerror = function () { toast('Файл уншихад алдаа гарлаа', 'error'); };
    rd.readAsText(file, 'UTF-8');
  });
  sec.addEventListener('click', function (ev) {
    var vb = ev.target.closest('[data-risk-view]');
    if (vb) {
      var dept = vb.getAttribute('data-risk-view');
      loadRiskDashboard(dept, function (data) {
        if (!data) { toast('Дашбоард олдсонгүй', 'warn'); return; }
        if (data.html) { openRiskPreviewModal(dept, data.html); return; }
        if (data.htmlUrl) {
          openRiskPreviewModal(dept, data.htmlUrl, true);
          return;
        }
        toast('Дашбоард олдсонгүй', 'warn');
      });
      return;
    }
    var db = ev.target.closest('[data-risk-del]');
    if (db) {
      var dept = db.getAttribute('data-risk-del');
      if (!confirm(esc(dept) + ' дашбоардыг устгах уу?')) return;
      deleteRiskDashboard(dept, function (ok) {
        if (ok) { toast('Дашбоард устгагдлаа', 'warn'); renderHazards(); }
        else toast('Устгахад алдаа гарлаа', 'error');
      });
    }
  });
}

/* ══ Дашбоардыг ДААТГАЛЫН ХУУДАСТАЙ ЯГ ИЖИЛ хэмжээгээр харуулах ══
   iframe дотор гадна талын viewport (740) нэвтэрдэггүй тул дашбоард нурдаг.
   Шийдэл: iframe-ийг ҮРГЭЛЖ 1024px өргөнөөр зурж (даатгалын хуудастай адил),
   дараа нь багтах хэмжээгээр нь багасгана. Ком дээр (өргөн ≥1024) огт өөрчлөгдөхгүй. */
var RISK_LOGICAL_W = 1024;

/* Дашбоардын ЖИНХЭНЭ контентын өргөнийг iframe дотроос хэмжинэ.
   (Ихэнх дашбоард max-width-тэй тул 1024-д тавихад баруун талд хоосон зай үлддэг.)
   Гадны домэйн (CORS) бол 0 буцаана. */
function riskContentWidth(iframe) {
  try {
    var d = iframe.contentDocument;
    if (!d || !d.body) return 0;
    var w = 0, kids = d.body.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      var bw = Math.max(el.scrollWidth || 0, el.getBoundingClientRect().width || 0);
      if (bw > w) w = bw;
    }
    var cs = d.defaultView.getComputedStyle(d.body);
    w += (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
         (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    return Math.round(w);
  } catch (e) { return 0; }
}

function fitRiskFrame(wrapper, iframe, visibleH) {
  var host = wrapper.clientWidth || wrapper.parentNode.clientWidth || RISK_LOGICAL_W;
  // undefined = эхний зураг (1024) · 0 = хэмжиж чадаагүй → бүтэн өргөнөөр
  var logical = (iframe._riskW === undefined) ? RISK_LOGICAL_W : iframe._riskW;
  wrapper.style.height = visibleH + 'px';
  wrapper.style.overflow = 'hidden';

  // Өргөн хүрэлцэж байвал (ком дээр) огт багасгахгүй — хуучин байдлаараа
  if (!logical || host >= logical) {
    iframe.style.width = '100%';
    iframe.style.height = visibleH + 'px';
    iframe.style.transform = 'none';
    return;
  }
  var sc = host / logical;
  iframe.style.width = logical + 'px';
  iframe.style.height = Math.round(visibleH / sc) + 'px';
  iframe.style.transform = 'scale(' + sc + ')';
  iframe.style.transformOrigin = 'top left';
}

/* Ачаалагдсаны дараа контентын өргөнийг хэмжиж, хоосон зайг арилгана */
function tuneRiskFrame(wrapper, iframe, hFn) {
  function pass() {
    var cw = riskContentWidth(iframe);
    if (cw >= 360 && cw <= 1600) iframe._riskW = cw;   // хэмжигдвэл яг таарууулна
    else if (!cw) iframe._riskW = 0;                   // CORS — багасгалтгүй, 100% өргөн
    fitRiskFrame(wrapper, iframe, hFn());
  }
  fitRiskFrame(wrapper, iframe, hFn());   // эхлээд 1024-д зурж контентыг задлана
  setTimeout(pass, 120);
  setTimeout(pass, 600);                  // график/хүснэгт сүүлд зурагдвал дахин
}

/* Дэлгэц эргэх/хэмжээ өөрчлөгдөхөд дахин тааруулна */
function wireRiskFrameResize(wrapper, iframe, hFn) {
  if (wireRiskFrameResize._t) { window.removeEventListener('resize', wireRiskFrameResize._t); }
  var t = null;
  wireRiskFrameResize._t = function () {
    clearTimeout(t);
    t = setTimeout(function () {
      if (!document.body.contains(iframe)) { window.removeEventListener('resize', wireRiskFrameResize._t); return; }
      fitRiskFrame(wrapper, iframe, hFn());
    }, 160);
  };
  window.addEventListener('resize', wireRiskFrameResize._t);
}

function renderRiskDept(sec, dept) {
  sec.style.padding = '0';
  if (!dept) {
    sec.innerHTML = '<div style="padding:24px">' +
      '<h1 style="font-size:22px;font-weight:700;margin:0 0 16px">Эрсдэлийн үнэлгээ</h1>' +
      emptyBox('Таны алба тодорхойгүй байна. ХАБЭА ажилтантай холбогдоно уу.') + '</div>';
    return;
  }
  sec.innerHTML = '<div style="padding:18px 24px 10px;border-bottom:1px solid #F1F5F9">' +
    '<h1 style="font-size:20px;font-weight:700;margin:0;color:#1E293B">Эрсдэлийн үнэлгээ</h1>' +
    '<p style="font-size:12px;color:#64748B;margin:2px 0 0">' + esc(dept) + '</p></div>' +
    '<div id="riskEmpArea" style="padding:16px">' +
    '<div style="text-align:center;padding:32px;color:#94A3B8"><i class="ti ti-loader-2" style="font-size:28px;animation:spin 1s linear infinite;display:block;margin-bottom:8px"></i>Дашбоард ачаалж байна...</div></div>';
  loadRiskDashboard(dept, function (data) {
    var area = document.getElementById('riskEmpArea');
    if (!area) return;
    if (!data || (!data.html && !data.htmlUrl)) {
      area.innerHTML = '<div style="text-align:center;padding:40px 20px">' +
        '<i class="ti ti-chart-off" style="font-size:40px;color:#CBD5E1;display:block;margin-bottom:12px"></i>' +
        '<div style="color:#94A3B8;font-size:14px">Энэ албанд эрсдэлийн үнэлгээний дашбоард бэлдэгдээгүй байна.</div>' +
        '<div style="color:#CBD5E1;font-size:12px;margin-top:6px">ХАБЭА ажилтантай холбогдоно уу.</div></div>';
      return;
    }
    area.innerHTML = '';
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;background:#fff;width:100%';
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'border:0;display:block;width:100%';
    wrapper.appendChild(iframe);
    area.appendChild(wrapper);

    var hFn = function () { return Math.max(480, window.innerHeight - 170); };
    var start = function () { tuneRiskFrame(wrapper, iframe, hFn); wireRiskFrameResize(wrapper, iframe, hFn); };
    iframe.onload = start;
    loadRiskIntoFrame(iframe, data, start);
  });
}

/* Дашбоардыг iframe рүү оруулна.
   URL-тэй бол эхлээд татаж srcdoc болгоно → ижил домэйн болсноор өргөнийг нь хэмжиж чадна.
   Татаж чадахгүй (CORS) бол шууд src-ээр — тэр үед багасгалт хийхгүй, бүтэн өргөнөөр. */
function loadRiskIntoFrame(iframe, data, onFail) {
  function asDoc(html) {
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.srcdoc = html;
  }
  if (data.html) { asDoc(data.html); return; }
  if (!data.htmlUrl) return;
  var done = false;
  var to = setTimeout(function () { if (!done) { done = true; iframe.src = data.htmlUrl; } }, 6000);
  try {
    fetch(data.htmlUrl).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (txt) { if (done) return; done = true; clearTimeout(to); asDoc(txt); })
      .catch(function () { if (done) return; done = true; clearTimeout(to); iframe.src = data.htmlUrl; });
  } catch (e) { done = true; clearTimeout(to); iframe.src = data.htmlUrl; }
}

function openRiskPreviewModal(dept, htmlOrUrl, isUrl) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;border-radius:8px;overflow:hidden';
  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'border:0;display:block;width:100%';
  wrap.appendChild(iframe);
  buildModal(esc(dept) + ' — Эрсдэлийн үнэлгээний дашбоард', wrap, { width: '90vw' });
  // Модал DOM-д ороод өргөнөө мэдсэний дараа тааруулна
  var hFn = function () { return Math.max(400, Math.round(window.innerHeight * 0.7)); };
  var start = function () {
    setTimeout(function () { tuneRiskFrame(wrap, iframe, hFn); wireRiskFrameResize(wrap, iframe, hFn); }, 30);
  };
  iframe.onload = start;
  loadRiskIntoFrame(iframe, isUrl ? { htmlUrl: htmlOrUrl } : { html: htmlOrUrl }, start);
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
      '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window.verifyReport(\'' + r.id + '\',\'verify\')"><i class="ti ti-check"></i> Батлах (+' + pts + ')</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();window.verifyReport(\'' + r.id + '\',\'reject\')">Татгалзах</button></div>';
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
    '<div class="rf-field"><label>4. Байршил</label><input type="text" id="rfLoc" class="rf-input" placeholder="Байршлаа гараар бичнэ үү (ж: Цех №2, 3-р машины ард)"></div>' +
    '<div class="rf-field"><label>5. Нэг өгүүлбэрээр тайлбарла</label><textarea id="rfDesc" class="rf-input" rows="2" placeholder="Юу болсон / болж болзошгүй вэ?"></textarea></div>' +
    '<div class="rf-field"><label>6. Баталгааны гарын үсэг</label>' +
    '<div style="border:1.5px solid #E2E8F0;border-radius:10px;overflow:hidden;background:#fff;cursor:crosshair">' +
    '<canvas id="rfSigCanvas" width="380" height="100" style="display:block;width:100%;height:100px;touch-action:none"></canvas></div>' +
    '<button type="button" id="rfSigClear" style="margin-top:5px;font-size:12px;background:none;border:1px solid #E2E8F0;border-radius:7px;padding:4px 10px;cursor:pointer;color:#64748B">Арилгах</button>' +
    '<div style="font-size:11px;color:#94A3B8;margin-top:3px"><i class="ti ti-lock"></i> Гарын үсэг зурж мэдээлэлээ баталгаажуулна</div></div>' +
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
      var locVal = ($('#rfLoc', node).value || '').trim() || 'Тодорхойгүй';
      if (!sel.signature) { toast('Гарын үсэг зурна уу', 'warn'); return; }
      createReport(sel.type, sel.risk, locVal, desc, sel.photo, sel.signature);
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
  // Гарын үсгийн canvas — touch + mouse зурах
  setTimeout(function () {
    var cv = $('#rfSigCanvas', node); if (!cv) return;
    var ctx = cv.getContext('2d');
    var drawing = false, lastX = 0, lastY = 0;
    function getPos(e) {
      var r = cv.getBoundingClientRect();
      var src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) * (cv.width / r.width), y: (src.clientY - r.top) * (cv.height / r.height) };
    }
    function startDraw(e) { e.preventDefault(); drawing = true; var p = getPos(e); lastX = p.x; lastY = p.y; }
    function moveDraw(e) {
      if (!drawing) return; e.preventDefault();
      var p = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke();
      lastX = p.x; lastY = p.y;
      sel.signature = cv.toDataURL('image/png');
    }
    function endDraw() { drawing = false; }
    cv.addEventListener('mousedown', startDraw); cv.addEventListener('mousemove', moveDraw);
    cv.addEventListener('mouseup', endDraw); cv.addEventListener('mouseleave', endDraw);
    cv.addEventListener('touchstart', startDraw, { passive: false });
    cv.addEventListener('touchmove', moveDraw, { passive: false });
    cv.addEventListener('touchend', endDraw);
    var clrBtn = $('#rfSigClear', node);
    if (clrBtn) clrBtn.addEventListener('click', function () {
      ctx.clearRect(0, 0, cv.width, cv.height); sel.signature = '';
    });
  }, 80);
  buildModal(presetType === 'hazard' ? 'Аюул / эрсдэл мэдээлэх' : 'Осолд дөхсөн мэдээлэх', node, { width: '440px' });
}

function createReport(type, risk, location, desc, photo, signature) {
  var who = currentReporter();
  var r = {
    id: newId('RP'), type: type, risk_level: risk, status: 'reported',
    desc: desc, location: location, dept: who.dept || '',
    reporterId: who.id || '', reporterUid: who.uid || '', reporterName: who.name || '', reporterEmail: who.email || '',
    photo: photo || '', signature: signature || '', verifiedBy: '', verifiedAt: '', createdAt: new Date().toISOString()
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
  var sig = r.signature ? '<div style="margin:0 0 12px"><div style="font-size:11px;color:#94A3B8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px"><i class="ti ti-writing-sign"></i> Гарын үсэг (баталгааны)</div><img src="' + r.signature + '" style="max-width:240px;border:1.5px solid #E2E8F0;border-radius:10px;background:#fff;padding:6px;display:block"></div>' : '';
  var html = photo + sig + '<div class="detail-grid">' +
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
  var wsum = _f(w.bosgo) + _f(w.davtan) + _f(w.video) + _f(w.task) + _f(w.bonus);
  var dsum = dw.coverage + dw.bonus + dw.firstAid + dw.ppe;
  function sumBox(id, sum, soft) {
    if (soft) return '<div id="' + id + '" class="weight-total" style="background:var(--emerald-light);color:var(--emerald-dark)">Нийт: <strong>' + sum + '%</strong> — систем харьцаагаар нь автоматаар тооцно ✓</div>';
    return '<div id="' + id + '" class="weight-total" style="background:' + (sum === 100 ? 'var(--emerald-light)' : 'var(--amber-light)') + ';color:' + (sum === 100 ? 'var(--emerald-dark)' : 'var(--amber-dark)') + '">Нийт: <strong>' + sum + '%</strong>' + (sum === 100 ? ' ✓' : ' (100 байх ёстой)') + '</div>';
  }
  var _demoN = demoDataCount(), _empN = (DB.employees || []).length;
  body.innerHTML =
    '<div class="card" id="demoCleanCard" style="border:1px solid #FDE68A;background:#FFFBEB;margin-bottom:16px">' +
    '<h3 style="color:#92400E"><i class="ti ti-trash"></i> Жишээ (демо) дата цэвэрлэх</h3>' +
    '<p style="font-size:13px;color:#B45309;margin:6px 0 12px">Прототипийн жишээ ажилтан, аюул, санал, осол, near-miss мэдээллийг бүрмөсөн устгаж, системийг цэвэр эхлүүлнэ. Жинхэнэ бүртгэлтэй ажилтнууд автоматаар эргэн нэмэгдэнэ.</p>' +
    '<div style="font-size:12px;color:#92400E;margin-bottom:12px">Одоогийн байдал: <strong>' + _empN + '</strong> ажилтан · <strong>' + _demoN + '</strong> аюул/санал/осол/near-miss/тайлангийн бичлэг</div>' +
    '<button class="btn btn-primary" id="clearDemoBtn" style="background:#D97706;border-color:#D97706"><i class="ti ti-trash"></i> Бүх жишээ датаг цэвэрлэх</button></div>' +
    '<div class="card"><h3>Байгууллагын мэдээлэл</h3><div class="form">' +
    '<div class="form-group"><label>Байгууллагын нэр</label><input type="text" id="setOrgName" value="' + esc(o.name || '') + '"></div>' +
    '<div class="form-row">' + inp('Регистрийн дугаар', 'setOrgReg', o.regNo || '', 'text', '') + inp('Ажилтны тоо', 'setOrgHc', o.headcount || 0, 'number', 'min="0" max="100000"') + '</div>' +
    '<div class="form-actions"><button class="btn btn-primary" data-saveorg="1">Хадгалах</button></div></div></div>' +

    '<div class="card"><h3>KPI үнэлгээний жин</h3><p class="card-subtitle">Босго(осол/зөрчилгүй) + давтан+шалгалт + видео(LMS) + даалгавар + бонус. Давтангүй сард давтангийн жин видео руу автоматаар шилжинэ. (Урьдчилсан/анхан зааварчилгаа KPI-д ороогүй.)</p><div class="form">' +
    '<div class="form-row">' + inp('Босго оноо', 'wBosgo', w.bosgo) + inp('Давтан + шалгалт', 'wDavtan', w.davtan) + '</div>' +
    '<div class="form-row">' + inp('Видео сургалт (LMS)', 'wVideo', w.video) + inp('Даалгавар', 'wTask', w.task) + inp('Аюул/NM бонус', 'wBonus', w.bonus) + '</div>' +
    sumBox('wsum', wsum, true) +
    '<div class="form-actions"><button class="btn btn-primary" data-savekpi="1">Хадгалах</button></div></div></div>' +

    '<div class="card" id="davtanSchedCard"><h3><i class="ti ti-calendar-event" style="color:#0891B2;margin-right:6px"></i>Давтан зааварчилгааны хуваарь</h3>' +
    '<p class="card-subtitle">Энэ цалингийн сард (' + esc(salaryKeyLabel(currentSalaryKey())) + ') аль албад давтан зааварчилгаатайг тэмдэглэнэ. Тэмдэглэсэн албаны ажилтдад Давтан+шалгалт жин идэвхжиж, бусдад нь видео жин 0.' + (_f(w.video) + _f(w.davtan)) + ' болно.</p>' +
    '<div id="davtanDeptList" style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px">' +
    deptList().map(function (d) {
      var on = deptHasDavtan(d, currentSalaryKey());
      return '<label style="display:flex;align-items:center;gap:7px;background:' + (on ? '#E0F2FE' : '#F8FAFC') + ';border:1.5px solid ' + (on ? '#7DD3FC' : '#E2E8F0') + ';border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;color:' + (on ? '#0369A1' : '#475569') + '">' +
        '<input type="checkbox" class="davtan-dept-cb" value="' + esc(d) + '"' + (on ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:#0891B2;cursor:pointer">' + esc(d) + '</label>';
    }).join('') + '</div>' +
    '<div class="form-actions"><button class="btn btn-primary" id="saveDavtanSched"><i class="ti ti-check"></i> Хуваарь хадгалах</button></div></div>' +

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
    '<div class="form-actions"><button class="btn btn-primary" data-import="1"><i class="ti ti-upload"></i> Видео үзэлт импорт</button></div></div>' +

    '<div class="card" id="subadminCard"><h3><i class="ti ti-user-shield" style="color:#8B5CF6;margin-right:6px"></i>Туслах Админ удирдлага</h3>' +
    '<p class="card-subtitle">Бүртгэлтэй хэрэглэгчдээс туслах админ (цех дарга) сонгоно. Туслах админ өөрийн хэлтсийн сургалт/шалгалтыг нэмж хаах боломжтой болно.</p>' +
    '<div id="subadminList" style="min-height:40px"><div style="color:#94A3B8;font-size:13px;padding:8px 0">Ачаалж байна...</div></div>' +
    '<div class="form-actions" style="margin-top:14px"><button class="btn btn-primary" data-addsubadmin="1"><i class="ti ti-user-plus"></i> Туслах Админ нэмэх</button></div></div>';
  setTimeout(loadSubadmins, 0);
  setTimeout(function () {
    var cdb = document.getElementById('clearDemoBtn');
    if (cdb && !cdb._wired) {
      cdb._wired = true;
      cdb.addEventListener('click', function () {
        if (confirm('Бүх жишээ (демо) датаг бүрмөсөн устгах уу?\n\nАжилтан, аюул, санал, осол, near-miss бүгд устана. Жинхэнэ бүртгэлтэй ажилтнууд эргэн нэмэгдэнэ. Энэ үйлдлийг буцаах боломжгүй.')) clearAllDemoData();
      });
    }
    // Давтан зааварчилгааны хуваарь хадгалах
    var dsb = document.getElementById('saveDavtanSched');
    if (dsb && !dsb._wired) {
      dsb._wired = true;
      dsb.addEventListener('click', function () {
        var sel = [];
        document.querySelectorAll('.davtan-dept-cb').forEach(function (cb) { if (cb.checked) sel.push(cb.value); });
        DB.davtanMonths = DB.davtanMonths || {};
        DB.davtanMonths[currentSalaryKey()] = sel;
        saveDB();
        toast('Давтан хуваарь хадгалагдлаа (' + sel.length + ' алба)', 'success');
        renderSettings(); renderKpiPage(); renderEmployees(); renderDashboard();
        if (charts.radar) renderCharts();
      });
    }
  }, 0);
}
function updateConfigSums() {
  function gv(id) { var el = $('#' + id); return el ? num(el.value) : 0; }
  [['wsum', gv('wBosgo') + gv('wDavtan') + gv('wVideo') + gv('wTask') + gv('wBonus'), true], ['dsum', gv('dCov') + gv('dBon') + gv('dFa') + gv('dPpe'), false]].forEach(function (p) {
    var el = $('#' + p[0]); if (!el) return; var s = p[1], soft = p[2];
    if (soft) {
      el.innerHTML = 'Нийт: <strong>' + s + '%</strong> — систем харьцаагаар нь автоматаар тооцно ✓';
      el.style.background = 'var(--emerald-light)'; el.style.color = 'var(--emerald-dark)';
      return;
    }
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
  var nw = { bosgo: gv('wBosgo', 30), davtan: gv('wDavtan', 20), video: gv('wVideo', 25), task: gv('wTask', 20), bonus: gv('wBonus', 15) };
  var wsum = nw.bosgo + nw.davtan + nw.video + nw.task + nw.bonus;
  if (wsum <= 0) { toast('KPI жин оруулна уу', 'warn'); return; }
  // Нийлбэр 100 биш байж болно — систем жинг автоматаар хэвийн болгоно (давтангүй сард видео руу шилждэг учир)
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
/* ---- Туслах Админ удирдлага ---- */
function _swRolesGet() { try { return JSON.parse(localStorage.getItem('sw_user_roles') || '{}'); } catch (e) { return {}; } }
function _swRolesSet(obj) { try { localStorage.setItem('sw_user_roles', JSON.stringify(obj)); } catch (e) {} }

function loadSubadmins() {
  var listEl = document.getElementById('subadminList');
  if (!listEl) return;
  // DB.userRoles-аас (localStorage-д хадгалагддаг) уншина — Firestore rules хэрэггүй
  var roles = (DB && DB.userRoles) || _swRolesGet();
  var admins = Object.keys(roles).filter(function (email) {
    return (roles[email] || {}).role === 'depthead';
  }).map(function (email) {
    return { email: email, dept: roles[email].department || '', updatedAt: roles[email].updatedAt || '' };
  });
  if (!admins.length) {
    listEl.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Туслах Админ байхгүй байна.</div>';
    return;
  }
  listEl.innerHTML = admins.map(function (a) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #F1F5F9">' +
      '<div style="width:36px;height:36px;border-radius:10px;background:#EDE9FE;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0"><i class="ti ti-user-shield"></i></div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;color:#1E293B">' + esc(a.email) + '</div>' +
      '<div style="font-size:12px;color:#64748B">' + esc(a.dept || 'Алба тогтоогүй') + (a.updatedAt ? ' · ' + timeAgo(a.updatedAt) : '') + '</div></div>' +
      '<button class="btn btn-sm" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA;flex-shrink:0" data-rmsubadmin="' + esc(a.email) + '"><i class="ti ti-user-minus"></i> Хасах</button>' +
      '</div>';
  }).join('');
  listEl.querySelectorAll('[data-rmsubadmin]').forEach(function (btn) {
    btn.addEventListener('click', function () { removeSubadmin(btn.getAttribute('data-rmsubadmin')); });
  });
}

function removeSubadmin(email) {
  if (!email) return;
  // DB.userRoles + localStorage-д хасна
  if (DB && DB.userRoles) delete DB.userRoles[email];
  var lr = _swRolesGet(); delete lr[email]; _swRolesSet(lr);
  saveDB();
  toast(esc(email) + ' — Туслах Админ эрх хасагдлаа', 'warn');
  loadSubadmins();
  // Firestore user_roles-д ч бичихийг оролдоно (rules байвал, байхгүй бол чимээгүй орхино)
  if (fbReady) {
    fdb.collection('user_roles').doc(email).set({
      role: 'employee', department: '',
      updatedBy: (SESSION && SESSION.email) || 'admin',
      updatedAt: new Date().toISOString()
    }).catch(function () {});
  }
}

function actionAddSubadmin() {
  if (!isAdmin()) return;
  if (DEMO || !fbReady) { toast('Амьд систем дээр ажиллана', 'warn'); return; }
  var node = elc('div', 'modal-info');
  node.innerHTML = '<div style="color:#94A3B8;font-size:13px">Бүртгэлтэй хэрэглэгчдийг татаж байна...</div>';
  buildModal('Туслах Админ нэмэх', node, { width: '440px' });

  fdb.collection('users').get().then(function (snap) {
    var users = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      var email = d.email || doc.id;
      if (email && email.indexOf('@') > -1) {
        users.push({ email: email, name: d.displayName || d.name || '' });
      }
    });
    users.sort(function (a, b) { return a.email < b.email ? -1 : 1; });

    var deptOpts = deptList().map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
    var userOpts = users.length
      ? users.map(function (u) {
          var lbl = u.name && u.name !== u.email ? u.name + ' — ' + u.email : u.email;
          return '<option value="' + esc(u.email) + '">' + esc(lbl) + '</option>';
        }).join('')
      : '<option value="">Хэрэглэгч байхгүй</option>';

    node.innerHTML =
      '<div class="rf-field"><label style="font-weight:600;font-size:13px">Хэрэглэгч сонгох</label>' +
      '<select id="saEmail" class="rf-input" style="height:auto;padding:9px 12px">' + userOpts + '</select></div>' +
      '<div class="rf-field" style="margin-top:12px"><label style="font-weight:600;font-size:13px">Харъяа хэлтэс</label>' +
      '<select id="saDept" class="rf-input" style="height:auto;padding:9px 12px">' + deptOpts + '</select></div>' +
      '<div style="margin-top:6px;font-size:11px;color:#94A3B8">Сонгосон хэрэглэгч нэвтрэх дараа дараагийн хуудасны ачааллаас эхлэн туслах админы эрхтэй болно.</div>' +
      '<button class="btn btn-primary btn-block" id="saSubmit" style="margin-top:14px"><i class="ti ti-check"></i> Туслах Админ болгох</button>';

    node.querySelector('#saSubmit').addEventListener('click', function () {
      var emailEl = node.querySelector('#saEmail');
      var deptEl = node.querySelector('#saDept');
      var email = (emailEl ? emailEl.value : '').trim();
      var dept = deptEl ? deptEl.value : '';
      if (!email) { toast('Хэрэглэгч сонгоно уу', 'warn'); return; }
      // DB.userRoles + localStorage-д хадгална (Firestore rules хэрэггүй)
      if (!DB.userRoles) DB.userRoles = {};
      var roleEntry = { role: 'depthead', department: dept, updatedBy: (SESSION && SESSION.email) || 'admin', updatedAt: new Date().toISOString() };
      DB.userRoles[email] = roleEntry;
      var lr = _swRolesGet(); lr[email] = roleEntry; _swRolesSet(lr);
      saveDB();
      closeModal();
      toast(esc(email) + ' → Туслах Админ болгогдлоо (' + esc(dept) + ')', 'success');
      loadSubadmins();
      // Firestore user_roles-д ч бичихийг оролдоно (rules байвал, байхгүй бол чимээгүй орхино)
      if (fbReady) {
        fdb.collection('user_roles').doc(email).set(roleEntry).catch(function () {});
      }
    });
  }).catch(function (err) {
    node.innerHTML = '<div style="color:#DC2626;font-size:13px">Хэрэглэгчдийг ачаалж чадсангүй: ' + esc(err.message || String(err)) + '</div>';
  });
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
  var boxCounts = (DB.settings && DB.settings.firstAidBoxCounts) || {};
  html += '<div class="card" style="padding:18px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><h3 style="margin:0">Анхны тусламжийн хайрцаг</h3>' +
    (admin ? '<button class="btn btn-secondary btn-sm" id="setBoxCounts"><i class="ti ti-settings"></i> Хайрцгийн тоо тохируулах</button>' : '') + '</div>' +
    '<p style="font-size:13px;color:#8A94A6;margin:0 0 14px">Алба бүрт хэдэн хайрцаг байгаагаас шалгах давтамж хамаарна. Зарцуулалт + нөхөн дүүргэлтийг мөрдөнө.</p>';
  html += depts.map(function (d) {
    var fa = deptFirstAid(d);
    var c = (DB.firstAidChecks || []).filter(function (x) { return x.dept === d; }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
    var boxCnt = boxCounts[d] || 0;
    var status = !c ? '<span class="tag">шалгаагүй</span>' : (c.complete ? '<span class="tag tag-emerald">Бүрэн</span>' : '<span class="tag tag-warn">Дутуу: ' + esc((c.missing || []).join(', ')) + '</span>');
    var usedHtml = (c && c.usedItems) ? ' <span style="font-size:11px;color:#D97706">⬇ Зарцуулсан: ' + esc(c.usedItems) + '</span>' : '';
    var restockHtml = (c && c.restocked) ? ' <span style="font-size:11px;color:#16A34A">✓ Нөхсөн</span>' : '';
    return '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #F1F5F9;flex-wrap:wrap">' +
      '<div style="min-width:110px;font-weight:600">' + esc(d) + '</div>' +
      '<div style="width:80px;font-size:12px;color:#64748B"><i class="ti ti-first-aid-kit"></i> ' + (boxCnt ? boxCnt + ' хайрцаг' : '<span style="color:#CBD5E1">тохируулаагүй</span>') + '</div>' +
      '<div style="flex:1;min-width:160px">' + status + usedHtml + restockHtml + (c ? ' <span style="font-size:12px;color:#8A94A6">· ' + timeAgo(c.createdAt) + '</span>' : '') + '</div>' +
      '<div style="width:50px;text-align:right;font-weight:700">' + (fa == null ? '—' : fa + '%') + '</div>' +
      (admin ? '<button class="btn btn-secondary btn-sm" data-checkdept="' + esc(d) + '">Шалгах</button>' : '') + '</div>';
  }).join('') + '</div>';

  // Анхны тусламжийн хайрцгийн шалгалтын бүрэн түүх (зөвхөн admin харна)
  if (admin) {
    var allChecks = (DB.firstAidChecks || []).slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    html += '<div class="card" style="padding:18px;margin-top:14px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">Шалгалтын бүрэн түүх <span class="badge">' + allChecks.length + '</span></h3></div>';
    if (!allChecks.length) {
      html += emptyBox('Шалгалт бүртгэгдээгүй');
    } else {
      html += allChecks.slice(0, 50).map(function (c) {
        var isDone = c.complete || c.restocked;
        var usedHtml = c.usedItems ? '<span style="font-size:11px;color:#D97706"> · Зарцуулсан: ' + esc(c.usedItems) + '</span>' : '';
        var restockHtml = c.restocked ? '<span style="font-size:11px;color:#16A34A"> · Нөхөн дүүргэсэн ✓</span>' : '';
        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #F8FAFC">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:' + (isDone ? '#D1FAE5' : '#FEF3C7') + ';color:' + (isDone ? '#065F46' : '#92400E') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px"><i class="ti ti-first-aid-kit"></i></div>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">' + esc(c.dept) + ' · ' +
          (isDone ? '<span style="color:#16A34A">Бүрэн</span>' : '<span style="color:#D97706">Дутуу: ' + esc((c.missing || []).join(', ')) + '</span>') + usedHtml + restockHtml + '</div>' +
          '<div style="font-size:11px;color:#94A3B8;margin-top:2px">Шалгасан: ' + esc(c.checkedBy || '—') + ' · ' + (c.createdAt ? new Date(c.createdAt).toLocaleString('mn-MN') : '—') + '</div></div></div>';
      }).join('');
    }
    html += '</div>';
  }

  sec.innerHTML = html;

  if (!sec._wired) {
    sec._wired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-addppe]')) { actionAddPpe(); return; }
      if (ev.target.closest('[data-addcheck]')) { actionCheckFirstAid(); return; }
      if (ev.target.closest('#setBoxCounts')) { actionSetBoxCounts(); return; }
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
      { name: 'complete', label: 'Хайрцгийн байдал', type: 'select', value: 'yes', options: [{ value: 'yes', label: 'Бүрэн — бүх зүйл байгаа' }, { value: 'no', label: 'Дутуу зүйл байна' }] },
      { name: 'missing', label: 'Дутуу зүйлс (таслалаар)', type: 'text', placeholder: 'ж: Боолт, Антисептик', hint: 'Зөвхөн дутуу үед бөглөнө' },
      { name: 'usedItems', label: 'Зарцуулагдсан зүйл (таслалаар)', type: 'text', placeholder: 'ж: Боолт x2, Бугуйвч x1', hint: 'Энэ хугацаанд юу зарцуулагдсан' },
      { name: 'restocked', label: 'Нөхөн дүүргэлт', type: 'select', value: 'no', options: [{ value: 'no', label: 'Нөхөөгүй' }, { value: 'yes', label: 'Нөхсэн — дүүрэн болсон' }] }
    ],
    submitLabel: 'Бүртгэх',
    onSubmit: function (v) {
      var complete = v.complete === 'yes';
      var restocked = v.restocked === 'yes';
      var missing = complete ? [] : (v.missing || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      DB.firstAidChecks.unshift({
        id: nextId('FA', DB.firstAidChecks), dept: v.dept,
        totalItems: FIRST_AID_ITEMS.length, complete: complete || restocked,
        missing: restocked ? [] : missing,
        usedItems: (v.usedItems || '').trim(),
        restocked: restocked,
        checkedBy: (SESSION && SESSION.email) || USER.name,
        restockedAt: restocked ? new Date().toISOString() : '',
        createdAt: new Date().toISOString()
      });
      saveDB(); renderPpe(); renderKpiPage(); renderDashboard();
      toast('Хайрцгийн шалгалт бүртгэгдлээ');
    }
  });
}
function actionSetBoxCounts() {
  var boxCounts = (DB.settings && DB.settings.firstAidBoxCounts) || {};
  var depts = deptList();
  var node = elc('div', 'modal-info');
  node.innerHTML = '<p style="font-size:13px;color:#64748B;margin:0 0 14px">Алба бүрт хэдэн анхны тусламжийн хайрцаг байгааг тохируулна. Энэ тоо нь шалгах давтамж, KPI-д нөлөөлнө.</p>' +
    depts.map(function (d) {
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<label style="min-width:100px;font-weight:600;font-size:13px">' + esc(d) + '</label>' +
        '<input type="number" min="0" max="99" value="' + (boxCounts[d] || 0) + '" data-box-dept="' + esc(d) + '" style="width:70px;padding:6px 10px;border:1px solid #E2E8F0;border-radius:8px;font-size:14px"> хайрцаг</div>';
    }).join('') +
    '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
    '<button class="btn btn-secondary" id="boxCancel">Цуцлах</button>' +
    '<button class="btn btn-primary" id="boxSave"><i class="ti ti-check"></i> Хадгалах</button></div>';

  var m = buildModal('Хайрцгийн тоо тохируулах', node, { width: '420px' });
  node.addEventListener('click', function (ev) {
    if (ev.target.closest('#boxCancel')) { closeModal(); return; }
    if (ev.target.closest('#boxSave')) {
      DB.settings = DB.settings || {};
      DB.settings.firstAidBoxCounts = DB.settings.firstAidBoxCounts || {};
      node.querySelectorAll('[data-box-dept]').forEach(function (inp) {
        var d = inp.getAttribute('data-box-dept');
        var v = clamp(parseInt(inp.value, 10) || 0, 0, 99);
        DB.settings.firstAidBoxCounts[d] = v;
      });
      saveDB(); renderPpe();
      closeModal();
      toast('Хайрцгийн тоо хадгалагдлаа', 'success');
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
  DB.examResults.unshift({ id: newId('ER'), examId: ex.id, examTitle: ex.title, uid: who.uid || '', empId: who.id || '', email: who.email || '', name: who.name || '', score: score, passed: passed, attempt: 1, createdAt: new Date().toISOString() });
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
  // Даатгал цэс дарахад ШУУД бүтэн хуудсаар нээнэ (iframe-гүй).
  // Ингэснээр тухайн хуудасны өөрийн viewport (ком-загвар + pinch-zoom) бүрэн ажиллана.
  sec.style.padding = '';

  /* ⚠ ГОГЦОО ХАМГААЛАЛТ: даатгалаас буцаж ирээд дахин тийш үсрэхээс сэргийлнэ.
     Дөнгөж сая (6 сек дотор) тийш явсан бол автоматаар нээхгүй — товч харуулна. */
  var justWent = 0;
  try { justWent = +(sessionStorage.getItem('kpi_daatgal_at') || 0); } catch (e) {}
  if (justWent && (Date.now() - justWent) < 6000) {
    try { sessionStorage.removeItem('kpi_daatgal_at'); } catch (e) {}
    sec.innerHTML = '<div class="page-header"><div><h1>Даатгал</h1>' +
      '<p class="page-subtitle">Нөхөн төлбөрийн гарын авлага</p></div></div>' +
      '<div class="card" style="padding:30px;text-align:center">' +
      '<i class="ti ti-shield-heart" style="font-size:42px;color:#0EA5E9"></i>' +
      '<div style="font-size:14px;color:#64748B;margin:12px 0 18px;line-height:1.6">Даатгалын хуудас тусдаа нээгддэг.</div>' +
      '<button class="btn btn-primary" id="daatgalOpen"><i class="ti ti-external-link"></i> Даатгалын хуудсыг нээх</button></div>';
    var ob = document.getElementById('daatgalOpen');
    if (ob) ob.addEventListener('click', function () {
      try { sessionStorage.setItem('kpi_daatgal_at', Date.now()); } catch (e) {}
      location.href = '/nohon-tulbur.html';
    });
    return;
  }

  sec.innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-loader"></i><div>Даатгалын хуудас нээгдэж байна…</div></div>';
  try { sessionStorage.setItem('kpi_daatgal_at', Date.now()); } catch (e) {}
  try { location.href = '/nohon-tulbur.html'; } catch (e) {}
  return;

}

/* Браузерын кэшээс (bfcache) буцаж ирэхэд даатгалын хуудсан дээр үлдвэл —
   үндсэн хуудас руу гаргана. Эс тэгвээс дахин үсэрдэг. */
window.addEventListener('pageshow', function (ev) {
  if (!ev.persisted) return;
  try {
    var cur = document.querySelector('.page.active');
    if (cur && cur.getAttribute('data-page') === 'daatgal') {
      try { sessionStorage.removeItem('kpi_daatgal_at'); } catch (e) {}
      switchPage(defaultPageForRole());
    }
  } catch (e) {}
});

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

/* ============ Шалгалтын удирдлага ============ */
function renderExamAdmin() {
  var sec = pageEl('examadmin'); if (!sec) return;
  if (!isAdmin()) { sec.style.padding = ''; sec.innerHTML = '<div class="card"><div class="empty-state" style="padding:30px"><i class="ti ti-lock"></i><div>Зөвхөн ХАБЭА ажилтан хандана.</div></div></div>'; return; }
  sec.style.padding = '';

  var examCards = EXAM_PAGES.map(function (ep) {
    var taken = 0, passed = 0;
    (DB.employees || []).forEach(function (emp) {
      var p = getEmpProg(emp.id, ep.key);
      if (p.examTaken) { taken++; if (p.examPassed) passed++; }
    });
    var total = (DB.employees || []).length;
    var pct = taken ? Math.round(passed / taken * 100) : 0;
    var adminUrl = '/habea-admin.html?exam=' + encodeURIComponent(ep.key);
    return '<div class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:11px">' +
      '<div style="width:46px;height:46px;border-radius:12px;background:' + ep.bg + ';color:' + ep.color + ';display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0"><i class="ti ' + ep.icon + '"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-weight:600">' + esc(ep.label) + '</div>' +
      '<div style="font-size:12px;color:#8A94A6">' + taken + '/' + total + ' өгсөн' + (taken ? ' · Тэнцсэн ' + passed + ' (' + pct + '%)' : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0">' +
      '<a href="' + adminUrl + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="ti ti-pencil"></i> Асуулт засах</a>' +
      '<a href="' + adminUrl + '&tab=results" target="_blank" rel="noopener" class="btn btn-sm" style="background:#F1F5F9;color:#475569;border:1.5px solid #E2E8F0"><i class="ti ti-chart-bar"></i> Дүн</a>' +
      '</div></div>';
  }).join('');

  sec.innerHTML =
    '<div class="page-header"><div><h1>Шалгалтын удирдлага</h1>' +
    '<p class="page-subtitle">ХАБЭА шалгалт бүрийн асуулт, тохиргоо, дүнг удирдана</p></div></div>' +
    '<div class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:18px;border:1.5px solid #C7D2FE">' +
    '<div style="width:46px;height:46px;border-radius:12px;background:#4338CA;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px"><i class="ti ti-layout-dashboard"></i></div>' +
    '<div style="flex:1"><div style="font-weight:700">Ерөнхий админ (бүх шалгалтын дүн)</div>' +
    '<div style="font-size:12px;color:#8A94A6">Бүх дүн, статистик, тохиргоо · PIN 1234</div></div>' +
    '<a href="/habea-admin.html" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="ti ti-external-link"></i> Нээх</a></div>' +
    '<h3 style="margin:0 0 12px">ХАБЭА Шалгалт — Тус бүрийн удирдлага</h3>' +
    examCards +
    '<div style="display:flex;align-items:center;gap:10px;margin:22px 0 10px"><h3 style="margin:0">Шалгалтын бүртгэл</h3>' +
    '<button onclick="loadHabeaResultsPanel()" class="btn btn-sm btn-ghost" style="font-size:12px;padding:4px 10px"><i class="ti ti-refresh"></i> Шинэчлэх</button></div>' +
    '<div id="habeaResultsPanel"><div style="padding:24px;text-align:center;color:#8A94A6"><i class="ti ti-loader"></i> Ачааллаж байна...</div></div>';
  setTimeout(function () { loadHabeaResultsPanel(); }, 0);
}

async function loadHabeaResultsPanel() {
  var panel = document.getElementById('habeaResultsPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:24px;text-align:center;color:#8A94A6"><i class="ti ti-loader"></i> Ачааллаж байна...</div>';
  try {
    var hdb = getHabeaDb();
    if (!hdb) throw new Error('Firebase холбогдсонгүй');
    var snap = await hdb.collection('habea_exam_results').get();
    var rows = [];
    snap.forEach(function (d) {
      var x = d.data() || {};
      var ts = x.timestamp;
      var tsMs = ts ? (ts.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : 0)) : 0;
      rows.push({ id: d.id, name: x.name || '—', dept: x.department || '—', pos: x.position || '—', pct: x.percent || 0, passed: !!x.passed, tsMs: tsMs });
    });
    rows.sort(function (a, b) { return b.tsMs - a.tsMs; });
    if (!rows.length) {
      panel.innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-clipboard-off"></i><div>Шалгалт байхгүй</div></div>';
      return;
    }
    function fmtHabeaTs(ms) {
      if (!ms) return '—';
      var d = new Date(ms);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    panel.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Нэр</th><th>Хэлтэс</th><th>Тушаал</th><th>%</th><th>Дүн</th><th>Огноо</th><th></th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr>' +
          '<td style="color:#8A94A6;font-size:12px;font-weight:700">' + (i + 1) + '</td>' +
          '<td style="font-weight:600">' + esc(r.name) + '</td>' +
          '<td>' + esc(r.dept) + '</td>' +
          '<td>' + esc(r.pos) + '</td>' +
          '<td style="font-weight:800;color:' + (r.passed ? 'var(--green)' : 'var(--red)') + '">' + r.pct + '%</td>' +
          '<td><span style="font-size:11px;font-weight:600;color:' + (r.passed ? 'var(--green)' : 'var(--red)') + '">' + (r.passed ? 'Тэнцсэн' : 'Тэнцээгүй') + '</span></td>' +
          '<td style="font-size:12px;color:#8A94A6">' + fmtHabeaTs(r.tsMs) + '</td>' +
          '<td><button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteHabeaResult(\'' + r.id + '\')">Устгах</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  } catch (e) {
    panel.innerHTML = '<div class="empty-state" style="padding:20px"><i class="ti ti-alert-circle"></i><div>' + esc(String(e.message || 'Алдаа')) + '</div></div>';
  }
}
async function deleteHabeaResult(id) {
  if (!confirm('Энэ шалгалтын бичлэгийг устгахдаа итгэлтэй байна уу?')) return;
  try {
    var hdb = getHabeaDb(); if (!hdb) throw new Error('db');
    await hdb.collection('habea_exam_results').doc(id).delete();
    toast('Устгагдлаа ✓', 'success');
    loadHabeaResultsPanel();
  } catch (e) { toast('Алдаа гарлаа', 'err'); }
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

/* Сүүлийн 12 сарын ЖИНХЭНЭ хандлага — бодит бичлэгээс тооцно (хиймэл дата биш) */
function monthlyTrendData() {
  var now = new Date();
  var labels = [], keys = [];
  var MN = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MN[d.getMonth()] + ' сар');
    keys.push(d.getFullYear() + '-' + (d.getMonth() + 1));
  }
  function mk(iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d.getTime()) ? null : d.getFullYear() + '-' + (d.getMonth() + 1); }
  function zeros() { return keys.map(function () { return 0; }); }
  var training = zeros(), risk = zeros(), incident = zeros();
  function bump(arr, iso) { var idx = keys.indexOf(mk(iso)); if (idx > -1) arr[idx]++; }

  // Эрсдэл = аюул/near-miss мэдээлэл + эрсдэлийн бүртгэл
  (DB.reports || []).forEach(function (r) { bump(risk, r.createdAt); });
  (DB.hazards || []).forEach(function (h) { bump(risk, h.createdAt); });
  // Осол
  (DB.incidents || []).forEach(function (n) { bump(incident, n.date || n.createdAt); });
  // Сургалт = модулийн шалгалт өгсөн + LMS видео сургалт тэнцсэн
  Object.keys(DB.empProgress || {}).forEach(function (k) {
    var p = DB.empProgress[k]; if (p && p.examTakenAt) bump(training, p.examTakenAt);
  });
  if (LMS.loaded) {
    Object.keys(LMS.progByUser || {}).forEach(function (uid) {
      var m = LMS.progByUser[uid];
      Object.keys(m).forEach(function (tid) {
        var p = m[tid];
        if (p && p.status === 'passed') bump(training, p.passedAt || p.completedAt || p.updatedAt || p.lastViewedAt);
      });
    });
  }
  return { labels: labels, training: training, risk: risk, incident: incident };
}

/* Дашбоардын үндсэн график — хүснэгтийн БҮХ үзүүлэлтийн одоогийн дундаж дүн (0-100) */
function empIntTrainingPct(e) {
  var keys = Object.keys(TRAINING_MODULES).filter(function (k) { return isModTrainingVisible(e, k); });
  if (!keys.length) return null;
  var done = keys.filter(function (k) { return getEmpProg(e.id, k).trainingCompleted; }).length;
  return Math.round(done / keys.length * 100);
}
function empExtTrainingPct(e) {
  var ext = DB.extTrainings || [];
  if (!ext.length) return null;
  var att = ext.filter(function (t) { return getExtAtt(t.id, e.id).status === 'attended'; }).length;
  return Math.round(att / ext.length * 100);
}
function empSafetyScore(e) {
  var vals = [deptPpe(e.dept), deptFirstAid(e.dept)].filter(function (v) { return v != null; });
  return vals.length ? Math.round(avg(vals)) : null;
}
var DASH_CATS = [
  { label: 'Дотоод сургалт', rgb: '29,78,216',  fn: empIntTrainingPct, desc: 'Дотоод 5 модулийн дуусгасан хувь' },
  { label: 'Гадны сургалт',  rgb: '22,101,52',  fn: empExtTrainingPct, desc: 'Гадны сургалтад хамрагдсан хувь' },
  { label: 'Видео сургалт',  rgb: '194,65,12',  fn: kpiVideo,          desc: 'Оногдсон видео сургалтаас тэнцсэн хувь' },
  { label: 'Аюул/NM',        rgb: '162,28,175', fn: empBonusScore,     desc: 'Аюул/near-miss мэдээллийн бонус оноо' },
  { label: 'ХХХ·Тусламж',    rgb: '8,145,178',  fn: empSafetyScore,    desc: 'Албаны ХХХ мөрдөлт + анхны тусламж' },
  { label: 'Даалгавар',      rgb: '22,163,74',  fn: kpiTask,           desc: 'Оногдсон даалгаврын биелэлт' }
];
var DASH_CAT_DEPT = ''; // '' = бүх алба; интерактив шүүлт
function _dashEmps() {
  var list = DB.employees || [];
  return DASH_CAT_DEPT ? list.filter(function (e) { return e.dept === DASH_CAT_DEPT; }) : list;
}
function _avgOf(emps, fn) {
  var vals = emps.map(fn).filter(function (v) { return v != null; });
  return vals.length ? Math.round(avg(vals)) : 0;
}
function kpiCategoryBars() {
  var emps = _dashEmps();
  return DASH_CATS.map(function (c) { return { label: c.label, rgb: c.rgb, v: _avgOf(emps, c.fn) }; });
}

/* Багана дээр дарахад — тухайн үзүүлэлтийн алба тус бүрийн задаргаа + анхаарал шаардлагатай ажилтнууд */
function openCategoryDrilldown(idx) {
  var cat = DASH_CATS[idx]; if (!cat) return;
  var depts = deptList().map(function (d) {
    var em = (DB.employees || []).filter(function (e) { return e.dept === d; });
    return { d: d, v: _avgOf(em, cat.fn), n: em.length };
  }).sort(function (a, b) { return b.v - a.v; });
  var deptMax = Math.max(1, depts.reduce(function (a, x) { return Math.max(a, x.v); }, 0));

  var lowEmps = _dashEmps().map(function (e) { return { e: e, v: cat.fn(e) }; })
    .filter(function (x) { return x.v != null; })
    .sort(function (a, b) { return a.v - b.v; }).slice(0, 8);

  function col(v) { return v >= 85 ? '#16A34A' : v >= 60 ? '#D97706' : '#DC2626'; }
  var deptRows = depts.map(function (r) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0">' +
      '<div style="width:130px;font-size:12.5px;font-weight:600;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(r.d) + '">' + esc(r.d) + '</div>' +
      '<div style="flex:1;height:16px;background:#F1F5F9;border-radius:8px;overflow:hidden"><div style="height:100%;width:' + Math.round(r.v / deptMax * 100) + '%;background:' + col(r.v) + ';border-radius:8px;transition:width .4s"></div></div>' +
      '<div style="width:40px;text-align:right;font-weight:700;font-size:13px;color:' + col(r.v) + '">' + r.v + '</div></div>';
  }).join('') || '<div style="color:#94A3B8;font-size:13px;padding:8px">Алба бүртгэгдээгүй</div>';

  var empRows = lowEmps.length ? lowEmps.map(function (x) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #F1F5F9">' +
      '<div class="avatar avatar-sm" style="width:28px;height:28px;font-size:11px">' + esc(x.e.initials || '') + '</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#1E293B">' + esc(x.e.name) + '</div>' +
      '<div style="font-size:11px;color:#94A3B8">' + esc(x.e.dept || '') + '</div></div>' +
      '<span style="font-weight:700;font-size:13px;color:' + col(x.v) + '">' + x.v + '</span></div>';
  }).join('') : '<div style="color:#94A3B8;font-size:13px;padding:8px">Дата алга</div>';

  var node = elc('div');
  node.innerHTML =
    '<div style="font-size:12.5px;color:#64748B;margin-bottom:14px">' + esc(cat.desc) +
    (DASH_CAT_DEPT ? ' · <b>' + esc(DASH_CAT_DEPT) + '</b>' : '') + '</div>' +
    '<div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Алба тус бүрээр</div>' +
    deptRows +
    '<div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:18px 0 4px">Анхаарал шаардлагатай ажилтнууд</div>' +
    empRows;
  buildModal(cat.label + ' — дэлгэрэнгүй', node, { width: '620px' });
}

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
    var cur = [cat.bosgo, cat.davtan, cat.video, cat.task, cat.bonus];
    var prev = cur.map(function (v) { return Math.max(0, v - 3 - Math.round(Math.random() * 2)); });
    charts.radar = new Chart(radarEl.getContext('2d'), {
      type: 'radar',
      data: {
        labels: [['Босго'], ['Давтан'], ['Видео'], ['Даалгавар'], ['Бонус']],
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
  // Алба сонгох dropdown — интерактив шүүлт
  var deptSel = $('#dashCatDept');
  if (deptSel) {
    if (!deptSel._wired) {
      deptSel._wired = true;
      deptSel.addEventListener('change', function () { DASH_CAT_DEPT = this.value; renderCharts(); });
    }
    var opts = '<option value="">Бүх алба</option>' + deptList().map(function (d) {
      return '<option value="' + esc(d) + '"' + (d === DASH_CAT_DEPT ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');
    if (deptSel.innerHTML !== opts) deptSel.innerHTML = opts;
    deptSel.value = DASH_CAT_DEPT;
  }

  var trendEl = $('#trendChart');
  if (trendEl) {
    if (charts.trend) charts.trend.destroy();
    var cats = kpiCategoryBars();
    charts.trend = new Chart(trendEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: cats.map(function (c) { return c.label; }),
        datasets: [{
          label: 'Дундаж дүн',
          data: cats.map(function (c) { return c.v; }),
          backgroundColor: function (ctx) {
            var rgb = cats[ctx.dataIndex].rgb, ch = ctx.chart, area = ch.chartArea;
            if (!area) return 'rgba(' + rgb + ',0.9)';
            var g = ch.ctx.createLinearGradient(area.left, 0, area.right, 0);
            g.addColorStop(0, 'rgba(' + rgb + ',0.75)'); g.addColorStop(1, 'rgba(' + rgb + ',1)');
            return g;
          },
          hoverBackgroundColor: cats.map(function (c) { return 'rgba(' + c.rgb + ',1)'; }),
          borderRadius: 8, borderSkipped: false, maxBarThickness: 34, categoryPercentage: 0.72, barPercentage: 0.9
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 12 } },
        onClick: function (evt, els) { if (els && els.length) openCategoryDrilldown(els[0].index); },
        onHover: function (evt, els) { evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A1815', padding: 12, cornerRadius: 10, displayColors: false,
            titleFont: { family: 'Manrope', size: 13, weight: '600' }, bodyFont: { family: 'Manrope', size: 13 },
            callbacks: { label: function (c) { return 'Дундаж: ' + c.parsed.x + ' / 100 · дэлгэрэнгүйг үзэхээр дарна уу'; } }
          }
        },
        scales: {
          x: { beginAtZero: true, max: 100, grid: { color: 'rgba(26,24,21,0.05)', drawTicks: false }, border: { display: false },
            ticks: { font: { family: 'Manrope', size: 11 }, color: '#908A80', stepSize: 25, padding: 6, callback: function (v) { return v + '%'; } } },
          y: { grid: { display: false }, border: { display: false },
            ticks: { font: { family: 'Manrope', size: 12.5, weight: '600' }, color: '#1A1815', padding: 6 } }
        }
      }
    });
  }
}

/* ============ Бүгдийг дахин зурах ============ */
/* ============ Видео сургалт (MiSkill) — тусдаа цэс ============ */
/* ============ MiSkill дата оноо тооцоолол ============ */
function miskillScore(r) {
  var tPct = r.trainReq > 0 ? Math.min(1, r.trainDone / r.trainReq) : (r.trainDone > 0 ? 1 : 0);
  var ePct = r.examReq > 0 ? Math.min(1, r.examDone / r.examReq) : (r.examDone > 0 ? 1 : 0);
  return Math.round((tPct * 70 + ePct * 30) * 100);
}
function miskillFindMyRow() {
  var me = myEmp();
  var stats = DB.miskillStats || [];
  if (!me) return null;
  return stats.find(function (r) {
    return r.empId === me.id || _sameEmail(r.empEmail, me.email) || r.empName === me.name;
  }) || null;
}
function msPct(done, req) { return req > 0 ? Math.min(100, Math.round(done / req * 100)) : (done > 0 ? 100 : 0); }
function msColor(pct) { return pct >= 90 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626'; }
function msBg(pct) { return pct >= 90 ? '#D1FAE5' : pct >= 60 ? '#FEF3C7' : '#FEE2E2'; }
function msLabel(pct) { return pct >= 90 ? 'Маш сайн' : pct >= 60 ? 'Хангалттай' : 'Анхаарал шаардлагатай'; }

function msProgressRing(pct, color, size) {
  size = size || 80;
  var r = (size - 10) / 2, circ = 2 * Math.PI * r;
  var dash = circ * Math.min(pct, 100) / 100;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="#E2E8F0" stroke-width="8"/>' +
    '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-dasharray="' + dash + ' ' + circ + '" stroke-dashoffset="' + (circ * 0.25) + '" stroke-linecap="round" transform="rotate(-90 ' + (size/2) + ' ' + (size/2) + ')"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="' + color + '" font-size="' + Math.round(size*0.22) + '" font-weight="700">' + pct + '%</text>' +
    '</svg>';
}

function renderVideoTracking() {
  var sec = pageEl('video-track'); if (!sec) return;
  sec.style.padding = '0';
  var admin = isAdmin(), dh = isDeptHead();

  if (admin || dh) {
    renderVtAdmin(sec);
  } else {
    renderVtEmployee(sec);
  }
}

function renderVtAdmin(sec) {
  var dh = isDeptHead();
  var stats = DB.miskillStats || [];
  var emps = dh ? (DB.employees || []).filter(function (e) { return SESSION && e.dept === SESSION.dept; }) : (DB.employees || []);
  var rows = stats.filter(function (r) {
    if (isDeptHead() && SESSION && SESSION.dept) {
      var e = emps.find(function (e) { return e.id === r.empId || _sameEmail(e.email, r.empEmail) || e.name === r.empName; });
      return !!e;
    }
    return true;
  }).sort(function (a, b) { return miskillScore(b) - miskillScore(a); });

  var weekLabel = rows.length && rows[0].weekStart ? rows[0].weekStart + ' — долоо хоног' : '';
  var adminUrl = '/admin.html?tab=lms';
  var html =
    // Sub-tab header
    '<div style="padding:22px 28px 0 28px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
    '<div><h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0">Видео сургалт (MiSkill)</h1>' +
    '<p style="font-size:13px;color:#64748B;margin:2px 0 0">Сургалт/шалгалт нэмж удирдана — ажилтнууд MiSkill цэсэндээ үзэж, шалгалтаа өгнө</p></div></div>' +
    '<div style="display:flex;gap:6px;border-bottom:2px solid #E2E8F0;margin-bottom:0">' +
    '<button id="vtSubLms" style="padding:9px 18px;border:none;background:none;font-family:inherit;font-size:13px;font-weight:700;color:#1D4ED8;cursor:pointer;border-bottom:2px solid #1D4ED8;margin-bottom:-2px"><i class="ti ti-book-2"></i> Сургалт (удирдлага)</button>' +
    '<button id="vtSubMiskill" style="padding:9px 18px;border:none;background:none;font-family:inherit;font-size:13px;font-weight:700;color:#64748B;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px"><i class="ti ti-chart-bar"></i> Гүйцэтгэлийн тайлан</button>' +
    '</div></div>' +
    // MiSkill/Гүйцэтгэл panel (default hidden — Сургалт default)
    '<div id="vtPanelMiskill" style="display:none">' +
    '<div style="padding:16px 28px 0">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn btn-secondary btn-sm" id="vtTpl"><i class="ti ti-download"></i> Загвар татах</button>' +
    '<button class="btn btn-primary" id="vtImport"><i class="ti ti-upload"></i> CSV байршуулах</button>' +
    '</div>' +
    (weekLabel ? '<div style="background:#EFF6FF;border-radius:8px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#1D4ED8;margin-bottom:8px"><i class="ti ti-calendar-week"></i> Тайлангийн долоо хоног: <strong>' + esc(rows[0].weekStart) + '</strong></div>' : '') +
    '</div>';

  if (!rows.length) {
    html += '<div style="padding:24px">' + emptyBox('MiSkill датагүй байна. CSV байршуулна уу.') + '</div>';
  } else {
    var totalEmps = rows.length;
    var fine = rows.filter(function (r) { return miskillScore(r) >= 70; }).length;
    var avgScore = Math.round(rows.reduce(function (s, r) { return s + miskillScore(r); }, 0) / totalEmps);
    var avgTP = Math.round(rows.reduce(function (s, r) { return s + msPct(r.trainDone, r.trainReq); }, 0) / totalEmps);
    var avgEP = Math.round(rows.reduce(function (s, r) { return s + msPct(r.examDone, r.examReq); }, 0) / totalEmps);

    html += '<div style="padding:0 28px;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
      statCard('Нийт ажилтан', totalEmps, 'ti-users', '#3730A3') +
      statCard('Норм биелүүлсэн', fine, 'ti-circle-check', '#16A34A') +
      statCard('Дундаж оноо', avgScore, 'ti-chart-radar', '#D97706') +
      statCard('Сургалт биелэлт', avgTP + '%', 'ti-player-play', '#0891B2') +
      '</div>';

    html += '<div style="padding:0 28px 28px"><div class="card" style="padding:0;overflow:hidden">' +
      '<table class="data-table" style="width:100%">' +
      '<thead><tr><th style="width:36px">#</th><th>Ажилтан</th><th>Алба</th>' +
      '<th style="text-align:center">Сургалт</th><th style="text-align:center">Шалгалт</th>' +
      '<th style="text-align:center">Нийт оноо</th><th>Байдал</th><th style="text-align:center">7 хоног</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var sc = miskillScore(r), tp = msPct(r.trainDone, r.trainReq), ep = msPct(r.examDone, r.examReq);
        var weekSum = (r.weekDays || []).reduce(function (s, d) { return s + (d.train || 0) + (d.exam || 0); }, 0);
        var empObj = (DB.employees || []).find(function (e) { return e.id === r.empId || e.name === r.empName; });
        var dept = empObj ? empObj.dept : (r.dept || '—');
        var pos = empObj ? (empObj.pos || '') : '';
        var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        return '<tr>' +
          '<td style="text-align:center;color:#94A3B8;font-size:12px">' + medal + (medal ? '' : (i + 1)) + '</td>' +
          '<td><div style="font-weight:600;font-size:13px">' + esc(r.empName || r.empId) + '</div>' +
          (pos ? '<div style="font-size:11px;color:#8A94A6">' + esc(pos) + '</div>' : '') + '</td>' +
          '<td style="font-size:13px;color:#64748B">' + esc(dept) + '</td>' +
          '<td style="text-align:center">' +
          '<div style="font-size:12px;color:#1E293B;font-weight:600">' + r.trainDone + '/' + r.trainReq + '</div>' +
          '<div style="height:4px;background:#E2E8F0;border-radius:4px;margin-top:3px;overflow:hidden"><div style="height:100%;width:' + tp + '%;background:' + msColor(tp) + ';border-radius:4px"></div></div></td>' +
          '<td style="text-align:center">' +
          '<div style="font-size:12px;color:#1E293B;font-weight:600">' + r.examDone + '/' + r.examReq + '</div>' +
          '<div style="height:4px;background:#E2E8F0;border-radius:4px;margin-top:3px;overflow:hidden"><div style="height:100%;width:' + ep + '%;background:' + msColor(ep) + ';border-radius:4px"></div></div></td>' +
          '<td style="text-align:center"><span class="score-pill ' + scoreClass(sc) + '">' + sc + '</span></td>' +
          '<td><span style="background:' + msBg(sc) + ';color:' + msColor(sc) + ';font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px">' + msLabel(sc) + '</span></td>' +
          '<td style="text-align:center;font-size:13px;font-weight:600;color:' + (weekSum > 0 ? '#1D4ED8' : '#CBD5E1') + '">' + (weekSum > 0 ? weekSum : '—') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // Close Гүйцэтгэл panel + add LMS iframe panel (Сургалт — default харагдана)
  html += '</div>' +
    '<div id="vtPanelLms" style="height:calc(100vh - 200px)">' +
    '<iframe src="' + adminUrl + '" style="width:100%;height:100%;border:none;border-radius:0" allow="same-origin"></iframe>' +
    '</div>';

  sec.innerHTML = html;
  if (!sec._vtWired) {
    sec._vtWired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('#vtImport')) importMiskillCSV();
      if (ev.target.closest('#vtTpl')) downloadMiskillTemplate();
      // Sub-tab switching
      if (ev.target.closest('#vtSubMiskill')) {
        document.getElementById('vtPanelMiskill').style.display = '';
        document.getElementById('vtPanelLms').style.display = 'none';
        ev.target.closest('#vtSubMiskill').style.color = '#1D4ED8';
        ev.target.closest('#vtSubMiskill').style.borderBottomColor = '#1D4ED8';
        var lmsBtn = document.getElementById('vtSubLms');
        if (lmsBtn) { lmsBtn.style.color = '#64748B'; lmsBtn.style.borderBottomColor = 'transparent'; }
      }
      if (ev.target.closest('#vtSubLms')) {
        document.getElementById('vtPanelMiskill').style.display = 'none';
        document.getElementById('vtPanelLms').style.display = '';
        ev.target.closest('#vtSubLms').style.color = '#1D4ED8';
        ev.target.closest('#vtSubLms').style.borderBottomColor = '#1D4ED8';
        var msBtn = document.getElementById('vtSubMiskill');
        if (msBtn) { msBtn.style.color = '#64748B'; msBtn.style.borderBottomColor = 'transparent'; }
      }
    });
  }
}

function renderVtEmployee(sec) {
  // Ажилтны MiSkill цэс = админаас нэмсэн сургалтууд (Сургалтын самбар). Үзэж, шалгалтаа өгнө.
  sec.style.padding = '0';
  var eurl = '/employee.html?embed=1';
  // Гарчиг ХАРУУЛАХГҮЙ — дээд баарт аль хэдийн "Видео сургалт (MiSkill)" гэж бичигдсэн,
  // давхардуулбал утсан дээр орон зай дэмий эзэлнэ.
  sec.innerHTML =
    '<div style="height:calc(100vh - 64px);min-height:520px">' +
    '<iframe src="' + eurl + '" style="width:100%;height:100%;border:none;display:block" allow="fullscreen"></iframe>' +
    '</div>';
  return;
  /* eslint-disable */
  var row = miskillFindMyRow();
  var me = myEmp();
  var name = (me && me.name) || (SESSION && SESSION.email) || 'Ажилтан';
  var allStats = DB.miskillStats || [];
  var html = '<div style="background:linear-gradient(135deg,#1D4ED8 0%,#3730A3 100%);padding:22px 24px 36px;color:#fff;position:relative;overflow:hidden">' +
    '<div style="position:absolute;right:-20px;top:-20px;width:140px;height:140px;background:rgba(255,255,255,.06);border-radius:50%"></div>' +
    '<div style="position:absolute;right:30px;bottom:-30px;width:90px;height:90px;background:rgba(255,255,255,.06);border-radius:50%"></div>' +
    '<div style="position:relative"><div style="font-size:12px;opacity:.7;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px">Видео сургалт (MiSkill)</div>' +
    '<div style="font-size:22px;font-weight:700;margin-bottom:2px">' + esc(name) + '</div>' +
    '<div style="font-size:13px;opacity:.7">' + ((me && me.dept) || '') + (me && me.pos ? ' · ' + me.pos : '') + '</div></div></div>';

  if (!row) {
    html += '<div style="margin-top:-16px;padding:0 20px 24px"><div class="card" style="padding:28px;text-align:center">' +
      '<i class="ti ti-cloud-off" style="font-size:40px;color:#CBD5E1;display:block;margin-bottom:10px"></i>' +
      '<div style="font-weight:600;color:#475569;margin-bottom:4px">Мэдээлэл байхгүй</div>' +
      '<div style="font-size:13px;color:#94A3B8">Таны MiSkill сургалтын тайлан ХАБЭА ажилтанд байршуулаагүй байна.</div></div></div>';
    sec.innerHTML = html;
    return;
  }

  var tp = msPct(row.trainDone, row.trainReq);
  var ep = msPct(row.examDone, row.examReq);
  var sc = miskillScore(row);
  var allSorted = allStats.slice().sort(function (a, b) { return miskillScore(b) - miskillScore(a); });
  var rank = allSorted.findIndex(function (r) { return r.empId === row.empId || r.empName === row.empName; }) + 1;
  var total = allSorted.length;
  var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  var rankColor = rank <= 3 ? '#D97706' : rank <= Math.ceil(total * 0.25) ? '#16A34A' : rank <= Math.ceil(total * 0.5) ? '#0891B2' : '#64748B';

  var MON_NAMES = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан'];
  var weekDays = row.weekDays || [{train:0,exam:0},{train:0,exam:0},{train:0,exam:0},{train:0,exam:0},{train:0,exam:0}];
  var maxDayVal = Math.max(1, weekDays.reduce(function (mx, d) { return Math.max(mx, (d.train||0) + (d.exam||0)); }, 0));

  function weekDateStr(start, offset) {
    if (!start) return '';
    try { var d = new Date(start); d.setDate(d.getDate() + offset); return (d.getMonth()+1) + '/' + d.getDate(); } catch(e) { return ''; }
  }

  html += '<div style="margin-top:-16px;padding:0 16px 24px">';

  // Нийт биелэлт хэсэг
  html += '<div class="card" style="padding:20px;margin-bottom:12px">' +
    '<div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px"><i class="ti ti-chart-pie-2"></i> Нийт биелэлт (бүх цаг хугацаа)</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    // Сургалт
    '<div style="text-align:center">' +
    msProgressRing(tp, msColor(tp), 90) +
    '<div style="font-weight:700;color:#1E293B;margin:6px 0 2px;font-size:15px">' + row.trainDone + ' / ' + row.trainReq + '</div>' +
    '<div style="font-size:11px;color:#64748B">Сургалт дууссан</div>' +
    '<div style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:' + msBg(tp) + ';color:' + msColor(tp) + '">' + msLabel(tp) + '</div></div>' +
    // Шалгалт
    '<div style="text-align:center">' +
    msProgressRing(ep, msColor(ep), 90) +
    '<div style="font-weight:700;color:#1E293B;margin:6px 0 2px;font-size:15px">' + row.examDone + ' / ' + row.examReq + '</div>' +
    '<div style="font-size:11px;color:#64748B">Шалгалт дууссан</div>' +
    '<div style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:' + msBg(ep) + ';color:' + msColor(ep) + '">' + msLabel(ep) + '</div></div>' +
    '</div>' +
    // Нийт оноо
    '<div style="margin-top:14px;padding:10px 14px;background:#F8FAFC;border-radius:10px;display:flex;align-items:center;gap:10px">' +
    '<div style="font-size:11px;color:#64748B;flex:1">Нийт MiSkill оноо (сургалт 70% + шалгалт 30%)</div>' +
    '<span class="score-pill ' + scoreClass(sc) + '" style="font-size:16px;padding:4px 14px">' + sc + '</span></div>' +
    '</div>';

  // Өнгөрсөн долоо хоногийн breakdown
  html += '<div class="card" style="padding:20px;margin-bottom:12px">' +
    '<div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px">' +
    '<i class="ti ti-calendar-week"></i> Өнгөрсөн долоо хоног' + (row.weekStart ? ' <span style="font-weight:400;color:#94A3B8;font-size:11px">(' + row.weekStart + ')</span>' : '') + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">' +
    weekDays.slice(0, 5).map(function (d, i) {
      var dayTotal = (d.train || 0) + (d.exam || 0);
      var barH = dayTotal > 0 ? Math.max(16, Math.round(dayTotal / maxDayVal * 60)) : 0;
      var dateStr = weekDateStr(row.weekStart, i);
      var hasTrain = (d.train || 0) > 0, hasExam = (d.exam || 0) > 0;
      return '<div style="text-align:center">' +
        '<div style="font-size:10px;font-weight:700;color:#475569">' + MON_NAMES[i] + '</div>' +
        '<div style="font-size:10px;color:#94A3B8;margin-bottom:6px">' + dateStr + '</div>' +
        '<div style="min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px">' +
        (hasTrain ? '<div style="width:28px;background:#3B82F6;border-radius:4px 4px 0 0;height:' + Math.max(8, Math.round((d.train||0)/maxDayVal*60)) + 'px;position:relative" title="Сургалт: ' + (d.train||0) + '">' +
          '<div style="position:absolute;top:-16px;width:100%;text-align:center;font-size:10px;font-weight:700;color:#1D4ED8">' + d.train + '</div></div>' : '<div style="width:28px;height:8px;background:#F1F5F9;border-radius:4px"></div>') +
        (hasExam ? '<div style="width:28px;background:#10B981;border-radius:0 0 4px 4px;height:' + Math.max(8, Math.round((d.exam||0)/maxDayVal*60)) + 'px;position:relative" title="Шалгалт: ' + (d.exam||0) + '">' +
          '</div>' : '<div style="width:28px;height:8px;background:#F1F5F9;border-radius:4px"></div>') +
        '</div>' +
        '<div style="margin-top:6px;font-size:11px;color:' + (dayTotal > 0 ? '#1E293B' : '#CBD5E1') + ';font-weight:' + (dayTotal > 0 ? '600' : '400') + '">' + (dayTotal > 0 ? dayTotal : '—') + '</div>' +
        '</div>';
    }).join('') + '</div>' +
    '<div style="margin-top:12px;display:flex;gap:14px;font-size:11px;color:#64748B">' +
    '<span><span style="display:inline-block;width:10px;height:10px;background:#3B82F6;border-radius:2px;margin-right:4px"></span>Сургалт</span>' +
    '<span><span style="display:inline-block;width:10px;height:10px;background:#10B981;border-radius:2px;margin-right:4px"></span>Шалгалт</span>' +
    '<span style="margin-left:auto;color:#94A3B8">7 хоногийн нийт: <strong style="color:#1E293B">' + weekDays.reduce(function (s, d) { return s + (d.train||0) + (d.exam||0); }, 0) + '</strong></span>' +
    '</div></div>';

  // Байр эзлэлт
  html += '<div class="card" style="padding:20px;background:linear-gradient(135deg,' + (rank <= 3 ? '#FEF3C7,#FDE68A' : rank <= Math.ceil(total*0.25) ? '#D1FAE5,#A7F3D0' : '#EFF6FF,#DBEAFE') + ')">' +
    '<div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px"><i class="ti ti-trophy"></i> Байр эзлэлт (MiSkill оноогоор)</div>' +
    '<div style="display:flex;align-items:center;gap:16px">' +
    '<div style="font-size:52px;line-height:1">' + (medal || '🎯') + '</div>' +
    '<div style="flex:1">' +
    '<div style="font-size:32px;font-weight:800;color:' + rankColor + ';line-height:1">' + rank + '<span style="font-size:16px;font-weight:500;color:#94A3B8">-р байр</span></div>' +
    '<div style="font-size:13px;color:#475569;margin-top:3px">Нийт <strong>' + total + '</strong> ажилтнаас</div>' +
    '<div style="margin-top:8px;height:6px;background:rgba(0,0,0,.08);border-radius:6px;overflow:hidden">' +
    '<div style="height:100%;width:' + Math.round((1 - (rank-1)/Math.max(1,total-1)) * 100) + '%;background:' + rankColor + ';border-radius:6px"></div></div>' +
    '<div style="font-size:11px;color:#64748B;margin-top:3px">Дээд ' + Math.round(rank/total*100) + '% дотор</div>' +
    '</div>' +
    '<div style="text-align:center;padding:12px 16px;background:rgba(255,255,255,.7);border-radius:12px">' +
    '<div style="font-size:11px;color:#64748B;margin-bottom:2px">Миний оноо</div>' +
    '<div style="font-size:28px;font-weight:800;color:' + rankColor + '">' + sc + '</div>' +
    '<div style="font-size:11px;color:#94A3B8">/ 100</div></div>' +
    '</div></div>';

  html += '</div>';
  sec.innerHTML = html;
}

function downloadMiskillTemplate() {
  var header = 'empid,empname,train_req,train_done,exam_req,exam_done,week_start,mon_train,mon_exam,tue_train,tue_exam,wed_train,wed_exam,thu_train,thu_exam,fri_train,fri_exam';
  var rows = [
    'EMP-001,Болд Баатар,20,15,10,8,2026-06-09,3,1,2,0,3,2,2,1,1,0',
    'EMP-002,Сарнай Ганбаатар,20,18,10,9,2026-06-09,4,2,3,1,4,2,3,1,2,1',
    'EMP-003,Энхбат Лхагва,20,10,10,5,2026-06-09,2,0,1,0,2,1,1,0,0,0'
  ];
  download('miskill-zagvar.csv', '﻿' + header + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
}

function importMiskillCSV() {
  var node = elc('div', 'modal-info');
  node.innerHTML = '<div style="font-size:13.5px;line-height:1.6;color:#475569;margin-bottom:14px">' +
    '<p style="margin:0 0 8px">MiSkill платформоос татсан <strong>CSV файл</strong> байршуулна. Баганууд:</p>' +
    '<div style="background:#F8FAFC;border-radius:8px;padding:10px 12px;font-family:monospace;font-size:12px;color:#1D4ED8;border:1px solid #E2E8F0">' +
    'empid, empname, train_req, train_done, exam_req, exam_done, week_start,<br>' +
    'mon_train, mon_exam, tue_train, tue_exam, wed_train, wed_exam,<br>' +
    'thu_train, thu_exam, fri_train, fri_exam</div></div>' +
    '<label class="rf-photo" id="msLbl" style="margin-bottom:10px"><input type="file" accept=".csv,text/csv" id="msCsv" hidden><i class="ti ti-file-spreadsheet"></i><span>CSV файл сонгох</span></label>' +
    '<button class="btn btn-secondary btn-sm" id="msTpl"><i class="ti ti-download"></i> Загвар татах</button>';

  node.addEventListener('click', function (ev) {
    if (ev.target.closest('#msTpl')) { downloadMiskillTemplate(); return; }
  });

  node.querySelector('#msCsv').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function (ev) {
      try {
        var parsed = parseCSV(ev.target.result);
        if (!parsed.length) { toast('Файл хоосон байна', 'warn'); return; }
        var imported = 0, skipped = 0;
        DB.miskillStats = DB.miskillStats || [];
        parsed.forEach(function (row) {
          var empid = (row['empid'] || row['EmployeeID'] || row[Object.keys(row)[0]] || '').trim();
          var empname = (row['empname'] || row['EmployeeName'] || row[Object.keys(row)[1]] || '').trim();
          if (!empid && !empname) { skipped++; return; }
          var r = {
            empId: empid, empName: empname,
            trainReq: num(row['train_req'] || row['TrainRequired'] || 0),
            trainDone: num(row['train_done'] || row['TrainDone'] || 0),
            examReq: num(row['exam_req'] || row['ExamRequired'] || 0),
            examDone: num(row['exam_done'] || row['ExamDone'] || 0),
            weekStart: (row['week_start'] || row['WeekStart'] || '').trim(),
            weekDays: [
              { train: num(row['mon_train']||0), exam: num(row['mon_exam']||0) },
              { train: num(row['tue_train']||0), exam: num(row['tue_exam']||0) },
              { train: num(row['wed_train']||0), exam: num(row['wed_exam']||0) },
              { train: num(row['thu_train']||0), exam: num(row['thu_exam']||0) },
              { train: num(row['fri_train']||0), exam: num(row['fri_exam']||0) }
            ],
            updatedAt: todayISO()
          };
          var idx = DB.miskillStats.findIndex(function (x) { return x.empId === empid || x.empName === empname; });
          if (idx >= 0) { DB.miskillStats[idx] = r; } else { DB.miskillStats.push(r); }
          imported++;
        });
        saveDB();
        closeModal();
        renderVideoTracking();
        infoModal('MiSkill импортын дүн', '<div style="font-size:14px;line-height:1.8">' +
          '<div>✅ Шинэчлэгдсэн/нэмэгдсэн: <strong>' + imported + '</strong> ажилтан</div>' +
          (skipped ? '<div>⚠️ Алгассан мөр: <strong>' + skipped + '</strong></div>' : '') +
          '<div style="margin-top:8px;font-size:13px;color:#64748B">Ажилтнуудад шинэ тайлан нь автоматаар харагдана.</div></div>');
      } catch (e) { toast('Файл уншихад алдаа: ' + e.message, 'error'); }
    };
    rd.readAsText(f, 'UTF-8');
  });
  buildModal('MiSkill CSV байршуулах', node, { width: '480px' });
}

/* ============ Даалгавар ============ */
function renderTasks() {
  var sec = pageEl('tasks'); if (!sec) return;
  sec.style.padding = '';
  DB.tasks = DB.tasks || [];
  var admin = isAdmin(), dh = isDeptHead(), emp = isEmp();
  var me = emp ? myEmp() : null;

  /* Role-д тохирсон даалгаврыг шүүх */
  var tasks = DB.tasks.filter(function (t) {
    if (admin) return true;
    if (dh && SESSION) {
      if (t.createdByEmail && t.createdByEmail === SESSION.email) return true;
      return SESSION.dept ? (t.dept === SESSION.dept || t.dept === 'all') : false;
    }
    if (emp) return me && (t.empId === me.id || (t.empIds && t.empIds.indexOf(me.id) > -1) || t.dept === me.dept || t.dept === 'all');
    return false;
  }).sort(taskSortFn);

  var review = tasks.filter(function (x) { return x.status === 'submitted'; });
  var open   = tasks.filter(function (x) { return x.status !== 'submitted' && !taskIsClosed(x); });
  var closed = tasks.filter(taskIsClosed);
  var myReview = review.filter(canReviewTask);
  var overdue = tasks.filter(function (x) { return taskOverdueDays(x) > 0; });

  /* Badge — хянагчид "хянах", ажилтанд "хийх" тоо */
  var badge = document.getElementById('taskBadge');
  var bn = (admin || dh) ? (myReview.length || open.length) : open.length;
  if (badge) { badge.textContent = bn; badge.style.display = bn ? 'inline-block' : 'none'; }

  var html = '<div class="page-header"><div><h1>Даалгавар</h1>' +
    '<p class="page-subtitle">Даалгавар өгөх → ажилтан гүйцэтгэх → хянагч үнэлгээ өгч баталгаажуулах</p></div>' +
    (admin || dh ? '<div class="page-actions"><button class="btn btn-primary" id="taskAdd"><i class="ti ti-plus"></i> Даалгавар нэмэх</button></div>' : '') +
    '</div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
    statCard('Нийт даалгавар', tasks.length, 'ti-checkbox', '#3730A3') +
    statCard('Хийгдэх', open.length, 'ti-clock', '#D97706') +
    statCard('Хянагдаж буй', review.length, 'ti-eye-search', '#7C3AED') +
    statCard('Хугацаа хэтэрсэн', overdue.length, 'ti-alarm', '#DC2626') +
    statCard('Баталгаажсан', closed.length, 'ti-circle-check', '#16A34A') +
    '</div>';

  function statusPill(x) {
    if (x.status === 'approved') {
      var s = taskScoreOf(x);
      var c = s >= 85 ? '#16A34A' : (s >= 70 ? '#0891B2' : (s >= 50 ? '#D97706' : '#DC2626'));
      return '<span style="background:' + c + '18;color:' + c + ';border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">✓ Баталгаажсан · ' + s + '%</span>';
    }
    if (x.status === 'done')      return '<span style="background:#16A34A18;color:#16A34A;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">✓ Биелсэн</span>';
    if (x.status === 'submitted') return '<span style="background:#7C3AED18;color:#7C3AED;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">⏳ Хянагдаж байна</span>';
    if (x.status === 'returned')  return '<span style="background:#DC262618;color:#DC2626;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">↩ Буцаагдсан</span>';
    return '<span style="background:#64748B18;color:#64748B;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">Хийгдэх</span>';
  }

  function taskCard(x) {
    var closedT = taskIsClosed(x);
    var od = taskOverdueDays(x), soon = taskDueSoon(x), late = taskLateDays(x);
    var pr = taskPrio(x);
    var deptLabel = x.dept === 'all' ? 'Бүх алба' : esc(x.dept || '');
    var ids = (x.empIds && x.empIds.length) ? x.empIds : (x.empId ? [x.empId] : []);
    var empLabel = ids.map(function (eid) { return esc(((DB.employees || []).filter(function (e) { return e.id === eid; })[0] || {}).name || eid); }).join(', ');
    var targetLabel = empLabel ? (deptLabel + ' · ' + empLabel) : deptLabel;

    /* Ажилтан өөрт нь оногдсон, хийгдээгүй даалгаврыг ИЛГЭЭНЭ */
    var mine = me && ids.indexOf(me.id) > -1;
    var canSubmit = !closedT && x.status !== 'submitted' && (mine || (emp && !ids.length));
    var canReview = x.status === 'submitted' && canReviewTask(x);
    var canRegrade = x.status === 'approved' && canReviewTask(x);

    var side = '#EEF1F4', ic = '#EFF6FF', icc = '#1D4ED8', icn = 'checkbox';
    if (x.status === 'submitted') { side = '#DDD6FE'; ic = '#F5F3FF'; icc = '#7C3AED'; icn = 'eye-search'; }
    else if (closedT)             { side = '#D1FAE5'; ic = '#D1FAE5'; icc = '#065F46'; icn = 'circle-check'; }
    else if (x.status === 'returned') { side = '#FECACA'; ic = '#FEF2F2'; icc = '#DC2626'; icn = 'arrow-back-up'; }

    return '<div style="background:#fff;border:1px solid ' + side + ';border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px">' +
      '<div style="width:36px;height:36px;border-radius:9px;background:' + ic + ';color:' + icc + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px"><i class="ti ti-' + icn + '"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-weight:600;font-size:14px' + (closedT ? ';color:#94A3B8' : '') + '">' + esc(x.title) + '</span>' +
        (!closedT && x.priority && x.priority !== 'normal' ? '<span style="background:' + pr.color + '18;color:' + pr.color + ';border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">' + esc(pr.label) + '</span>' : '') +
        (od ? '<span style="background:#DC262618;color:#DC2626;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">⏰ ' + od + ' хоног хэтэрсэн</span>' : '') +
        (!od && soon ? '<span style="background:#D9770618;color:#D97706;border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:800">Хугацаа ойртсон</span>' : '') +
        statusPill(x) + '</div>' +
        (x.desc ? '<div style="font-size:13px;color:#64748B;margin-top:3px">' + esc(x.desc) + '</div>' : '') +
        '<div style="font-size:11px;color:#94A3B8;margin-top:6px;display:flex;gap:10px;flex-wrap:wrap">' +
        '<span><i class="ti ti-building"></i> ' + targetLabel + '</span>' +
        (x.category && TASK_CAT[x.category] ? '<span><i class="ti ti-tag"></i> ' + esc(TASK_CAT[x.category]) + '</span>' : '') +
        (x.startDate ? '<span style="color:#0891B2"><i class="ti ti-player-play"></i> Эхлэх: ' + esc(x.startDate) + '</span>' : '') +
        (x.dueDate ? '<span' + (od ? ' style="color:#DC2626;font-weight:700"' : (soon ? ' style="color:#D97706;font-weight:700"' : '')) + '><i class="ti ti-calendar"></i> Дуусах: ' + esc(x.dueDate) + '</span>' : '') +
        (x.repeat && TASK_REPEAT[x.repeat] ? '<span style="color:#7C3AED"><i class="ti ti-repeat"></i> ' + esc(TASK_REPEAT[x.repeat]) + '</span>' : '') +
        '<span><i class="ti ti-user"></i> ' + esc(x.createdBy || 'Админ') + '</span>' +
        (x.submittedAt ? '<span style="color:#7C3AED"><i class="ti ti-send"></i> ' + esc((x.submittedAt || '').slice(0, 10)) + (late ? ' (' + late + ' хоног хоцорсон)' : '') + '</span>' : '') +
        '</div>' +
        (x.refUrl ? '<div style="margin-top:8px"><a href="' + esc(x.refUrl) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#4F46E5;text-decoration:none;background:#EEF2FF;border-radius:8px;padding:6px 11px"><i class="ti ti-paperclip"></i> Заавар файл' + (x.refUrlName ? ': ' + esc(x.refUrlName) : '') + '</a></div>' : '') +
        (x.submitNote ? '<div style="margin-top:8px;background:#F8FAFC;border-radius:9px;padding:8px 11px;font-size:12.5px;color:#475569"><b>Ажилтны тайлбар:</b> ' + esc(x.submitNote) + '</div>' : '') +
        (x.proofUrl ? '<div style="margin-top:6px"><a href="' + esc(x.proofUrl) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#047857;text-decoration:none;background:#ECFDF5;border-radius:8px;padding:6px 11px"><i class="ti ti-photo-check"></i> Гүйцэтгэлийн нотолгоо' + (x.proofName ? ': ' + esc(x.proofName) : '') + '</a></div>' : '') +
        (x.reviewComment ? '<div style="margin-top:6px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:9px;padding:8px 11px;font-size:12.5px;color:#92400E"><b>Хянагчийн тайлбар' + (x.reviewedBy ? ' (' + esc(x.reviewedBy) + ')' : '') + ':</b> ' + esc(x.reviewComment) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">' +
      (canSubmit ? '<button class="btn btn-sm" style="background:#EDE9FE;color:#5B21B6;border-color:#DDD6FE" data-task-submit="' + esc(x.id) + '"><i class="ti ti-send"></i> Гүйцэтгэсэн</button>' : '') +
      (canReview ? '<button class="btn btn-sm btn-primary" data-task-review="' + esc(x.id) + '"><i class="ti ti-eye-check"></i> Хянах</button>' : '') +
      (canRegrade ? '<button class="btn btn-sm" style="background:#F1F5F9;color:#475569;border-color:#E2E8F0" data-task-review="' + esc(x.id) + '"><i class="ti ti-pencil"></i> Дүн засах</button>' : '') +
      (admin ? '<button class="btn btn-sm" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA" data-task-del="' + esc(x.id) + '"><i class="ti ti-trash"></i></button>' : '') +
      '</div></div>';
  }

  if (myReview.length) {
    html += '<div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:14px;padding:14px 16px;margin-bottom:16px">' +
      '<div style="font-size:14px;font-weight:800;color:#5B21B6;margin-bottom:4px">⏳ Таны хянах ёстой ' + myReview.length + ' даалгавар</div>' +
      '<div style="font-size:12.5px;color:#6D28D9">Гүйцэтгэлийг нь үзээд үнэлгээ өгнө үү. Үнэлгээ нь ажилтны KPI оноонд шууд нөлөөлнө.</div></div>';
  }

  html += (review.length ? '<h3 style="margin:0 0 10px;font-size:15px;color:#7C3AED">Хянагдаж буй ' + review.length + '</h3>' + review.map(taskCard).join('') : '') +
    '<h3 style="margin:' + (review.length ? '18px' : '0') + ' 0 10px;font-size:15px">Хийгдэх ' + open.length + '</h3>' +
    (open.length ? open.map(taskCard).join('') : emptyBox('Хийгдэх даалгавар алга')) +
    (closed.length ? '<h3 style="margin:18px 0 10px;font-size:15px;color:#94A3B8">Баталгаажсан ' + closed.length + '</h3>' + closed.map(taskCard).join('') : '');

  sec.innerHTML = html;

  if (!sec._taskWired) {
    sec._taskWired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('#taskAdd')) { actionAddTask(); return; }

      var sb = ev.target.closest('[data-task-submit]');
      if (sb) { actionSubmitTask(sb.getAttribute('data-task-submit')); return; }

      var rv = ev.target.closest('[data-task-review]');
      if (rv) { actionReviewTask(rv.getAttribute('data-task-review')); return; }

      var dl = ev.target.closest('[data-task-del]');
      if (dl) {
        var tid2 = dl.getAttribute('data-task-del');
        if (!confirm('Энэ даалгаврыг устгах уу?')) return;
        DB.tasks = DB.tasks.filter(function (x) { return x.id !== tid2; });
        saveDB(); renderTasks(); renderDashboard();
        toast('Даалгавар устгагдлаа', 'warn');
      }
    });
  }
}

/* ── Ажилтан гүйцэтгээд хянуулахаар илгээх ── */
function actionSubmitTask(tid) {
  var x = (DB.tasks || []).filter(function (y) { return y.id === tid; })[0];
  if (!x) return;
  formModal({
    title: 'Даалгавар гүйцэтгэсэн — ' + (x.title || ''),
    width: '480px',
    fields: [
      { name: 'note', label: 'Юу хийснээ товч бичнэ үү (заавал биш)', type: 'textarea', rows: 4,
        placeholder: 'Жишээ: Цехийн гал унтраагуурыг бүрэн шалгаж, 2 ширхгийг сольсон.' },
      { name: 'proof', label: '📷 Гүйцэтгэлийн нотолгоо — зураг эсвэл файл (заавал биш)', type: 'file',
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx' }
    ],
    submitLabel: 'Хянуулахаар илгээх',
    onSubmit: function (v) {
      x.status = 'submitted';
      x.submitNote = (v.note || '').trim();
      x.proofUrl = v.proof || '';
      x.proofName = v.proofName || '';
      x.submittedBy = USER.name;
      x.submittedAt = new Date().toISOString();
      x.reviewComment = '';
      saveDB(); renderTasks(); renderDashboard();
      toast('Хянуулахаар илгээгдлээ. Хянагч үнэлгээ өгнө.', 'success');
    }
  });
}

/* ── Хянагч үнэлгээ өгч баталгаажуулах ── */
function actionReviewTask(tid) {
  var x = (DB.tasks || []).filter(function (y) { return y.id === tid; })[0];
  if (!x) return;
  if (!canReviewTask(x)) { toast('Танд энэ даалгаврыг хянах эрх байхгүй', 'warn'); return; }
  var ids = (x.empIds && x.empIds.length) ? x.empIds : (x.empId ? [x.empId] : []);
  var who = ids.map(function (id) { return ((DB.employees || []).filter(function (e) { return e.id === id; })[0] || {}).name || id; }).join(', ');

  var lateN = taskLateDays(x);
  var lateTxt = lateN ? ' ⏰ ХУГАЦАА ' + lateN + ' ХОНОГ ХОЦОРСОН' : '';
  var proofTxt = x.proofUrl ? ' 📎 Нотолгоо хавсаргасан' : ' ⚠ Нотолгоо хавсаргаагүй';

  formModal({
    title: 'Гүйцэтгэл хянах — ' + (x.title || ''),
    width: '540px',
    fields: [
      { name: 'score', label: 'Гүйцэтгэлийн үнэлгээ' + (who ? ' · ' + who : '') + lateTxt + ' ·' + proofTxt, type: 'select',
        value: String(x.score != null ? x.score : 100),
        options: [
          { value: '100', label: '100% — Маш сайн, бүрэн гүйцэт' },
          { value: '85',  label: '85% — Сайн, бага зэрэг дутуу' },
          { value: '70',  label: '70% — Дунд, засах зүйлтэй' },
          { value: '50',  label: '50% — Хангалтгүй' },
          { value: '30',  label: '30% — Маш муу' },
          { value: '0',   label: '0% — Огт хийгээгүйтэй адил' }
        ] },
      { name: 'comment', label: 'Тайлбар (ажилтан харна)', type: 'textarea', rows: 3,
        value: x.reviewComment || '', placeholder: 'Юуг сайжруулах ёстойг бичвэл ажилтанд тустай.' },
      { name: 'decision', label: 'Шийдвэр', type: 'select', value: 'approve',
        options: [
          { value: 'approve', label: '✅ Баталгаажуулах (үнэлгээ хүчинтэй болно)' },
          { value: 'return',  label: '↩ Буцаах — дахин хийлгэх' }
        ] }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      x.reviewComment = (v.comment || '').trim();
      x.reviewedBy = USER.name;
      x.reviewedAt = new Date().toISOString();
      if (v.decision === 'return') {
        x.status = 'returned';
        x.score = null;
        saveDB(); renderTasks(); renderDashboard();
        toast('Даалгавар буцаагдлаа. Ажилтан дахин гүйцэтгэнэ.', 'warn');
        return;
      }
      var s = clamp(parseInt(v.score, 10) || 0, 0, 100);
      x.status = 'approved';
      x.score = s;
      x.completedBy = x.submittedBy || USER.name;
      x.completedAt = x.submittedAt || new Date().toISOString();
      try { taskRepeatNext(x); } catch (err) { console.error('[task repeat]', err); }
      saveDB(); renderTasks(); renderDashboard();
      toast('Баталгаажлаа · үнэлгээ ' + s + '%' + (x.repeat ? ' · дараагийнх автоматаар үүслээ' : '') + ' — KPI-д тооцогдлоо', 'success');
    }
  });
}
function actionAddTask() {
  var deptOpts = [{ value: 'all', label: 'Бүх алба' }].concat(deptList().map(function (d) { return { value: d, label: d }; }));
  var empOpts = (DB.employees || []).slice().sort(function (a, b) { return (a.dept + a.name).localeCompare(b.dept + b.name); })
    .map(function (e) { return { value: e.id, label: e.name + ' · ' + (e.dept || '') }; });
  formModal({
    title: 'Шинэ даалгавар',
    width: '520px',
    fields: [
      { name: 'title', label: 'Даалгаврын гарчиг', type: 'text', required: true, placeholder: 'Юу хийх ёстой...' },
      { name: 'desc', label: 'Тайлбар (заавал биш)', type: 'textarea', placeholder: 'Дэлгэрэнгүй...' },
      { name: 'category', label: 'Ангилал', type: 'select', value: 'other',
        options: Object.keys(TASK_CAT).map(function (k) { return { value: k, label: TASK_CAT[k] }; }) },
      { name: 'priority', label: 'Ач холбогдол', type: 'select', value: 'normal',
        options: [
          { value: 'urgent', label: '🔴 Яаралтай — нэн даруй хийх' },
          { value: 'high',   label: '🟠 Өндөр — эн тэргүүнд' },
          { value: 'normal', label: '🔵 Энгийн' },
          { value: 'low',    label: '⚪ Бага — цаг гарвал' }
        ] },
      { name: 'dept', label: 'Хаана өгөх (алба)', type: 'select', options: deptOpts, value: 'all' },
      { name: 'empIds', label: 'Тодорхой ажилтнуудад (заавал биш — олон сонгож болно)', type: 'checkboxlist',
        options: empOpts, value: [], searchable: true, searchPlaceholder: '🔍 Ажилтны нэр эсвэл албаар хайх...' },
      { name: 'startDate', label: 'Эхлэх огноо (заавал биш)', type: 'date', value: '' },
      { name: 'dueDate', label: 'Дуусах огноо (заавал биш)', type: 'date', value: '' },
      { name: 'repeat', label: 'Давтамж — дуусмагц дараагийнх нь автоматаар үүснэ', type: 'select', value: '',
        options: [{ value: '', label: 'Давтахгүй (нэг удаа)' }].concat(
          Object.keys(TASK_REPEAT).map(function (k) { return { value: k, label: TASK_REPEAT[k] }; })) },
      { name: 'refUrl', label: 'Заавар / загвар файл хавсаргах (заавал биш)', type: 'file',
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx' }
    ],
    submitLabel: 'Нэмэх',
    onSubmit: function (v) {
      DB.tasks = DB.tasks || [];
      var empIds = Array.isArray(v.empIds) ? v.empIds.filter(Boolean) : [];
      DB.tasks.unshift({
        id: nextId('TSK', DB.tasks),
        title: v.title,
        desc: v.desc || '',
        dept: v.dept || 'all',
        empId: empIds[0] || '',
        empIds: empIds,
        startDate: v.startDate || '',
        dueDate: v.dueDate || '',
        priority: v.priority || 'normal',
        category: v.category || 'other',
        repeat: v.repeat || '',
        refUrl: v.refUrl || '',
        refUrlName: v.refUrlName || '',
        status: 'open',
        createdBy: USER.name,
        createdByEmail: (SESSION && SESSION.email) || '',
        createdAt: new Date().toISOString(),
        completedBy: '',
        completedAt: ''
      });
      saveDB(); renderTasks();
      toast('Даалгавар нэмэгдлээ', 'success');
    }
  });
}

function renderAll() {
  [renderSidebar, renderDashboard, renderEmployees, renderKpiPage,
   renderHazards, renderIncidents, renderReportflow, renderSuggestions,
   renderSettings, renderNotifBadge, renderPpe, renderInspections,
   renderDataflow, renderVideoTracking, renderTasks, renderViolationsPage].forEach(function (fn) {
    try { fn(); } catch (err) { console.error('[renderAll] ' + fn.name + ':', err); }
  });
  // renderDashboard унасан ч дашбоардын харагдац цэвэрхэн үлдэнэ
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
      { name: 'dept', label: 'Хэлтэс', type: 'select', options: deptList() },
      { name: 'body', label: 'Дэлгэрэнгүй', type: 'textarea', required: true, rows: 4, placeholder: 'Асуудал ба санал болгож буй шийдэл...' }
    ],
    submitLabel: 'Илгээх',
    onSubmit: function (v) {
      var s = {
        id: newId('SG'), title: v.title, body: v.body, dept: v.dept,
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
      { name: 'dept', label: 'Хэлтэс', type: 'select', options: deptList() },
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
  var _hasD2 = deptHasDavtan(e.dept, currentSalaryKey());
  var _vidW2 = _f(w.video) + (_hasD2 ? 0 : _f(w.davtan));
  var cats = [
    ['Босго оноо (осол/зөрчилгүй)', kpiBosgo(e), w.bosgo],
    ['Давтан + шалгалт' + (_hasD2 ? '' : ' (энэ сард давтангүй)'), _hasD2 ? kpiDavtan(e) : null, _hasD2 ? w.davtan : 0],
    ['Видео сургалт (LMS)', kpiVideo(e), _vidW2],
    ['Даалгаврын биелэлт', kpiTask(e), w.task]
  ].map(function (c) { return [c[0], (c[1] == null ? 0 : c[1]), c[2], c[1] == null]; });
  var bp = empBonusPoints(e);
  var html = '<div class="detail-grid">' +
    '<div class="detail-row"><span>Албан тушаал</span><b>' + esc(e.role) + '</b></div>' +
    '<div class="detail-row"><span>Алба</span><b>' + esc(e.dept) + '</b></div>' +
    '<div class="detail-row"><span>Код</span><b>' + esc(e.id) + '</b></div>' +
    '<div class="detail-row"><span>Имэйл</span><b>' + esc(e.email || '—') + '</b></div>' +
    '<div class="detail-row"><span>Төлөв</span><b>' + (e.onLeave ? 'Чөлөөтэй' : 'Идэвхтэй') + '</b></div></div>' +
    '<div style="font-size:12px;color:#8A94A6;margin:12px 2px 4px;font-weight:600">СУУРЬ ҮЗҮҮЛЭЛТ · ' + empBase(e) + '/100</div>' +
    '<div class="kpi-breakdown">' + cats.map(function (c) {
      var noData = c[3];
      return '<div class="kb-row"><div class="kb-name">' + esc(c[0]) + ' <small>· жин ' + c[2] + '%' + (noData ? ' · дата алга' : '') + '</small></div>' +
        '<div class="kb-bar"><div class="kb-fill" style="width:' + c[1] + '%' + (noData ? ';opacity:.3' : '') + '"></div></div>' +
        '<div class="kb-val">' + (noData ? '—' : c[1]) + '</div></div>';
    }).join('') + '</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;background:#F0FDF4;border-radius:10px">' +
    '<i class="ti ti-gift" style="color:#16A34A;font-size:18px"></i>' +
    '<div style="flex:1"><div style="font-weight:600">Нэмэгдэх бонус</div>' +
    '<div style="font-size:12px;color:#64748B">Баталгаажсан аюул / near-miss мэдээллээс</div></div>' +
    '<div style="font-weight:700;color:#16A34A;font-size:18px">+' + bp + '</div></div>' +
    habeaExamsHTML(e) +
    // Энэ цалингийн сарын зөрчлүүд (босго онооноос хасагдсан)
    (function () {
      var vlist = empViolations(e);
      var rows = vlist.map(function (v) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #FEE2E2">' +
          '<i class="ti ti-alert-octagon" style="color:#DC2626"></i>' +
          '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600;color:#991B1B">' + esc(v.desc || 'Зөрчил') + '</div>' +
          '<div style="font-size:11px;color:#B91C1C">' + esc((v.date || '').slice(0, 10)) + '</div></div>' +
          '<span style="font-weight:700;color:#DC2626">-' + _f(v.points, 50) + '</span>' +
          (isAdmin() ? '<button class="icon-btn-sm" data-del-viol="' + esc(v.id) + '" title="Устгах" style="color:#DC2626">✕</button>' : '') +
          '</div>';
      }).join('');
      return '<div style="margin-top:10px;padding:10px 12px;background:#FEF2F2;border-radius:10px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (rows ? '6px' : '0') + '">' +
        '<i class="ti ti-shield-x" style="color:#DC2626;font-size:16px"></i>' +
        '<div style="flex:1;font-weight:600;font-size:13px">Энэ сарын осол/зөрчил (босго оноо: ' + kpiBosgo(e) + ')</div>' +
        (isAdmin() ? '<button class="btn btn-sm" data-add-viol="1" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA"><i class="ti ti-plus"></i> Бүртгэх</button>' : '') +
        '</div>' + (rows || '<div style="font-size:12px;color:#16A34A">Зөрчилгүй — босго оноо бүтэн ✓</div>') + '</div>';
    })() +
    '<div class="kb-total">Нийт KPI оноо: <strong>' + empTotal(e) + ' / 100</strong></div>' +
    (isAdmin() ? '<div class="detail-actions">' +
    '<button class="btn btn-secondary" data-emp-leave="' + e.id + '">' +
    (e.onLeave ? 'Идэвхтэй болгох' : 'Чөлөө олгох') + '</button>' +
    '<button class="btn btn-secondary" data-emp-role="' + e.id + '"><i class="ti ti-shield-cog"></i> Системийн эрх</button>' +
    '<button class="btn btn-primary" data-emp-edit="' + e.id + '">Суурь дата засах</button></div>' : '');
  var node = elc('div', 'modal-info', html);
  node.addEventListener('click', function (ev) {
    var lv = ev.target.closest('[data-emp-leave]');
    if (lv) { e.onLeave = !e.onLeave; saveDB(); renderEmployees(); closeModal(); toast('Ажилтны төлөв шинэчлэгдлээ'); return; }
    var ed = ev.target.closest('[data-emp-edit]');
    if (ed) { closeModal(); editEmployeeScores(e.id); return; }
    var er = ev.target.closest('[data-emp-role]');
    if (er) { closeModal(); actionSetEmpRole(e.id); return; }
    var av = ev.target.closest('[data-add-viol]');
    if (av) { closeModal(); openAddViolationModal(e.id); return; }
    var dv = ev.target.closest('[data-del-viol]');
    if (dv) {
      if (!confirm('Энэ зөрчлийн бүртгэлийг устгах уу? Босго оноо сэргэнэ.')) return;
      var vid = dv.getAttribute('data-del-viol');
      DB.violations = (DB.violations || []).filter(function (v) { return v.id !== vid; });
      saveDB(); closeModal(); renderEmployees(); renderDashboard();
      toast('Зөрчил устгагдлаа', 'success');
      openEmployeeDetail(e.id);
    }
  });
  buildModal(esc(e.name), node, { width: '480px' });
}

/* Осол/зөрчил бүртгэх — босго онооноос хасагдана (зөвхөн админ) */
function openAddViolationModal(empId) {
  if (!isAdmin() && !isDeptHead()) return;
  var locked = empId ? DB.employees.filter(function (x) { return x.id === empId; })[0] : null;
  // Ажилтан сонгох жагсаалт (depthead бол зөвхөн өөрийн алба)
  var pickable = (DB.employees || []).filter(function (e) {
    return !isDeptHead() || (SESSION && e.dept === SESSION.dept);
  }).slice().sort(function (a, b) { return (a.dept || '').localeCompare(b.dept || '', 'mn') || (a.name || '').localeCompare(b.name || '', 'mn'); });
  var fields = [];
  if (locked) {
    fields.push({ name: 'empId', label: 'Ажилтан', type: 'select', value: locked.id, options: [{ value: locked.id, label: locked.name + ' · ' + (locked.dept || '') }] });
  } else {
    fields.push({ name: 'empId', label: 'Ажилтан сонгох', type: 'select', value: (pickable[0] && pickable[0].id) || '',
      options: pickable.map(function (e) { return { value: e.id, label: e.name + ' · ' + (e.dept || '') }; }) });
  }
  fields.push({ name: 'desc', label: 'Осол/зөрчлийн тайлбар', type: 'text', value: '', placeholder: 'жишээ: ХХХ-гүй ажилласан / ослын буруутай тал / аюулгүй ажиллагааны зөрчил' });
  fields.push({ name: 'date', label: 'Огноо', type: 'date', value: todayISO() });
  fields.push({ name: 'points', label: 'Хасах оноо', type: 'select', value: '50',
    options: [{ value: '25', label: '-25 (хөнгөн зөрчил)' }, { value: '50', label: '-50 (дунд зөрчил)' }, { value: '100', label: '-100 (ноцтой осол/зөрчил)' }] });
  formModal({
    title: 'Осол/зөрчил бүртгэх',
    width: '480px',
    fields: fields,
    submitLabel: 'Бүртгэх',
    onSubmit: function (v) {
      var eid = v.empId || (locked && locked.id);
      var e = DB.employees.filter(function (x) { return x.id === eid; })[0];
      if (!e) { toast('Ажилтан сонгоно уу', 'warn'); return; }
      DB.violations = DB.violations || [];
      DB.violations.push({
        id: 'VL-' + Date.now(), empId: eid,
        date: v.date || todayISO(), desc: (v.desc || '').trim() || 'Зөрчил',
        points: clamp(num(v.points, 50), 0, 100),
        by: (SESSION && SESSION.email) || 'admin', createdAt: new Date().toISOString()
      });
      saveDB();
      renderEmployees(); renderDashboard(); renderKpiPage(); renderViolationsPage();
      toast(esc(e.name) + ' — осол/зөрчил бүртгэгдэж, босго оноо хасагдлаа', 'warn');
    }
  });
}

/* Осол/зөрчлийн бүртгэлийн хуудас — админ/албаны дарга */
function renderViolationsPage() {
  var sec = pageEl('violations'); if (!sec) return;
  if (!isAdmin() && !isDeptHead()) { sec.innerHTML = ''; return; }
  var key = currentSalaryKey();
  var dh = isDeptHead();
  var emps = (DB.employees || []).filter(function (e) { return !dh || (SESSION && e.dept === SESSION.dept); });
  var vios = (DB.violations || []).filter(function (v) {
    if (salaryMonthKey(v.date || v.createdAt) !== key) return false;
    var e = DB.employees.filter(function (x) { return x.id === v.empId; })[0];
    return e && (!dh || (SESSION && e.dept === SESSION.dept));
  }).sort(function (a, b) { return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt); });

  var withViol = {};
  vios.forEach(function (v) { withViol[v.empId] = 1; });
  var affectedCnt = Object.keys(withViol).length;
  var cleanCnt = emps.filter(function (e) { return !e.onLeave; }).length - affectedCnt;

  var html = '<div class="page-header"><div><h1>Осол/зөрчлийн бүртгэл</h1>' +
    '<p class="page-subtitle">Цалингийн сар: ' + esc(salaryKeyLabel(key)) + ' · Осол/зөрчил бүртгэхэд босго оноо хасагдана. Осолгүй ажилтан автоматаар бүтэн босго авна.</p></div>' +
    '<div class="page-actions"><button class="btn btn-primary" id="vioAdd"><i class="ti ti-shield-plus"></i> Осол/зөрчил бүртгэх</button></div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
    statCard('Осолгүй ажилтан', Math.max(0, cleanCnt), 'ti-shield-check', '#16A34A') +
    statCard('Зөрчилтэй ажилтан', affectedCnt, 'ti-shield-x', '#DC2626') +
    statCard('Энэ сарын бүртгэл', vios.length, 'ti-clipboard-list', '#D97706') +
    '</div>';

  // Энэ сарын зөрчлийн жагсаалт
  html += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:18px">' +
    '<div style="padding:14px 18px;border-bottom:1px solid #F1F5F9;font-weight:700">Энэ сарын осол/зөрчил (' + vios.length + ')</div>';
  if (!vios.length) {
    html += '<div style="padding:24px">' + emptyBox('Энэ сард осол/зөрчил бүртгэгдээгүй — бүх ажилтан цэвэр ✓') + '</div>';
  } else {
    html += '<div>' + vios.map(function (v) {
      var e = DB.employees.filter(function (x) { return x.id === v.empId; })[0] || {};
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #F5F5F5">' +
        '<div style="width:36px;height:36px;border-radius:9px;background:#FEE2E2;color:#DC2626;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-alert-octagon"></i></div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">' + esc(e.name || v.empId) + ' <span style="font-size:11px;color:#94A3B8;font-weight:400">· ' + esc(e.dept || '') + '</span></div>' +
        '<div style="font-size:12.5px;color:#64748B">' + esc(v.desc || 'Зөрчил') + '</div>' +
        '<div style="font-size:11px;color:#94A3B8">' + esc((v.date || '').slice(0, 10)) + ' · ' + esc(v.by || '') + '</div></div>' +
        '<span style="font-weight:800;font-size:16px;color:#DC2626;flex-shrink:0">-' + _f(v.points, 50) + '</span>' +
        '<button class="btn btn-sm" data-del-vio="' + esc(v.id) + '" style="background:#F1F5F9;color:#64748B;flex-shrink:0"><i class="ti ti-trash"></i></button>' +
        '</div>';
    }).join('') + '</div>';
  }
  html += '</div>';

  // Ажилтнуудын босго төлөв
  html += '<div class="card" style="padding:0;overflow:hidden">' +
    '<div style="padding:14px 18px;border-bottom:1px solid #F1F5F9;font-weight:700">Ажилтнуудын босго оноо (энэ сар)</div>' +
    '<div style="max-height:420px;overflow-y:auto">' +
    emps.slice().sort(function (a, b) { return kpiBosgo(a) - kpiBosgo(b); }).map(function (e) {
      var bs = kpiBosgo(e), c = bs >= 100 ? '#16A34A' : bs >= 50 ? '#D97706' : '#DC2626';
      var vc = empViolations(e, key).length;
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid #F5F5F5">' +
        '<div class="avatar avatar-sm" style="width:32px;height:32px;flex-shrink:0">' + esc(e.initials || '') + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">' + esc(e.name) + '</div>' +
        '<div style="font-size:11px;color:#94A3B8">' + esc(e.dept || '') + (vc ? ' · <span style="color:#DC2626">' + vc + ' зөрчил</span>' : ' · зөрчилгүй') + '</div></div>' +
        '<div style="width:80px;height:8px;background:#F1F5F9;border-radius:5px;overflow:hidden;flex-shrink:0"><div style="height:100%;width:' + bs + '%;background:' + c + ';border-radius:5px"></div></div>' +
        '<div style="width:34px;text-align:right;font-weight:700;color:' + c + ';flex-shrink:0">' + bs + '</div>' +
        '<button class="btn btn-sm" data-vio-emp="' + e.id + '" style="background:#FEE2E2;color:#991B1B;flex-shrink:0"><i class="ti ti-plus"></i></button>' +
        '</div>';
    }).join('') + '</div></div>';

  sec.innerHTML = html;
  if (!sec._vioWired) {
    sec._vioWired = true;
    sec.addEventListener('click', function (ev) {
      if (ev.target.closest('#vioAdd')) { openAddViolationModal(); return; }
      var ae = ev.target.closest('[data-vio-emp]');
      if (ae) { openAddViolationModal(ae.getAttribute('data-vio-emp')); return; }
      var de = ev.target.closest('[data-del-vio]');
      if (de) {
        if (!confirm('Энэ осол/зөрчлийн бүртгэлийг устгах уу? Босго оноо сэргэнэ.')) return;
        var vid = de.getAttribute('data-del-vio');
        DB.violations = (DB.violations || []).filter(function (v) { return v.id !== vid; });
        saveDB();
        renderViolationsPage(); renderEmployees(); renderDashboard(); renderKpiPage();
        toast('Бүртгэл устгагдлаа', 'success');
      }
    });
  }
}
function editEmployeeScores(id) {
  var e = DB.employees.filter(function (x) { return x.id === id; })[0];
  if (!e) return;
  formModal({
    title: 'Суурь дата засах — ' + e.name,
    width: '520px',
    fields: [
      { name: 'email', label: 'Имэйл (нэвтрэхэд хэрэглэнэ)', type: 'text', value: e.email || '', placeholder: 'user@monos.mn', hint: 'Ажилтан энэ имэйлээр нэвтэрч системтэй холбогдоно' },
      { name: 'video', label: 'Видео сургалтын үзэлт %', type: 'number', value: _f(e.video, e.training), min: 0, max: 100, hint: 'MiSkill CSV-ээс автоматаар орно — гараар засч болно' },
      { name: 'examScore', label: 'Шалгалтын дүн (сүүлийн)', type: 'number', value: _f(e.examScore, e.training), min: 0, max: 100, hint: 'MiSkill шалгалтаас автоматаар орно' },
      { name: 'examPrev', label: 'Урьдчилсан шалгалтын дүн (ахиц бодоход)', type: 'number', value: (e.examPrev == null ? '' : e.examPrev), min: 0, max: 100 },
      { name: 'firstTry', label: 'Дахин шалгалтгүй тэнцсэн эсэх', type: 'select', value: (e.firstTry ? '1' : '0'),
        options: [{ value: '1', label: 'Тийм — анхны удаа тэнцсэн' }, { value: '0', label: 'Үгүй' }] }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      if (v.email && v.email.trim()) e.email = v.email.trim().toLowerCase();
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

function actionSetEmpRole(id) {
  var e = DB.employees.filter(function (x) { return x.id === id; })[0];
  if (!e) return;
  var roleOpts = [
    { value: 'employee', label: 'Ажилтан (энгийн)' },
    { value: 'depthead', label: 'Албаны дарга (зөвхөн өөрийн алба харна)' }
  ];
  formModal({
    title: 'Системийн эрх тохируулах — ' + e.name,
    width: '480px',
    fields: [
      { name: 'email', label: 'Нэвтрэх имэйл', type: 'text', value: e.email || '', required: true, placeholder: 'user@monos.mn', hint: 'Энэ имэйлээр нэвтрэх ажилтны системийн эрхийг тохируулна' },
      { name: 'role', label: 'Системийн эрх', type: 'select', options: roleOpts, value: 'employee' },
      { name: 'dept', label: 'Харъяа алба (Дарга үед)', type: 'select', options: deptList(), value: e.dept || deptList()[0] }
    ],
    submitLabel: 'Хадгалах',
    onSubmit: function (v) {
      var email = (v.email || '').trim().toLowerCase();
      if (!email) { toast('Имэйл заавал бөглөнө', 'warn'); return false; }
      if (email !== e.email) { e.email = email; }
      // DB.userRoles + localStorage-д хадгална (Firestore rules хэрэггүй)
      if (!DB.userRoles) DB.userRoles = {};
      var roleEntry = { role: v.role, department: v.role === 'depthead' ? v.dept : '', updatedBy: (SESSION && SESSION.email) || 'admin', updatedAt: new Date().toISOString() };
      DB.userRoles[email] = roleEntry;
      var lr = _swRolesGet();
      if (v.role === 'depthead') { lr[email] = roleEntry; } else { delete lr[email]; }
      _swRolesSet(lr);
      saveDB();
      toast(esc(e.name) + ' → ' + v.role + ' эрх олгогдлоо', 'success');
      renderEmployees();
      // Firestore user_roles-д ч бичихийг оролдоно (rules байвал, байхгүй бол чимээгүй орхино)
      if (fbReady && !DEMO) {
        fdb.collection('user_roles').doc(email).set(roleEntry).catch(function () {});
      }
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
  var head = ['Код', 'Нэр', 'Албан тушаал', 'Алба', 'Босго', 'Давтан+шалгалт', 'Видео(LMS)', 'Даалгавар', 'Суурь оноо', 'Бонус оноо', 'Нийт оноо'];
  var lines = [head];
  function _n(v) { return v == null ? '' : v; }
  filteredEmployees().forEach(function (e) {
    lines.push([e.id, e.name, e.role, e.dept, _n(kpiBosgo(e)), _n(kpiDavtan(e)), _n(kpiVideo(e)), _n(kpiTask(e)), empBase(e), empBonusPoints(e), empTotal(e)]);
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
    '<tr><td>Босго оноо (осол/зөрчилгүй)</td><td>' + cat.bosgo + '</td></tr>' +
    '<tr><td>Давтан + шалгалт</td><td>' + cat.davtan + '</td></tr>' +
    '<tr><td>Видео сургалт (LMS)</td><td>' + cat.video + '</td></tr>' +
    '<tr><td>Даалгаврын биелэлт</td><td>' + cat.task + '</td></tr>' +
    '<tr><td>Аюул/NM бонус (дундаж)</td><td>' + cat.bonus + '</td></tr></table>' +
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
/* ══════════════════════════════════════════════════════════════
   ЗААВАР АЯЛАЛ — цэс/товч бүр дээр гарын хөдөлгөөнт заагч гаргана
   ══════════════════════════════════════════════════════════════ */
var TOUR = { i: 0, steps: [], sidebarOpened: false };

/* Заагч гар — emoji биш SVG. Ямар ч төхөөрөмж дээр ижил зурагдаж, ижил хөдөлнө. */
var HAND_SVG =
  '<svg viewBox="0 0 26 30" width="34" height="39" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M10.4 15.2V4.1a2.1 2.1 0 0 1 4.2 0v8.3h.9V9.9a2.1 2.1 0 0 1 4.2 0v2.9h.9v-1a2 2 0 0 1 4 0v8.6c0 4.4-3.1 7.6-7.6 7.6h-2.3c-2.4 0-4.6-1.1-6-3l-4.4-5.7a2.2 2.2 0 0 1 3-3.1l3.1 2z" ' +
  'fill="#FBBF24" stroke="#1E293B" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M14.6 12.4v3.1M19.5 12.8v2.7" stroke="#1E293B" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>' +
  '</svg>';

function tourSteps() {
  var s = [];
  function add(sel, title, text) { s.push({ sel: sel, title: title, text: text }); }

  if (isEmp()) {
    add('.nav-item[data-page="dashboard"]', 'Миний гүйцэтгэл',
      'Энэ сарын оноо, байр эзлэлт, юу хийх ёстойгоо энд хараарай.');
    add('.nav-item[data-page="video-track"]', 'Видео сургалт',
      'Танд оногдсон видео хичээлүүд. Үзэж дуусгаснаар оноо нэмэгдэнэ.');
    add('.nav-item[data-page="myexams"]', 'ХАБЭА шалгалт',
      'Урьдчилсан болон дараах шалгалтаа энд өгнө. Сүүлийн дүн тооцогдоно.');
    add('.nav-item[data-page="tasks"]', 'Даалгавар',
      'ХАБЭА ажилтнаас өгсөн даалгавар. Биелүүлээд тэмдэглэнэ.');
    add('#hazardFab', 'Аюул мэдээлэх',
      'Аюултай зүйл харвал энд дарж мэдээлнэ. Батлагдсан бүрт БОНУС оноо нэмэгдэнэ — хэзээ ч хасагдахгүй.');
    add('.nav-item[data-page="hazards"]', 'Эрсдэлийн үнэлгээ',
      'Таны албаны эрсдэлийн үнэлгээний дашбоард.');
    add('.nav-item[data-page="daatgal"]', 'Даатгал',
      'Нөхөн төлбөрийн гарын авлага — AI туслахтай.');
  } else {
    add('.nav-item[data-page="dashboard"]', 'Хяналтын самбар',
      'Компанийн ерөнхий үзүүлэлт, албадын харьцуулалт.');
    add('[data-batch-training]', 'Бүлэг сургалт нэмэх',
      'Олон ажилтанд нэг дор сургалт оноох.');
    add('.nav-item.leaf[data-mod="urdchilsan"]', 'Зааварчилгаа бүр',
      'Зааварчилгаа тус бүрийг нээж, албаар эсвэл ажилтан тус бүрээр нь сургалт/шалгалтыг нээнэ.');
    add('.nav-item[data-page="examadmin"]', 'Шалгалтын удирдлага',
      'Шалгалтын асуулт, дүн, хэдэн удаа өгөх эрхийг эндээс тохируулна.');
    add('.nav-item[data-page="employees"]', 'Ажилтнууд',
      'Бүх ажилтны KPI оноо, сургалт/шалгалтын биелэлт.');
    add('.nav-item[data-page="kpi"]', 'KPI үнэлгээ',
      'Оноо хэрхэн тооцогдож байгаа арга зүй, албадын харьцуулалт.');
    add('.nav-item[data-page="reportflow"]', 'Аюул/Near-miss',
      'Ажилтнуудын мэдээлсэн аюул. Баталгаажуулсны дараа бонус тооцогдоно.');
    add('.nav-item[data-page="violations"]', 'Осол/зөрчлийн бүртгэл',
      'Зөрчил бүртгэвэл тухайн ажилтны босго оноо хасагдана.');
    add('.nav-item[data-page="hazards"]', 'Эрсдэлийн үнэлгээ',
      'Алба тус бүрийн эрсдэлийн дашбоардыг эндээс байршуулна.');
    add('.nav-item[data-page="settings"]', 'Тохиргоо',
      'KPI-н жин, давтан зааварчилгааны хуваарь, бонусын хэмжээ.');
  }
  add('#kpiLogoutBtn', 'Гарах', 'Ажлаа дуусгасны дараа эндээс гарна.');
  return s;
}

function tourEls() {
  var mask = document.getElementById('tourMask');
  if (mask) return mask;
  mask = document.createElement('div');
  mask.id = 'tourMask';
  mask.innerHTML =
    '<div id="tourHole"></div><div id="tourRing"></div><div id="tourHand">' + HAND_SVG + '</div>' +
    '<div id="tourTip"><div class="tt-step"></div><div class="tt-title"></div><div class="tt-text"></div>' +
    '<div class="tt-bar"><button class="btn btn-secondary btn-sm" data-tour="prev">Өмнөх</button>' +
    '<button class="btn btn-primary btn-sm" data-tour="next">Дараах</button></div>' +
    '<div style="text-align:center"><button class="tt-skip" data-tour="end">Хаах</button></div>' +
    '<div class="tt-dots"></div></div>';
  document.body.appendChild(mask);
  mask.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-tour]'); if (!b) return;
    var a = b.getAttribute('data-tour');
    if (a === 'end') tourEnd();
    else if (a === 'prev') tourGo(TOUR.i - 1);
    else tourGo(TOUR.i + 1);
  });
  // Гүйлгэх / дэлгэц эргэхэд заагчаа дагуулна
  var reflow = function () {
    if (!mask.classList.contains('on')) return;
    var st = TOUR.steps[TOUR.i]; if (!st) return;
    var el = document.querySelector(st.sel); if (el) tourPlace(st, el, TOUR.i);
  };
  window.addEventListener('resize', reflow);
  window.addEventListener('scroll', reflow, true);
  return mask;
}

function tourStart() {
  closeModal();
  TOUR.steps = tourSteps().filter(function (st) { return document.querySelector(st.sel); });
  if (!TOUR.steps.length) { toast('Заавар үзүүлэх цэс олдсонгүй', 'warn'); return; }
  tourEls().classList.add('on');
  TOUR.i = -1;
  setTimeout(function () { tourGo(0); }, 60);
}

function tourEnd() {
  var m = document.getElementById('tourMask');
  if (m) m.classList.remove('on');
  if (TOUR.sidebarOpened) {
    var sb = document.querySelector('.sidebar'); if (sb) sb.classList.remove('open');
    TOUR.sidebarOpened = false;
  }
  try { localStorage.setItem('kpi_tour_done', '1'); } catch (e) {}
}

function tourGo(i) {
  if (i < 0) return;
  if (i >= TOUR.steps.length) { tourEnd(); toast('Заавар дууслаа 👍'); return; }
  TOUR.i = i;
  var st = TOUR.steps[i];
  var el = document.querySelector(st.sel);
  if (!el) { tourGo(i + 1); return; }

  // Хаалттай мод цэс / далд хажуугийн цэсийг нээнэ
  var d = el.closest('details');
  while (d) { d.open = true; d = d.parentNode && d.parentNode.closest ? d.parentNode.closest('details') : null; }
  if (el.closest('.sidebar') && window.innerWidth <= 768) {
    var sb = document.querySelector('.sidebar');
    if (sb && !sb.classList.contains('open')) { sb.classList.add('open'); TOUR.sidebarOpened = true; }
  } else if (TOUR.sidebarOpened && !el.closest('.sidebar')) {
    var sb2 = document.querySelector('.sidebar');
    if (sb2) sb2.classList.remove('open');
    TOUR.sidebarOpened = false;
  }
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
  setTimeout(function () { tourPlace(st, el, i); }, 320);
}

function tourPlace(st, el, i) {
  var r = el.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var hole = document.getElementById('tourHole');
  var ring = document.getElementById('tourRing');
  var hand = document.getElementById('tourHand');
  var tip = document.getElementById('tourTip');
  if (!hole) return;

  var pad = 7;
  hole.style.left = (r.left - pad) + 'px';
  hole.style.top = (r.top - pad) + 'px';
  hole.style.width = (r.width + pad * 2) + 'px';
  hole.style.height = (r.height + pad * 2) + 'px';

  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var rs = Math.max(46, Math.min(r.height + 30, 90));
  ring.style.width = rs + 'px'; ring.style.height = rs + 'px';
  ring.style.left = (cx - rs / 2) + 'px'; ring.style.top = (cy - rs / 2) + 'px';

  // Гар — товчны баруун доод хэсэгт, дарж байгаа мэт
  hand.style.left = Math.min(vw - 46, r.left + r.width * 0.58) + 'px';
  hand.style.top = (r.top + r.height * 0.45) + 'px';

  // Тайлбар хайрцаг — доор нь, багтахгүй бол дээр нь
  var tw = Math.min(300, vw - 28);
  tip.style.width = tw + 'px';
  var tl = Math.max(14, Math.min(vw - tw - 14, cx - tw / 2));
  var th = tip.offsetHeight || 190;
  var tt = r.bottom + 58;
  if (tt + th > vh - 12) tt = Math.max(12, r.top - th - 22);
  tip.style.left = tl + 'px';
  tip.style.top = tt + 'px';

  tip.querySelector('.tt-step').textContent = (i + 1) + ' / ' + TOUR.steps.length;
  tip.querySelector('.tt-title').textContent = st.title;
  tip.querySelector('.tt-text').textContent = st.text;
  tip.querySelector('[data-tour="prev"]').style.display = i === 0 ? 'none' : '';
  tip.querySelector('[data-tour="next"]').textContent = (i === TOUR.steps.length - 1) ? 'Дуусгах' : 'Дараах';
  tip.querySelector('.tt-dots').innerHTML = TOUR.steps.map(function (_, k) {
    return '<i class="' + (k === i ? 'on' : '') + '"></i>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   БАЙНГЫН ЗААГЧ — аялал дуусахад ч арилахгүй.
   Ажилтны дараагийн хийх ёстой зүйл рүү үргэлж заасаар байна.
   ══════════════════════════════════════════════════════════════ */
var HINT = { idx: 0, at: 0, key: '' };

function hintEl() {
  var h = document.getElementById('hintHand');
  if (h) return h;
  h = document.createElement('div'); h.id = 'hintHand'; h.innerHTML = HAND_SVG;
  var ring = document.createElement('div'); ring.id = 'hintRing';
  var tip = document.createElement('div'); tip.id = 'hintTip';
  document.body.appendChild(ring);
  document.body.appendChild(h);
  document.body.appendChild(tip);
  window.addEventListener('scroll', hintTick, true);
  window.addEventListener('resize', hintTick);
  return h;
}

function hintShow(on) {
  ['hintHand', 'hintRing', 'hintTip'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList[on ? 'add' : 'remove']('on');
  });
}

/* Юун дээр заах вэ — эрэмбээр нь. Эхний ХАРАГДАЖ БУЙ нь сонгогдоно. */
function hintCandidates() {
  var list = [];
  var e = null; try { e = myEmployeeRecord(); } catch (err) {}

  if (isEmp()) {
    // Хуудсан дээр "Хийх ёстой зүйлс" мөр байвал хамгийн түрүүнд
    list.push({ sel: '.page.active .emp-step[data-gopage]', txt: 'Энд дарж хийнэ үү' });
    if (e) {
      try {
        var v = empLmsStats(e);
        if (v && v.total && v.passed < v.total)
          list.push({ sel: '.nav-item[data-page="video-track"]', txt: 'Сургалтаа үзнэ үү' });
      } catch (err) {}
      try {
        var needExam = false;
        Object.keys(TRAINING_MODULES).forEach(function (k) {
          if (isModExamUnlocked(e, k) && !getEmpProg(e.id, k).examTaken) needExam = true;
        });
        if (needExam) list.push({ sel: '.nav-item[data-page="myexams"]', txt: 'Шалгалтаа өгнө үү' });
      } catch (err) {}
      try {
        var t = empTaskStats(e);
        if (t && t.total && t.done < t.total)
          list.push({ sel: '.nav-item[data-page="tasks"]', txt: 'Даалгавраа гүйцээнэ үү' });
      } catch (err) {}
    }
    list.push({ sel: '#hazardFab', txt: 'Аюул харвал энд дар' });
  } else {
    try {
      var pend = (DB.reports || []).filter(function (r) { return r.status !== 'verified' && r.status !== 'rejected'; }).length;
      if (pend) list.push({ sel: '.nav-item[data-page="reportflow"]', txt: pend + ' мэдээлэл хүлээгдэж байна' });
    } catch (err) {}
    list.push({ sel: '#hazardFab', txt: 'Аюул мэдээлэх' });
  }
  return list;
}

function hintVisible(el) {
  if (!el || !el.offsetParent) return false;
  var r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  return r.bottom > 40 && r.top < window.innerHeight - 10 && r.right > 0 && r.left < window.innerWidth;
}

function hintTick() {
  var h = hintEl();
  var ring = document.getElementById('hintRing');
  var tip = document.getElementById('hintTip');
  // Аялал явж байх үед эсвэл цонх нээлттэй бол нуух
  var tm = document.getElementById('tourMask');
  if ((tm && tm.classList.contains('on')) || document.body.classList.contains('modal-open')) {
    hintShow(false); return;
  }
  /* Харагдаж буй БҮХ зорилтыг цуглуулаад ээлжлэн заана
     (доод мөрүүд ч алгасагдахгүй) */
  var vis = [], cands = hintCandidates();
  for (var i = 0; i < cands.length && vis.length < 6; i++) {
    var nl = document.querySelectorAll(cands[i].sel);
    for (var j = 0; j < nl.length && vis.length < 6; j++) {
      if (hintVisible(nl[j])) vis.push({ el: nl[j], txt: cands[i].txt });
    }
  }
  if (!vis.length) { hintShow(false); return; }

  var key = vis.map(function (c) { return c.txt + '@' + Math.round(c.el.getBoundingClientRect().top); }).join('|');
  var now = Date.now();
  if (key !== HINT.key) { HINT.key = key; HINT.idx = 0; HINT.at = now; }
  else if (now - HINT.at > 3800) { HINT.idx = (HINT.idx + 1) % vis.length; HINT.at = now; }
  var pick = vis[HINT.idx % vis.length];

  var r = pick.el.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  hintShow(true);
  tip.textContent = pick.txt;

  /* ── Гар: зорилтын ДОТОР, баруун доод хэсэгт (дарж байгаа мэт).
        Хажуугийн багана/картад давхцахгүй — хэзээ ч зорилтоос гарахгүй. ── */
  var hw = 29, hh = 33;
  var hx = r.right - hw - 10;
  var hy = r.top + r.height / 2 - hh / 2 + 4;
  // Жижиг зорилт бол гар нь бүтэн багтахгүй — төвд нь тавина
  if (r.width < hw + 20) hx = r.left + r.width / 2 - hw / 2;
  if (r.height < hh) hy = r.top + r.height / 2 - hh / 2;
  hx = Math.max(4, Math.min(hx, vw - hw - 4));
  hy = Math.max(4, Math.min(hy, vh - hh - 4));
  h.style.left = Math.round(hx) + 'px';
  h.style.top = Math.round(hy) + 'px';

  /* ── Цагираг: ЯГ ГАРЫН дээр — дарж буй цэгээс цацарна ── */
  var rs = Math.max(38, Math.min(r.height + 14, 54));
  ring.style.width = rs + 'px'; ring.style.height = rs + 'px';
  ring.style.left = Math.round(hx + hw / 2 - rs / 2) + 'px';
  ring.style.top = Math.round(hy + hh / 2 - rs / 2) + 'px';

  /* ── Бичиг: зорилтын ДООР, зүүн ирмэгээр нь. Багтахгүй бол дээр нь ── */
  var tw = tip.offsetWidth || 120, th = tip.offsetHeight || 24;
  var tx = Math.max(6, Math.min(r.left + 4, vw - tw - 6));
  var ty = r.bottom + 6;
  if (ty + th > vh - 6) ty = Math.max(6, r.top - th - 6);
  tip.style.left = Math.round(tx) + 'px';
  tip.style.top = Math.round(ty) + 'px';
}

function startHint() {
  if (startHint._on) return;
  startHint._on = true;
  hintTick();
  setInterval(hintTick, 1300);
}

/* ══════════════════ ТУСЛАМЖ — сайтын жинхэнэ цэсээр ══════════════════ */
function helpRow(icon, color, name, desc) {
  return '<div class="help-row"><i class="ti ' + icon + ' hi" style="background:' + color + '18;color:' + color + '"></i>' +
    '<div class="ht"><b>' + name + '</b><span>' + desc + '</span></div></div>';
}

function openHelp() {
  var w = kpiCfg().weights;
  var body = '<div class="help-body">' +
    '<button class="btn btn-primary" data-starttour="1" style="width:100%;justify-content:center;margin-bottom:14px">' +
    '<i class="ti ti-hand-click"></i> Заавар үзүүлэх — цэс бүрийг гараар зааж өгнө</button>';

  if (isEmp()) {
    body +=
      '<p>Энэ бол <b>Монос Хүнс</b>-ний ХАБЭА-н систем. Та сургалтаа үзэж, шалгалтаа өгч, аюул мэдээлснээр ' +
      '<b>сар бүрийн оноо</b> цуглуулна.</p>' +
      '<h4>Таны цэсүүд</h4>' +
      helpRow('ti-layout-dashboard', '#4F46E5', 'Миний гүйцэтгэл', 'Энэ сарын оноо, байр эзлэлт, хийх ёстой зүйлс.') +
      helpRow('ti-player-play', '#C2410C', 'Видео сургалт (MiSkill)', 'Оногдсон хичээлүүд. Үзэж дуусгаснаар оноо нэмэгдэнэ.') +
      helpRow('ti-pencil-check', '#0891B2', 'ХАБЭА шалгалт', 'Урьдчилсан/дараах шалгалт. Хэд дахин өгөхийг админ тохируулна.') +
      helpRow('ti-checkbox', '#16A34A', 'Даалгавар', 'Танд оногдсон ажил. Биелүүлээд тэмдэглэнэ.') +
      helpRow('ti-flag-2', '#E11D48', 'Аюул мэдээлэх', 'Улаан хөвөгч товч — бүх хуудсанд байна. Бонус авах хамгийн хялбар зам.') +
      helpRow('ti-chart-pie-2', '#7C3AED', 'Эрсдэлийн үнэлгээ', 'Таны албаны эрсдэлийн дашбоард.') +
      helpRow('ti-shield-heart', '#0EA5E9', 'Даатгал', 'Нөхөн төлбөрийн гарын авлага.') +
      '<h4>Оноо хэрхэн бүрддэг вэ</h4>' +
      helpRow('ti-shield-check', '#3730A3', 'Осол, зөрчилгүй байх', 'Хамгийн том хувь. Зөрчил бүртгэгдэхгүй бол бүтэн оноо.') +
      helpRow('ti-player-play', '#C2410C', 'Видео сургалт үзэх', 'Тэнцсэн сургалтын хувиар.') +
      helpRow('ti-refresh', '#0891B2', 'Давтан + шалгалт', 'Тухайн сард давтан зааварчилгаа товлогдсон бол.') +
      helpRow('ti-checkbox', '#16A34A', 'Даалгавар биелүүлэх', 'Биелүүлсэн даалгаврын хувиар.') +
      helpRow('ti-gift', '#059669', 'Аюул мэдээлэх (бонус)', 'НЭМЭГДЭНЭ — хэзээ ч хасагдахгүй.') +
      '<div class="help-note"><b>Түвшин:</b> 0–59 Эхлэгч · 60–74 Хүрэл · 75–89 Мөнгөн · 90+ Алтан.<br>' +
      '<b>Хугацаа:</b> оноо цалингийн сараар (өмнөх сарын 25-наас энэ сарын 24) тооцогдоно.<br>' +
      '<b>Шалгалт:</b> нэг шалгалтыг хэд хэдэн удаа өгвөл <b>сүүлийн дүн</b> тооцогдоно.</div>';
  } else {
    body +=
      '<p>Та <b>' + esc(USER.role || 'ХАБЭА ажилтан') + '</b> эрхтэй нэвтэрсэн байна. ' +
      'Сургалт нээх, шалгалт удирдах, KPI хянах бүрэн боломжтой.</p>' +
      '<h4>Сургалт ба шалгалт</h4>' +
      helpRow('ti-table-plus', '#4F46E5', '＋ Бүлэг сургалт нэмэх', 'Олон ажилтанд нэг дор сургалт оноох.') +
      helpRow('ti-school', '#7C3AED', 'Зааварчилгаа бүр', 'Дотор нь <b>алба тус бүрээр</b> эсвэл <b>ажилтан тус бүрээр</b> сургалт/шалгалт нээнэ.') +
      helpRow('ti-clipboard-text', '#0891B2', 'Шалгалтын удирдлага', 'Асуулт, дүн, хэдэн удаа өгөх эрх.') +
      helpRow('ti-settings-cog', '#64748B', 'Контент удирдлага', 'Видео хичээл, бүлгийн зураг байршуулах.') +
      '<h4>ХАБЭА / KPI</h4>' +
      helpRow('ti-users', '#4F46E5', 'Ажилтнууд', 'Бүх ажилтны оноо, сургалт/шалгалтын биелэлт.') +
      helpRow('ti-chart-radar', '#7C3AED', 'KPI үнэлгээ', 'Арга зүй, албадын харьцуулалт.') +
      helpRow('ti-checkbox', '#16A34A', 'Даалгавар', 'Ажилтнуудад даалгавар өгч, биелэлтийг хянана.') +
      '<h4>Мэдээлэл цуглуулалт</h4>' +
      helpRow('ti-flag-2', '#E11D48', 'Аюул/Near-miss', 'Ажилтны мэдээлэл. <b>Баталгаажуулсны дараа</b> бонус тооцогдоно.') +
      helpRow('ti-shield-x', '#DC2626', 'Осол/зөрчлийн бүртгэл', 'Зөрчил бүртгэвэл босго оноо хасагдана.') +
      helpRow('ti-chart-pie-2', '#7C3AED', 'Эрсдэлийн үнэлгээ', 'Алба бүрийн дашбоард байршуулах.') +
      '<div class="help-note"><b>KPI-н жин (Тохиргооноос өөрчилнө):</b><br>' +
      'Босго (осол/зөрчилгүй) <b>' + _f(w.bosgo) + '</b> · Давтан+шалгалт <b>' + _f(w.davtan) + '</b> · ' +
      'Видео сургалт <b>' + _f(w.video) + '</b> · Даалгавар <b>' + _f(w.task) + '</b> · Бонус <b>' + _f(w.bonus) + '</b><br>' +
      'Давтан зааварчилгаа товлогдоогүй сард түүний жин видео сургалт руу шилжинэ.<br>' +
      '<b>Хугацаа:</b> цалингийн сар — өмнөх сарын 25-наас энэ сарын 24.</div>';
  }
  body += '</div>';
  infoModal('Сайтын ашиглах заавар', body, '520px');
  setTimeout(function () {
    var b = document.querySelector('[data-starttour]');
    if (b) b.addEventListener('click', tourStart);
  }, 40);
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
    items = [{ label: 'Бүх хэлтэс', value: '' }].concat(deptList().slice().sort().map(function (d) { return { label: d, value: d }; }));
  } else if (kind === 'role') {
    var _rs = {}; (DB.employees || []).forEach(function (e) { if (e.role) _rs[e.role] = 1; });
    items = [{ label: 'Бүх албан тушаал', value: '' }].concat(Object.keys(_rs).sort().map(function (r) { return { label: r, value: r }; }));
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

  /* Сургалтын агуулга засах (админ) */
  if (el.hasAttribute && el.hasAttribute('data-editcourse')) { actionEditCourse(CURRENT_CAT); return; }

  /* Слайд modal харах */
  var pptUrl = el.closest ? (el.closest('[data-ppt-view]') || el).getAttribute('data-ppt-view') : null;
  if (pptUrl) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:75vh;min-height:400px';
    var ifr = document.createElement('iframe');
    ifr.style.cssText = 'width:100%;height:100%;border:0;border-radius:8px';
    ifr.src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(pptUrl);
    wrap.appendChild(ifr);
    buildModal('Слайд харах', wrap, { width: '92vw' });
    return;
  }


  /* --- Сургалтын модулийн toggle / үйлдэлүүд --- */
  var modact = el.getAttribute ? el.getAttribute('data-modact') : null;
  if (modact) {
    var mkey = el.getAttribute('data-modkey') || CURRENT_MOD;
    var mdept = el.getAttribute('data-moddept') || '';
    var mempid = el.getAttribute('data-empid') || '';
    if (modact === 'markdone') {
      setEmpProgData(mempid, mkey, { trainingCompleted: true, completedAt: new Date().toISOString() });
      toast('Сургалт дуусгасан тэмдэглэгдлээ ✓', 'success');
      renderTrainingModule(CURRENT_MOD);
      return;
    }
    if (modact === 'takeexam') { actionTakeModExam(mkey, mempid); return; }
    if (el.classList.contains('mod-tog-btn')) { e.stopPropagation(); handleModToggle(modact, mkey, mdept, mempid); return; }
  }

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
  if (el.hasAttribute('data-addsubadmin')) { actionAddSubadmin(); return; }
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

  /* --- Бусад товчны ерөнхий хариу (form submit товчнуудыг алгасна) --- */
  if (el.tagName === 'BUTTON' && (el.classList.contains('btn') || el.classList.contains('icon-btn-sm'))) {
    if (el.type === 'submit') return; // formModal submit-ийг form.addEventListener('submit') боловсруулна
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
  // Видео арын дэвсгэр (МОНОС intro) — нэвтрэх дэлгэц дотор
  try { if (window.renderForestScene && !s.querySelector('.forest-scene')) renderForestScene('#loginScreen', 'login'); } catch (e) {}
  var btn = document.getElementById('loginBtn'),
      em = document.getElementById('loginEmail'),
      pw = document.getElementById('loginPass'),
      err = document.getElementById('loginErr');
  function fail(m) { if (err) err.textContent = m; if (btn) { btn.disabled = false; btn.textContent = 'Нэвтрэх'; } }
  function doLogin() {
    var email = ((em && em.value) || '').trim().toLowerCase(), pass = (pw && pw.value) || '';
    if (!email || !pass) { fail('Gmail хаяг болон нууц үгээ оруулна уу'); return; }
    if (!fbReady) { fail('Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Нэвтэрч байна...'; }
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
      // Firebase холбогдоогүй бол эрх баталгаажуулах боломжгүй тул admin эрх ОЛГОХГҮЙ (аюулгүйн бодлого)
      if (!fbReady) { SESSION = { role: 'employee', email: email, uid: uid, dept: '' }; resolve(); return; }
      fdb.collection('users').doc(uid).get().then(function (snap) {
        var data = (snap.exists && snap.data()) || {};
        // Admin эрхийг ЗӨВХӨН users/{uid}.role='admin' тодорхойлно (баталгаат эх сурвалж)
        var isAdminByDoc = (data.role === 'admin');
        var role = isAdminByDoc ? 'admin' : (data.role === 'depthead' ? 'depthead' : 'employee');
        var dept = data.department || '';
        // Админ олгосон user_roles/{email} override шалгана (зөвхөн depthead/employee, admin ОЛГОХГҮЙ)
        if (email) {
          // localStorage-с depthead override шалгана (admin эрх localStorage-аар огт олгогдохгүй)
          try { var lrole = _swRolesGet()[email]; if (!isAdminByDoc && lrole && lrole.role === 'depthead') { role = 'depthead'; dept = lrole.department || dept; } } catch (e2) {}
          fdb.collection('user_roles').doc(email).get().then(function (rSnap) {
            if (rSnap.exists) {
              var rd = rSnap.data() || {};
              // Аюулгүйн бодлого: user_roles admin эрх олгохгүй. Admin зөвхөн users doc-оос.
              if (!isAdminByDoc && (rd.role === 'depthead' || rd.role === 'employee')) role = rd.role;
              if (rd.department) dept = rd.department;
            }
            SESSION = { role: role, email: email, uid: uid, empId: null, dept: dept };
            resolve();
          }).catch(function () {
            // Firestore user_roles уншихад алдаа — localStorage-с авсан role ашиглана
            SESSION = { role: role, email: email, uid: uid, empId: null, dept: dept };
            resolve();
          });
        } else {
          SESSION = { role: role, email: email, uid: uid, empId: null, dept: dept };
          resolve();
        }
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
    if (exLink && SESSION) exLink.href = examBust('/shalgalt/habea-exam.html?email=' + encodeURIComponent(SESSION.email || '') + '&name=' + encodeURIComponent(USER.name || '') + (SESSION.empId ? '&eid=' + encodeURIComponent(SESSION.empId) : ''));
  } catch (e) {}
  if (isAdmin()) {
    // Операциональ цэсүүдийг админы харагдацаас нуух
    ['incidents', 'inspections', 'suggestions', 'health', 'myexams'].forEach(function (pg) {
      var nav = document.querySelector('.nav-item[data-page="' + pg + '"]');
      if (nav) nav.style.display = 'none';
    });
    return;
  }
  blockedPages().forEach(function (pg) {
    var nav = document.querySelector('.nav-item[data-page="' + pg + '"]');
    if (nav) nav.style.display = 'none';
    var pe = document.querySelector('.page[data-page="' + pg + '"]');
    if (pe) pe.setAttribute('data-locked', '1');
  });
  // Зөвхөн админд зориулсан холбоосуудыг нуух
  $$('.nav-item[data-admin]').forEach(function (el) { el.style.display = 'none'; });
  $$('[data-admin-only]').forEach(function (el) { el.style.display = 'none'; });
  // Хаалттай шалгалтын сургалт цэсийг нуух (ажилтан болон дарга аль аль нь)
  var examOpen = (DB.settings && DB.settings.examOpen) || {};
  $$('.nav-item.leaf[data-cat]').forEach(function (el) {
    var key = courseKey(el.getAttribute('data-cat') || '');
    if (examOpen[key] === false) el.style.display = 'none';
  });
  // Бүх leaf нуугдсан бол details хэсгийг нуух (data-cat болон data-page аль аль нь)
  $$('details').forEach(function (det) {
    var allLeaves = $$('.nav-item.leaf', det);
    var hasVisible = allLeaves.some(function (el) { return el.style.display !== 'none'; });
    if (!hasVisible && allLeaves.length) det.style.display = 'none';
  });
  if (isEmp()) {
    // Ажилтны хувьд цэсийг хялбаршуулах
    // "Хяналтын самбар" → "Миний гүйцэтгэл"
    var dashNav = document.querySelector('.nav-item[data-page="dashboard"] span');
    if (dashNav) dashNav.textContent = 'Миний гүйцэтгэл';
    // "Аюул/Near-miss мэдээлэл" → "Аюул мэдээллэх"
    var rfNav = document.querySelector('.nav-item[data-page="reportflow"] span');
    if (rfNav) rfNav.textContent = 'Аюул мэдээллэх';
    // chatbot хуудсыг нуух
    var cbNav = document.querySelector('.nav-item[data-page="chatbot"]');
    if (cbNav) cbNav.style.display = 'none';
    // Харагдаж байгаа nav section title-уудыг шалгаж, бүх item нь нуугдсан бол section-ыг нуух
    $$('.nav-section').forEach(function (sec) {
      var visible = $$('.nav-item', sec).filter(function (el) { return el.style.display !== 'none'; });
      var details = $$('details', sec);
      if (!visible.length && !details.length) sec.style.display = 'none';
    });
  }
  // 5 тогтмол модуль (data-mod) болон Видео сургалт — хаалттай шалгалтаас үл хамааран ҮРГЭЛЖ харагдана
  if (!isAdmin()) {
    $$('.nav-item.leaf[data-mod]').forEach(function (el) {
      el.style.display = '';
      var det = el.closest('details'); if (det) det.style.display = '';
    });
    var vtNav = document.querySelector('.nav-item[data-page="video-track"]');
    if (vtNav) {
      vtNav.style.display = '';
      var vtDet = vtNav.closest('details'); if (vtDet) vtDet.style.display = '';
    }
  }
  var active = document.querySelector('.nav-item.active');
  if (active && blockedPages().indexOf(active.getAttribute('data-page')) >= 0) { switchPage('dashboard'); }
}

/* ══ Дашбоард ХЭЗЭЭ Ч хоосон харагдахгүй ══
   renderDashboard дуудагдсан эсэхээс үл хамааран ажиллана.
   Ажилтны дата байвал мэдэгдлийг нууна, байхгүй бол шалтгааныг харуулна. */
function ensureDashboardNotEmpty() {
  var page = document.querySelector('.page[data-page="dashboard"]');
  if (!page) return;
  var n = (DB && DB.employees && DB.employees.length) || 0;
  var note = document.getElementById('dashNoData');

  if (n > 0) { if (note) note.style.display = 'none'; return; }

  if (!note) {
    note = document.createElement('div');
    note.id = 'dashNoData';
    note.className = 'card';
    var hdr = page.querySelector('.page-header');
    if (hdr && hdr.parentNode === page) page.insertBefore(note, hdr.nextSibling);
    else page.insertBefore(note, page.firstChild);
  }

  var el = (typeof EMP_LOAD !== 'undefined') ? EMP_LOAD : { state: 'idle' };
  var icon = 'ti-users-plus', msg, hint = '', btn = false;

  if (!fbReady || el.state === 'nofb') {
    icon = 'ti-cloud-off';
    msg = 'Сервертэй холбогдож чадсангүй';
    hint = 'Интернэт холболтоо шалгаад хуудсыг дахин ачаална уу.';
  } else if (el.state === 'error') {
    icon = 'ti-alert-triangle';
    msg = 'Ажилтны мэдээлэл уншигдсангүй';
    hint = 'Алдаа: ' + esc(el.error || '') + '. Дахин нэвтэрч үзнэ үү.';
  } else if (el.state === 'ok' && !el.users) {
    msg = 'Ажилтан бүртгэгдээгүй байна';
    hint = 'Контент удирдлага → Хэрэглэгчид хэсгээс ажилтан нэмнэ. Бүртгэсний дараа KPI, сургалт, тайлан энд автоматаар харагдана.';
    btn = isAdmin();
  } else if (el.state === 'ok') {
    msg = 'Ажилтны жагсаалт үүсээгүй';
    hint = 'Системд ' + el.users + ' хэрэглэгч байна. Хуудсыг дахин ачаалж (Ctrl+Shift+R) үзнэ үү.';
  } else {
    icon = 'ti-loader-2';
    msg = 'Мэдээлэл ачаалж байна…';
  }

  note.innerHTML = '<div class="empty-state" style="padding:38px 20px">' +
    '<i class="ti ' + icon + '"' + (icon === 'ti-loader-2' ? ' style="animation:spin 1s linear infinite"' : '') + '></i>' +
    '<div style="font-weight:700;color:#4B5268;margin-top:8px;font-size:15px">' + msg + '</div>' +
    (hint ? '<div style="font-size:12.5px;margin-top:7px;line-height:1.65;max-width:440px">' + hint + '</div>' : '') +
    (btn ? '<button class="btn btn-primary btn-sm" style="margin-top:16px" data-go-users="1">' +
      '<i class="ti ti-user-plus"></i> Ажилтан бүртгэх</button>' : '') +
    '</div>';
  note.style.display = '';
  var g = note.querySelector('[data-go-users]');
  if (g) g.onclick = function () { switchPage('adminpanel'); };
}

/* Ачаалалтын дэлгэцийг хаах — апп бэлэн болсныг тэмдэглэнэ */
function appReady() {
  try { document.body.classList.add('app-ready'); } catch (e) {}
  // Аль ч замаар ирсэн (амжилт / алдаа / хугацаа хэтрэлт) — дашбоард хоосон үлдэхгүй
  try { ensureDashboardNotEmpty(); } catch (e) { console.error('[appReady]', e); }
  // Анх орж ирсэн хүнд зааврыг НЭГ УДАА автоматаар үзүүлнэ
  try {
    if (!localStorage.getItem('kpi_tour_done')) {
      setTimeout(function () { if (!document.getElementById('tourMask')) tourStart(); }, 1400);
    }
  } catch (e) {}
  // Байнгын заагч — үргэлж ажиллана
  try { startHint(); } catch (e) { console.error('[hint]', e); }
}

/* ── Сүүлд үзсэн хуудсыг санах: refresh хийхэд ТЭР ХУУДСАНДАА үлдэнэ ──
   Ажилтан бол ажилтны, админ бол админы үндсэн хуудас руу орно. */
var LAST_PAGE_KEY = 'kpi_last_page';

/* ⚠ Гадагш үсэрдэг хуудсуудыг САНАХГҮЙ.
   Жишээ: "Даатгал" нь /nohon-tulbur.html руу шилждэг. Хэрэв санавал —
   буцах товч дарахад энэ сайт дахин ачаалж, дахиад тийш үсэрч, ГОГЦОО үүсдэг. */
var NAV_AWAY_PAGES = { daatgal: 1 };

/* Шалгалтын хуудсыг браузер КЭШЛЭХГҮЙН тулд цагийн тэмдэг нэмнэ.
   (Хуучин хувилбар үлдэж, зассан алдаа дахин гарахаас сэргийлнэ.) */
function examBust(u) {
  var v = Math.floor(Date.now() / 600000);   // 10 минут тутам шинэчилнэ
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + '_v=' + v;
}

function rememberPage(pageId) {
  if (!pageId) return;
  if (NAV_AWAY_PAGES[pageId]) return;
  try { localStorage.setItem(LAST_PAGE_KEY, pageId); } catch (e) {}
}

/* Эрхээс хамаарсан ҮНДСЭН хуудас.
   Ажилтны дата байхгүй үед дашбоард утгагүй тул ажлын хуудас руу оруулна. */
function defaultPageForRole() {
  var hasEmp = (DB && DB.employees && DB.employees.length) > 0;
  if (isAdmin() || isDeptHead()) return hasEmp ? 'dashboard' : 'adminpanel';
  return 'video-track';         // ажилтан → Видео сургалт (өдөр тутмын ажлын хуудас)
}

function restoreLastPage() {
  var pg = '';
  try { pg = localStorage.getItem(LAST_PAGE_KEY) || ''; } catch (e) {}
  // URL-д ?page= байвал тэр давамгайлна
  try { if (new URLSearchParams(location.search).get('page')) return; } catch (e) {}
  var blocked = blockedPages();
  // Гадагш үсэрдэг хуудас хадгалагдсан байвал (хуучин хувилбарын үлдэгдэл) — үл тоомсорлоно
  if (NAV_AWAY_PAGES[pg]) { try { localStorage.removeItem(LAST_PAGE_KEY); } catch (e) {} pg = ''; }
  if (!pg || blocked.indexOf(pg) >= 0 || !pageEl(pg)) pg = defaultPageForRole();
  // Хадгалсан хуудас нь дашбоард боловч дата байхгүй бол ажлын хуудас руу
  if (pg === 'dashboard' && !((DB && DB.employees && DB.employees.length) > 0)) pg = defaultPageForRole();
  if (!pg || pg === 'dashboard') return;
  // Сургалтын модулийн хуудас бол сүүлд үзсэн модулийг сэргээнэ
  if (pg === 'trn-mod') {
    var mk = '';
    try { mk = localStorage.getItem('kpi_last_mod') || ''; } catch (e) {}
    if (!mk || !TRAINING_MODULES[mk]) { pg = defaultPageForRole(); if (pg === 'dashboard') return; }
    else { CURRENT_MOD = mk; try { switchPage('trn-mod'); renderTrainingModule(mk); } catch (e) {} return; }
  }
  try { switchPage(pg); } catch (e) {}
}

/* ── "Аюул мэдээлэх" хөвөгч товч — БҮХ ЦЭСЭНД ил харагдана ── */
function injectHazardFab() {
  if (document.getElementById('hazardFab')) return;
  var b = document.createElement('button');
  b.id = 'hazardFab';
  b.type = 'button';
  b.title = 'Аюул мэдээлэх';
  b.innerHTML = '<i class="ti ti-flag-2"></i><span>Аюул мэдээлэх</span>';
  b.addEventListener('click', function () {
    try { actionReportNew('hazard'); } catch (e) { try { switchPage('reportflow'); } catch (e2) {} }
  });
  document.body.appendChild(b);
}

async function init() {
  // Юу ч болсон 10 секундын дараа ачаалалтын дэлгэцийг албадан хаана (гацахаас сэргийлж).
  // Тэр үед апп ХООСОН харагдахгүйн тулд байгаа датагаар нэг удаа зурна.
  var _bootGuard = setTimeout(function () {
    try {
      if (!DB || !DB.settings) { DB = seedDB(); }
      injectControls(); applyRole(); renderAll(); injectHazardFab();
    } catch (e) { console.error('[bootGuard]', e); }
    appReady();
  }, 10000);
  try {
  await establishSession();
  // Нэвтрээгүй бол апп доторх нэвтрэх дэлгэцийг гаргана (тусдаа хуудас руу үсрэхгүй)
  if (!SESSION) { clearTimeout(_bootGuard); appReady(); showLoginScreen(); return; }
  // Системийн эзэн админыг баталгаажуулна (Firestore role ямар ч байсан)
  if (SESSION.email && ADMIN_EMAILS.indexOf((SESSION.email || '').toLowerCase()) > -1) SESSION.role = 'admin';
  var loginEl = document.getElementById('loginScreen'); if (loginEl) loginEl.style.display = 'none';
  // Дата ачаалахад алдаа гарсан/өлгөгдсөн ч апп ЗААВАЛ ажиллана (хоосон дэлгэц гарахгүй).
  // Сүлжээ удаан үед Firestore хүсэлт мөнхөд хүлээж болзошгүй тул 12 сек хугацаа тавина.
  var fresh = false;
  try {
    fresh = await Promise.race([
      loadDB(),
      new Promise(function (res) { setTimeout(function () { res('__timeout__'); }, 12000); })
    ]);
    if (fresh === '__timeout__') {
      console.warn('[init] loadDB хугацаа хэтэрлээ — локал/эхлэлийн датагаар үргэлжилнэ');
      fresh = false;
      if (!DB || !DB.settings) {
        try { var _raw = localStorage.getItem(LSKEY); DB = _raw ? JSON.parse(_raw) : seedDB(); }
        catch (e2) { try { DB = seedDB(); } catch (e3) {} }
      }
      // Дата дараа ирвэл автоматаар дахин зурна
      loadDB().then(function () { try { renderAll(); } catch (e) {} }).catch(function () {});
    }
  } catch (err) {
    console.error('[init] loadDB:', err);
    if (!DB || !DB.settings) { try { DB = seedDB(); } catch (e2) {} }
  }
  // DB.userRoles-с SESSION эрхийн override шалгана — зөвхөн employee→depthead тохиолдолд
  // (admin-ийн role хэзээ ч бууруулагдахгүй, kpi_state/main-д хадгалагдсан override)
  if (SESSION && SESSION.email && SESSION.role === 'employee' && DB.userRoles && DB.userRoles[SESSION.email]) {
    var _ro = DB.userRoles[SESSION.email];
    if (_ro.role === 'depthead') {
      SESSION.role = 'depthead';
      if (_ro.department) SESSION.dept = _ro.department;
      // loadDB дахин ачаална — depthead шүүлт зөв role-оор ажиллана
      await loadDB();
    }
  }
  // Алхам бүрийг тусад нь хамгаална — нэг нь унасан ч апп бүрэн ажиллана
  try { injectControls(); } catch (err) { console.error('[init] injectControls:', err); }
  try { applyRole(); } catch (err) { console.error('[init] applyRole:', err); }
  try { renderAll(); } catch (err) { console.error('[init] renderAll failed:', err); }
  try { wireEmployeesPage(); } catch (err) { console.error('[init] wireEmployeesPage:', err); }
  try { injectHazardFab(); } catch (e) {}   // бүх цэсэнд "Аюул мэдээлэх"
  try { restoreLastPage(); } catch (e) {}   // сүүлд үзсэн хуудсаа сэргээнэ
  clearTimeout(_bootGuard);
  appReady();   // ← дата бэлэн: одоо л апп харагдана

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

  /* 5 тогтмол сургалтын модуль — data-mod nav */
  document.addEventListener('click', function (e) {
    var modleaf = e.target.closest('.nav-item.leaf[data-mod]');
    if (!modleaf) return;
    e.preventDefault();
    var modKey = modleaf.getAttribute('data-mod');
    $$('.nav-item.leaf').forEach(function (el) { el.classList.remove('active'); });
    modleaf.classList.add('active');
    CURRENT_MOD = modKey;
    try { localStorage.setItem('kpi_last_mod', modKey); } catch (e2) {}
    switchPage('trn-mod');
    var bc = $('#bcCurrent'); if (bc) bc.textContent = TRAINING_MODULES[modKey] || modKey;
    try { renderTrainingModule(modKey); } catch (e2) { console.error('[trn-mod]', e2); }
    try { if (window.innerWidth < 768) { var sb = $('#sidebar'); if (sb) sb.classList.remove('open'); } } catch (e2) {}
  });

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
    try { renderCourse(cat); } catch (e2) {}
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
  /* Гар утас: хажуугийн цэс нээлттэй үед гадуур дарахад хаана */
  document.addEventListener('click', function (e) {
    if (window.innerWidth >= 768) return;
    var sb = $('#sidebar');
    if (!sb || !sb.classList.contains('open')) return;
    if (e.target.closest && (e.target.closest('#sidebar') || e.target.closest('.menu-toggle'))) return;
    sb.classList.remove('open');
  }, true);

  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', function (e) {
    // Цэсний дотор гүйлгэж байвал хаахгүй — зөвхөн хуудас/бусад гүйлгэлтэд хаана
    if (activeMenu && e.target && e.target.nodeType === 1 && (e.target === activeMenu || activeMenu.contains(e.target))) return;
    closeMenu();
  }, true);

  /* Ажилтан шалгалтыг шинэ табд өгөөд буцаж ирэхэд дүнг автоматаар шинэчилж, идэвхтэй хуудсыг дахин зурна */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || isAdmin() || !fbReady) return;
    if (Date.now() - (window._lastVisRefresh || 0) < 3000) return;
    window._lastVisRefresh = Date.now();
    refreshMyExams().then(function (ch) {
      if (!ch) return;
      var active = document.querySelector('.page.active');
      var pg = active ? active.getAttribute('data-page') : '';
      try {
        if (pg === 'myexams') renderMyExams();
        else if (pg === 'dashboard') renderEmployeeDashboard();
        else if (pg === 'trn-mod') renderTrainingModule(CURRENT_MOD);
      } catch (e) {}
    });
  });

  setTimeout(renderCharts, 80);
  if (fresh) setTimeout(function () { toast('Тавтай морил! Жишээ өгөгдөл ачааллаа.', 'info'); }, 400);
  } catch (err) {
    // Алдаа гарсан ч ачаалалтын дэлгэц гацахгүй
    console.error('[init] алдаа:', err);
  } finally {
    clearTimeout(_bootGuard);
    appReady();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* IIFE-с global scope-д export хийх — inline onclick-аас дуудагдах шаардлагатай функцүүд */
window.verifyReport = verifyReport;
window.deleteHabeaResult = deleteHabeaResult;
window.loadHabeaResultsPanel = loadHabeaResultsPanel;

})();
