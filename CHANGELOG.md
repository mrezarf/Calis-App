# Changelog

## 2026-10-14

- Added an expandable monthly archive, four months per page, with daily calendars,
  workout-type rings, session totals and completion percentages. Removed the
  14-day history strip; records are retained without an application cutoff.
- Added Foundation and Build workout plans and stored completed workout levels.
  Foundation preserves original timing; Build lasts 20:25 (24:05 with bonus).
- Renamed moves to Pike-to-Cobra Push-ups and Walking Lunges, added short cues to
  every move, and embedded additional demonstrations from the existing source.
- Centered and enlarged the timer, added a smooth glowing center-collapse bar,
  stacked round/move indicators, glossy SVG controls and next-move rest banners.
- Updated square demo sizing and compact portrait layouts; added gloss to history
  controls and days. Changed Push from red to violet alongside teal, blue, amber.
- Removed all review fixture controls, seed initialization and experimental timer
  settings from production. Existing local storage and Supabase configuration are
  preserved, with no database migration or historical data rewrite.
