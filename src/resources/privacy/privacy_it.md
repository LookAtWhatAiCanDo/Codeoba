# Informativa sulla Privacy
*Ultimo aggiornamento: 27 giugno 2026*

Questa Informativa sulla Privacy descrive le pratiche relative alla privacy per l'applicazione desktop locale Codeoba (l'"Applicazione") e il sito web codeoba.com (il "Sito"). Sia l'Applicazione che il Sito sono sviluppati, pubblicati e gestiti da What AI Can Do, LLC (la "Società").

Si prega di leggere attentamente questa informativa. Se non si accettano i termini qui descritti, si prega di non utilizzare l'Applicazione o il Sito.

---

## 1. Principio Fondamentale: Local-First per Impostazione Predefinita
> Codeoba è progettato per essere un'applicazione local-first. Tutte le trascrizioni dei dialoghi, gli indici dei database, le cache e i modelli semantici sono memorizzati interamente sul dispositivo locale.

Gli aspetti chiave di questa implementazione local-first includono:
- **Zero Registri Remoti:** Le trascrizioni delle conversazioni aggregate dalle directory degli assistenti locali (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, ecc.) sono elaborate offline e analizzate direttamente all'interno dell'ambiente di esecuzione del client desktop sul dispositivo.
- **Database SQLite e Cache Locale:** Tutte le sessioni indicizzate, i registri, le parole chiave di ricerca e i dati sulle prestazioni sono memorizzati in una directory di cache locale.
- **Indicizzazione Vettoriale Locale:** Per la corrispondenza semantica delle query, l'applicazione scarica localmente un modello di trasformatore quantizzato (all-MiniLM-L6-v2). Tutti i calcoli concettuali e le ricerche di similarità sono eseguiti sul processore del dispositivo, senza alcuna trasmissione ad API esterne.

## 2. Diagnostica e Controlli di Aggiornamento Automatico
Per mantenere la piattaforma operativa e sicura, Codeoba esegue controlli diagnostici di base:
- **Controlli di Aggiornamento Automatico del Software:** Se acconsenti esplicitamente, l'App interroga il nostro server di aggiornamento per verificare le ultime versioni. Vengono inviati parametri di rete standard (come la versione dell'applicazione e la preferenza della lingua, insieme alla versione del sistema operativo e all'architettura della CPU del tuo sistema) per recuperare il manifesto di rilascio, ma non vengono raccolti dati personali o di conversazione.
- **Registrazione di Telemetria e Diagnostica:** Per monitorare lo stato del servizio e prevenire abusi del limite di frequenza delle API, le richieste di aggiornamento vengono registrate in GCP Cloud Logging, che conosce intrinsecamente l'indirizzo IP del client da cui provengono le richieste. Questi registri acquisiscono i dettagli del SO e il GUID di installazione anonimo. Tutti questi registri vengono conservati per 30 giorni e poi eliminati automaticamente in modo permanente.

## 3. Analisi del Sito Web e Consenso ai Cookie
Per analizzare il traffico dei visitatori e monitorare i tassi di download, il Sito utilizza Google Analytics (GA4). Per impostazione predefinita, il tracciamento analitico è completamente disabilitato e non viene caricato alcun cookie.

Quando si visita il Sito, viene visualizzato un banner di consenso alla privacy:
- **Consenso Accettato:** Se si accetta il tracciamento, carichiamo Google Analytics in modo dinamico. Google Analytics inserirà identificatori persistenti (cookie come _ga e _ga_<id-contenitore>) per tracciare le visualizzazioni di pagina anonime e i clic di download. L'indirizzo IP viene anonimizzato.
- **Consenso Rifiutato:** Se si rifiuta, il script di Google Analytics non viene mai caricato. Non viene memorizzato alcun cookie e non viene inviato alcun ping per l'identificazione del dispositivo.

È possibile revocare o reimpostare la scelta in qualsiasi momento: [Gestisci Preferenze Privacy](#) (questo cancella la scelta salvata e mostra immediatamente di nuovo il banner di consenso).

## 4. Condivisione delle Informazioni
Non vendiamo, affittiamo o scambiamo i tuoi dati personali. Condividiamo solo le informazioni tecniche limitate necessarie per gestire il nostro servizio di aggiornamento e diagnostica con il fornitore di servizi di terze parti fidato (responsabile del trattamento) di seguito:
- **Infrastruttura Cloud:** Utilizziamo Google Cloud Platform (GCP) Cloud Logging per memorizzare registri di telemetria standard (come indirizzi IP e informazioni sul dispositivo per i controlli degli aggiornamenti) a scopo diagnostico e di sicurezza. Questi registri vengono eliminati automaticamente dopo 30 giorni.

## 5. Sicurezza dei Dati Locali
Poiché i dati sono memorizzati localmente, la sicurezza delle trascrizioni indicizzate dipende dalla sicurezza del proprio dispositivo. Si raccomanda di proteggere il proprio dispositivo con strumenti di crittografia standard (come FileVault su macOS) e password sicure.

## 6. Modifiche alla presente Informativa sulla Privacy
La Società si riserva il diritto di modificare questa Informativa sulla Privacy. Eventuali modifiche saranno pubblicate su questa pagina con una data di "Ultimo aggiornamento" modificata. Si consiglia di controllare periodicamente questa pagina.

## 7. Contatti
In caso di domande o se si desidera discutere di queste pratiche relative alla privacy, si prega di contattare la Società:
- **E-mail:** privacy@whataicando.com
- **Organizzazione:** What AI Can Do, LLC
- **Sito web:** [whataicando.com](https://whataicando.com)
