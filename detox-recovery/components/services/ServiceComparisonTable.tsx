import { SERVICE_TIERS } from "@/lib/services-data";

export function ServiceComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Service
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Duration
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Price
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Status
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              CTA
            </th>
          </tr>
        </thead>
        <tbody>
          {SERVICE_TIERS.map((tier) => (
            <tr
              key={tier.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-medium text-slate-900">
                {tier.name}
              </td>
              <td className="px-4 py-3 text-slate-600">{tier.duration}</td>
              <td className="px-4 py-3 text-slate-600">{tier.price}</td>
              <td className="px-4 py-3">
                {tier.status === "available" ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                    Available
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Coming soon
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <a
                  href={tier.ctaHref}
                  className="font-medium text-teal-700 hover:underline"
                >
                  {tier.cta}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
