## Repository Layout

```txt
src/       NestJS backend source
prisma/    Prisma schema and migrations
test/      API tests
mobile/    Expo React Native app
```

## API Commands

Run from repo root:

```bash
npm install
npm run start:dev
npm run lint -- --no-fix
npm run test -- --ci --runInBand
npm run build
```

## Mobile Commands

Run from `mobile/`:

```bash
npm install
npm run typecheck
npm test -- --runInBand
```
