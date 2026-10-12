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
