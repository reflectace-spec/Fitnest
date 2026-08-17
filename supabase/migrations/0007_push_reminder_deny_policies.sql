create policy "push_devices_server_only"
on public.push_devices
for all
to anon, authenticated
using (false)
with check (false);

create policy "reminder_preferences_server_only"
on public.reminder_preferences
for all
to anon, authenticated
using (false)
with check (false);

create policy "push_delivery_log_server_only"
on public.push_delivery_log
for all
to anon, authenticated
using (false)
with check (false);
