# Privacybeleid
*Laatst bijgewerkt: 27 juni 2026*

Dit Privacybeleid beschrijft de privacypraktijken voor de lokale Codeoba-desktoptoepassing (de "App") and de codeoba.com website (de "Site"). Zowel de App als de Site worden ontwikkeld, gepubliceerd en beheerd door What AI Can Do, LLC (de "Onderneming").

Lees dit beleid zorgvuldig door. Als u niet akkoord gaat met de hierin uiteengezette voorwaarden, gebruik de App of de Site dan niet.

---

## 1. Kernprincipe: Standaard lokaal eerst
> Codeoba is gebouwd als een lokaal-eerst toepassing. Alle gesprekstranscripties, database-indexen en caches worden volledig op uw lokale machine opgeslagen.

Belangrijke aspecten van deze lokaal-eerst implementatie zijn:
- **Geen logs op afstand:** Gesprekstranscripties verzameld uit lokale assistent-directories (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, etc.) worden offline verwerkt en direct binnen de runtime van de desktopclient op uw apparaat geanalyseerd.
- **Lokale SQLite-database & cache:** Alle geïndexeerde sessies, logs, zoekwoorden en prestatiegegevens worden bewaard in een lokale cachemap.
- **Lokale vooraf geanalyseerde cache:** Alle geïndexeerde gesprekken worden lokaal geanalyseerd in een snelle sessiecache in uw thuismap om een onmiddellijke opstart van de toepassing mogelijk te maken zonder externe netwerkoproepen.

## 2. Diagnostische gegevens & automatische updatecontroles
Om het platform operationeel en veilig te houden, voert Codeoba basiscontroles uit:
- **Automatische software-updatecontroles:** Als u expliciet toestemming geeft, vraagt de app onze update-server om te controleren op de nieuwste versies. Standaard netwerkparameters (zoals de applicatieversie en taalvoorkeur, samen met de versie van het besturingssysteem en de CPU-architectuur van uw systeem) worden verzonden om het release-manifest op te halen, maar er worden geen persoonlijke gegevens of gespreksgegevens verzameld.
- **Telemetrie- & Diagnostische Logbestanden:** Om de servicestatus te bewaken en misbruik van de API-frequentielimiet te voorkomen, worden update-aanvragen geregistreerd in GCP Cloud Logging, dat inherent het IP-adres van de client kent waarvan de aanvragen afkomstig zijn. Deze logbestanden leggen OS-details en de anonieme installatie-GUID vast. Al deze logbestanden worden 30 dagen bewaard en daarna automatisch permanent verwijderd.

## 3. Website-analyses & cookie-toestemming
Om bezoekersverkeer te analyseren en downloadpercentages te controleren, maakt de Site gebruik van Google Analytics (GA4). Standaard is het volgen van analyses volledig uitgeschakeld en worden er geen cookies geladen.

Wanneer u de Site bezoekt, wordt er een privacybanner getoond:
- **Toestemming Geaccepteerd:** Als u akkoord gaat, laden we Google Analytics dynamisch. Google Analytics plaatst permanente identificatiemiddelen (cookies zoals _ga en _ga_<container-id>) om anonieme paginaweergaven en download-klikken bij te houden. Uw IP-adres wordt geanonimiseerd.
- **Toestemming Geweigerd:** Als u weigert, wordt het Google Analytics-script nooit geladen. Er worden geen cookies opgeslagen en er worden geen apparaatvingerafdrukken verzonden.

U kunt uw keuze op elk moment intrekken of resetten: [Privacyvoorkeuren beheren](#) (dit wist uw opgeslagen keuze en toont de toestemmingsbanner onmiddellijk opnieuw).

## 4. Delen van uw gegevens
Wij verkopen, verhuren of verhandelen uw persoonlijke gegevens niet. We delen alleen de beperkte technische informatie die nodig is om onze update- en diagnosedienst uit te voeren met de onderstaande vertrouwde externe dienstverlener (subverwerker):
- **Cloudinfrastructuur:** We gebruiken Google Cloud Platform (GCP) Cloud Logging om standaard telemetrielogs (zoals IP-adressen en apparaatinformatie voor updatecontroles) op te slaan voor diagnostische en veiligheidsdoeleinden. Deze logs worden na 30 dagen automatisch gewist.

## 5. Beveiliging van uw lokale gegevens
Omdat uw gegevens lokaal worden opgeslagen, hangt de beveiliging van uw geïndexeerde transcripties af van de beveiliging van uw eigen apparaat. We raden aan om uw machine te beveiligen met standaard encryptietools (zoals FileVault op macOS) en sterke wachtwoorden.

## 6. Wijzigingen in dit Privacybeleid
De Onderneming behoudt zich het recht voor om dit Privacybeleid te wijzigen. Eventuele wijzigingen worden op deze pagina bijgewerkt met een herziene datum van "Laatst bijgewerkt". Het wordt aanbevolen om deze pagina regelmatig te controleren.

## 7. Contact
Als u vragen heeft of deze privacypraktijken wilt bespreken, neem dan contact op met de Onderneming:
- **E-mail:** privacy@whataicando.com
- **Organisatie:** What AI Can Do, LLC
- **Website:** [whataicando.com](https://whataicando.com)
