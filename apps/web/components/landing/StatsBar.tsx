const stats = [
  { value: "2,400+", label: "Companies trust TimeForge" },
  { value: "18M+", label: "Hours tracked monthly" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "40+", label: "Countries supported" },
];

export function StatsBar() {
  return (
    <section className="border-y border-gray-100 bg-gray-50/60 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 text-center sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-3xl font-extrabold text-blue-600">{s.value}</p>
            <p className="mt-1 text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
