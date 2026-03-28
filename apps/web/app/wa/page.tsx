export const revalidate = 3600;

export default function WAHomePage() {
  return (
    <div className="py-12">
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-[#B8860B] bg-[#FFD700]/15 px-2.5 py-1 rounded mb-4">
          Coming soon
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-3">
          On Notice WA
        </h1>
        <p className="text-gray-500 text-lg leading-relaxed max-w-xl">
          A daily feed for the Western Australian Parliament — questions without
          notice, bills, and divisions from the Legislative Assembly and Council.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Questions Without Notice"
          description="An edited podcast of WA question time with Dorothy Dixers removed. No fluff, just scrutiny."
        />
        <FeatureCard
          title="Bills"
          description="Track legislation moving through the WA Legislative Assembly and Council."
        />
        <FeatureCard
          title="Divisions"
          description="How every member voted, with AI summaries of what was actually at stake."
        />
        <FeatureCard
          title="Daily digest"
          description="A short AI summary of each sitting day — what happened and why it matters."
        />
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-400">
          Looking for Federal Parliament?{" "}
          <a href="https://on-notice.xyz" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
            on-notice.xyz
          </a>
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="font-semibold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
