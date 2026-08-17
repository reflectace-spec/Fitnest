create index if not exists goals_user_id_idx on public.goals (user_id);
create index if not exists workout_sessions_user_id_idx on public.workout_sessions (user_id);

insert into public.exercise_library (id,name,muscle_groups,level,instructions,common_errors)
values
('mountain','Mountain Climbers',array['Core','Schultern','Cardio'],'basis','["Stützposition einnehmen", "Core stabil halten", "Knie abwechselnd kontrolliert Richtung Brust führen", "Schultern über den Händen halten"]','["Hüfte springt stark auf und ab", "Rücken hängt durch", "Tempo vor Kontrolle"]'),
('deadbug','Dead Bug',array['Core','Rumpfstabilität'],'stabilität','["Rückenlage und Beine anheben", "Unteren Rücken kontrolliert am Boden halten", "Gegengleichen Arm und Bein langsam strecken", "Zur Mitte zurückkehren und Seite wechseln"]','["Hohlkreuz entsteht", "Bewegung zu schnell", "Nacken unnötig anspannen"]')
on conflict (id) do update set
  name = excluded.name,
  muscle_groups = excluded.muscle_groups,
  level = excluded.level,
  instructions = excluded.instructions,
  common_errors = excluded.common_errors,
  is_active = true;
