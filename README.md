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

- **Static-friendly deployment (GitHub Pages)**
  - Întrebările sunt încărcate din `public/intrebari_c.json`.
  - Generarea testului și scorarea se fac în client.

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
- `.github/workflows/deploy-pages.yml` – build + deploy pe GitHub Pages.
- `next.config.mjs` – configurare `output: export` pentru hosting static.
- `intrebari_c.json` – dataset întrebări/răspunsuri.

## Firestore (pasul următor)

Progresul este local acum. Pentru Firestore, înlocuiești persistența din `localStorage` din `app/page.js` cu citire/scriere pe colecție utilizator (ex: `users/{uid}/progress`).

Setup pas cu pas este documentat în `FIRESTORE_SETUP.md`.

Helper Firebase client este pregătit în `lib/firebaseClient.js`.
