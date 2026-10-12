# Den magiske julesekken

Et komplett, serverstyrt Secret Santa-spill med SQLite, private deltakerkoder, ønskelister og en animert fjøsnisse.

## Start

Krever Node.js 22.5 eller nyere. Ingen pakker må installeres.

```powershell
npm start
```

Åpne `http://localhost:3000/admin` på maskinen som kjører serveren. Ved første besøk oppretter du administratorpassordet. Legg inn deltakerne, kopier de genererte kodene og send hver person sin egen kode privat. Deltakerne åpner `http://localhost:3000`.

For andre enheter på samme nett bruker du servermaskinens lokale IP-adresse, for eksempel `http://192.168.1.50:3000`. For bruk over internett bør appen kjøres bak HTTPS (Caddy, nginx eller en hostingtjeneste) og `.data`-mappen må ligge på varig lagring.

## Sikkerhet og trekning

- Passord hashes med scrypt; private koder lagres bare som SHA-256 med en lokal serverhemmelighet.
- Innlogging bruker `HttpOnly`/`SameSite=Strict`-cookies.
- Alle resultater genereres komplett på serveren med backtracking før runden åpnes.
- Ingen får seg selv, alle mottakere brukes én gang, og unntaksregler valideres.
- Deltakere kan bare se sitt eget lagrede resultat. Administratoroversikten viser status, ikke hemmelige par.
- Sikkerhetskopier `.data/secretsanta.db` og `.data/secret.key` sammen.

## Test

```powershell
npm test
```

`PORT` og `HOST` kan settes som miljøvariabler. Standard er port 3000 på alle nettverksgrensesnitt.

## GitHub Pages

Prosjektet inneholder en GitHub Actions-workflow som bygger `static/` til et rent
Pages-artefakt og publiserer ved push til `main`:

```powershell
npm run build:pages
```

Artefaktet havner i `dist/`. Alle nettleserressurser bruker relative adresser og
fungerer derfor under `https://odafossvoll.github.io/SecretSanta/`.

GitHub Pages er kun statisk hosting. Uten en separat HTTPS-backend kan den ikke
tilby en felles deltakerliste, administratorinnlogging, private deltakerkoder,
ønskelister eller hemmelige, permanente tildelinger. Pages-versjonen viser derfor
en ærlig statusmelding og deaktiverer innlogging når backend ikke er konfigurert;
den lagrer ikke sensitive data i nettleseren eller i repoet.

For å koble til en driftet versjon av `server.mjs`:

1. Drift serveren på en HTTPS-adresse med varig lagring for `.data`.
2. Sett servermiljøvariabelen `PUBLIC_ORIGIN=https://odafossvoll.github.io`.
3. Opprett repository variable `SECRET_SANTA_API_URL` med serverens HTTPS-adresse.
4. Konfigurer administratorpassordet direkte på backend-maskinen før Pages tas i bruk.

`SECRET_SANTA_API_URL` er en offentlig endepunktadresse, ikke en hemmelighet.
Administratorpassord, deltakerkoder, database og tildelinger skal aldri legges i
GitHub Actions-variabler eller statiske filer.

En produksjonsklar Cloudflare Workers + D1-backend ligger i
`backend/cloudflare/`. Den bruker D1 for permanent, delt lagring, Worker Secrets
for administratorpassord og sesjonsnøkkel, HMAC-hashing av deltakerkoder,
serverstyrt komplett trekning, korte CORS-regler og rate limiting på innlogging.
Se `backend/cloudflare/README.md` for oppsett og deploy.
