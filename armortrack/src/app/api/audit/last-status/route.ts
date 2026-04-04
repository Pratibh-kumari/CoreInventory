import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const response = await fetch(`${BACKEND_URL}/api/audit/verify`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'UNKNOWN', lastRun: new Date().toISOString() },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ status: data.status || 'UNKNOWN', lastRun: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch audit status' },
      { status: 500 }
    );
  }
}
