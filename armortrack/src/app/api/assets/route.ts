import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

function mapStatus(status: string): string {
  if (status === 'MAINTENANCE') return 'MAINTENANCE_DUE';
  return status;
}

export async function GET(request: NextRequest) {
  try {
    // Get token from headers
    const authHeader = request.headers.get('authorization');
    
    // Call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/api/assets`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch assets' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assets = Array.isArray(data)
      ? data.map((asset: any) => ({
          id: asset.asset_code || asset.id,
          name: asset.asset_name || 'Unnamed Asset',
          type: asset.asset_type || 'Unknown',
          status: mapStatus(asset.status || 'WAREHOUSE'),
          currentCustodian: asset.current_custodian || asset.current_custodian_id || 'Unassigned',
          lastUpdated: asset.last_serviced_at || asset.created_at || new Date().toISOString(),
        }))
      : [];

    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      { assets: [], error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}
