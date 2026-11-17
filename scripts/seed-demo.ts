import { ready, q } from '../lib/db';
import { seedDemo } from '../lib/seed/demo';
(async () => {
  await ready();
  await seedDemo();
  const [p] = await q(`select p.name, p.coin_balance, p.lifetime_coins, p.level, s.current, s.longest from profiles p join streaks s on s.user_id=p.id join users u on u.id=p.id where u.is_demo`);
  console.log(p);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
