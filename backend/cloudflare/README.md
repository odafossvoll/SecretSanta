# Cloudflare Worker + D1 backend

Denne backenden leverer samme `/api/*`-kontrakt som den lokale Node-serveren,
men bruker Cloudflare D1 og krypterte Worker Secrets.

## Oppsett

1. Logg inn: `npx wrangler@latest login`
2. Opprett databasen: `npx wrangler@latest d1 create secret-santa`
3. Lim database-ID-en inn i `wrangler.jsonc`.
4. Kjør migreringen:
   `npx wrangler@latest d1 migrations apply secret-santa --remote --config backend/cloudflare/wrangler.jsonc`
5. Legg inn to secrets via skjult prompt:
   `npx wrangler@latest secret put ADMIN_PASSWORD --config backend/cloudflare/wrangler.jsonc`
   `npx wrangler@latest secret put SESSION_SECRET --config backend/cloudflare/wrangler.jsonc`
6. Deploy: `npx wrangler@latest deploy --config backend/cloudflare/wrangler.jsonc`
7. Sett GitHub repository variable `SECRET_SANTA_API_URL` til Workerens HTTPS-URL,
   og kjør Pages-workflowen på nytt.

Bruk et langt, unikt administratorpassord og en tilfeldig `SESSION_SECRET` på minst
32 byte. Ingen av dem skal lagres i repoet eller i `wrangler.jsonc`.
