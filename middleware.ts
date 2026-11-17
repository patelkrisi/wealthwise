import { NextResponse, type NextRequest } from 'next/server';

const APP = ['/home', '/transactions', '/insights', '/goals', '/rewards', '/reports', '/assistant', '/settings', '/onboarding', '/weekly'];

/** Cheap gate: no session cookie → /auth. Full verification happens in the (app) layout and every API route. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (APP.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.get('ww_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
