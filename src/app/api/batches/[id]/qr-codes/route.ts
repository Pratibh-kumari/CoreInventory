import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const tokenParam = request.nextUrl.searchParams.get('token');
    const derivedAuthHeader = authHeader || (tokenParam ? `Bearer ${tokenParam}` : null);

    if (!derivedAuthHeader) {
      return NextResponse.json(
        { error: 'Not authenticated. Open this from the dashboard or pass ?token=<jwt>.' },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/batches/${id}/qr-codes`, {
      headers: { 'Authorization': derivedAuthHeader },
    });

    if (!response.ok) {
      let message = 'Failed to fetch QR codes';
      try {
        const data = await response.json();
        message = data.detail || data.error || message;
      } catch {
        const text = await response.text().catch(() => '');
        if (text) message = text;
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=qr-codes-${id.substring(0, 8)}.zip`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to download QR codes' }, { status: 500 });
  }
}
