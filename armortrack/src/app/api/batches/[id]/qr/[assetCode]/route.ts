import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetCode: string }> }
) {
  try {
    const { id, assetCode } = await params;
    const authHeader = request.headers.get('authorization');
    const tokenParam = request.nextUrl.searchParams.get('token');
    const derivedAuthHeader = authHeader || (tokenParam ? `Bearer ${tokenParam}` : null);

    if (!derivedAuthHeader) {
      return NextResponse.json(
        { error: 'Not authenticated. Open this from the dashboard or pass ?token=<jwt>.' },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/batches/${id}/qr/${encodeURIComponent(assetCode)}`, {
      headers: { Authorization: derivedAuthHeader },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail || data.error || 'QR image not found' }, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch QR image' }, { status: 500 });
  }
}
