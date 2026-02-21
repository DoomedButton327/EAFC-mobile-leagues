# 🏆 Mettlestate × EA FC Mobile League

A community league management platform for **Mettlestate EA FC Mobile** — built as a clean, single-page web app that runs entirely in the browser. No server required.

## 📸 Features

- **Live League Standings** — Sorted by points, goal difference, and goals scored. Includes podium view for top 3 and form indicators.
- **Fixtures Management** — View, generate, and resolve pending matches.
- **Results History** — Full log of completed matches with scores.
- **Player Registry** — Import via `.txt` file or add manually.
- **Admin Panel** — Full control over fixtures, scores, and data.
- **Image Export** — Export Standings, Fixtures, and Rules as shareable `.png` images.
- **JSON Backup & Restore** — Export/import all league data.
- **Round Robin Generator** — Auto-generate a full round-robin schedule.

## 🚀 Getting Started

### Run Locally
Just open `index.html` in any modern browser. No build step, no dependencies.

### GitHub Pages (Recommended)
1. Fork this repo
2. Go to **Settings → Pages**
3. Set source to `main` branch, root folder
4. Your league will be live at `https://yourusername.github.io/repo-name`

## 📁 File Structure

```
league/
├── index.html          # Main app shell
├── css/
│   └── style.css       # Full design system
├── js/
│   └── app.js          # All logic & rendering
├── Players.txt         # Sample player import file
└── README.md
```

## 📄 Player Import Format

Create a `.txt` file with one player per line:
```
Full Name, InGameUsername, PhoneNumber
```

Example:
```
astral_reign, astral, 0123456789
```

## ⚙️ Admin Controls

| Feature | Description |
|---|---|
| Import Players | Upload `.txt` with player list |
| Generate Draw | Random pairs or full Round Robin |
| Manual Match | Add a specific fixture |
| Add Player | Single player form |
| Log Score | Record exact goal scores |
| Backup | Export all data as JSON |
| Restore | Reload from a JSON backup |
| Reset | Clear everything |

## 📐 Points System

| Result | Points |
|---|---|
| Win | 3 |
| Draw | 1 |
| Loss | 0 |

Tiebreaker: Goal Difference → Goals For → Head-to-Head

## 🌐 Tech Stack

- Vanilla HTML / CSS / JavaScript
- [Font Awesome 6](https://fontawesome.com/)
- [html2canvas](https://html2canvas.hertzen.com/) — image export
- Google Fonts: Barlow Condensed + Barlow
- `localStorage` for persistent data

## 📜 License

MIT — free to use and modify for community leagues.

---

*Built for the Mettlestate community. #MettlestateLeague*

## 🔄 GitHub Sync

The league can auto-save all data and match screenshots directly to your repo via the GitHub API.

### Setup
1. Go to **Admin → GitHub Sync**
2. Enter your GitHub username, repo name, and branch
3. Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
4. Paste it in and click **Save & Connect**

Once connected:
- Every result, player change, or fixture update is committed automatically to `data/league-data.json`
- Match screenshots are uploaded to `match-images/` in your repo
- On next page load, the app reloads data from GitHub so it's always in sync

### Token Security
Your token is stored in your browser's `localStorage` only — it is never sent anywhere except directly to `api.github.com`. For a public repo with one admin, this is the standard approach.

> ⚠️ Don't share your screen while the Admin panel is open, as the token is visible in the form.
