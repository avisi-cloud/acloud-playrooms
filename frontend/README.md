# Acloud Playrooms Frontend

Angular frontend for the Acloud Playrooms desktop app. It talks to the Wails
backend through generated bindings in `frontend/bindings`.

```sh
npm run dev
npm run build
npm test
npm run check
```

Anything that needs the Go backend or the installed `acloud` CLI should be tested
through `make dev` from the repository root.
