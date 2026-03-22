// Auto-generated from Supabase schema via: supabase gen types typescript --local
// Run `npx supabase gen types typescript --local > lib/types.ts` after migrations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      parliaments: {
        Row: {
          id: string;
          name: string;
          jurisdiction: string;
          chamber: string;
        };
        Insert: Omit<Database["public"]["Tables"]["parliaments"]["Row"], never>;
        Update: Partial<Database["public"]["Tables"]["parliaments"]["Row"]>;
      };
      parties: {
        Row: {
          id: string;
          name: string;
          short_name: string;
          colour_hex: string | null;
          jurisdiction: string;
        };
        Insert: Omit<Database["public"]["Tables"]["parties"]["Row"], never>;
        Update: Partial<Database["public"]["Tables"]["parties"]["Row"]>;
      };
      members: {
        Row: {
          id: string;
          parliament_id: string;
          name_display: string;
          name_last: string;
          name_first: string | null;
          party_id: string | null;
          electorate: string | null;
          role: string | null;
          is_active: boolean;
          scraped_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["members"]["Row"], "scraped_at">;
        Update: Partial<Database["public"]["Tables"]["members"]["Row"]>;
      };
      sitting_days: {
        Row: {
          id: number;
          parliament_id: string;
          sitting_date: string;
          hansard_url: string | null;
          audio_source_url: string | null;
          pipeline_status: string;
          pipeline_error: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["sitting_days"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["sitting_days"]["Row"]>;
      };
      bills: {
        Row: {
          id: number;
          parliament_id: string;
          sitting_day_id: number | null;
          bill_number: string | null;
          short_title: string;
          long_title: string | null;
          introduced_by: string | null;
          introduced_date: string | null;
          bill_stage: string | null;
          ai_summary: string | null;
          source_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["bills"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["bills"]["Row"]>;
      };
      divisions: {
        Row: {
          id: number;
          sitting_day_id: number;
          division_number: number | null;
          subject: string;
          result: string | null;
          ayes_count: number | null;
          noes_count: number | null;
          occurred_at: string | null;
          hansard_ref: string | null;
          bill_id: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["divisions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["divisions"]["Row"]>;
      };
      division_votes: {
        Row: {
          id: number;
          division_id: number;
          member_id: string;
          vote: "aye" | "no" | "abstain" | "absent";
        };
        Insert: Omit<Database["public"]["Tables"]["division_votes"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["division_votes"]["Row"]>;
      };
      questions: {
        Row: {
          id: number;
          sitting_day_id: number;
          question_number: number | null;
          asker_id: string | null;
          minister_id: string | null;
          subject: string | null;
          question_text: string | null;
          answer_text: string | null;
          is_dorothy_dixer: boolean;
          ai_summary: string | null;
          audio_start_sec: number | null;
          audio_end_sec: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["questions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["questions"]["Row"]>;
      };
      episodes: {
        Row: {
          id: number;
          sitting_day_id: number;
          title: string;
          description: string | null;
          duration_sec: number | null;
          audio_url: string | null;
          audio_raw_url: string | null;
          transcript_url: string | null;
          question_count: number | null;
          dorothy_dixer_count: number | null;
          published_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["episodes"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["episodes"]["Row"]>;
      };
      daily_digests: {
        Row: {
          id: number;
          sitting_day_id: number;
          ai_summary: string | null;
          lede: string | null;
          bills_summary: string | null;
          divisions_summary: string | null;
          generated_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["daily_digests"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["daily_digests"]["Row"]>;
      };
    };
  };
}
