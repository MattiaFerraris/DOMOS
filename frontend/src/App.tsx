export default function App() {
  return (
    <div className="min-h-screen bg-neutral-100 p-6 md:p-10 font-sans text-neutral-800">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight">
            DOMOS
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Device Orchestration for Multivendor Open Systems
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Badge di stato del sistema */}
          <div className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
            Backend Connesso
          </div>
        </div>
      </header>

      {/* Main Grid dei Dispositivi */}
      <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Card Philips Hue */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-neutral-800">Philips Hue</h2>
            <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border border-amber-100">
              Luce
            </span>
          </div>
          <p className="text-sm text-neutral-500 mb-6">
            Stato attuale:{" "}
            <span className="font-semibold text-amber-500">Accesa (80%)</span>
          </p>
          <button className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl font-semibold transition-colors cursor-pointer">
            Spegni Luce
          </button>
        </div>

        {/* Card Shelly */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-neutral-800">
              Shelly Plus 1
            </h2>
            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border border-blue-100">
              Relè / Presa
            </span>
          </div>
          <p className="text-sm text-neutral-500 mb-6">
            Assorbimento:{" "}
            <span className="font-semibold text-neutral-800">12 W</span>
          </p>
          <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition-colors cursor-pointer">
            Toggle Alimentazione
          </button>
        </div>

        {/* Card Nenko */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-neutral-800">
              Nenko Telecomando
            </h2>
            <span className="text-purple-600 bg-purple-50 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border border-purple-100">
              Radio
            </span>
          </div>
          <p className="text-sm text-neutral-500 mb-6">
            Ultimo comando:{" "}
            <span className="font-semibold text-neutral-800">Nessuno</span>
          </p>
          <div className="flex gap-2">
            {/* Bottoni colorati per simulare il telecomando Nenko */}
            <button className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-semibold transition-colors cursor-pointer">
              Rosso
            </button>
            <button className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl font-semibold transition-colors cursor-pointer">
              Verde
            </button>
            <button className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-xl font-semibold transition-colors cursor-pointer">
              Blu
            </button>
          </div>
        </div>

        {/* Card Diffusore */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-neutral-800">
              Diffusore Fragranze
            </h2>
            <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border border-rose-100">
              Scent
            </span>
          </div>
          <p className="text-sm text-neutral-500 mb-6">
            Capsula attiva:{" "}
            <span className="font-semibold text-neutral-800">
              Lavanda Relax
            </span>
          </p>
          <button className="w-full py-2.5 border-2 border-neutral-200 hover:border-rose-500 hover:text-rose-600 text-neutral-700 rounded-xl font-semibold transition-colors cursor-pointer">
            Spara Fragranza
          </button>
        </div>
      </main>

      {/* Sezione Scenari Multivendor */}
      <section className="mt-12 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-neutral-200">
        <h3 className="text-2xl font-bold text-neutral-800 mb-2">
          Automazioni e Scenari
        </h3>
        <p className="text-neutral-500 mb-6">
          Orchestra dispositivi di produttori diversi con un singolo comando.
        </p>

        <div className="flex flex-wrap gap-4">
          <button className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold transition-all hover:-translate-y-0.5 cursor-pointer flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Avvia "Stanza Sensoriale"
          </button>

          <button className="px-6 py-3.5 bg-neutral-800 hover:bg-black text-white rounded-xl shadow-md font-bold transition-all hover:-translate-y-0.5 cursor-pointer">
            Spegnimento Globale
          </button>
        </div>
      </section>
    </div>
  );
}
