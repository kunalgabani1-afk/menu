# Firebase setup for Phase 1

This app intentionally uses Firebase Authentication, Realtime Database, and Storage. It does not fall back to demo or fake production data.

## Server secrets

Add `FIREBASE_SERVICE_ACCOUNT_JSON` as a Replit Secret containing the service account JSON for the Firebase project. The API also accepts the split variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`, but the single JSON secret is preferred.

Add `FIREBASE_DATABASE_URL` as a shared environment variable. Add `FIREBASE_STORAGE_BUCKET` if Storage uses a bucket different from the default.

## Browser configuration

Add these non-secret shared variables for the web artifact:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Firebase browser config values are identifiers, not admin credentials. Admin credentials must never use a `VITE_` prefix.

## Rules and first platform administrator

Deploy `firebase/database.rules.json` as Realtime Database Rules and `firebase/storage.rules` as Storage Rules. After the first platform-admin user is created in Firebase Authentication, set `platformAdmins/{uid}` to `true` with the Admin SDK or the Firebase console. The API uses that server-side membership to protect `/admin` and platform restaurant creation. Storage membership uses Firebase Auth custom claims because Storage Rules cannot query Realtime Database; the API syncs `restaurantIds` and `restaurantRoles` when it creates or invites a member. Users should refresh their Firebase session after a membership change.

The API never returns `pinHash`, service-account values, or passwords. Table PINs are returned only once on create/regenerate and their secure scrypt hashes are stored in Realtime Database.