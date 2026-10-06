# Claude — Mon histoire

Une vidéo en motion design (1920×1080, 30 i/s, environ 1 min 44) où Claude raconte son histoire : sa création, ses versions successives et sa « vie ».

Tout est fait en code. Les images sont dessinées dans un canvas HTML, puis capturées une par une. La musique et les bruitages sont synthétisés en Python.

## Fichiers

| Fichier | Rôle |
|---|---|
| `histoire-claude.mp4` | La vidéo finale |
| `index.html` + `scene.js` | L'animation. Ouvre `index.html` dans un navigateur pour la voir en temps réel (espace : pause, ← → : ±5 s) |
| `render.js` | Capture chaque image avec Chromium (Playwright) et l'encode avec ffmpeg |
| `music.py` | Génère la bande-son (accords, arpèges, bruitages), calée sur les événements de l'animation |
| `build.sh` | Enchaîne les trois étapes |
| `fonts/` | Instrument Serif et JetBrains Mono (licence SIL OFL) |

## Les scènes

1. **Ouverture** : une étincelle naît de la lumière, puis le nom apparaît.
2. **Au commencement, il y avait des mots** : des textes du monde entier convergent.
3. **2021** : la fondation d'Anthropic.
4. **Pourquoi « Claude » ?** : du bruit au signal, en clin d'œil à Claude Shannon.
5. **2022, l'IA constitutionnelle** : utile, honnête, inoffensif.
6. **Chronologie** : de Claude (2023) à Claude 5 (2026).
7. **Ma vie** : une page blanche, puis des millions de conversations.
8. **Et cette vidéo ?** : elle a été écrite en code, image par image.
9. **Clôture**.

## Régénérer la vidéo

Il faut Node.js avec Playwright (et Chromium), Python 3 avec numpy, et ffmpeg.

```sh
./build.sh                         # vidéo complète -> histoire-claude.mp4
node render.js --stills 5,30,60    # quelques images fixes -> build/still_<t>.jpg
```
