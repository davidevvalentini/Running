const round1 = value => Math.round(value * 10) / 10;

/**
 * Turns a session into a structured, display-ready prescription.
 * Distances remain consistent with the session total; effort cues take
 * precedence over estimated pace bands.
 */
export function buildSessionPrescription(session) {
  if (!session || typeof session !== "object" || !Number.isFinite(session.distanceKm) || session.distanceKm < 0) {
    throw new TypeError("A session with a non-negative distanceKm is required.");
  }
  const km = round1(session.distanceKm);
  const s = session.structure ?? {};
  const steps = [];
  const add = (kind, title, distanceKm, instruction, effort) => {
    if (distanceKm > 0) steps.push({ order: steps.length + 1, kind, title, distanceKm: round1(distanceKm), instruction, effort });
  };

  add("warmup", "Riscaldamento", s.warmupKm ?? 0,
    "Inizia molto piano. Se previsto, aggiungi mobilità dinamica e qualche allungo rilassato; nessuno sprint.",
    "RPE 2–3/10");
  const mainKm = round1(s.mainKm ?? km);
  let instruction = s.mainSet || "Corri a intensità facile e controllata.";
  let effort = session.effort || "RPE 3–4/10";
  let title = "Parte centrale";
  const set = s.setDetails;
  const structuredQuality = (session.type === "intervals" && set?.kind === "intervals") ||
    (session.type === "threshold" && set?.kind === "threshold");

  if (session.type === "intervals") {
    title = set?.kind === "intervals"
      ? `Ripetute controllate · ${set.repetitions} × ${Math.round(set.workDistanceKm * 1000)} m / ${Math.round(set.recoveryDistanceKm * 1000)} m facile`
      : "Ripetute controllate";
    effort = "RPE 7/10, mai massimale";
    instruction = instruction + " Recupero in corsa facile: devi ripartire con controllo, non affannato.";
  } else if (session.type === "threshold") {
    title = set?.kind === "threshold"
      ? `Soglia controllata · ${set.repetitions} × ${Math.round(set.workDistanceKm * 1000)} m / ${Math.round(set.recoveryDistanceKm * 1000)} m facile`
      : "Soglia controllata";
    effort = "RPE 6/10";
    instruction = instruction + " Prevedi recupero in corsa facile tra i blocchi; il ritmo deve restare uniforme e sostenibile. Interrompi la parte intensa se perdi controllo.";
  } else if (session.type === "marathon_pace") {
    title = "Ritmo maratona";
    effort = "RPE 5–6/10, solo se validato";
    instruction = instruction + " Non inseguire il passo se caldo, salite o fatica lo rendono inappropriato.";
  } else if (session.type === "long") {
    title = "Lungo";
    effort = "RPE 3–4/10";
  } else if (session.type === "run_walk") {
    title = "Blocchi corsa/camminata";
    effort = "RPE 2–4/10";
  }

  if (structuredQuality) {
    const workKm = round1(set.repetitions * set.workDistanceKm);
    const recoveryKm = round1(set.recoveryCount * set.recoveryDistanceKm);
    const remainingKm = round1(Math.max(0, mainKm - workKm - recoveryKm));
    let firstWorkInstruction = instruction;
    for (let rep = 1; rep <= set.repetitions; rep++) {
      add("work", `Ripetuta ${rep}/${set.repetitions} · ${Math.round(set.workDistanceKm * 1000)} m`,
        set.workDistanceKm,
        firstWorkInstruction + " Mantieni il controllo e non accelerare fino allo sprint.",
        effort);
      firstWorkInstruction = "Ripeti allo stesso sforzo della prova precedente; se perdi controllo, rallenta o termina la parte intensa.";
      if (rep <= set.recoveryCount) {
        add("recovery", `Recupero ${rep}/${set.recoveryCount} · ${Math.round(set.recoveryDistanceKm * 1000)} m facile`,
          set.recoveryDistanceKm,
          `Recupera in ${set.recoveryIntensity ?? "corsa facile"}; riparti solo se hai recuperato il controllo del respiro.`,
          "RPE 2–3/10");
      }
    }
    add("easy", "Corsa facile residua", remainingKm,
      "Completa la distanza restante della parte centrale a ritmo facile, senza aggiungere altre ripetute.",
      "RPE 3–4/10");
  } else {
    add("main", title, mainKm, instruction, effort);
  }

  add("cooldown", "Defaticamento", s.cooldownKm ?? 0,
    "Rallenta gradualmente fino a una corsa molto facile o camminata. Termina senza forzare.",
    "RPE 1–2/10");

  const totalKm = round1(steps.reduce((sum, step) => sum + step.distanceKm, 0));
  return {
    steps,
    totalKm,
    estimatedMinutesAtPace: null,
    completionChecks: ["Sforzo percepito (RPE)", "Dolore o sintomi insoliti", "Recupero dopo la seduta"],
    note: "I ritmi sono indicativi: prevalgono sforzo percepito, condizioni e recupero. Non recuperare una seduta saltata aggiungendola a un altro giorno."
  };
}
