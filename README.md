# World Cup 2026 Flag-to-Map

Standalone static website. Open `index.html` directly or deploy the folder to GitHub Pages.

## Files

- `index.html`
- `assets/styles.css`
- `assets/data.js`
- `assets/app.js`
- `assets/flags/*.png`

## Game modes

- **Normal**: 5 random teams, altered real flag, typed country answer, borderless world map country placement, team card after each round.
- **HARDCORE**: 5 random teams, tougher flag alteration, typed country answer, one-shot capital question, timed scoring, borderless world map capital placement, team card after each round.

## Scoring

- **Normal**: 20 points per round: flag 10 + country map 10.
- **HARDCORE**: 20 points per round: flag 5 + capital 5 + capital map 7 + speed 3.

## Map policy

The map intentionally renders landmasses only. Country borders are not shown.

## Deployment

For GitHub Pages, upload `index.html` and the whole `assets/` folder to the repository root, then enable Pages from the `main` branch and `/root` folder.
