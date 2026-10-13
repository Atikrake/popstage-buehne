# POPSTAGE – Bühne

Die 3D-Bühne der Dating-Show POPSTAGE. Live unter https://popstage.vercel.app/buehne
(ein Host, bis zu fünf Kandidaten, Kamera und Mikro über LiveKit).

Gebaut mit Vite, React, React Three Fiber und three.js. Das Ergebnis ist eine einzige
HTML-Datei (`dist/index.html`), in der alles steckt.

## Starten

```bash
npm install
npm run dev
```

Dann http://localhost:5190 öffnen und „Ohne Mitspieler ansehen (Demo)“ wählen.
In der Entwicklungsversion lässt sich jeder Moment der Show anspringen, z. B. in
der Browser-Konsole:

```js
__show.send({ type: 'jump', phase: 'pop', ms: 600 }); // mitten in den POP
__show.hold(true); // Uhr anhalten, um ein Bild genau anzusehen
```

## Bauen

```bash
npm run build
```

Prüft die Typen und schreibt `dist/index.html`. Die App (Repo `popstage-app`) kopiert
diese Datei beim Veröffentlichen als `buehne.html` nach popstage.vercel.app/buehne.

## Aufbau

- `src/show/` – die Spielregeln und Zeiten (Ablauf, Runden, wer dran ist). Rein
  rechnerisch: gleicher Zustand + gleiche Zeit = gleiches Bild auf jedem Handy.
- `src/world/` – das Studio. Wird nur vom Show-Zustand gesteuert.
  - `director.ts` – Regie: Kamera, Licht, LED-Wand für jeden Moment
  - `shapes.ts` – die runden Formen (Podeste, Pult, Ballon, Traverse)
  - `materials.ts` – Materialien und Shader (Lichtkegel, Bildschirme, LED-Wand)
  - `Studio.tsx`, `Podium.tsx`, `Screens.tsx`, `Corridor.tsx`, … – die einzelnen Teile
- `src/hud/` – die Bedienung über dem Bild (Knöpfe, Karten)
- `src/net/` – Live-Verbindung (LiveKit-Raum, Kamera, Mikro)
- `src/quality.ts` – die Qualitätsstufen Niedrig / Mittel / Hoch
