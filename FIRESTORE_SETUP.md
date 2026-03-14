# Firestore Setup (Sea Skipper)

Follow these steps to connect your Next.js app to Firestore safely.

## 1. Add Firebase Web App config

In Firebase Console:

1. Open your project.
2. Project settings -> General.
3. In "Your apps", create/select your Web app.
4. Copy the Firebase config values.

In this repo:

1. Copy `.env.example` to `.env.local`.
2. Fill all `NEXT_PUBLIC_FIREBASE_*` values.

## 2. Keep secrets out of git

Already configured in `.gitignore`:

- `.env*` local files
- `serviceAccountKey.json`
- Firebase debug/emulator local files

Only commit `.env.example`, never `.env.local`.

## 3. Install SDK

```bash
npm install firebase
```

## 4. Create Firebase client helper

Create `lib/firebaseClient.js`:

```js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
```

## 5. Create collection structure for progress

Recommended shape:

- `users/{uid}`
- `users/{uid}/progress/main`

Where `uid` is the Firebase Auth user id (`request.auth.uid`).

### `users/{uid}` document fields

- `schemaVersion`: number
- `createdAt`: timestamp
- `updatedAt`: timestamp

### `users/{uid}/progress/main` document fields

- `schemaVersion`: number
- `goodIds`: number[] (question ids answered correctly)
- `badIds`: number[] (question ids answered incorrectly)
- `answersById`: map of `{ [questionId: string]: boolean }` (true = correct)
- `submittedAnswerIndexById`: map of `{ [questionId: string]: 0 | 1 | 2 }` (selected answer index)
- `updatedAt`: timestamp

## 6. Choose user identity strategy

Quick start options:

1. Anonymous Auth (recommended): one Firebase user per device/session.
2. Device ID fallback: generated ID in localStorage.

For production, use Firebase Auth (Google/Email) so progress syncs cross-device.

## 7. Firestore rules (starter)

If using authenticated users:

- Repo files:
  - `firestore.rules` (rules)
  - `firebase.json` (points Firebase CLI to rules/indexes)
  - `firestore.indexes.json` (empty starter)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/progress/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 8. Integrate into current app logic

In `app/page.js`:

1. On load: read `users/{uid}/progress/main` and hydrate local state.
2. On submit answer: write updated progress to Firestore (debounced).
3. Keep localStorage as fallback if Firestore is unavailable.

## 9. Test checklist

1. Start app: `npm run dev`.
2. Answer some Learning questions.
3. Refresh page and confirm progress remains.
4. Open app on another browser/device with same account and verify sync.

## 10. Deploy notes

1. In Vercel/hosting, set all `NEXT_PUBLIC_FIREBASE_*` env vars.
2. Do not store admin service key in frontend env vars.
3. If using Firebase Admin in API routes, store server-only vars securely.
