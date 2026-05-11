import { NextRequest, NextResponse } from 'next/server';

const protectedPrefixes = ['/api/', '/v1/'];
const authResponseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
};

const isProtectedPath = (pathname: string) =>
  protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

const getProvidedKey = (request: NextRequest) => {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return request.headers.get('x-api-key')?.trim();
};

export function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS' || !isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const expectedKey = process.env.INTERNAL_API_KEY?.trim();
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'INTERNAL_API_KEY is required for API access' },
      { status: 500, headers: authResponseHeaders }
    );
  }

  if (getProvidedKey(request) !== expectedKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: authResponseHeaders }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/v1/:path*']
};
