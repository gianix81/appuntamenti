# Genera le icone PWA

Crea due file PNG nella cartella `public/icons/`:

- `icon-192.png` — 192x192 pixel
- `icon-512.png` — 512x512 pixel

Suggerimento rapido: usa https://icon.kitchen o qualsiasi editor grafico.
Colore di sfondo consigliato: #f43f5e (rosa). Simbolo: forbici o fiore.

Oppure usa `sharp` da terminale:

```bash
npm install -g sharp-cli
sharp -i icon.svg -o public/icons/icon-192.png resize 192 192
sharp -i icon.svg -o public/icons/icon-512.png resize 512 512
```
