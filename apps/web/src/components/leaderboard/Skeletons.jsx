/* Skeletony žebříčku a sezón — drží layout, dokud nedorazí data, takže místo
   prázdna / „bliku" vidíš okamžitě tvar obsahu. Čistě CSS shimmer (žádný shadcn —
   projekt nepoužívá Tailwind). */

function Bar({ w, h = 14, className = '' }) {
  return <span className={'skeleton ' + className} style={{ width: w, height: h }} />;
}

/* Šířky jmen cyklíme podle indexu → řádky vypadají různorodě (a deterministicky). */
const NICK_W = ['62%', '48%', '74%', '40%', '58%', '52%', '68%', '44%'];

export function BoardSkeleton({ rows = 8 }) {
  return (
    <table className="board-table board-skeleton" aria-hidden="true">
      <thead>
        <tr><th>#</th><th>Hráč</th><th>&nbsp;</th></tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            <td className="rank"><Bar w={18} h={16} /></td>
            <td className="nick"><Bar w={NICK_W[i % NICK_W.length]} /></td>
            <td className="val"><Bar w={60} h={16} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PodiumSkeleton() {
  return (
    <div className="podium podium-skeleton" aria-hidden="true">
      {[2, 1, 3].map((r) => (
        <div key={r} className={'podium-spot rank-' + r}>
          <Bar w={r === 1 ? 36 : 28} h={r === 1 ? 36 : 28} className="sk-circle" />
          <Bar w="72%" h={14} />
          <Bar w="50%" h={10} />
          <Bar w="56%" h={14} />
        </div>
      ))}
    </div>
  );
}

export function SeasonBannerSkeleton() {
  return (
    <div className="season-banner live" aria-hidden="true">
      <div className="sb-head">
        <Bar w={90} h={11} />
        <Bar w="55%" h={40} className="sk-title" />
        <Bar w={140} h={12} />
      </div>
      <div className="sb-podium-label"><Bar w={110} h={11} /></div>
      <PodiumSkeleton />
    </div>
  );
}
