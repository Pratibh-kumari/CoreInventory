import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    
    // Call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/api/assets/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify({
        asset_name: body.name,
        asset_type: body.type,
        metadata: body.metadata || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Failed to register asset' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      asset: data,
      message: 'Asset registered successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to register asset' },
      { status: 500 }
    );
  }
}
