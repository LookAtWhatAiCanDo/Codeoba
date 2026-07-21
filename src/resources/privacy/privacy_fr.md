# Politique de Confidentialité
*Dernière mise à jour : 27 juin 2026*

Cette Politique de Confidentialité décrit les pratiques de confidentialité pour l'application de bureau locale Codeoba (l'"Application") et le site web codeoba.com (le "Site"). L'Application et le Site sont tous deux développés, édités et exploités par What AI Can Do, LLC (la "Société").

Veuillez lire attentivement cette politique. Si vous n'acceptez pas les termes décrits ici, veuillez ne pas utiliser l'Application ni le Site.

---

## 1. Principe Fondamental : Local-First par Défaut
> Codeoba est conçu pour être une application locale-first. Tous les transcriptions de dialogues, index de bases de données et caches sont stockés intégralement sur votre machine locale.

Les aspects clés de cette mise en œuvre locale-first incluent :
- **Zéro Journal Distant:** Les transcriptions de conversations agrégées à partir des répertoires d'assistants locaux (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, etc.) sont traitées hors ligne et analysées directement dans l'environnement d'exécution du client de bureau sur votre appareil.
- **Base de Données SQLite et Cache Local:** Toutes les sessions indexées, journaux, mots-clés de recherche et données de performance sont conservés dans un répertoire de cache local.
- **Cache local pré-analysé:** Toutes les conversations indexées sont analysées localement dans un cache de session rapide dans votre répertoire utilisateur pour permettre un démarrage instantané de l'application sans appels réseau externes.

## 2. Diagnostics et Vérifications de Mise à Jour Automatique
Pour maintenir la plateforme opérationnelle et sécurisée, Codeoba effectue des mises à jour de diagnostic de base :
- **Vérifications de Mise à Jour Automatique du Logiciel:** Si vous y consentez explicitement, l'application interroge notre serveur de mise à jour pour vérifier les dernières versions. Les paramètres réseau standard (tels que la version de l'application et la préférence de langue, ainsi que la version du système d'exploitation et l'architecture du processeur (CPU) de votre système) sont envoyés pour récupérer le manifeste de version, mais aucune donnée personnelle ou de conversation n'est collectée.
- **Journalisation de Télémétrie et Diagnostic:** Pour surveiller la santé du service et prévenir les abus de limite de taux d'API, les demandes de mise à jour sont enregistrées dans GCP Cloud Logging, qui connaît intrinsèquement l'adresse IP du client d'où proviennent les demandes. Ces journaux capturent les détails du système d'exploitation et le GUID d'installation anonyme. Tous ces journaux sont conservés pendant 30 jours, puis automatiquement supprimés définitivement.

## 3. Analyses du Site Web et Consentement aux Cookies
Pour analyser le trafic des visiteurs et surveiller les taux de téléchargement, le Site utilise Google Analytics (GA4). Par défaut, le suivi analytique est complètement désactivé et aucun cookie n'est chargé.

Lorsque vous visitez le Site, une bannière de consentement à la confidentialité s'affiche :
- **Consentement Accepté:** Si vous acceptez le suivi, nous chargeons Google Analytics de manière dynamique. Google Analytics placera des identifiants persistants (cookies comme _ga et _ga_<id-du-conteneur>) pour suivre les pages vues anonymes et les clics de téléchargement. Votre adresse IP est anonymisée.
- **Consentement Refusé:** Si vous refusez, le script de Google Analytics n'est jamais chargé. Aucun cookie n'est stocké et aucun ping d'empreinte numérique de l'appareil n'est envoyé.

Vous pouvez retirer ou réinitialiser votre choix à tout moment : [Gérer les Préférences de Confidentialité](#) (cela efface votre choix enregistré et réaffiche immédiatement la bannière de consentement).

## 4. Partage de Vos Informations
Nous ne vendons, ne louons ni n'échangeons vos données personnelles. Nous ne partageons que les informations techniques limitées nécessaires au fonctionnement de notre service de mise à jour et de diagnostic avec le prestataire de services tiers de confiance (sous-traitant) ci-dessous :
- **Infrastructure Cloud:** Nous utilisons Google Cloud Platform (GCP) Cloud Logging pour stocker les journaux de télémétrie standard (tels que les adresses IP et les informations sur l'appareil pour les vérifications de mise à jour) à des fins de diagnostic et de sécurité. Ces journaux sont automatiquement purgés après 30 jours.

## 5. Sécurité de Vos Données Locales
Vos données étant stockées localement, la sécurité de vos transcriptions indexées dépend de la sécurité de votre propre appareil. Nous vous recommandons de sécuriser votre machine avec des outils de chiffrement standard (tels que FileVault sur macOS) et des mots de passe forts.

## 6. Modifications de cette Politique de Confidentialité
La Société se réserve le droit de modifier cette Politique de Confidentialité. Toute modification sera publiée sur cette page avec une date de "Dernière mise à jour" révisée. Il est recommandé de consulter régulièrement cette page.

## 7. Nous Contacter
Si vous avez des questions ou souhaitez discuter de ces pratiques de confidentialité, veuillez contacter la Société :
- **E-mail :** privacy@whataicando.com
- **Organisation :** What AI Can Do, LLC
- **Web :** [whataicando.com](https://whataicando.com)
