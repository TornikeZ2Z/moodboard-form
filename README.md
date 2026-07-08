# Mariam · Interior Design Questionnaire → Moodboard

A trilingual (ქართული / English / Русский) client questionnaire that ends with an
auto-composed moodboard the client can view on screen and download as PDF.
Answers are e-mailed to the designer.

## Try it right now
Open `index.html` in any browser — everything works locally except e-mail sending.

## Setup (one time, ~3 minutes)

**1. E-mail delivery.** Answers are sent through the free service Web3Forms:
go to https://web3forms.com, enter the e-mail address that should receive the
questionnaires, confirm, and copy the Access Key you get. Open `config.js` and
paste it instead of `YOUR_WEB3FORMS_ACCESS_KEY_HERE`. Done.

**2. Hosting.** The folder is a static site — host it anywhere:
- easiest: https://app.netlify.com/drop — drag the whole `moodboard-form` folder into the page, get a link immediately;
- or GitHub Pages, Vercel, or any ordinary hosting (just upload the folder).

## Everyday editing

- **All text and translations** live in `i18n.js` — three blocks: `ge`, `en`, `ru`.
  Please proofread EN/RU: they were machine-drafted from the Georgian original.
- **Any picture** can be replaced by dropping a new file with the same name into
  `assets/opts/` (option photos), `assets/styles/` (style boards) or `assets/palettes/`.
  File names describe what they are (`door_hidden.jpg`, `fin_bgold.jpg`, …).
- **Brand name / designer name** — top of `config.js`.
- **Palette colours** used for the moodboard chips are in `app.js` → `PALETTES`.

## Notes / decisions taken while building

- Where the photos in the source doc showed more options than the typed list,
  the photo labels won (skirting: 6 types; fixture finishes: 10 incl. Matte White
  and Polished Rose Gold).
- The kitchen worktop list in the doc contained "ლამინატი" twice — kept once:
  Quartz / Granite / Marble / Solid Surface / Laminate. Add more in `app.js` if needed.
- Contemporary and Mid-Century Modern have two boards each — the style card shows
  a "2 boards" badge and both open in the zoom view.
- The guest WC gets a shortened question set (no bathtub/shower questions).
- Client progress is autosaved in the browser — closing the tab does not lose answers.

## Structure
```
index.html   — page shell
styles.css   — design system
config.js    — ⭐ the only file you must edit (key, names)
i18n.js      — every visible string ×3 languages
app.js       — questionnaire schema + engine + moodboard
assets/      — styles/ opts/ palettes/
_source/     — original questionnaire text (reference)
```
