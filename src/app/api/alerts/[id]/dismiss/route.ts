import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(`${BACKEND_URL}/api/alerts/${id}/dismiss`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to dismiss alert' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ message: data.message || 'Alert dismissed', id });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to dismiss alert' },
      { status: 500 }
    );
  }
}
