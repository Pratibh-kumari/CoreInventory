import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const body = await request.json().catch(() => ({}));

    const response = await fetch(`${BACKEND_URL}/api/batches/${id}/request-delivery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || 'Failed to request delivery' }, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to request delivery' }, { status: 500 });
  }
}
