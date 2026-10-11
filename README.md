# Running — Piani di corsa

App web statica (nessuna dipendenza a runtime) per preparare maratona, mezza maratona o 10 km: piano settimanale dettagliato a partire da data gara e tempo obiettivo, seduta del giorno e adattamento in base ai riscontri.

## Cosa fa
- **Piano**: 16 settimane (18 per obiettivi sotto 3h30), 3–6 giorni/settimana, calcolato all'indietro dalla data gara. Per ogni seduta: notazione compatta (`3 km RIS + 6 x (0,8 km RipM + 2'30" REC_M) + 1 km DEF`), passi dettagliati, ritmo per tipologia, durata e media. Riepilogo (km totali, media, picco), capacità richieste (VMA, 5k/10k/mezza), probabilità di successo, zone, regola delle 3 ore sul lungo. Se mancano settimane il piano parte dalla fase corrispondente.
- **Oggi**: la seduta del giorno con i passi e il feedback ("com'è andata davvero"): esito, distanza, durata, RPE, fatica, dolore.
- **Adattamenti**: dai riscontri nascono *proposte* motivate (alleggerire, sostituire la qualità, rallentare/alzare i ritmi, aderenza bassa). Si applicano solo su conferma; i km saltati non si recuperano mai; il dolore sospende il piano.
- **Progressi**: aderenza settimanale, riscontri, registrazione manuale e import GPX/TCX/CSV.

## Livello di partenza: test iniziali
I km a settimana non sono un input: dipendono dalla fase del piano. Il livello si stabilisce con due test (scheda Oggi, prime due settimane): 30' di corsa facile (ritmo facile e base aerobica) e 5 km a ritmo massimo (passo gara realistico, previsioni su 10 km/mezza/maratona). Dalla valutazione nascono proposte applicabili su conferma: obiettivo realistico (rigenera il piano) e partenza cauta (−15% nelle prime due settimane).

## Funzioni aggiuntive
- **Export .FIT** di ogni seduta strutturata (riscaldamento, ripetute con recuperi, defaticamento, target di ritmo) da caricare su Garmin/Coros/Wahoo. Verificato col decoder ufficiale `@garmin/fitsdk`, non ancora provato su un orologio reale.
- **Import .FIT** delle attività (solo corsa), oltre a GPX/TCX/CSV.
- **Sposta sedute** nella stessa settimana (scambio se occupato), con avviso se due sedute intense finiscono consecutive.
- **Zone cardiache personali** (FC massima nel profilo), **carico settimanale** (minuti × RPE) e **meteo** con consigli (città nel profilo, servizio Open-Meteo).
- **Mezza maratona e 10 km** oltre alla maratona.

## Calibrazione sui piani di riferimento
Ritmi per tipologia, volume medio settimanale, lunghi massimi, durata e giorni consigliati sono calibrati su 16 piani pubblici di GoAndRace (maratona 3:00–5:00, mezza 1:30–2:30, 10 km 40'–60'); `test/reference.test.js` li confronta con i numeri misurati in `test/fixtures/reference.json` (solo valori numerici). Le sedute e i testi sono originali. Scarti noti: 10 km sotto i 40' a 6 giorni (−12% di km) e mezza a 3 giorni a 2h00 (−7%); i picchi settimanali dei piani veloci sono più marcati (fino a +10%).

Non incluse: sincronizzazione automatica con Garmin Connect e Strava (richiedono un'app registrata presso i rispettivi servizi).

## Sviluppo
```sh
python3 -m http.server 8000   # poi http://localhost:8000
npm test                      # test del dominio (Node 20+)
npm run e2e                   # prova in Chromium (richiede Playwright: npm i)
```
Dominio in `src/domain/` (`paces`, `session`, `plan`, `adapt`), interfaccia in `src/app.js`. Lo stato sta in `localStorage`; se esiste `/api/running-state` (Second Brain) viene specchiato lì (vince il `savedAt` più recente).

Non è un sistema di coaching validato né consulto medico.
