# DUPR Estimator (GitHub Pages Ready)

This project is structured for static hosting on GitHub Pages.

## Project Structure

- `index.html` - main web app entry
- `assets/css/styles.css` - styling
- `assets/js/app.js` - parser, estimator, charts, UI logic
- `assets/js/wrapped.js` - Wrapped generator/view/download
- `assets/images/tutorial.png` - tutorial image shown on page
- `data/` - sample data files
- `archive/` - legacy Python scripts kept for reference

## Run Locally

Open `index.html` in a browser, or serve the folder with any static server.

## Publish to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open **Settings** -> **Pages**.
3. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or default)
   - **Folder**: `/ (root)`
4. Save and wait for deployment.
5. Open:
   - `https://<your-username>.github.io/<repo-name>/`

## Notes

- Everything runs client-side (no backend needed).
- Wrapped export/view and charts are fully static-hosting compatible.
- 100% of this codebase was written by AI.
