import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetIds, transporterId, destination, expectedDelivery } = body;
    const authHeader = request.headers.get('authorization');

    if (!assetIds || !destination || !expectedDelivery) {
      return NextResponse.json(
        { error: 'assetIds, destination and expectedDelivery are required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/batches/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify({
        transporter_id: transporterId,
        destination,
        asset_ids: assetIds,
        expected_delivery: expectedDelivery,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to create batch' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const newBatch = {
      id: data.id,
      batchCode: data.batch_code,
      assetsCount: Array.isArray(data.assets) ? data.assets.length : 0,
      transporter: data.transporter_id,
      status: data.status,
      destination: data.destination,
      createdAt: data.created_at,
      driverName: data.driver_name,
      qrGenerated: Boolean(data.qr_generated),
      createdBy: data.created_by,
    };

    return NextResponse.json({
      batch: newBatch,
      message: 'Batch created successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 }
    );
  }
}
