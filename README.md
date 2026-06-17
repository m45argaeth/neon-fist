# 🥊 NEON FIST

A compact **HTML5 fighting game** with a Tekken / Street Fighter vibe — built in pure vanilla JavaScript on a `<canvas>`. No assets, no dependencies, no build step. Just open and brawl.

![status](https://img.shields.io/badge/built%20with-vanilla%20JS-00e5ff) ![license](https://img.shields.io/badge/license-MIT-ff2e88)

## ✨ Features

- Best-of-3 rounds with health bars, round timer and win pips
- Punch, kick, **block**, jump, and a chargeable **special projectile** (hadouken-style)
- A super meter that fills over time and when you take hits
- 1P vs CPU with simple AI, or local **2-player** mode
- Procedurally drawn neon fighters, particles, screen shake, and a parallax synthwave arena

## 🎮 Controls

| Action | Player 1 | Player 2 / CPU |
|---|---|---|
| Move | `A` / `D` | `←` / `→` |
| Jump | `W` | `↑` |
| Block | `S` | `↓` |
| Punch | `F` | `K` |
| Kick | `G` | `L` |
| Special | `H` | `;` |

- `Enter` — start / rematch
- `T` — toggle 1P vs CPU / 2 players (on the title screen)

## ▶️ Run it

Just open `index.html` in any modern browser. Or serve locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 📁 Structure

```
index.html   # page + styles + controls hint
game.js      # the whole game engine
```

## 📜 License

MIT — do whatever you want. Have fun!
