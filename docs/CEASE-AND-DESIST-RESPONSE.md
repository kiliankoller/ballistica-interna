# Reply to a cease-and-desist letter or a takedown notice

A template for the maintainer, not legal advice and no claim that any step is sufficient or correct in a given
case. Contact is via GitHub only (no e-mail address is published), so a letter will usually arrive as a GitHub
notice, an issue or a mail to the maintainer's GitHub account.

## First 24 to 48 hours

1. Do not sign a pre-drafted declaration to cease and desist with a contractual penalty. It can bind for good and
   trigger penalties.
2. Take the named records or files out of `main` with a normal commit (a precaution, no admission). The data is
   in `data/*.csv`; each record names its source in `data/sources.csv`.
3. Send the reply below. Note the deadline; save the evidence: `data/sources.csv`, the terms and robots.txt of
   the source with their date.
4. A DMCA notice from GitHub: remove the content named; send a counter-notice only after advice.
5. Get a lawyer as soon as money or a declaration is demanded.

## Reply, English

> Dear Sir or Madam,
>
> I received your letter of <date>. BallisticaInterna is a private, non-commercial open-source project. I take your
> concern seriously and, as a precaution and without acknowledging a legal obligation, have removed the content
> you name. Please tell me the specific files or records and the legal basis you rely on. I do not give a
> declaration to cease and desist without legal advice. I would like to find a solution that suits both sides.
>
> Kind regards,
> <name>

## Reply, German

> Sehr geehrte Damen und Herren,
>
> ich habe Ihr Schreiben vom <Datum> erhalten. BallisticaInterna ist ein privates, nicht kommerzielles
> Open-Source-Projekt. Ich nehme Ihr Anliegen ernst und habe die genannten Inhalte vorsorglich entfernt, ohne
> damit eine Rechtspflicht anzuerkennen. Bitte nennen Sie mir die konkreten Dateien oder Datensätze und die
> Rechtsgrundlage, auf die Sie sich stützen. Eine Unterlassungserklärung gebe ich ohne anwaltliche Prüfung nicht
> ab. Ich bin an einer einvernehmlichen Lösung interessiert.
>
> Mit freundlichen Grüßen
> <Name>

## Afterwards

- Record what was removed and when (commit hash) in the issue or notice thread.
- Remove the record from the next release's data as well; a removed record stays in the git history, so ask a
  lawyer before deciding whether to rewrite it.
