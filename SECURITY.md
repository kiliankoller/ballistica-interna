# Security policy

## Supported versions

Only the latest release receives fixes. BallisticaInterna is at version 0.x: there are no long-term supported branches.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the repository on GitHub, choose **Security**, then
**Report a vulnerability**. Do not post vulnerabilities in public issues. There is no e-mail address for reports.

Ordinary bugs, wrong data records and wrong calculation results are not vulnerabilities: please open an issue.

What to expect: BallisticaInterna is a private, unpaid project. Reports are read as time allows; there is no guaranteed
response time and no bug bounty.

## Scope

BallisticaInterna runs locally and does not connect to the internet. It reads and writes `.grtload` files and keeps its
own library in a local database. Relevant are, for example, problems when opening a crafted `.grtload` file or a
library export.

A calculation that is too low or wrong is a model limitation, not a security vulnerability; see
[DISCLAIMER.md](DISCLAIMER.md).
