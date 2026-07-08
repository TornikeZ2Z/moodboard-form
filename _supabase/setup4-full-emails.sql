-- ============================================================
-- FULL-DETAIL e-mails — run once (no placeholders to edit;
-- reuses your existing gscript_url / gscript_secret)
-- ============================================================

alter table public.submissions add column if not exists summary jsonb;

create or replace function private.espacio_notify()
returns trigger
language plpgsql
security definer
set search_path = private, public, net
as $$
declare
  u text; s text;
  client_subject text; client_intro text; details_title text;
  answers_html text := ''; sec jsonb; row_ jsonb;
  msgs jsonb := '[]'::jsonb;
  brand text := '<div style="background:#4e44e6;color:#fff;padding:18px 26px;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;letter-spacing:1px">ESPACIO <span style="font-weight:normal">Studio</span></div>';
  foot text := '<p style="color:#8a8a93;font-size:12px;font-family:Arial,sans-serif;padding:0 26px 20px">Espacio Studio — Architecture & Interior Design, Tbilisi<br>info@espacio.ge · +995 555 340 345 · <a href="https://espacio.ge">espacio.ge</a></p>';
begin
  select value into u from private.config where key = 'gscript_url';
  select value into s from private.config where key = 'gscript_secret';
  if u is null or u like 'PASTE_%' then return new; end if;

  -- full Q&A tables from the snapshot (labels in the client's language)
  if new.summary is not null then
    for sec in select * from jsonb_array_elements(new.summary) loop
      answers_html := answers_html ||
        '<h3 style="font-family:Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#352bc0;border-bottom:1px solid #e6e6ef;padding-bottom:6px;margin:26px 0 8px">'
        || coalesce(sec->>'sec','') || '</h3><table cellpadding="0" cellspacing="0" style="width:100%;font-family:Arial,sans-serif;font-size:14px">';
      for row_ in select * from jsonb_array_elements(sec->'rows') loop
        answers_html := answers_html ||
          '<tr><td style="color:#6b6b75;padding:6px 14px 6px 0;vertical-align:top;width:55%;border-bottom:1px solid #f4f3fb">' || coalesce(row_->>'q','') ||
          '</td><td style="color:#16161c;font-weight:bold;padding:6px 0;vertical-align:top;border-bottom:1px solid #f4f3fb">' || coalesce(row_->>'a','') || '</td></tr>';
      end loop;
      answers_html := answers_html || '</table>';
    end loop;
  end if;

  -- 1) notification to the studio — with every answer
  msgs := msgs || jsonb_build_object(
    'to', 'info@espacio.ge',
    'replyTo', coalesce(nullif(new.client_email,''), 'info@espacio.ge'),
    'subject', 'New questionnaire — ' || coalesce(nullif(new.client_name,''), 'client'),
    'html', brand ||
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#16161c;padding:22px 26px">' ||
      '<p style="margin:0 0 4px"><b style="font-size:17px">' || coalesce(new.client_name,'—') || '</b><br>' ||
      '<span style="color:#6b6b75;font-size:13px">' || coalesce(new.client_phone,'') || ' · ' || coalesce(new.client_email,'') || ' · ' || upper(coalesce(new.lang,'')) || '</span></p>' ||
      answers_html ||
      '<p style="margin-top:24px"><a href="https://espacio.ge/admin/" style="background:#16161c;color:#fff;padding:12px 22px;text-decoration:none;font-size:13px;letter-spacing:1px">OPEN IN ADMIN →</a></p></div>' || foot);

  -- 2) auto-reply to the client — thank-you + their own full answers
  if coalesce(new.client_email,'') <> '' then
    if new.lang = 'ge' then
      client_subject := 'მადლობა — თქვენი კითხვარი მივიღეთ · Espacio Studio';
      client_intro := '<p>გამარჯობა' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>დიდი მადლობა! თქვენი დიზაინის კითხვარი წარმატებით მივიღეთ — ქვემოთ იხილავთ თქვენი პასუხების სრულ ასლს. ჩვენი გუნდი მალე დაგიკავშირდებათ.</p>' ||
        '<p>თბილი სურვილებით,<br><b>Espacio Studio</b> — მარიამი & მარიამი</p>';
      details_title := 'თქვენი პასუხები';
    elsif new.lang = 'ru' then
      client_subject := 'Спасибо — мы получили вашу анкету · Espacio Studio';
      client_intro := '<p>Здравствуйте' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>Спасибо! Ваша дизайн-анкета успешно получена — ниже полная копия ваших ответов. Наша команда скоро свяжется с вами.</p>' ||
        '<p>С тёплыми пожеланиями,<br><b>Espacio Studio</b> — Мариам и Мариам</p>';
      details_title := 'Ваши ответы';
    else
      client_subject := 'Thank you — we received your questionnaire · Espacio Studio';
      client_intro := '<p>Hello' || coalesce(' ' || nullif(new.client_name,''), '') || ',</p>' ||
        '<p>Thank you! Your design questionnaire has been received — a full copy of your answers is below. Our team will get back to you shortly.</p>' ||
        '<p>Warm regards,<br><b>Espacio Studio</b> — Mariam & Mariam</p>';
      details_title := 'Your answers';
    end if;

    msgs := msgs || jsonb_build_object(
      'to', new.client_email,
      'replyTo', 'info@espacio.ge',
      'subject', client_subject,
      'html', brand || '<div style="font-family:Arial,sans-serif;font-size:15px;color:#16161c;padding:22px 26px;line-height:1.6">' ||
        client_intro ||
        case when answers_html <> '' then
          '<h2 style="font-family:Arial,sans-serif;font-size:15px;letter-spacing:2px;text-transform:uppercase;margin-top:30px">' || details_title || '</h2>' || answers_html
        else '' end ||
        '</div>' || foot);
  end if;

  perform net.http_post(
    url := u,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('secret', s, 'messages', msgs));

  return new;
exception when others then
  return new;
end $$;
