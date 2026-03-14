# Sea Skipper Trainer (Next.js)

Aplicație React + Next.js pentru antrenament și testare, folosind baza de întrebări din `intrebari_c.json`.

## Funcționalități

- **Learning Journey**
  - Start „de la început” sau „random”.
  - Verificare răspuns și feedback corect/greșit.
  - Progres salvat local (`localStorage`): `goodIds`, `badIds`, `answersById`.
  - Liste bune/rele cu jump direct pe întrebări și re-submit.
  - Procent completare totală.

- **Testing Journey**
  - Test random cu **26** întrebări.
  - Evaluare doar dacă toate cele 26 au răspuns.
  - Prag promovare: **22/26**.

- **Backend routes (Next API)**
  - `GET /api/questions` → toate întrebările.
  - `GET /api/questions?mode=test&count=26` → subset random.
  - `POST /api/test` → scorare server-side (pass/fail).

## Rulare locală

1. Instalează dependențele:

```bash
npm install
```

2. Rulează în development:

```bash
npm run dev
```

3. Deschide:

- `http://localhost:3000`

## Structură principală

- `app/page.js` – UI React pentru Learning + Testing.
- `app/api/questions/route.js` – endpoint întrebări.
- `app/api/test/route.js` – endpoint scorare test.
- `lib/questions.js` – utilitare de citire + randomizare + scor.
- `intrebari_c.json` – dataset întrebări/răspunsuri.

## Firestore (pasul următor)

Progresul este local acum. Pentru Firestore, înlocuiești persistența din `localStorage` din `app/page.js` cu citire/scriere pe colecție utilizator (ex: `users/{uid}/progress`).
