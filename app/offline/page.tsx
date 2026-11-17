export default function Offline() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-4xl">📴</p>
        <h1 className="mt-3 text-xl font-bold">You’re offline</h1>
        <p className="mt-1 text-sm text-muted">Expenses you add with the Form are saved on this device and sync automatically when you’re back online.</p>
        <a href="/home" className="mt-5 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Try again</a>
      </div>
    </div>
  );
}
