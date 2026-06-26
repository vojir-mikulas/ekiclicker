import { maskProfanity } from '@ekiclicker/shared';

/* Klíče, jejichž STRING hodnoty jsou hráčem zadaná jména (přezdívky, cechy, [TAG],
   odesílatel/příjemce, aktér/cíl ve feedu). Maskujeme je AŽ PŘI VÝSTUPU, takže i
   už uložená jména (vytvořená před zavedením filtru) se v žebříčcích apod. zacenzurují.
   maskProfanity je no-op nad čistým textem → bezpečné aplikovat plošně. */
// Jména končí na tato slova (chytá i camelCase: guildName, championNickname, byNick).
const NAME_SUFFIX = /(nick|name|tag|actor|target|champion)$/i;
// Krátké klíče jen PŘESNĚ — ať omylem nezamaskujeme "token" ("to") apod.
const NAME_EXACT = /^(by|from|to)$/i;

function isNameKey(key) {
  return NAME_EXACT.test(key) || NAME_SUFFIX.test(key);
}

/* Rekurzivně zamaskuje jména v libovolné JSON struktuře (vrací NOVOU strukturu). */
function censor(value, key) {
  if (typeof value === 'string') {
    return key && isNameKey(key) ? maskProfanity(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => censor(v, key));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = censor(value[k], k);
    return out;
  }
  return value;
}

/* Middleware: obalí res.json tak, aby každá odpověď prošla cenzurou jmen. */
export function censorResponse(_req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => original(censor(body, null));
  next();
}
