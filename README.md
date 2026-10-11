# Running — Piano maratona

App web statica (nessuna dipendenza a runtime) per preparare una maratona: piano settimanale dettagliato a partire da data gara e tempo obiettivo, seduta del giorno e adattamento in base ai riscontri.

## Cosa fa
- **Piano**: 16 settimane (18 per obiettivi sotto 3h30), 3–6 giorni/settimana, calcolato all'indietro dalla data gara. Per ogni seduta: notazione compatta (`3 km RIS + 6 x (0,8 km RipM + 2'30" REC_M) + 1 km DEF`), passi dettagliati, ritmo per tipologia, durata e media. Riepilogo (km totali, media, picco), capacità richieste (VMA, 5k/10k/mezza), probabilità di successo, zone, regola delle 3 ore sul lungo. Se mancano settimane il piano parte dalla fase corrispondente.
- **Oggi**: la seduta del giorno con i passi e il feedback ("com'è andata davvero"): esito, distanza, durata, RPE, fatica, dolore.
- **Adattamenti**: dai riscontri nascono *proposte* motivate (alleggerire, sostituire la qualità, rallentare/alzare i ritmi, aderenza bassa). Si applicano solo su conferma; i km saltati non si recuperano mai; il dolore sospende il piano.
- **Progressi**: aderenza settimanale, riscontri, registrazione manuale e import GPX/TCX/CSV.

## Sviluppo
```sh
python3 -m http.server 8000   # poi http://localhost:8000
npm test                      # node --test (Node 20+)
```
Dominio in `src/domain/` (`paces`, `session`, `plan`, `adapt`), interfaccia in `src/app.js`. Lo stato sta in `localStorage`; se esiste `/api/running-state` (Second Brain) viene specchiato lì (vince il `savedAt` più recente).

Non è un sistema di coaching validato né consulto medico.
