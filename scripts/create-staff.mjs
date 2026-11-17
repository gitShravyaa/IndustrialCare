// Trusted administrative setup of Maintenance Team / Warehouse Manager accounts (and optionally workers).
//
//   npm run create-staff -- --role maintenance --email jordan@company.com --name "Jordan Vance" --badge MT-01
//   npm run create-staff -- --role warehouse   --email elena@company.com  --name "Elena Rostova" --badge WM-01
//
// You are prompted for the password (it is never stored in Firestore or in this project).
// Re-running for an existing email updates the role/profile of that account.
import readline from 'node:readline';
import { auth, db, projectId, usingEmulator } from './_admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const role = args.role;
const email = (args.email || '').toLowerCase();
const name = args.name;
const badgeId = (args.badge || '').toUpperCase();
const ROLES = ['worker', 'maintenance', 'warehouse'];

if (!ROLES.includes(role) || !email || !name || !/^[A-Z]{2}-[0-9]{2}$/.test(badgeId)) {
  console.error(
    'Usage: npm run create-staff -- --role <worker|maintenance|warehouse> --email <email> --name "<Full Name>" --badge <AA-00> [--password <pw>]'
  );
  process.exit(1);
}

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });

const password = args.password || (await ask('Password for this account (min 8 chars): '));
if (!password || password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { displayName: name });
  console.log(`Existing auth user found (${user.uid}); updating role/profile.`);
} catch (err) {
  if (err.code !== 'auth/user-not-found') throw err;
  user = await auth.createUser({ email, password, displayName: name });
  console.log(`Created auth user ${user.uid}`);
}

await auth.setCustomUserClaims(user.uid, { role });
await db.doc(`users/${user.uid}`).set(
  { uid: user.uid, badgeId, name, email, role, createdAt: FieldValue.serverTimestamp() },
  { merge: true }
);
await db.doc(`badgeIds/${badgeId}`).set({ uid: user.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });

console.log(`\n${role} account ready in project "${projectId}"${usingEmulator ? ' (emulator)' : ''}: ${email} (${badgeId})`);
process.exit(0);
