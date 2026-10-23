# Sapios — Emails

Deux familles d'emails, un seul fournisseur : **Resend**.

| Email | Qui l'envoie | Par où | Réglage |
|---|---|---|---|
| Code de connexion, confirmation d'inscription | Supabase Auth | SMTP de Resend | dashboard Supabase (§5 et §6) |
| Verdict de diplôme, nouveau match | Edge Function `notify` | API HTTP de Resend | secrets des Edge Functions (§4) |
| Événements (lot 2) : place confirmée, place libérée, annulation, rappel la veille | Edge Function `notify` | API HTTP de Resend | secrets des Edge Functions (§4) |

Pas d'email pour les nouveaux messages : le badge de l'app suffit (suite possible, §10).

Pourquoi : le SMTP intégré de Supabase n'envoie qu'aux membres de l'équipe du projet, à raison de quelques
emails par heure. Sans SMTP personnalisé, un membre ordinaire ne reçoit jamais son code de connexion. Et
l'app membre publiée sur le web n'a pas de notifications push : l'email prend le relais pour le verdict et
le match.

**En local**, rien à faire :
- les codes de connexion arrivent dans Mailpit, http://127.0.0.1:54324 (`supabase/config.toml`) ;
- sans `RESEND_API_KEY`, `notify` n'envoie que les push et journalise `email : canal désactivé`.

Il faut un **nom de domaine** à vous (ex. `sapios.fr`). Sans domaine vérifié, Resend n'envoie qu'à l'adresse
du compte Resend : même impasse que le SMTP intégré de Supabase.

Dans la suite, `<domaine>` est votre domaine, `<ref>` l'identifiant du projet Supabase (*Project Settings →
General → Project ID*), et `<app membre>` l'adresse publique de l'app membre sur le web.

---

## 1. Compte Resend

1. Créer un compte sur https://resend.com (au nom du porteur du projet, pas d'un prestataire).
2. Offre gratuite, à vérifier au moment de l'inscription sur https://resend.com/pricing : environ
   3 000 emails par mois, **100 par jour**, un seul domaine. Les codes de connexion et les emails de verdict
   et de match comptent ensemble : prévoir l'offre payante avant l'ouverture au public.

## 2. Domaine d'envoi

1. Resend → **Domains** → **Add Domain**.
   - Nom : un sous-domaine dédié, par exemple `mail.<domaine>`. La réputation d'envoi reste séparée du
     domaine principal, qui garde sa propre messagerie.
   - Région : **Ireland (eu-west-1)**, pour que l'envoi se fasse depuis l'UE (RGPD).
2. Resend affiche 3 ou 4 enregistrements DNS. Les recopier **à l'identique** chez le registraire du domaine
   (OVH, Gandi, Cloudflare…) :
   - `TXT` sur `resend._domainkey.mail` : la clé DKIM ;
   - `MX` sur `send.mail` (priorité 10) : `feedback-smtp.eu-west-1.amazonses.com` (retours d'erreur) ;
   - `TXT` sur `send.mail` : `v=spf1 include:amazonses.com ~all` (SPF) ;
   - recommandé, sur le domaine principal : `TXT` `_dmarc` = `v=DMARC1; p=none;` (à durcir plus tard).

   Les valeurs exactes sont celles que Resend affiche ; celles ci-dessus ne sont qu'indicatives.
3. **Verify DNS Records**, puis attendre le statut **Verified** (quelques minutes à quelques heures).
4. Dans la page du domaine, onglet **Configuration** : désactiver **Click tracking** et **Open tracking**.
   Le suivi réécrit les liens et ajoute un pixel espion : inutile ici, et à déclarer au titre du RGPD.

## 3. Clé API

1. Resend → **API Keys** → **Create API Key**.
   - Nom : `sapios-staging` (une clé par environnement : `sapios-prod` pour la production).
   - Permission : **Sending access**.
   - Domain : `mail.<domaine>`.
2. Copier la clé `re_…` : elle ne s'affiche qu'une fois. Ne jamais la committer.

La **même clé** sert deux fois : secret `RESEND_API_KEY` des Edge Functions (§4) et mot de passe SMTP de
Supabase Auth (§5).

## 4. Secrets des Edge Functions (verdict et match)

| Secret | Valeur | Rôle |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | Active le canal email. Vide : push seuls |
| `EMAIL_FROM` | `Sapios <bonjour@mail.<domaine>>` | Expéditeur, obligatoirement sur le domaine vérifié. Vide : push seuls |
| `SAPIOS_APP_URL` | `https://<app membre>` (sans `/` final) | Liens des emails : `/` pour le verdict, `/chat/<match>` pour le match. Vide : emails sans lien |

```sh
npx supabase secrets set --project-ref <ref> \
  RESEND_API_KEY=re_xxxxxxxx \
  EMAIL_FROM='Sapios <bonjour@mail.<domaine>>' \
  SAPIOS_APP_URL=https://<app membre>
npx supabase secrets list --project-ref <ref>   # les trois noms doivent apparaître
```

Ou dans le dashboard : *Edge Functions → Secrets* (selon la version : *Project Settings → Edge Functions*).
Pas de redéploiement nécessaire pour un secret ; le code de `notify`, lui, part avec le workflow
`deploy.yml` (staging après une CI verte sur `main`).

## 5. SMTP de Supabase Auth (codes de connexion)

À faire dans **chaque** projet hébergé (staging, prod). Dashboard du projet → **Authentication** →
**Emails** → onglet **SMTP Settings** → activer **Enable Custom SMTP** :

| Champ | Valeur |
|---|---|
| Sender email address | `bonjour@mail.<domaine>` (même domaine vérifié que `EMAIL_FROM`) |
| Sender name | `Sapios` |
| Host | `smtp.resend.com` |
| Port number | `465` (TLS direct ; si refusé, `587` avec STARTTLS) |
| Minimum interval per user | `60` secondes (valeur par défaut, à garder) |
| Username | `resend` |
| Password | la clé API `re_…` du §3 |

Puis **Save**. Réglages voisins, dans le même projet :

1. **Authentication → Rate Limits** → *Rate limit for sending emails* : Supabase le fixe à 30 par heure
   à l'activation du SMTP personnalisé. Le monter selon l'offre Resend (ex. 100 par heure), sans dépasser
   le quota journalier.
2. **Authentication → Sign In / Providers → Email** : *Email OTP Length* = **6** (l'app et le back-office
   attendent exactement 6 chiffres) ; *Email OTP Expiration* = `3600` comme en local.
3. **Authentication → URL Configuration** : *Redirect URLs* doit contenir `https://<app membre>/**`,
   `https://<back-office>/admin/auth/callback` et `sapios://**`, sinon le lien de l'email renvoie vers la
   *Site URL*.

## 6. Gabarits des emails d'authentification

Les projets hébergés ne lisent ni `supabase/config.toml` ni `supabase/templates/` : il faut recopier les deux
gabarits dans le dashboard, et recommencer à chaque modification de ces fichiers (le déploiement ne les pousse
pas). Les deux sont nécessaires : `signInWithOtp` envoie « Confirm signup » à une adresse inconnue et
« Magic link » à un compte existant.

Dashboard → **Authentication** → **Emails** → onglet **Templates** :

| Modèle | Subject heading | Message body |
|---|---|---|
| **Magic link** | `Votre code Sapios` | tout le contenu de `supabase/templates/magic_link.html` |
| **Confirm signup** | `Confirmez votre inscription à Sapios` | tout le contenu de `supabase/templates/confirmation.html` |

Pour chacun : ouvrir le fichier dans le dépôt (vue *Raw* sur GitHub), tout copier, coller dans l'onglet
**Source** du champ *Message body* en remplaçant le contenu existant, puis **Save changes**. Vérifier dans
l'aperçu le bloc noir du code. Ne pas toucher aux variables : `{{ .Token }}` (le code à 6 chiffres) et
`{{ .ConfirmationURL }}` (le lien) doivent rester telles quelles. Un test Deno
(`_shared/email_test.ts`) vérifie leur présence dans les fichiers du dépôt.

**Variante scriptée** (même effet, copie exacte des fichiers ; non essayée faute d'accès à un projet
hébergé) : l'API Management de Supabase, avec un jeton personnel créé sur
https://supabase.com/dashboard/account/tokens. Depuis la racine du dépôt :

```sh
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx     # jeton personnel
export RESEND_API_KEY=re_xxxxxxxx
PROJECT_REF=<ref>
jq -n \
  --rawfile magic supabase/templates/magic_link.html \
  --rawfile confirm supabase/templates/confirmation.html \
  --arg pass "$RESEND_API_KEY" \
  '{
     mailer_subjects_magic_link: "Votre code Sapios",
     mailer_templates_magic_link_content: $magic,
     mailer_subjects_confirmation: "Confirmez votre inscription à Sapios",
     mailer_templates_confirmation_content: $confirm,
     mailer_otp_length: 6,
     smtp_host: "smtp.resend.com",
     smtp_port: "465",
     smtp_user: "resend",
     smtp_pass: $pass,
     smtp_admin_email: "bonjour@mail.<domaine>",
     smtp_sender_name: "Sapios"
   }' |
curl -sS -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @-
```

`smtp_port` est une chaîne dans cette API. `supabase config push` n'est pas utilisé : il pousserait aussi les
valeurs locales de `config.toml` (`site_url = http://localhost:3000`, redirections locales).

## 7. Tester

1. **Code de connexion.** Depuis l'app membre web ou le back-office, demander un code pour une adresse
   **extérieure à l'équipe Supabase**. L'email doit venir de `bonjour@mail.<domaine>`, avec le code et le
   lien ; il apparaît aussi dans Resend → **Emails**. Saisir le code : la connexion aboutit.
2. **Verdict.** Back-office → décider un diplôme d'un compte de test dont vous lisez la boîte. Ou directement
   (envoie un vrai email et un vrai push à ce compte ; prendre le vôtre) :
   ```sh
   curl -sS -X POST "https://<ref>.supabase.co/functions/v1/notify" \
     -H "Content-Type: application/json" \
     -H "x-sapios-secret: <valeur de SAPIOS_INTERNAL_SECRET>" \
     -d '{"type":"verdict","user_id":"<uuid du compte>","copy_key":"verdict.standard"}'
   # → {"sent":0,"emailed":1}   (sent = push acceptés par Expo, emailed = emails acceptés par Resend)
   ```
3. **Match.** Deux comptes de test se likent : chacun reçoit « Nouveau match ».
4. **Journaux** : dashboard → *Edge Functions* → `notify` (ou `review-diploma`) → *Logs*.

| Journal | Cause | Correction |
|---|---|---|
| `email : canal désactivé` | `RESEND_API_KEY` ou `EMAIL_FROM` absent | §4 |
| `refusé par Resend 401` | clé invalide ou révoquée | nouvelle clé, §3 et §4 |
| `refusé par Resend 403` | domaine non vérifié, ou `EMAIL_FROM` hors du domaine de la clé | §2, §4 |
| `refusé par Resend 422` | `EMAIL_FROM` mal formé | `Sapios <adresse@mail.<domaine>>` |
| `refusé par Resend 429` | limite de débit ou quota atteint (après deux nouveaux essais) | offre Resend |
| `SAPIOS_APP_URL invalide` | adresse sans `https://` | §4 |
| `emailed: 0`, sans erreur | compte banni, supprimé, sans profil ou adresse non confirmée | normal |

Les journaux portent l'identifiant du compte, jamais son adresse.

## 8. Textes

Back-office → **Textes** → groupe `email` (créés par la migration `20261021091000_email_copy.sql`, jamais
écrasés ensuite) :

| Clé | Rôle |
|---|---|
| `email.verdict.subject`, `email.verdict.title`, `email.verdict.body`, `email.verdict.cta` | Email de verdict : sujet, titre (en inversion noir/blanc), texte, bouton |
| `email.match.subject`, `email.match.title`, `email.match.body`, `email.match.cta` | Email de match |
| `email.footer` | Pied de page commun |
| `email.event.registered.*`, `email.event.promoted.*`, `email.event.cancelled.*`, `email.event.reminder.*` (`subject`, `title`, `body`), `email.event.cta` | Emails d'événement (migration `20261024090300_lot2_copy.sql`) |

Variables : `{name}` = prénom affiché du **destinataire** (« Bonjour » s'il n'en a pas) ; `{verdict}` = texte
de son verdict (`verdict.standard`, `verdict.refused`…). Événements : `{title}`, `{date}` (« samedi 14 novembre à
19 h 30 », heure de Paris), `{reason}` (motif d'annulation). Une ligne vide sépare deux paragraphes. Pas de HTML :
tout est échappé. Un texte vidé retombe sur un texte de repli codé dans `_shared/email.ts`. Effet immédiat.

Le gabarit (`supabase/functions/_shared/email_template.ts`) suit la charte : noir `#0B0B0B` et blanc cassé
`#F4F3EF` uniquement, titre en Didot, étiquette en capitales monospace, version texte jointe.

## 9. Données personnelles

- **Événement** : prénom du destinataire, titre, date et, pour une annulation, le motif. Jamais le lieu exact (il
  reste dans l'application, réservé aux inscrits), jamais les autres inscrits. Une notification périmée (désinscrit
  entre-temps, événement annulé depuis) ne part pas.

- **Verdict** : prénom du destinataire, texte de **son** verdict, lien vers l'app. Ni niveau, ni diplôme, ni
  motif de refus.
- **Match** : prénom du destinataire seulement. Jamais le prénom ni la photo de l'autre personne : avec le
  genre du destinataire, il suffirait à deviner une orientation (donnée sensible, brief §9).
- Jamais d'email à un compte banni (`profiles.status`, ou `banned_until` côté Auth), supprimé, anonyme ou
  dont l'adresse n'est pas confirmée. L'adresse est lue au moment de l'envoi par l'API admin d'Auth, côté
  serveur, et n'est stockée nulle part ailleurs.
- **Resend devient sous-traitant** (adresse email, contenu des emails) : l'ajouter à la politique de
  confidentialité (`apps/web/app/confidentialite`), accepter son DPA (https://resend.com/legal/dpa) et
  garder la région UE.
- Pas encore de préférence « ne plus recevoir d'emails » : le pied de page renvoie à la suppression du compte.

**Sign in with Apple, « Masquer mon adresse »** : les adresses `@privaterelay.appleid.com` ne relaient que les
expéditeurs déclarés. Apple Developer → *Certificates, Identifiers & Profiles* → *Services* → *Sign in with
Apple for Email Communication* → *Configure* : ajouter le domaine `mail.<domaine>` et l'adresse
`bonjour@mail.<domaine>`. À vérifier avec un compte Apple de test (non essayé ici).

## 10. Suites possibles

- Email pour les nouveaux messages, regroupé et différé (seulement si le message n'est pas lu après
  quelques minutes), avec une préférence de désinscription.
- Préférences de notification par email dans *Compte*, et en-tête `List-Unsubscribe`.
- Webhook Resend (rebonds, plaintes) pour cesser d'écrire aux adresses invalides.
- Textes dans d'autres langues (`app_copy.locale`).
