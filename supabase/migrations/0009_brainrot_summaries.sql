alter table bills add column if not exists brainrot_summary text;
alter table questions add column if not exists brainrot_summary text;
alter table divisions add column if not exists brainrot_summary text;
alter table daily_digests add column if not exists brainrot_lede text;
alter table daily_digests add column if not exists brainrot_summary text;
