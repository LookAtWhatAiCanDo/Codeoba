# Datenschutzerklärung
*Zuletzt aktualisiert: 27. Juni 2026*

Diese Datenschutzerklärung beschreibt die Datenschutzpraktiken für die lokale Codeoba-Desktop-Anwendung (die "App") und die Website codeoba.com (die "Website"). Sowohl die App als auch die Website werden von What AI Can Do, LLC (dem "Unternehmen") entwickelt, veröffentlicht und betrieben.

Bitte lesen Sie diese Richtlinie sorgfältig durch. Wenn Sie mit den hier beschriebenen Bedingungen nicht einverstanden sind, nutzen Sie die App oder die Website bitte nicht.

---

## 1. Grundprinzip: Standardmäßig lokal zuerst
> Codeoba ist als lokal-erste Anwendung konzipiert. Alle Dialogtranskripte, Datenbankindizes und Caches werden vollständig auf Ihrem lokalen Rechner gespeichert.

Wesentliche Aspekte dieser lokal-ersten Implementierung sind:
- **Keine Remote-Protokolle:** Konversationsprotokolle, die aus lokalen Verzeichnissen (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot usw.) aggregiert werden, werden offline verarbeitet und direkt in der Laufzeit des Desktop-Clients auf Ihrem Gerät analysiert.
- **Lokale SQLite-Datenbank & Cache:** Alle indexierten Sitzungen, Protokolle, Suchbegriffe und Leistungsdaten werden in einem lokalen Cache-Verzeichnis gespeichert.
- **Lokaler vorgeparster Cache:** Alle indexierten Konversationen werden lokal in einen schnellen Sitzungscache in Ihrem Benutzer-Home-Verzeichnis geparst, um einen sofortigen Anwendungsstart ohne externe Netzwerkaufrufe zu ermöglichen.

## 2. Diagnose & automatische Update-Prüfungen
Um die Plattform betriebsbereit und sicher zu halten, führt Codeoba grundlegende Diagnose-Updates durch:
- **Automatische Software-Update-Prüfungen:** Wenn Sie Ihre ausdrückliche Zustimmung geben, fragt die App unseren Update-Server ab, um nach den neuesten Versionen zu suchen. Standard-Netzwerkparameter (wie die Anwendungsversion und Spracheinstellung zusammen mit der Betriebssystemversion und der CPU-Architektur Ihres Systems) werden gesendet, um das Release-Manifest abzurufen, aber es werden keine persönlichen Daten oder Konversationsdaten erfasst.
- **Telemetrie- & Diagnoseprotokollierung:** Zur Überwachung des Dienststatus und zur Verhinderung von API-Ratenbegrenzungsmissbrauch werden Update-Anfragen in GCP Cloud Logging protokolliert, das die Client-IP-Adresse, von der die Anfragen ausgehen, naturgemäß kennt. Diese Protokolle erfassen Betriebssystemdetails und die anonyme Installations-GUID. Alle diese Protokolle werden 30 Tage lang aufbewahrt und dann automatisch dauerhaft gelöscht.

## 3. Website-Analysen & Cookie-Einwilligung
Um den Besucherverkehr zu analysieren und die Download-Raten zu überwachen, verwendet die Website Google Analytics (GA4). Standardmäßig ist das Analyse-Tracking vollständig deaktiviert und es werden keine Cookies geladen.

Wenn Sie die Website besuchen, wird ein Datenschutz-Einwilligungsbanner angezeigt:
- **Einwilligung Akzeptiert:** Wenn Sie dem Tracking zustimmen, laden wir Google Analytics dynamisch. Google Analytics setzt permanente Identifikatoren (Cookies wie _ga und _ga_<container-id>), um anonyme Seitenaufrufe und Download-Klicks zu verfolgen. Ihre IP-Adresse wird anonymisiert.
- **Einwilligung Abgelehnt:** Wenn Sie ablehnen, wird das Google Analytics-Skript niemals geladen. Es werden keine Cookies gespeichert und keine Pings zur Geräte-Fingerabdruck-Erfassung gesendet.

Sie können Ihre Wahl jederzeit widerrufen oder zurücksetzen: [Datenschutzeinstellungen verwalten](#) (dies löscht Ihre gespeicherte Wahl und zeigt das Einwilligungsbanner sofort wieder an).

## 4. Weitergabe Ihrer Informationen
Wir verkaufen, vermieten oder handeln nicht mit Ihren persönlichen Daten. Wir geben nur die begrenzten technischen Informationen, die für den Betrieb unseres Update- und Diagnosedienstes erforderlich sind, an den unten aufgeführten vertrauenswürdigen Drittanbieter (Unterauftragsverarbeiter) weiter:
- **Cloud-Infrastruktur:** Wir verwenden Google Cloud Platform (GCP) Cloud Logging, um Standard-Telemetrieprotokolle (wie IP-Adressen und Geräteinformationen für Update-Prüfungen) zu Diagnose- und Sicherheitszwecken zu speichern. Diese Protokolle werden nach 30 Tagen automatisch gelöscht.

## 5. Sicherheit Ihrer lokalen Daten
Da Ihre Daten lokal gespeichert werden, hängt die Sicherheit Ihrer indexierten Transkripte von der Sicherheit Ihres eigenen Geräts ab. Wir empfehlen, Ihren Rechner mit Standard-Verschlüsselungstools (wie FileVault auf macOS) und sicheren Passwörtern zu schützen.

## 6. Änderungen an dieser Datenschutzerklärung
Das Unternehmen behält sich das Recht vor, diese Datenschutzerklärung zu ändern. Alle Änderungen werden auf dieser Seite mit einem aktualisierten Datum "Zuletzt aktualisiert" veröffentlicht. Es wird empfohlen, diese Seite regelmäßig zu überprüfen.

## 7. Kontakt
Wenn Sie Fragen haben oder diese Datenschutzpraktiken besprechen möchten, wenden Sie sich bitte an das Unternehmen:
- **E-Mail:** privacy@whataicando.com
- **Organisation:** What AI Can Do, LLC
- **Web:** [whataicando.com](https://whataicando.com)
