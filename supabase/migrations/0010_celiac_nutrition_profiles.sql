alter table public.nutrition_profiles
  add column if not exists gluten_free_celiac boolean not null default false;

comment on column public.nutrition_profiles.gluten_free_celiac is
  'When true, meal planning must be strictly gluten-free for celiac disease.';
