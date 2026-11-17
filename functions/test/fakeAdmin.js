// In-memory stand-in for firebase-admin (Firestore + Auth) used ONLY by the local logic tests.
// It models the behaviours the backend relies on:
//   - optimistic transactions: conflicting commits are detected and retried
//   - "all reads before any write" inside a transaction (real Firestore rejects violations)
//   - create() fails if a doc exists; update() fails if it does not
//   - serverTimestamp / arrayUnion sentinels, equality queries
// It is NOT a substitute for testing against a real Firebase project / the emulator.
class Timestamp {
  constructor(ms) { this.ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  toDate() { return new Date(this.ms); }
}
const FieldValue = {
  serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  arrayUnion: (...els) => ({ __op: 'arrayUnion', els })
};

const clone = (v) => {
  if (v instanceof Timestamp) return new Timestamp(v.ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o;
  }
  return v;
};

const store = new Map(); // path -> { data, version }
let autoId = 0;
const tick = () => new Promise((r) => setImmediate(r));

const resolveValue = (existing, v) => {
  if (v && v.__op === 'serverTimestamp') return Timestamp.now();
  if (v && v.__op === 'arrayUnion') {
    const arr = Array.isArray(existing) ? existing.map(clone) : [];
    for (const el of v.els) {
      if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(el))) arr.push(clone(el));
    }
    return arr;
  }
  return clone(v);
};

class DocSnap {
  constructor(ref, rec) { this.ref = ref; this.id = ref.id; this.exists = !!rec; this._d = rec ? rec.data : undefined; this.version = rec ? rec.version : 0; }
  data() { return this._d ? clone(this._d) : undefined; }
  get(f) { return this._d ? clone(this._d[f]) : undefined; }
}
class QuerySnap { constructor(docs) { this.docs = docs; this.empty = docs.length === 0; this.size = docs.length; } }

class DocRef {
  constructor(path) { this.path = path; this.id = path.split('/').pop(); }
  async get() { return new DocSnap(this, store.get(this.path)); }
  async set(data, opts) { applyWrite({ op: 'set', ref: this, data, opts }); }
  async update(data) { applyWrite({ op: 'update', ref: this, data }); }
  async create(data) { applyWrite({ op: 'create', ref: this, data }); }
  async delete() { applyWrite({ op: 'delete', ref: this }); }
}
class Query {
  constructor(col, filters = []) { this.col = col; this.filters = filters; }
  where(f, op, v) {
    if (op !== '==') throw new Error('fake supports == only');
    return new Query(this.col, [...this.filters, [f, v]]);
  }
  _run() {
    const prefix = this.col + '/';
    const out = [];
    for (const [path, rec] of store) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      if (this.filters.every(([f, v]) => rec.data[f] === v)) out.push(new DocSnap(new DocRef(path), rec));
    }
    return out;
  }
  async get() { return new QuerySnap(this._run()); }
}
class CollectionRef extends Query {
  constructor(name) { super(name, []); this.name = name; }
  doc(id) { return new DocRef(`${this.name}/${id || `auto${++autoId}`}`); }
}

function applyWrite(w) {
  const path = w.ref.path;
  const rec = store.get(path);
  if (w.op === 'create') {
    if (rec) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
    const d = {};
    for (const k of Object.keys(w.data)) d[k] = resolveValue(undefined, w.data[k]);
    store.set(path, { data: d, version: 1 });
  } else if (w.op === 'set') {
    const base = w.opts && w.opts.merge && rec ? rec.data : {};
    const d = { ...clone(base) };
    for (const k of Object.keys(w.data)) d[k] = resolveValue(base[k], w.data[k]);
    store.set(path, { data: d, version: (rec ? rec.version : 0) + 1 });
  } else if (w.op === 'update') {
    if (!rec) { const e = new Error('NOT_FOUND: ' + path); e.code = 5; throw e; }
    const d = clone(rec.data);
    for (const k of Object.keys(w.data)) d[k] = resolveValue(rec.data[k], w.data[k]);
    store.set(path, { data: d, version: rec.version + 1 });
  } else if (w.op === 'delete') {
    store.delete(path);
  }
}

class Tx {
  constructor() { this.reads = new Map(); this.queries = []; this.writes = []; }
  async get(x) {
    if (this.writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
    await tick();
    if (x instanceof DocRef) {
      const s = await x.get();
      this.reads.set(x.path, s.version);
      return s;
    }
    const docs = x._run();
    this.queries.push({ q: x, ids: docs.map((d) => `${d.ref.path}@${d.version}`).sort().join('|') });
    return new QuerySnap(docs);
  }
  set(ref, data, opts) { this.writes.push({ op: 'set', ref, data, opts }); return this; }
  update(ref, data) { this.writes.push({ op: 'update', ref, data }); return this; }
  create(ref, data) { this.writes.push({ op: 'create', ref, data }); return this; }
  delete(ref) { this.writes.push({ op: 'delete', ref }); return this; }
}

const firestore = {
  collection: (name) => new CollectionRef(name),
  doc: (path) => new DocRef(path),
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const tx = new Tx();
      const result = await fn(tx);
      await tick();
      // validate: nothing we read changed since we read it
      let conflict = false;
      for (const [path, ver] of tx.reads) {
        const rec = store.get(path);
        if ((rec ? rec.version : 0) !== ver) conflict = true;
      }
      for (const { q, ids } of tx.queries) {
        const now = q._run().map((d) => `${d.ref.path}@${d.version}`).sort().join('|');
        if (now !== ids) conflict = true;
      }
      if (conflict) continue; // retry, like the real SDK
      const snapshot = new Map([...store].map(([k, v]) => [k, { data: clone(v.data), version: v.version }]));
      try {
        for (const w of tx.writes) applyWrite(w);
      } catch (e) {
        store.clear();
        for (const [k, v] of snapshot) store.set(k, v); // atomic: roll back
        throw e;
      }
      return result;
    }
    throw new Error('Too much contention');
  }
};

// ---- Auth fake
const users = new Map();
const authFake = {
  async createUser({ email, password, displayName }) {
    if ([...users.values()].some((u) => u.email === email)) {
      const e = new Error('exists'); e.code = 'auth/email-already-exists'; throw e;
    }
    if (!password || password.length < 6) { const e = new Error('weak'); e.code = 'auth/invalid-password'; throw e; }
    const uid = `uid${users.size + 1}`;
    const u = { uid, email, displayName, claims: {}, password };
    users.set(uid, u);
    return { uid };
  },
  async setCustomUserClaims(uid, claims) { users.get(uid).claims = claims; },
  async deleteUser(uid) { users.delete(uid); }
};

module.exports = {
  Timestamp, FieldValue, store, users,
  reset() { store.clear(); users.clear(); autoId = 0; },
  appModule: { getApps: () => [1], initializeApp: () => ({}) },
  firestoreModule: { getFirestore: () => firestore, FieldValue, Timestamp },
  authModule: { getAuth: () => authFake }
};
