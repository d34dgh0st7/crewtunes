import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get('term');

  if (!term) {
    return NextResponse.json({ error: 'No search term provided' }, { status: 400 });
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&limit=6&media=music`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CrewTunes/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('iTunes proxy error:', error);
    return NextResponse.json({ 
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
