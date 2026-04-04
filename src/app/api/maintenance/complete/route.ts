import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asset_id, asset_code, technician_id, notes } = body;
    const authHeader = request.headers.get('authorization');

    if (!asset_id && !asset_code) {
      return NextResponse.json(
        { error: 'Asset code is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/maintenance/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify({
        asset_id: asset_id || null,
        asset_code: asset_code || asset_id || null,
        technician_id: technician_id || 'system',
        notes: notes || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to update maintenance' },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      message: data.message || 'Maintenance marked complete',
      asset_id: data.asset_id || asset_id || asset_code,
      asset_code: data.asset_code || asset_code || asset_id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update maintenance' },
      { status: 500 }
    );
  }
}
