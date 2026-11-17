import type { Q } from '../db';
import { BADGES, CHALLENGES, DEFAULT_CATEGORIES, REWARDS, merchantRows } from './catalog';

/** Idempotent seed of global reference data. */
export async function seedReferenceData(q: Q) {
  let i = 0;
  for (const c of DEFAULT_CATEGORIES) {
    i++;
    await q(
      `insert into categories(user_id,name,emoji,colour,is_default,bucket,sort)
       values(null,$1,$2,$3,true,$4,$5)
       on conflict (name) where user_id is null do update set emoji=excluded.emoji, colour=excluded.colour, bucket=excluded.bucket, sort=excluded.sort`,
      [c.name, c.emoji, c.colour, c.bucket, i],
    );
  }
  const [{ n }] = await q<{ n: number }>(`select count(*)::int n from merchant_dictionary`);
  const rows = merchantRows();
  if (n < rows.length) {
    // bulk insert in chunks
    for (let k = 0; k < rows.length; k += 100) {
      const chunk = rows.slice(k, k + 100);
      const vals: unknown[] = [];
      const ph = chunk.map((r, j) => {
        vals.push(r.keyword, r.category, r.necessity);
        return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::necessity)`;
      });
      await q(
        `insert into merchant_dictionary(keyword,category_name,default_necessity) values ${ph.join(',')}
         on conflict (keyword) do update set category_name=excluded.category_name, default_necessity=excluded.default_necessity`,
        vals,
      );
    }
  }
  for (const b of BADGES) {
    await q(
      `insert into badges(id,name,description,emoji,rule,sort) values($1,$2,$3,$4,$5,$6)
       on conflict(id) do update set name=excluded.name, description=excluded.description, emoji=excluded.emoji, rule=excluded.rule, sort=excluded.sort`,
      [b.id, b.name, b.description, b.emoji, b.rule, b.sort],
    );
  }
  for (const c of CHALLENGES) {
    await q(
      `insert into challenges(id,name,description,emoji,rule_json,reward,duration_days) values($1,$2,$3,$4,$5::jsonb,$6,$7)
       on conflict(id) do update set name=excluded.name, description=excluded.description, emoji=excluded.emoji,
         rule_json=excluded.rule_json, reward=excluded.reward, duration_days=excluded.duration_days`,
      [c.id, c.name, c.description, c.emoji, JSON.stringify(c.rule_json), c.reward, c.duration_days],
    );
  }
  for (const r of REWARDS) {
    await q(
      `insert into rewards(id,name,description,emoji,cost_coins,type,value,available,sort) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict(id) do update set name=excluded.name, description=excluded.description, emoji=excluded.emoji,
         cost_coins=excluded.cost_coins, type=excluded.type, value=excluded.value, available=excluded.available, sort=excluded.sort`,
      [r.id, r.name, r.description, r.emoji, r.cost_coins, r.type, r.value, (r as any).available ?? true, r.sort],
    );
  }
  // Colour themes are free for everyone now (Settings → Appearance), so they're no longer sold in the store.
  await q(`update rewards set available=false where type='theme'`);
  await q(`update profiles set accent='teal' where accent is null or accent not in ('teal','ocean','royal')`);
}
