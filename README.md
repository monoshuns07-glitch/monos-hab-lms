# Монос ХАБ Chatbot Система

Вэб сайт дотор ажилладаг AI chatbot + мэдлэгийн сан удирдах систем.

## Файлууд

```
├── index.html                  # Таны сайт + chatbot widget
├── admin.html                  # Мэдлэгийн сан удирдах dashboard
├── netlify.toml                # Netlify тохиргоо
├── netlify/
│   └── functions/
│       └── chat.js             # Gemini API backend
└── README.md                   # Энэ файл
```

## Суулгах алхмууд

### 1) Файлуудыг Netlify руу оруулах

Одоогийн `index.html`-аа шинэ `index.html`-аар солиод, `admin.html`, `netlify.toml`, `netlify/functions/chat.js` файлуудыг репод нэмэх.

### 2) Netlify Environment Variable нэмэх

Netlify Dashboard дээр:
- **Site settings → Environment variables → Add a variable**
- Нэр: `GEMINI_API_KEY`
- Утга: (Google AI Studio-гээс авсан API key)

Дараа нь deploy-ыг дахин triger хийнэ.

### 3) Firebase Authentication идэвхжүүлэх (Admin dashboard-ын хамгаалалт)

Firebase Console → `monos-hk-alba` project → **Authentication → Sign-in method → Email/Password** → Enable.

Дараа нь **Users → Add user** — өөрийн и-мэйл, нууц үг.

### 4) Firestore Security Rules

Firebase Console → **Firestore Database → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // knowledge_base — идэвхтэй мэдээллийг хэн ч уншина, зөвхөн нэвтэрсэн хүн засна
    match /knowledge_base/{docId} {
      allow read: if resource.data.active == true
                  || request.auth != null;
      allow write: if request.auth != null;
    }
    // бусад коллекцүүд
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5) Firestore Collection үүсгэх

Firebase Console → Firestore → **Start collection** → нэр: `knowledge_base`

Анхны баримтын талбарууд:
| Талбар | Төрөл | Жишээ |
|--------|-------|-------|
| question | string | "Нөхөн төлбөр авахад юу хэрэгтэй?" |
| answer | string | "Эмнэлгийн тодорхойлолт, төлбөрийн баримт..." |
| category | string | "Нөхөн төлбөр" |
| keywords | array | ["эмнэлэг", "баримт", "нөхөн төлбөр"] |
| active | boolean | true |
| created_at | timestamp | (auto) |

## Ашиглалт

### Мэдлэгийн сан удирдах
1. `https://таны-сайт.netlify.app/admin.html` дээр нэвтэрнэ.
2. **"Шинэ"** товчоор нэг бүрчлэн нэмэх **эсвэл** **"Excel оруулах"** товчоор олон мэдээллийг зэрэг оруулна.

### Excel файлын загвар

| question | answer | category | keywords |
|----------|--------|----------|----------|
| Асуулт | Хариулт | Ангилал | түлхүүр,үгс |

### Chatbot ашиглах
Хэрэглэгч сайтын баруун доод буланд байрлах **улаан chat товчийг** дарахад цонх нээгдэж, асуултаа бичнэ → Gemini таны мэдлэгийн сан дээр үндэслэн хариулна.

## Ажлын зарчим

```
Хэрэглэгч асуулт бичнэ
  ↓
JS код Firestore-оос knowledge_base хайна (түлхүүр үгээр)
  ↓
Хамгийн холбогдох 8 мэдээлэл олно
  ↓
Netlify Function (chat.js) руу илгээнэ
  ↓
Gemini API: "Зөвхөн энэ мэдээлэл дээр үндэслэж хариул"
  ↓
Хэрэглэгчид хариулт харагдана
```

## Аюулгүй байдал

- ✅ Gemini API key нь **Netlify Environment Variables** дотор хадгалагдана — клиентэд харагдахгүй
- ✅ Admin dashboard нь Firebase Authentication-аар хамгаалагдсан
- ✅ Firestore Security Rules идэвхтэй бол зөвхөн нэвтэрсэн хүн мэдлэгийн сан засах боломжтой

## Зардал

| Үйлчилгээ | Үнэ |
|-----------|-----|
| Netlify Functions | Үнэгүй (125k invocation/сар) |
| Firebase Firestore | Үнэгүй (50k read, 20k write/өдөр) |
| Gemini 2.0 Flash | Үнэгүй (15 request/мин, 1,500/өдөр) |

## Алдаа заах

### Chatbot "⚠️ Алдаа гарлаа" гэж бичиж байна
→ Netlify Environment Variables-д `GEMINI_API_KEY` байгаа эсэх, deploy дахин run хийсэн эсэхээ шалгах.

### Admin хуудас нээгдэхгүй байна
→ Firebase Auth → Email/Password идэвхжүүлсэн эсэх, хэрэглэгч нэмсэн эсэхээ шалгах.

### Chatbot "мэдээлэл олдсонгүй" гэж хариулж байна
→ Admin dashboard-д мэдлэг нэмсэн эсэх, `active: true` байгаа эсэхийг шалгах.
