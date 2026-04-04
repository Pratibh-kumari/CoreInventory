import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const response = await fetch(`${BACKEND_URL}/api/gps/active`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch GPS data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const batches = (data.batches || []).map((batch: any) => ({
      id: `gps-${batch.batch_id}`,
      batchId: batch.batch_id,
      transporterName: batch.destination || 'UNKNOWN',
      assetsCount: 0,
      lat: batch.latitude ?? batch.lat,
      lng: batch.longitude ?? batch.lng,
      lastUpdated: batch.timestamp || batch.created_at,
      alert: false,
    }));

    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch GPS data' },
      { status: 500 }
    );
  }
}
