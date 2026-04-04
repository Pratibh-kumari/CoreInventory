import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const response = await fetch(`${BACKEND_URL}/api/batches`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch batches' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const batches = (data || []).map((batch: any) => ({
      id: batch.id,
      batchCode: batch.batch_code,
      assetsCount: Array.isArray(batch.assets) ? batch.assets.length : 0,
      transporter: batch.transporter_id || 'UNKNOWN',
      status: batch.status,
      destination: batch.destination,
      createdAt: batch.created_at,
      driverName: batch.driver_name,
      qrGenerated: Boolean(batch.qr_generated),
      createdBy: batch.created_by,
      assets: (batch.assets || []).map((asset: any) => ({
        assetId: asset.asset_code || asset.asset_id,
        assetName: asset.asset_name || asset.asset_code || asset.asset_id,
        scanStatus: asset.scanned_at_dispatch ? 'SCANNED' : 'NOT_SCANNED',
      })),
    }));

    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}
