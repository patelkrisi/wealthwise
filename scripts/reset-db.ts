// Wipes the local database (or the one in DATABASE_URL!) and rebuilds schema, reference data and the demo account.
import { dropAll, ready } from '../lib/db';
(async () => {
  await dropAll();
  await ready();
  console.log('Database reset. Demo login: demo@wealthwise.app / Demo@1234');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
