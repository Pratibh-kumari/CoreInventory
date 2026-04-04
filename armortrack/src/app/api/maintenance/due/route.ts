import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const response = await fetch(`${BACKEND_URL}/api/maintenance/due`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch maintenance data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assets = (data.assets || []).map((asset: any) => ({
      id: asset.id,
      name: asset.asset_name,
      lastServiced: asset.last_serviced_at || new Date().toISOString(),
      daysUntilDue: asset.days_until_due,
    }));

    return NextResponse.json({ assets, total: data.total || assets.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch maintenance data' },
      { status: 500 }
    );
  }
}
