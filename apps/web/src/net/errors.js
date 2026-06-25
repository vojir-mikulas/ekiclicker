/* Převede chybu z API na českou hlášku pro uživatele. */
export function accountErrorMessage(e) {
  switch (e?.code) {
    case 'nickname_taken': return 'Tahle přezdívka je už obsazená.';
    case 'nickname_invalid': return e.message || 'Neplatná přezdívka.';
    case 'ip_cap': return 'Z této sítě dnes vzniklo příliš mnoho účtů. Zkus to později.';
    case 'rename_throttled': return 'Přejmenovat se dá jen jednou za hodinu.';
    case 'not_found': return 'Kód pro obnovu nesedí na žádný účet.';
    case 'unauthorized': return 'Účet už neplatí — připoj se znovu.';
    case 'network':
    case 'db_unavailable': return 'Server je nedostupný. Zkus to za chvíli.';
    default: return e?.message || 'Něco se nepovedlo.';
  }
}
