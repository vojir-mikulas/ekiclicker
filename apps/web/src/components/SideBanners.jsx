// Reklamní rail 300×600 — vsazený přímo do layoutu (pravý sloupec rámu),
// ne plovoucí fixed box. Drží se uvnitř 16:9 rámu vedle herního obsahu a
// na užších/mobilních displejích se přes CSS (.app-rail) skryje.

// name=hb 300x600 (ekiclicker.cz) – mezery a závorky URL-enkódované
const BANNER_SRC =
  'https://delivery.r2b2.cz/static/selfpromo/banner.html?name=hb%20300x600%20%28ekiclicker.cz%29';

export default function AdRail() {
  return (
    <aside className="app-rail" aria-hidden="true">
      <div className="app-rail-inner">
        <iframe
          className="side-banner-iframe"
          src={BANNER_SRC}
          title="Reklama 300×600"
          width="300"
          height="600"
          loading="lazy"
          scrolling="no"
          frameBorder="0"
        />
      </div>
    </aside>
  );
}
