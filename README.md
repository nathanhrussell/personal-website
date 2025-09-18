# personal-website

Personal portfolio — single page site built with vanilla HTML, Tailwind CDN, and a small `script.js`.

Local preview:

Open `index.html` in a browser or serve the folder with a simple static server, e.g.:

```bash
python3 -m http.server 8000
```

Notes:
- Theme is controlled by `data-theme` on `<html>` and persisted to `localStorage`.
- Scroll reveals use a single IntersectionObserver for elements with `data-reveal`.
- The GitHub contribution graph is a lightweight SVG drawn in `script.js` (random demo data).

Deployment:
- Push to `main` and enable GitHub Pages for the repository named `USERNAME.github.io`.

Assets:
- Add images to `/assets/img` and icons to `/assets/icons`.

See `TODO.md` for the remaining checklist.
# personal-website