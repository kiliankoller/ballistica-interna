# Local fixtures

This folder is **not part of the repository** (see `.gitignore`): it holds the maintainer's local working data
(source documents as published, measured sets, caches, reports). Nothing in it is shipped or needed to build or
run the app; the shipped data are `data/*.csv`.

Tools that read these files are in `tools/reference-data/` (steps for sources whose terms do not allow shipping
or processing are kept locally and are not in the repository). Sources of the shipped data are listed in
`data/sources.csv`. Load tables of makers are used only to fit and check BallisticaInterna's own powder models
(§ 44b UrhG) and are never shipped.
