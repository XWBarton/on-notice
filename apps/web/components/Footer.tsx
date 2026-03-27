import { createClient } from "@supabase/supabase-js";
import { SupporterBar } from "./SupporterBar";

export const revalidate = 3600;

async function getSupporters() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("supporters")
    .select("total_monthly_aud, supporter_count")
    .eq("id", 1)
    .single();
  return { totalMonthly: data?.total_monthly_aud ?? 0, supporterCount: data?.supporter_count ?? 0 };
}

export async function Footer() {
  const { totalMonthly, supporterCount } = await getSupporters();
  return (
    <footer className="mt-16">
      <SupporterBar totalMonthly={totalMonthly} supporterCount={supporterCount} />
      <div className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 text-sm text-gray-500">
          <span>On Notice — Australian Parliament Feed</span>
        </div>
      </div>
    </footer>
  );
}
