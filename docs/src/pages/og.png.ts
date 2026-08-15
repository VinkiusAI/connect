import type { APIRoute } from 'astro';
import sharp from 'sharp';

export const prerender = true;

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#000000"/>
  <defs>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 L 0 0 0 64" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1"/>
    </pattern>
    <radialGradient id="fade" cx="50%" cy="48%" r="62%">
      <stop offset="0" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <rect x="70" y="68" width="12" height="12" rx="6" fill="#dfff4f"/>
  <text x="102" y="81" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">TYPESCRIPT SDK DOCUMENTATION</text>
  <text x="70" y="270" fill="#ffffff" font-family="Georgia, serif" font-size="104" letter-spacing="-5">Vinkius Connect</text>
  <text x="70" y="372" fill="#ffffff" fill-opacity="0.42" font-family="Georgia, serif" font-size="88" letter-spacing="-4">real capabilities for AI.</text>
  <text x="72" y="492" fill="#d4d4d4" font-family="Arial, sans-serif" font-size="26">User-scoped connectors · Typed capabilities · Framework adapters</text>
  <line x1="70" y1="548" x2="1130" y2="548" stroke="#ffffff" stroke-opacity="0.18"/>
  <text x="70" y="588" fill="#ffffff" fill-opacity="0.5" font-family="monospace" font-size="18">connect.vinkius.com</text>
  <text x="1130" y="588" text-anchor="end" fill="#dfff4f" font-family="monospace" font-size="18">@vinkius/connect</text>
</svg>`;

export const GET: APIRoute = async () => {
  const image = await sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
  return new Response(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
