const stats = [
  { value: "120K+", label: "Vessels Indexed" },
  { value: "4,500", label: "Ports Covered" },
  { value: "$2.5B+", label: "Contacts" },
];

export function StatsStrip() {
  return (
    <section className="relative bg-black py-24 lg:py-32">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <p className="mx-auto max-w-sm text-balance text-base font-medium text-white/70 md:max-w-none md:text-lg">
          How marine teams have grown using MariMail
        </p>

        <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
          {stats.map((s, index) => (
            <div
              key={s.label}
              className={`flex flex-col items-center animate-float-y-${(index % 3) + 1}`}
            >
              <p className="font-serif text-6xl font-normal tracking-tight text-white md:text-7xl">
                {s.value}
              </p>
              <p className="mt-3 text-sm text-white/60 md:text-base">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
