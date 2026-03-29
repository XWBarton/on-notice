import { fetchPolicies } from "@/lib/tvfy";
import BillMapClient from "./BillMapClient";

export const revalidate = 86400; // 24h — policies don't change often

interface Props {
  searchParams: Promise<{ focus?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const { focus } = await searchParams;

  let initialPolicies: Awaited<ReturnType<typeof fetchPolicies>> = [];
  try {
    initialPolicies = await fetchPolicies();
  } catch {
    // Graph still works without policies — nodes just won't be topic-coloured
  }

  return <BillMapClient initialPolicies={initialPolicies} focus={focus ?? null} />;
}
