import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const response = await fetch(`${BACKEND_URL}/api/armoury/custody/${id}`, {
      headers: {
        'Authorization': authHeader || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch custody events' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const events = (data.custody_events || []).map((event: any) => ({
      id: event.id,
      type: event.event_type,
      timestamp: event.created_at,
      personResponsible: event.triggered_by || event.user_id || 'UNKNOWN',
      locationName: event.location_name,
      location: event.location_lat && event.location_lng ? {
        lat: event.location_lat,
        lng: event.location_lng,
      } : undefined,
    }));

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch custody events' },
      { status: 500 }
    );
  }
}
