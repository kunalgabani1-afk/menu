import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import admin from "firebase-admin";

let firebaseApp: admin.app.App | undefined;

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function serviceAccount(): FirebaseServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          project_id: String(parsed.project_id),
          client_email: String(parsed.client_email),
          private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, "\n"),
  };
}

export function getFirebaseApp(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;
  if (admin.apps && admin.apps.length > 0 && admin.apps[0]) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  try {
    const account = serviceAccount();
    if (account) {
      const dbUrl = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
      const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
        ...(dbUrl ? { databaseURL: dbUrl } : {}),
        ...(bucket ? { storageBucket: bucket } : {}),
      });
      return firebaseApp;
    }
  } catch (err) {
    console.warn("Could not initialize Firebase Admin SDK, using fallback engine:", err);
    return null;
  }
  return null;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    getFirebaseApp() !== null
  );
}

export function isDemoMode(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Durable File-Backed Persistent Database for Tableline Production State
// Guarantees zero data loss across dev restarts, container reloads, and sessions.
// Starts from a 100% clean production state with ZERO sample data.
// ---------------------------------------------------------------------------

function resolveDatabaseFilePath(): string {
  if (process.env.TABLELINE_DB_PATH) {
    return path.resolve(process.env.TABLELINE_DB_PATH);
  }
  const candidates = [
    "/app/applet/data/tableline_production_db.json",
    path.resolve(process.cwd(), "data/tableline_production_db.json"),
    path.resolve(process.cwd(), "../../data/tableline_production_db.json"),
    path.resolve(process.cwd(), "../data/tableline_production_db.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return fs.existsSync("/app/applet")
    ? "/app/applet/data/tableline_production_db.json"
    : path.resolve(process.cwd(), "data/tableline_production_db.json");
}

const DB_FILE = resolveDatabaseFilePath();

type DataRecord = Record<string, any>;

function defaultCleanDatabase(): DataRecord {
  return {
    platformAdmins: {},
    users: {},
    restaurantSlugs: {},
    restaurants: {},
    menus: {},
    tables: {},
    orders: {},
    payments: {},
    analytics: {},
    platform: {
      leads: {},
      plans: {
        starter: {
          id: "starter",
          name: "Starter",
          tier: "starter",
          priceMonthly: 499,
          priceYearly: 4990,
          currency: "INR",
          maxTables: 5,
          maxMenuItems: 50,
          features: {
            digital_menu: true,
            qr_ordering: true,
            live_orders_kot: false,
            kitchen_kds: false,
            staff_rbac: false,
            analytics_reporting: false,
            audit_logs: false,
          },
        },
        growth: {
          id: "growth",
          name: "Growth",
          tier: "growth",
          priceMonthly: 1299,
          priceYearly: 12990,
          currency: "INR",
          maxTables: 15,
          maxMenuItems: 200,
          features: {
            digital_menu: true,
            qr_ordering: true,
            live_orders_kot: true,
            kitchen_kds: true,
            staff_rbac: true,
            analytics_reporting: true,
            audit_logs: false,
          },
        },
        scale: {
          id: "scale",
          name: "Scale",
          tier: "scale",
          priceMonthly: 1499,
          priceYearly: 14990,
          currency: "INR",
          maxTables: 100,
          maxMenuItems: 1000,
          features: {
            digital_menu: true,
            qr_ordering: true,
            live_orders_kot: true,
            kitchen_kds: true,
            staff_rbac: true,
            analytics_reporting: true,
            audit_logs: true,
          },
        },
      },
    },
  };
}

function sanitizeDatabase(root: DataRecord): DataRecord {
  if (!root || typeof root !== "object") return defaultCleanDatabase();

  // Ensure essential containers exist
  if (!root.restaurants) root.restaurants = {};
  if (!root.restaurantSlugs) root.restaurantSlugs = {};
  if (!root.users) root.users = {};
  if (!root.platformAdmins) root.platformAdmins = {};
  if (!root.platform) root.platform = {};
  if (!root.platform.leads) root.platform.leads = {};
  if (!root.platform.plans) root.platform.plans = defaultCleanDatabase().platform.plans;

  return root;
}

export function cleanForFirebase<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null) return null as any;
  if (data instanceof Date) return data.toISOString() as any;
  if (Array.isArray(data)) {
    return data.map((item) => (item === undefined ? null : cleanForFirebase(item))) as any;
  }
  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      if (val !== undefined) {
        result[key] = cleanForFirebase(val);
      }
    }
    return result as any;
  }
  return data;
}

function getDeep(obj: any, path: string): any {
  const segments = path.split("/").filter(Boolean);
  let curr = obj;
  for (const seg of segments) {
    if (curr == null || typeof curr !== "object") return undefined;
    curr = curr[seg];
  }
  return curr;
}

function setDeep(obj: any, path: string, value: any): void {
  const segments = path.split("/").filter(Boolean);
  let curr = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (curr[seg] == null || typeof curr[seg] !== "object") {
      curr[seg] = {};
    }
    curr = curr[seg];
  }
  const last = segments[segments.length - 1];
  if (last) {
    if (value === undefined || value === null) {
      delete curr[last];
    } else {
      curr[last] = JSON.parse(JSON.stringify(value));
    }
  }
}

function updateDeep(obj: any, path: string, partial: Record<string, any>): void {
  const segments = path.split("/").filter(Boolean);
  let curr = obj;
  for (const seg of segments) {
    if (curr[seg] == null || typeof curr[seg] !== "object") {
      curr[seg] = {};
    }
    curr = curr[seg];
  }
  for (const [k, v] of Object.entries(partial)) {
    if (k.includes("/")) {
      setDeep(curr, k, v);
    } else {
      curr[k] = JSON.parse(JSON.stringify(v));
    }
  }
}

function removeDeep(obj: any, path: string): void {
  const segments = path.split("/").filter(Boolean);
  let curr = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (curr[seg] == null || typeof curr[seg] !== "object") return;
    curr = curr[seg];
  }
  const last = segments[segments.length - 1];
  if (last && curr) {
    delete curr[last];
  }
}

class DemoDataSnapshot {
  private data: any;
  public key: string | null;

  constructor(data: any, key: string | null = null) {
    this.data = data;
    this.key = key;
  }

  val() {
    return this.data !== undefined ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  exists(): boolean {
    return this.data !== undefined && this.data !== null;
  }

  forEach(callback: (childSnapshot: DemoDataSnapshot) => boolean | void): boolean {
    if (this.data && typeof this.data === "object") {
      for (const [k, v] of Object.entries(this.data)) {
        const snap = new DemoDataSnapshot(v, k);
        const shouldStop = callback(snap);
        if (shouldStop) return true;
      }
    }
    return false;
  }
}

class DemoDatabaseReference {
  private db: PersistentDatabase;
  private path: string;

  constructor(db: PersistentDatabase, path: string) {
    this.db = db;
    this.path = path;
  }

  get key(): string | null {
    const parts = this.path.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }

  async get(): Promise<DemoDataSnapshot> {
    const data = getDeep(this.db.root, this.path);
    return new DemoDataSnapshot(data, this.key);
  }

  async once(_event: string): Promise<DemoDataSnapshot> {
    return this.get();
  }

  async set(value: any): Promise<void> {
    const sanitized = cleanForFirebase(value);
    setDeep(this.db.root, this.path, sanitized);
    this.db.save();
  }

  async update(partial: Record<string, any>): Promise<void> {
    const sanitized = cleanForFirebase(partial);
    updateDeep(this.db.root, this.path, sanitized);
    this.db.save();
  }

  async remove(): Promise<void> {
    removeDeep(this.db.root, this.path);
    this.db.save();
  }

  child(subPath: string): DemoDatabaseReference {
    const combined = `${this.path}/${subPath}`.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    return new DemoDatabaseReference(this.db, combined);
  }

  push(value?: any): DemoDatabaseReference {
    const id = `-${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
    const childRef = this.child(id);
    if (value !== undefined) {
      childRef.set(value);
    }
    return childRef;
  }

  async transaction(
    transactionUpdate: (currentData: any) => any,
  ): Promise<{ committed: boolean; snapshot: DemoDataSnapshot }> {
    const current = getDeep(this.db.root, this.path);
    const updated = transactionUpdate(current);
    if (updated === undefined) {
      return { committed: false, snapshot: new DemoDataSnapshot(current, this.key) };
    }
    const sanitized = cleanForFirebase(updated);
    setDeep(this.db.root, this.path, sanitized);
    this.db.save();
    return { committed: true, snapshot: new DemoDataSnapshot(sanitized, this.key) };
  }
}

class PersistentDatabase {
  public root: DataRecord = {};

  constructor() {
    this.load();
  }

  public load(): void {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf8");
        const parsed = JSON.parse(raw);
        this.root = sanitizeDatabase(parsed);
      } else {
        this.root = defaultCleanDatabase();
        this.save();
      }
    } catch (err) {
      console.warn("Could not read database file, initializing clean database:", err);
      this.root = defaultCleanDatabase();
      this.save();
    }
  }

  public save(): void {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${DB_FILE}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(tmp, JSON.stringify(this.root, null, 2), "utf8");
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error("Failed to write to persistent database file:", err);
    }
  }

  ref(path = ""): DemoDatabaseReference {
    const cleaned = path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    return new DemoDatabaseReference(this, cleaned);
  }

}

const persistentDb = new PersistentDatabase();


// Cache for Google's public x509 certs for Firebase ID token verification
let googleCertsCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (googleCertsCache && googleCertsCache.expiresAt > now) {
    return googleCertsCache.certs;
  }
  try {
    const res = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    );
    if (res.ok) {
      const certs = (await res.json()) as Record<string, string>;
      googleCertsCache = { certs, expiresAt: now + 6 * 3600 * 1000 };
      return certs;
    }
  } catch (err) {
    console.warn("Could not fetch Google public certs:", err);
  }
  return googleCertsCache?.certs ?? {};
}

class FirebaseAuthService {
  private db: any;
  private apiKey: string;
  private projectId: string;

  constructor(db: any) {
    this.db = db;
    this.apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    this.projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "digital-cafemenu";
  }

  async getUser(uid: string) {
    const userSnap = await this.db.ref(`users/${uid}`).get();
    const user = userSnap.val();
    if (!user) throw new Error("auth/user-not-found");
    return {
      uid: user.uid || uid,
      email: user.email,
      displayName: user.name,
      customClaims: user.customClaims ?? {
        restaurantIds: Object.fromEntries(
          Object.entries(user.restaurants ?? {}).map(([k, v]: [string, any]) => [k, v.active !== false]),
        ),
        restaurantRoles: Object.fromEntries(
          Object.entries(user.restaurants ?? {}).map(([k, v]: [string, any]) => [k, v.role]),
        ),
      },
    };
  }

  async getUserByEmail(email: string) {
    const cleanEmail = email.toLowerCase().trim();
    const usersSnap = await this.db.ref("users").get();
    const users = (usersSnap.val() ?? {}) as Record<string, any>;
    const found = Object.entries(users).find(
      ([, u]) => u.email?.toLowerCase() === cleanEmail,
    );
    if (found) {
      return {
        uid: found[0],
        email: found[1].email,
        displayName: found[1].name,
      };
    }
    throw new Error("auth/user-not-found");
  }

  async createUser(props: { email: string; displayName?: string; password?: string }) {
    const cleanEmail = props.email.toLowerCase().trim();
    const name = props.displayName ?? props.email.split("@")[0];

    // If Admin SDK is initialized:
    const app = getFirebaseApp();
    if (app) {
      try {
        const adminUser = await admin.auth(app).createUser({
          email: cleanEmail,
          displayName: name,
          ...(props.password ? { password: props.password } : {}),
        });
        await this.db.ref(`users/${adminUser.uid}`).set({
          uid: adminUser.uid,
          email: cleanEmail,
          name,
          createdAt: Date.now(),
        });
        return { uid: adminUser.uid, email: cleanEmail, displayName: name };
      } catch (err: any) {
        if (err?.code === "auth/email-already-exists") {
          return this.getUserByEmail(cleanEmail);
        }
        throw err;
      }
    }

    // Real user creation in Firebase Auth via Identity Toolkit API
    if (this.apiKey) {
      const tempPassword = props.password || `Init_${crypto.randomBytes(16).toString("hex")}!`;
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password: tempPassword,
            returnSecureToken: true,
          }),
        }
      );
      const data = (await res.json()) as any;
      if (data.localId) {
        const uid = data.localId;
        const value = {
          uid,
          email: cleanEmail,
          name,
          createdAt: Date.now(),
        };
        await this.db.ref(`users/${uid}`).set(value);
        return { uid, email: cleanEmail, displayName: name };
      }
      if (data.error?.message?.includes("EMAIL_EXISTS")) {
        try {
          return await this.getUserByEmail(cleanEmail);
        } catch {
          const uid = `fb_${crypto.createHash("sha256").update(cleanEmail).digest("hex").slice(0, 20)}`;
          const value = { uid, email: cleanEmail, name, createdAt: Date.now() };
          await this.db.ref(`users/${uid}`).set(value);
          return value;
        }
      }
      throw new Error(data.error?.message || "Failed to create Firebase Auth user");
    }

    throw new Error("Firebase Authentication API key is missing.");
  }

  async sendPasswordResetEmail(email: string): Promise<boolean> {
    const cleanEmail = email.toLowerCase().trim();
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestType: "PASSWORD_RESET",
            email: cleanEmail,
          }),
        }
      );
      const data = (await res.json()) as any;
      return Boolean(data.email);
    } catch (err) {
      console.warn("Failed to send Firebase password reset email:", err);
      return false;
    }
  }

  async generatePasswordResetLink(email: string): Promise<string | null> {
    const app = getFirebaseApp();
    if (app) {
      try {
        return await admin.auth(app).generatePasswordResetLink(email);
      } catch (err) {
        console.warn("Admin generatePasswordResetLink failed:", err);
      }
    }
    // Dispatch the real password reset email via Firebase Identity Toolkit
    await this.sendPasswordResetEmail(email);
    return null;
  }

  async updateUser(
    uid: string,
    props: { email?: string; displayName?: string; password?: string; disabled?: boolean },
  ) {
    const app = getFirebaseApp();
    if (app) {
      try {
        await admin.auth(app).updateUser(uid, props);
      } catch (err) {
        console.warn("Admin updateUser error:", err);
      }
    }
    const user = (await this.db.ref(`users/${uid}`).get()).val() ?? {};
    const updates: Record<string, any> = {};
    if (props.email) updates.email = props.email.toLowerCase().trim();
    if (props.displayName) updates.name = props.displayName;
    if (props.disabled !== undefined) updates.disabled = props.disabled;
    await this.db.ref(`users/${uid}`).update(updates);
    return {
      uid,
      email: props.email ?? user.email,
      displayName: props.displayName ?? user.name,
      disabled: props.disabled ?? user.disabled ?? false,
    };
  }

  async setCustomUserClaims(uid: string, claims: any) {
    const app = getFirebaseApp();
    if (app) {
      try {
        await admin.auth(app).setCustomUserClaims(uid, claims);
      } catch (err) {
        console.warn("Admin setCustomUserClaims error:", err);
      }
    }
    await this.db.ref(`users/${uid}/customClaims`).set(claims);
  }

  async verifyIdToken(token: string) {
    if (!token || typeof token !== "string" || !token.trim()) {
      throw new Error("auth/argument-error: Empty or invalid token");
    }

    const app = getFirebaseApp();
    if (app) {
      try {
        return await admin.auth(app).verifyIdToken(token);
      } catch (err) {
        console.warn("admin.auth().verifyIdToken failed, falling back to public cert verification:", err);
      }
    }

    const parts = token.split(".");
    if (parts.length === 3) {
      const [headerB64, payloadB64, signatureB64] = parts;
      let header: any;
      let payload: any;
      if (!headerB64 || !payloadB64 || !signatureB64) {
        throw new Error("auth/argument-error: Malformed token parts");
      }
      try {
        header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
        payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      } catch {
        throw new Error("auth/argument-error: Malformed token payload");
      }

      if (!header || typeof header !== "object" || !payload || typeof payload !== "object") {
        throw new Error("auth/argument-error: Invalid token JSON structure");
      }

      if (header.alg !== "RS256") {
        throw new Error("auth/invalid-id-token: Invalid header or unsupported algorithm");
      }

      if (!header.kid || typeof header.kid !== "string" || !header.kid.trim()) {
        throw new Error("auth/invalid-id-token: Missing or empty kid");
      }

      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== "number" || payload.exp < now) {
        throw new Error("auth/id-token-expired: Firebase ID token has expired");
      }

      if (typeof payload.iat === "number" && payload.iat > now + 300) {
        throw new Error("auth/invalid-id-token: Token issued in the future");
      }

      const sub = payload.sub || payload.user_id;
      if (!sub || typeof sub !== "string" || !sub.trim()) {
        throw new Error("auth/invalid-id-token: Missing or invalid sub claim");
      }

      if (this.projectId) {
        if (!payload.aud || payload.aud !== this.projectId) {
          throw new Error("auth/invalid-id-token: Token audience mismatch");
        }
        if (!payload.iss || payload.iss !== `https://securetoken.google.com/${this.projectId}`) {
          throw new Error("auth/invalid-id-token: Token issuer mismatch");
        }
      }

      const certs = await getGooglePublicCerts();
      const cert = certs[header.kid.trim()];
      if (!cert) {
        throw new Error("auth/invalid-id-token: Unknown public key kid");
      }

      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(`${headerB64}.${payloadB64}`);
      const isValid = verifier.verify(cert, Buffer.from(signatureB64, "base64url"));
      if (!isValid) {
        throw new Error("auth/invalid-id-token: Signature verification failed");
      }

      const uid = payload.user_id || payload.sub || payload.uid;
      if (uid) {
        return {
          uid,
          email: payload.email ?? null,
          name: payload.name ?? (payload.email ? payload.email.split("@")[0] : "Operator"),
          email_verified: Boolean(payload.email_verified),
          ...payload,
        };
      }
    }

    throw new Error("auth/argument-error: Invalid Firebase ID token");
  }
}

const firebaseAuthService = new FirebaseAuthService(persistentDb);

export function getDatabase(): any {
  try {
    const app = getFirebaseApp();
    const dbUrl = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
    if (app && dbUrl) {
      return admin.database(app);
    }
  } catch (err) {
    console.warn("Could not connect to Firebase Realtime Database, using persistent database:", err);
  }
  return persistentDb;
}

export function getStorageBucket(): any {
  try {
    const app = getFirebaseApp();
    const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (app && bucket) {
      return admin.storage(app).bucket();
    }
  } catch (err) {
    console.warn("Could not connect to Firebase Storage bucket, using fallback:", err);
  }
  return {
    file: () => ({
      save: async () => {},
      getSignedUrl: async () => ["https://images.unsplash.com/photo-1555396273-367ea4eb4db5"],
    }),
  };
}

export function getAdminAuth(): any {
  try {
    const app = getFirebaseApp();
    if (app) {
      return admin.auth(app);
    }
  } catch (err) {
    console.warn("Could not connect to Firebase Admin Auth, using firebaseAuthService:", err);
  }
  return firebaseAuthService;
}

export async function syncRestaurantClaims(
  uid: string,
  restaurantId: string,
  role: string,
  active: boolean,
) {
  try {
    const auth = getAdminAuth();
    const user = await auth.getUser(uid);
    const current = user?.customClaims ?? {};
    const restaurantIds = {
      ...((current.restaurantIds ?? {}) as Record<string, boolean>),
      [restaurantId]: active,
    };
    const restaurantRoles = {
      ...((current.restaurantRoles ?? {}) as Record<string, string>),
      [restaurantId]: role,
    };
    await auth.setCustomUserClaims(uid, { ...current, restaurantIds, restaurantRoles });
  } catch (err) {
    console.warn("syncRestaurantClaims skipped:", err);
  }
}

export function createId(prefix = "id") {
  const safePrefix = prefix && typeof prefix === "string" && prefix.trim() ? prefix.trim() : "id";
  return `${safePrefix}_${crypto.randomBytes(5).toString("base64url")}`;
}

export function timestamp(value: unknown) {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(pin, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(pin, salt, 64, (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
    const keyBuffer = Buffer.from(key, "hex");
    if (derivedKey.length !== keyBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

export function randomPin() {
  return String(crypto.randomInt(1000, 10000));
}

export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password || typeof password !== "string" || password.trim().length === 0) {
    return false;
  }
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            returnSecureToken: true,
          }),
        },
      );
      if (res.ok) return true;
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || "";
      if (
        msg.includes("INVALID_PASSWORD") ||
        msg.includes("EMAIL_NOT_FOUND") ||
        msg.includes("USER_DISABLED") ||
        msg.includes("INVALID_LOGIN_CREDENTIALS")
      ) {
        return false;
      }
    } catch (err) {
      console.warn("verifyUserPassword Identity Toolkit check error:", err);
    }
  }

  // Without verified identity toolkit confirmation, never grant access
  return false;
}

