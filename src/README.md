# Server source

`config.js` is the single place for normalized environment configuration used
at server startup. `server.js` is a small loader; the actual runtime is split by
domain under `server/`.

The loader compiles the ordered parts as one CommonJS module. This intentionally
keeps caches, helper functions and Express handlers in one private scope while
avoiding a multi-thousand-line source file. When adding a part, also add it to
`SERVER_PARTS` in `server.js`. The order is significant.

Keep future server modules in these groups:

```text
src/
├── config.js       Environment parsing, defaults and paths
├── server.js       Ordered runtime loader
├── server/         Runtime source grouped by domain
├── lib/            Stateless reusable helpers
├── services/       Stateful integrations such as Spotify or calendar
└── routes/         Thin HTTP handlers calling services
```

Do not import browser code from `public/` into server modules. Secrets and API
tokens must remain on the server.
