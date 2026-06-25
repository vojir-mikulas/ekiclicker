// Boční reklamní bannery 300×600.
// Zobrazí se jen na dostatečně širokých a vysokých obrazovkách (viz .side-banner v index.css),
// aby se vešly vedle herního obsahu (sloupec max 1080px) a nepřekrývaly ho.
// Na užších/mobilních displejích zůstávají skryté.

// name=gb 300x600 (ekiclicker.cz) – mezery a závorky URL-enkódované
const BANNER_SRC =
  'https://delivery.r2b2.cz/static/selfpromo/banner.html?name=gb%20300x600%20%28ekiclicker.cz%29';

function Banner() {
  return (
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
  );
}

export default function SideBanners() {
  return (
    <>
      <aside className="side-banner side-banner--left" aria-hidden="true">
        <div className="side-banner-inner" id="ad-left">
          <Banner />
        </div>
      </aside>
      <aside className="side-banner side-banner--right" aria-hidden="true">
        <div className="side-banner-inner" id="ad-right">
          <Banner />
        </div>
      </aside>
    </>
  );
}
