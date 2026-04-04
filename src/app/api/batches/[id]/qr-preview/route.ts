import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenParam = request.nextUrl.searchParams.get('token') || '';

  if (!tokenParam) {
    return NextResponse.json(
      { error: 'Not authenticated. Open this from the dashboard or pass ?token=<jwt>.' },
      { status: 401 }
    );
  }

  const filesRes = await fetch(
    `${request.nextUrl.origin}/api/batches/${id}/qr-files?token=${encodeURIComponent(tokenParam)}`,
    { cache: 'no-store' }
  );

  if (!filesRes.ok) {
    const data = await filesRes.json().catch(() => ({}));
    return NextResponse.json({ error: data.error || 'Failed to load QR preview' }, { status: filesRes.status });
  }

  const data = await filesRes.json();
  const files: string[] = Array.isArray(data.files) ? data.files : [];

  const imagesHtml = files
    .map((f) => {
      const code = f.replace(/\.png$/i, '');
      const src = `/api/batches/${id}/qr/${encodeURIComponent(code)}?token=${encodeURIComponent(tokenParam)}`;
      return `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;background:#fff;">
        <div style="font:600 14px/1.2 sans-serif;margin-bottom:8px;word-break:break-all;">${code}</div>
        <img src="${src}" alt="QR ${code}" style="max-width:280px;width:100%;height:auto;display:block;"/>
      </div>`;
    })
    .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Batch QR Preview</title>
</head>
<body style="margin:0;padding:24px;background:#f5f5f5;">
  <h1 style="font:700 22px/1.2 sans-serif;margin:0 0 16px;">Batch QR Preview</h1>
  <p style="font:400 14px/1.4 sans-serif;margin:0 0 20px;color:#444;">Batch ID: ${id}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">${imagesHtml || '<p style="font:400 14px sans-serif;">No QR files found.</p>'}</div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
