# Running — Marathon Planner

Local-first prototype for adaptive marathon training plans for beginner, intermediate and advanced runners.

## Current implementation
- Deterministic plan generation and weekly review rules.
- Separate runner ability, currently sustainable load and training phase.
- Local persistence through browser storage.
- Activity import preview for GPX, TCX and CSV; FIT support is an explicit next adapter, requiring a tested FIT decoder before production use.
- Node's built-in test runner; no runtime dependencies.

## Development
Requires Node.js 20 or newer.

```sh
npm test
```

## Safety principles
This software is a planning aid, not medical advice or a substitute for a qualified coach. It does not diagnose injuries or prescribe paces from insufficient data. Pain or concerning symptoms block progression; missed sessions are never added to future weeks to "catch up". Automatic plan adaptation is explainable and logged. Local data stays in this browser unless the user exports it.

## Domain model
- Runner profile: goal, race date, experience band, current weekly load, longest recent run, available days, optional recent race/time-trial results.
- Training plan: generated version, start date, target race date, level, current load assumptions, weeks and workouts.
- Completed workout: source, date, distance, duration, perceived effort, optional notes and import metadata.
- Adjustment: deterministic decision, evidence, reasons and timestamp.
