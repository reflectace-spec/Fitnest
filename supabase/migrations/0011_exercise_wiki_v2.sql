-- Build 2.5: Exercise Wiki 2.0
-- Additive only: extends the shared exercise catalog and adds per-user favorites.

alter table public.exercise_library
  add column if not exists category text not null default 'strength',
  add column if not exists equipment text[] not null default '{}',
  add column if not exists regression_ids text[] not null default '{}',
  add column if not exists progression_ids text[] not null default '{}',
  add column if not exists alternative_ids text[] not null default '{}',
  add column if not exists impact text not null default 'low';

create table if not exists public.exercise_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercise_library(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_favorites enable row level security;

revoke all on table public.exercise_favorites from anon;
grant select, insert, delete on table public.exercise_favorites to authenticated;
grant select, insert, update, delete on table public.exercise_favorites to service_role;

drop policy if exists exercise_favorites_select_own on public.exercise_favorites;
create policy exercise_favorites_select_own
  on public.exercise_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists exercise_favorites_insert_own on public.exercise_favorites;
create policy exercise_favorites_insert_own
  on public.exercise_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists exercise_favorites_delete_own on public.exercise_favorites;
create policy exercise_favorites_delete_own
  on public.exercise_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Keep the catalog readable by signed-in clients, but not writable from the browser.
revoke insert, update, delete on table public.exercise_library from authenticated;
grant select on table public.exercise_library to authenticated;

insert into public.exercise_library
  (id,name,muscle_groups,level,instructions,common_errors,image_path,is_active,category,equipment,regression_ids,progression_ids,alternative_ids,impact)
values
('squat','Kniebeugen',array['Beine','Core'],'basis','["Füße etwa schulterbreit aufstellen.","Hüfte kontrolliert nach hinten und unten führen.","Knie folgen der Fußrichtung.","Über den ganzen Fuß wieder aufrichten."]'::jsonb,'["Knie nach innen kippen lassen","Fersen vom Boden lösen","Rücken stark einrunden"]'::jsonb,'/assets/exercise-sprite.webp#squat',true,'lower-body',array[]::text[],array['wall-sit'],array['split-squat'],array['reverse-lunge'], 'low'),
('pushup','Liegestütze',array['Brust','Trizeps','Core'],'basis','["Hände etwas breiter als schulterbreit aufsetzen.","Körper stabil in einer Linie halten.","Brust kontrolliert Richtung Boden senken.","Boden aktiv wegdrücken."]'::jsonb,'["Hüfte absinken lassen","Ellbogen komplett seitlich abspreizen","Kopf nach vorne schieben"]'::jsonb,'/assets/exercise-sprite.webp#pushup',true,'upper-body',array[]::text[],array['knee-pushup','incline-pushup'],array['pike-pushup'],array['incline-pushup'], 'low'),
('reverse-lunge','Reverse Lunges',array['Beine','Gesäß'],'basis','["Aufrecht stehen und einen Fuß nach hinten setzen.","Hinteres Knie Richtung Boden absenken.","Vorderes Knie stabil über dem Fuß halten.","Über das vordere Bein zurück in den Stand."]'::jsonb,'["Zu schmaler Stand","Vorderes Knie kippt nach innen","Nur aus dem hinteren Bein abstoßen"]'::jsonb,'/assets/exercise-sprite.webp#reverse-lunge',true,'lower-body',array[]::text[],array['split-squat'],array['split-squat'],array['squat'], 'low'),
('glute-bridge','Glute Bridge',array['Gesäß','hintere Kette'],'basis','["Rückenlage, Füße nah am Gesäß.","Bauch leicht anspannen.","Becken über die Fersen anheben.","Oben Gesäß anspannen und kontrolliert absenken."]'::jsonb,'["Ins Hohlkreuz drücken","Füße zu weit entfernt","Bewegung zu schnell ausführen"]'::jsonb,'/assets/exercise-sprite.webp#glute-bridge',true,'lower-body',array['Matte'],array[]::text[],array['hip-hinge'],array['hip-hinge'], 'low'),
('bird-dog','Bird Dog',array['Core','Rücken'],'stabilität','["Vierfüßlerstand einnehmen.","Gegenüberliegenden Arm und Bein ausstrecken.","Becken parallel zum Boden halten.","Langsam zurückführen und Seite wechseln."]'::jsonb,'["Becken aufdrehen","Hohlkreuz erzeugen","Zu schnell wechseln"]'::jsonb,'/assets/exercise-sprite.webp#bird-dog',true,'core',array['Matte'],array['deadbug'],array['bear-crawl'],array['deadbug'], 'low'),
('plank','Plank',array['Core'],'stabilität','["Unterarme unter den Schultern platzieren.","Beine strecken und Zehen aufstellen.","Gesäß und Bauch anspannen.","Ruhig atmen und Position halten."]'::jsonb,'["Hüfte absinken lassen","Gesäß zu hoch schieben","Luft anhalten"]'::jsonb,'/assets/exercise-sprite.webp#plank',true,'core',array['Matte'],array['deadbug'],array['side-plank'],array['hollow-hold'], 'low'),
('mountain','Mountain Climbers',array['Core','Schultern','Cardio'],'basis','["Hohe Plank-Position einnehmen.","Ein Knie kontrolliert zur Brust führen.","Seiten rhythmisch wechseln.","Schultern stabil über den Händen halten."]'::jsonb,'["Hüfte stark hoch und runter bewegen","Nur auf Tempo gehen","Schultern nach hinten verlieren"]'::jsonb,'/assets/exercise-sprite.webp#mountain',true,'cardio',array[]::text[],array['march-in-place'],array['high-knees'],array['bear-crawl'], 'moderate'),
('jumping-jack','Jumping Jacks',array['Cardio','Ganzkörper'],'kondition','["Aufrecht mit geschlossenen Füßen starten.","Füße seitlich öffnen und Arme über den Kopf führen.","Weich landen und Rumpf stabil halten.","Rhythmisch zurückkehren."]'::jsonb,'["Hart landen","Schultern hochziehen","Tempo vor Kontrolle stellen"]'::jsonb,'/assets/exercise-sprite.webp#jumping-jack',true,'cardio',array[]::text[],array['march-in-place'],array['high-knees'],array['high-knees'], 'moderate'),
('deadbug','Dead Bug',array['Core','Rumpfstabilität'],'stabilität','["Rückenlage, Arme und Beine anheben.","Lendenbereich sanft stabilisieren.","Gegenüberliegenden Arm und Bein strecken.","Kontrolliert zurückführen."]'::jsonb,'["Rücken hebt stark vom Boden ab","Bewegung zu groß wählen","Schwung verwenden"]'::jsonb,null,true,'core',array['Matte'],array[]::text[],array['bird-dog','hollow-hold'],array['bird-dog'], 'low'),
('wall-sit','Wandsitz',array['Beine','Gesäß'],'einsteiger','["Rücken flach an eine Wand lehnen.","Füße etwas nach vorne setzen.","Kontrolliert absenken, bis die Position fordernd aber stabil ist.","Ruhig weiteratmen."]'::jsonb,'["Knie nach innen fallen lassen","Zu tief starten","Luft anhalten"]'::jsonb,null,true,'lower-body',array['Wand'],array[]::text[],array['squat'],array['squat'], 'low'),
('calf-raise','Wadenheben',array['Waden'],'einsteiger','["Aufrecht stehen und Füße parallel ausrichten.","Fersen langsam anheben.","Oben kurz kontrollieren.","Langsam wieder absenken."]'::jsonb,'["Nach außen über die Füße kippen","Schwung nutzen","Zu schnell absenken"]'::jsonb,null,true,'lower-body',array[]::text[],array[]::text[],array['single-leg-calf-raise'],array['march-in-place'], 'low'),
('single-leg-calf-raise','Einbeiniges Wadenheben',array['Waden','Balance'],'fortgeschritten','["Auf einem Bein stabil stehen.","Bei Bedarf leicht an einer Wand abstützen.","Ferse kontrolliert anheben.","Langsam absenken und Seite wechseln."]'::jsonb,'["Sprunggelenk wegknicken lassen","Mit den Armen hochziehen","Bewegung verkürzen"]'::jsonb,null,true,'lower-body',array['Wand'],array['calf-raise'],array[]::text[],array['calf-raise'], 'low'),
('split-squat','Split Squat',array['Beine','Gesäß'],'basis','["Einen stabilen Schrittstand einnehmen.","Oberkörper aufrecht halten.","Beide Knie kontrolliert beugen.","Über den vorderen Fuß wieder aufrichten."]'::jsonb,'["Zu enger Stand","Vorderes Knie kippt nach innen","Vorne auf die Zehen rollen"]'::jsonb,null,true,'lower-body',array[]::text[],array['reverse-lunge'],array[]::text[],array['squat','reverse-lunge'], 'low'),
('hip-hinge','Hip Hinge',array['Gesäß','hintere Kette','Rücken'],'basis','["Füße hüftbreit aufstellen.","Knie leicht beugen.","Hüfte nach hinten schieben und Rücken neutral halten.","Gesäß anspannen und wieder aufrichten."]'::jsonb,'["Bewegung aus den Knien statt aus der Hüfte","Rücken einrunden","Kopf stark überstrecken"]'::jsonb,null,true,'lower-body',array[]::text[],array['glute-bridge'],array[]::text[],array['glute-bridge'], 'low'),
('incline-pushup','Erhöhte Liegestütze',array['Brust','Trizeps','Core'],'einsteiger','["Hände auf eine stabile erhöhte Fläche setzen.","Körper in einer Linie halten.","Brust kontrolliert zur Fläche führen.","Wieder wegdrücken."]'::jsonb,'["Instabile Möbel verwenden","Hüfte abknicken","Ellbogen weit ausstellen"]'::jsonb,null,true,'upper-body',array['Stabile Erhöhung'],array[]::text[],array['pushup'],array['knee-pushup'], 'low'),
('knee-pushup','Liegestütze auf Knien',array['Brust','Trizeps','Core'],'einsteiger','["Knie auf einer weichen Unterlage platzieren.","Von Knie bis Kopf eine stabile Linie halten.","Brust kontrolliert absenken.","Wieder hochdrücken."]'::jsonb,'["Hüfte stark abknicken","Kopf vorschieben","Zu kurze Bewegung"]'::jsonb,null,true,'upper-body',array['Matte'],array['incline-pushup'],array['pushup'],array['incline-pushup'], 'low'),
('pike-pushup','Pike Push-up',array['Schultern','Trizeps','Core'],'fortgeschritten','["Aus der hohen Plank die Hüfte anheben.","Kopf kontrolliert Richtung Boden zwischen die Hände führen.","Ellbogen kontrolliert beugen.","Aktiv zurückdrücken."]'::jsonb,'["Zu viel Gewicht auf den Füßen lassen","Kopf nach vorne statt nach unten führen","Kontrolle verlieren"]'::jsonb,null,true,'upper-body',array[]::text[],array['pushup'],array[]::text[],array['pushup'], 'low'),
('side-plank','Side Plank',array['Core','seitliche Rumpfmuskulatur'],'fortgeschritten','["Unterarm unter der Schulter platzieren.","Beine strecken oder versetzt aufstellen.","Becken anheben.","Kopf, Rumpf und Beine in Linie halten."]'::jsonb,'["Schulter einsinken lassen","Becken absinken lassen","Körper nach vorne drehen"]'::jsonb,null,true,'core',array['Matte'],array['plank'],array[]::text[],array['plank','hollow-hold'], 'low'),
('hollow-hold','Hollow Hold',array['Core'],'fortgeschritten','["Rückenlage einnehmen.","Rippen Richtung Becken ziehen und unteren Rücken kontrollieren.","Arme und Beine nur so weit strecken, wie die Spannung gehalten werden kann.","Ruhig atmen."]'::jsonb,'["Unteren Rücken vom Boden lösen","Zu schwere Variante erzwingen","Luft anhalten"]'::jsonb,null,true,'core',array['Matte'],array['deadbug'],array[]::text[],array['plank'], 'low'),
('superman','Superman',array['Rücken','Gesäß'],'basis','["Bauchlage einnehmen.","Nacken neutral halten.","Arme und Beine nur leicht vom Boden lösen.","Kurz halten und kontrolliert ablegen."]'::jsonb,'["Kopf stark überstrecken","Zu hoch ins Hohlkreuz ziehen","Schwung verwenden"]'::jsonb,null,true,'core',array['Matte'],array['bird-dog'],array[]::text[],array['bird-dog'], 'low'),
('bear-crawl','Bear Crawl',array['Core','Schultern','Ganzkörper'],'fortgeschritten','["Vierfüßlerstand einnehmen und Knie knapp anheben.","Rumpf stabil halten.","Gegenüberliegende Hand und Fuß klein versetzen.","Kontrolliert vorwärts oder rückwärts bewegen."]'::jsonb,'["Hüfte stark drehen","Zu große Schritte","Schultern kollabieren lassen"]'::jsonb,null,true,'cardio',array[]::text[],array['bird-dog'],array['mountain'],array['mountain'], 'moderate'),
('high-knees','High Knees',array['Cardio','Beine'],'kondition','["Aufrecht stehen.","Knie rhythmisch anheben.","Über den Mittelfuß weich landen.","Arme locker mitführen."]'::jsonb,'["Hart landen","Oberkörper stark zurücklehnen","Tempo vor Kontrolle stellen"]'::jsonb,null,true,'cardio',array[]::text[],array['march-in-place'],array[]::text[],array['jumping-jack'], 'moderate'),
('march-in-place','Marschieren am Platz',array['Cardio','Beine'],'einsteiger','["Aufrecht stehen.","Abwechselnd ein Knie anheben.","Arme natürlich mitschwingen lassen.","Ruhigen gleichmäßigen Rhythmus halten."]'::jsonb,'["Nach vorne zusammensacken","Füße hart aufsetzen","Atem anhalten"]'::jsonb,null,true,'cardio',array[]::text[],array[]::text[],array['high-knees','jumping-jack'],array['high-knees'], 'low'),
('cat-cow','Cat-Cow',array['Wirbelsäule','Mobilität'],'mobilität','["Vierfüßlerstand einnehmen.","Wirbelsäule langsam runden.","Anschließend kontrolliert in eine sanfte Gegenbewegung wechseln.","Bewegung mit ruhiger Atmung verbinden."]'::jsonb,'["Bewegung erzwingen","Zu schnell wechseln","Schultern hochziehen"]'::jsonb,null,true,'mobility',array['Matte'],array[]::text[],array['thoracic-rotation'],array['thoracic-rotation'], 'low'),
('thoracic-rotation','Brustwirbelsäulen-Rotation',array['Rücken','Mobilität'],'mobilität','["Vierfüßlerstand oder Seitlage einnehmen.","Eine Hand hinter den Kopf führen.","Oberkörper kontrolliert zur Seite öffnen.","Becken möglichst ruhig halten und zurückkehren."]'::jsonb,'["Rotation aus der Hüfte holen","Bewegung erzwingen","Nacken überdrehen"]'::jsonb,null,true,'mobility',array['Matte'],array['cat-cow'],array[]::text[],array['cat-cow'], 'low')
on conflict (id) do update set
  name=excluded.name,
  muscle_groups=excluded.muscle_groups,
  level=excluded.level,
  instructions=excluded.instructions,
  common_errors=excluded.common_errors,
  image_path=coalesce(excluded.image_path, public.exercise_library.image_path),
  is_active=excluded.is_active,
  category=excluded.category,
  equipment=excluded.equipment,
  regression_ids=excluded.regression_ids,
  progression_ids=excluded.progression_ids,
  alternative_ids=excluded.alternative_ids,
  impact=excluded.impact;
