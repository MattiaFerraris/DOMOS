interface HeaderProps {
  deviceCount: number;
  onRefresh: () => void;
}

export default function Header({ deviceCount, onRefresh }: HeaderProps) {
  return (
    <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-black text-white shadow-lg shadow-indigo-500/30">
          D
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">
            DOMOS
          </h1>
          <p className="mt-0.5 text-sm font-medium text-neutral-500">
            Device Orchestration for Multivendor Open Systems
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-600 shadow-sm">
          {deviceCount} {deviceCount === 1 ? "dispositivo" : "dispositivi"}
        </span>

        <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-700 shadow-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"></span>
          Backend Connesso
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900 cursor-pointer"
          title="Aggiorna dispositivi"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          Aggiorna
        </button>
      </div>
    </header>
  );
}
