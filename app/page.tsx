// Minimal placeholder — Steven owns the landing page. Backend lives in app/api/*.
export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: 40 }}>
      <h1>BILADS</h1>
      <p>Billboards, decided. (backend branch — API routes live)</p>
      <ul>
        <li>POST /api/research (add ?mock=1 for the hardcoded mock)</li>
        <li>POST /api/generate (add ?live=1 to bypass the disk cache)</li>
        <li>GET/POST /api/band — agent collaboration room</li>
        <li>GET/POST /api/kylon — AI workforce assignments</li>
      </ul>
    </main>
  );
}
