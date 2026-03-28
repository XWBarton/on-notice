-- WA party definitions
INSERT INTO parties (id, name, short_name, colour_hex, jurisdiction) VALUES
  ('wa_alp',  'Australian Labor Party (WA)',    'Labor',     '#E53935', 'wa'),
  ('wa_lib',  'Liberal Party',                  'Liberal',   '#1565C0', 'wa'),
  ('wa_nat',  'The Nationals WA',               'Nationals', '#2E7D32', 'wa'),
  ('wa_grn',  'Greens Western Australia',       'Greens',    '#43A047', 'wa'),
  ('wa_onp',  'Pauline Hanson''s One Nation',   'One Nation','#F4A300', 'wa'),
  ('wa_ajp',  'Animal Justice Party',           'AJP',       '#4CAF50', 'wa'),
  ('wa_ac',   'Australian Christians',          'AC',        '#7B1FA2', 'wa'),
  ('wa_lcwa', 'Western Australia Party',        'WAP',       '#FF6F00', 'wa'),
  ('wa_ind',  'Independent',                    'Ind',       '#757575', 'wa')
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  colour_hex = EXCLUDED.colour_hex;
