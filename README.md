# Veiling Easyfiets Leiden – tracker

Volgt de biedingen van de [faillissementsveiling Easyfiets](https://auctivo.net/nl/auction/b10e4c75-ae8c-4562-8f48-b853ec689a24) op Auctivo.

Openbaar overzicht: https://kasperrich.github.io/auction-tracker/

## Hoe het werkt

1. Een geplande Claude-taak opent de openbare veilingpagina en voert `extract.js` uit in de browser.
   Dat levert één regel per kavel op (minimumbod, hoogste bod, aantal biedingen, open, sluittijd) plus een controlesom.
2. `node update.mjs data/incoming.txt` controleert de meting, voegt hem toe aan `data/snapshots.jsonl`,
   legt elke wijziging vast in `data/changes.jsonl` en maakt `index.html` (deze pagina) en `data/dashboard.json`.
3. De taak pusht `index.html` en de metingen naar GitHub; GitHub Pages toont `index.html`.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `extract.js` | Leest de kavels uit de geladen veilingpagina |
| `update.mjs` | Verwerkt een meting en maakt de pagina's |
| `overzicht.template.html` | Sjabloon van de openbare pagina |
| `data/lots.json` | Kavelnummer, titel en id |
| `data/categories.json` | Eigen indeling van de kavels in categorieën (aan te passen) |
| `data/snapshots.jsonl` | Alle metingen |
| `data/changes.jsonl` | Alle gevonden wijzigingen |
| `dashboard/` | Pagina van het dashboard op claude.ai |

Planning: dagelijks om 05:00, 12:00 en 19:00, en op 10 november van 15:00 tot de sluiting elk kwartier.
