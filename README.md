# Running — Marathon Planner

A responsive, local-first web prototype for building and reviewing a marathon-training plan.

## Try it locally

Requires Node.js 20+ for the test suite. The app itself has no runtime dependencies.

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser. Serve the directory over HTTP rather than opening `index.html` as a `file://` URL, because the app uses JavaScript modules.

Run the tests:

```sh
npm test
```

## Current features
- Italian responsive interface for runner profile and race date.
- Optional recent 5 km, 10 km or half-marathon result to estimate indicative pace bands (easy/long, theoretical marathon pace, threshold and intervals).
- Deterministic plan generation with base, build, specific and taper phases where the remaining horizon allows it.
- Day-labelled weekly sessions with structured warm-up, main block and cool-down steps, per-block distance, effort cues, and concrete instructions for easy, run/walk, long and quality workouts. Quality repetitions are capped to fit the main block; established runners may get an optional controlled finish on sufficiently long specific-phase runs.
- Manual activity logging with distance, duration, RPE and notes.
- GPX, TCX and CSV import preview, validation and explicit confirmation before persistence. FIT is not enabled until a maintained decoder is integrated and tested.
- Weekly review based on recorded activity, perceived effort, missed sessions, unusual fatigue and pain/symptom flags.
- Versioned plan history and explainable adjustment records.
- Browser-local persistence and JSON export. Data is not sent to a server.

## Safety and limitations
This is an early software prototype, not a validated coaching system, medical device, or medical advice. The plan engine is deliberately conservative but has not been clinically or scientifically validated. It cannot establish marathon readiness, diagnose injury, or guarantee a safe finish. If pain or concerning symptoms are present, progression is blocked and appropriate professional advice is recommended. Missed sessions are never added to future weeks as catch-up mileage.

The plan now gives day-labelled sessions and concrete instructions with effort cues, but it can estimate indicative pace bands from a recent 5 km, 10 km or half-marathon result using a distance-time projection. These are rough estimates, not measured physiological thresholds, and a theoretical marathon pace can be optimistic. Do not force the suggested paces; effort, talk test, conditions and recovery take priority. Quality-session examples remain conservative templates, not a validated individualized prescription.

## Data model
- Runner profile: ability band, current weekly volume, longest recent run, days available, race date and optional recent pace.
- Training plan: version, context, phase-labelled weeks, sessions, warnings and disclaimer.
- Completed workout: date, distance and/or duration, RPE, source, notes and optional external identifier.
- Adjustment: deterministic decision, evidence summary, reason and resulting load.

## Project structure
- `src/domain/`: data validation and deterministic plan/review engine.
- `src/import/`: activity import preview and normalization.
- `src/storage/`: browser-local persistence.
- `src/app.js`, `index.html`, `styles.css`: client-side interface.
- `test/`: automated engine, safety and import tests.
- `.github/workflows/test.yml`: CI test workflow.
