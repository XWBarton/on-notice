"use client";
import dynamic from "next/dynamic";
import type { TVFYPolicy } from "@/lib/types";

// ssr: false ensures d3-force (ESM-only) never runs during server-side rendering
const BillMap = dynamic(() => import("@/components/BillMap"), { ssr: false });

interface Props {
  initialPolicies: TVFYPolicy[];
  focus: string | null;
}

export default function BillMapClient({ initialPolicies, focus }: Props) {
  return <BillMap initialPolicies={initialPolicies} focus={focus} />;
}
