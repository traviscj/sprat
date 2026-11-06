# sprat

Nerts/Sprat engine: web client (phone-friendly), authoritative ws server, attention-modelled bots, headless sim.

```
npm install
npm run dev          # http://localhost:5178  (local vs bots; ⚙ to configure)
npm run server       # ws://0.0.0.0:8787; client: ?ws=ws://host:8787&room=fam&name=you
npm run sim -- --n 300 steady twitchy river
npm run sim -- --sweep cps=3,5,8,12 steady steady steady
npm run sim -- --house grandma auditor steady
npm test
```

Autostart URL: `?bots=steady,slammer,grandma&house=1&seed=3`. See DESIGN.md.
