-- ============================================================
-- ESPACIO e-mail notifications  (run AFTER creating your Resend
-- account and verifying the espacio.ge domain — see chat steps)
-- Replace YOUR_RESEND_API_KEY_HERE below before running!
-- ============================================================

create extension if not exists pg_net;

create schema if not exists private;
create table if not exists private.config (key text primary key, value text not null);
-- no grants to anon/authenticated: only definer functions can read this

insert into private.config (key, value) values ('resend_key', 'YOUR_RESEND_API_KEY_HERE')
  on conflict (key) do update set value = excluded.value;

create or replace function private.espacio_notify()
returns trigger
language plpgsql
security definer
set search_path = private, public, net
as $$
declare
  k text;
  styles text; palettes text;
  client_subject text; client_html text;
  brand text := '<div style="background:#4e44e6;color:#fff;padding:18px 26px;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;letter-spacing:1px">ESPACIO <span style="font-weight:normal">Studio</span></div>';
  foot text := '<p style="color:#8a8a93;font-size:12px;font-family:Arial,sans-serif">Espacio Studio — Architecture & Interior Design, Tbilisi<br>info@espacio.ge · +995 555 340 345 · <a href="https://espacio.ge">espacio.ge</a></p>';
begin
  select value into k from private.config where key = 'resend_key';
  if k is null or k = 'YOUR_RESEND_API_KEY_HERE' then return new; end if;

  select string_agg(initcap(x), ' + ') into styles from jsonb_array_elements_text(coalesce(new.data->'s_style','[]'::jsonb)) t(x);
  select string_agg(x, ', ') into palettes from jsonb_array_elements_text(coalesce(new.data->'s_palette','[]'::jsonb)) t(x);

  -- 1) notification to the studio
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Espacio Studio <info@espacio.ge>',
      'to', jsonb_build_array('info@espacio.ge'),
      'reply_to', nullif(new.client_email, ''),
      'subject', 'New questionnaire — ' || coalesce(nullif(new.client_name,''), 'client'),
      'html', brand ||
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#16161c;padding:22px 26px">' ||
        '<p><b>' || coalesce(new.client_name,'—') || '</b> filled out the design questionnaire.</p>' ||
        '<table style="font-size:14px;color:#3a3a44" cellpadding="4">' ||
        '<tr><td>Phone</td><td><b>'  || coalesce(new.client_phone,'—') || '</b></td></tr>' ||
        '<tr><td>E-mail</td><td><b>' || coalesce(new.client_email,'—') || '</b></td></tr>' ||
        '<tr><td>Language</td><td><b>' || upper(coalesce(new.lang,'—')) || '</b></td></tr>' ||
        '<tr><td>Styles</td><td><b>' || coalesce(styles,'—') || '</b></td></tr>' ||
        '<tr><td>Palettes</td><td><b>#' || coalesce(palettes,'—') || '</b></td></tr></table>' ||
        '<p style="margin-top:18px"><a href="https://espacio.ge/admin/" style="background:#16161c;color:#fff;padding:12px 22px;text-decoration:none;font-size:13px;letter-spacing:1px">OPEN IN ADMIN →</a></p></div>' || foot
    ));

  -- 2) auto-reply to the client
  if coalesce(new.client_email,'') <> '' then
    if new.lang = 'ge' then
      client_subject := 'მადლობა — თქვენი კითხვარი მივიღეთ · Espacio Studio';
      client_html := '<p>გამარჯობა' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>დიდი მადლობა, თქვენი დიზაინის კითხვარი წარმატებით მივიღეთ. ჩვენი გუნდი გაეცნობა თქვენს პასუხებს და მალე დაგიკავშირდებათ შემდეგი ნაბიჯების განსახილველად.</p>' ||
        '<p>თბილი სურვილებით,<br><b>Espacio Studio</b> — მარიამი & მარიამი</p>';
    elsif new.lang = 'ru' then
      client_subject := 'Спасибо — мы получили вашу анкету · Espacio Studio';
      client_html := '<p>Здравствуйте' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>Спасибо! Ваша дизайн-анкета успешно получена. Наша команда изучит ваши ответы и свяжется с вами в ближайшее время, чтобы обсудить следующие шаги.</p>' ||
        '<p>С тёплыми пожеланиями,<br><b>Espacio Studio</b> — Мариам и Мариам</p>';
    else
      client_subject := 'Thank you — we received your questionnaire · Espacio Studio';
      client_html := '<p>Hello' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>Thank you! Your design questionnaire has been received. Our team will review your answers and get back to you shortly to discuss the next steps.</p>' ||
        '<p>Warm regards,<br><b>Espacio Studio</b> — Mariam & Mariam</p>';
    end if;

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'Espacio Studio <info@espacio.ge>',
        'to', jsonb_build_array(new.client_email),
        'reply_to', 'info@espacio.ge',
        'subject', client_subject,
        'html', brand || '<div style="font-family:Arial,sans-serif;font-size:15px;color:#16161c;padding:22px 26px;line-height:1.6">' || client_html || '</div>' || foot
      ));
  end if;

  return new;
exception when others then
  return new;  -- e-mail problems must never block a submission
end $$;

drop trigger if exists espacio_notify_tg on public.submissions;
create trigger espacio_notify_tg
  after insert on public.submissions
  for each row execute function private.espacio_notify();
