import { api, HttpError } from '@/lib/auth';
import { abandonChallenge, badgesFor, gamificationStatus, joinChallenge, ledger, listChallenges, redeem, storeItems, streakCalendar } from '@/lib/services/gamification';

type C = { params: Promise<{ kind: string }> };
export const GET = api<C>(async (_req, u, { params }) => {
  switch ((await params).kind) {
    case 'status':
      return { ...(await gamificationStatus(u.id)), calendar: await streakCalendar(u.id, 35) };
    case 'badges':
      return badgesFor(u.id);
    case 'challenges':
      return listChallenges(u.id);
    case 'store':
      return storeItems(u.id);
    case 'ledger':
      return ledger(u.id, 80);
    default:
      throw new HttpError(404, 'Unknown');
  }
});
export const POST = api<C>(async (req, u, { params }) => {
  const kind = (await params).kind;
  const body = await req.json().catch(() => ({}));
  if (kind === 'redeem') return redeem(u.id, String(body.reward_id));
  if (kind === 'challenges') {
    if (body.abandon) return abandonChallenge(u.id, String(body.abandon));
    return joinChallenge(u.id, String(body.challenge_id));
  }
  throw new HttpError(404, 'Unknown');
});
