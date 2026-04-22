export default function Home() {
  return (
    <main className="min-h-screen bg-brand-off-white flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-display text-6xl font-black text-brand-black tracking-tight">
          THE BURGH <span className="bg-brand-lime px-2">QUARTERLY</span>
        </h1>
        <p className="font-body text-lg mt-4 text-brand-black/70">
          The businesses Pittsburgh is talking about, ranked every quarter.
        </p>
        <p className="font-body text-xs mt-8 text-brand-black/50">
          Published by Relay. Pittsburgh, PA.
        </p>
      </div>
    </main>
  );
}
