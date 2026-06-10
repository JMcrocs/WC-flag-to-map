# World Cup 2026 Flag-to-Map

A standalone static website for a quick 5-round learning game based on the 2026 World Cup field.

## How to run

Open `index.html` in a browser. No server, build step, login, CDN or internet connection is required.

## Game flow

1. Five random World Cup 2026 teams are selected.
2. Each round shows a real local PNG flag altered in a different hard style.
3. The player types the country name. There is no multiple choice.
4. The player has three attempts; after each miss the flag becomes slightly clearer.
5. The player places the team on a world map with no country borders shown.
6. A team profile card is unlocked immediately with FIFA rank, editorial outlook, group, opponents, geography and a fun fact.

## Scoring

Each round is worth 20 points:

- Flag: 8 points on first attempt, 5 on second, 3 on third, 0 if revealed.
- Map: up to 12 points based on distance from the country.
- Five rounds: 100 points maximum.

## Data snapshot

Team groups and team list are included as a June 2026 snapshot. FIFA rank numbers use a June 2026 ranking snapshot. The site is standalone, so the data does not update automatically.

## Files

- `index.html` - page structure
- `assets/styles.css` - responsive design and flag alteration styles
- `assets/app.js` - game logic
- `assets/data.js` - team dataset and map line data
- `assets/flags/` - local PNG flags
