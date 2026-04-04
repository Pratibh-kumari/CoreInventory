import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // If no auth header, return empty alerts
    if (!authHeader) {
      return NextResponse.json({ alerts: [], total: 0 });
    }
    
    const response = await fetch(`${BACKEND_URL}/api/alerts/active`, {
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      // If unauthorized or error, return empty alerts instead of error
      return NextResponse.json({ alerts: [], total: 0 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    // Return empty alerts on any error
    return NextResponse.json({ alerts: [], total: 0 });
  }
}
