import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = Math.max(0, (page - 1) * limit);
    const authHeader = request.headers.get('authorization');

    const response = await fetch(`${BACKEND_URL}/api/audit/log?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch audit logs' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const logs = (data.entries || []).map((entry: any) => ({
      id: String(entry.id),
      eventType: entry.event_data?.event_type || 'UNKNOWN',
      timestamp: entry.created_at,
      entryHash: entry.entry_hash,
      prevHash: entry.prev_hash,
    }));

    return NextResponse.json({ logs, total: data.total || logs.length, page, limit });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
