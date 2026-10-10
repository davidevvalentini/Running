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
- Deterministic plan generation with base, build, specific and taper phases where the remaining horizon allows it.
- Day-labelled weekly sessions with per-session warm-up, main block, cool-down, effort cues and concrete instructions for easy, run/walk, long and quality workouts.
- Manual activity logging with distance, duration, RPE and notes.
- GPX, TCX and CSV import preview, validation and explicit confirmation before persistence. FIT is not enabled until a maintained decoder is integrated and tested.
- Weekly review based on recorded activity, perceived effort, missed sessions, unusual fatigue and pain/symptom flags.
- Versioned plan history and explainable adjustment records.
- Browser-local persistence and JSON export. Data is not sent to a server.

## Safety and limitations
This is an early software prototype, not a validated coaching system, medical device, or medical advice. The plan engine is deliberately conservative but has not been clinically or scientifically validated. It cannot establish marathon readiness, diagnose injury, or guarantee a safe finish. If pain or concerning symptoms are present, progression is blocked and appropriate professional advice is recommended. Missed sessions are never added to future weeks as catch-up mileage.

The plan now gives day-labelled sessions and concrete instructions with effort cues, but it does not yet calculate individualized pace zones from a recent race result. Any marathon-pace block must use a pace established from a recent race or qualified assessment; without that, the instruction is to run easily. Quality-session examples are conservative templates, not a validated individualized prescription.

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
