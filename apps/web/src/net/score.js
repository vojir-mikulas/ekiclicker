/* Sestaví skóre payload (pole z @ekiclicker/shared) z herního stavu. */
export function buildScore(state) {
  return {
    highestLevel: state.highestLevel,
    totalGold: state.stats.totalGold,
    kills: state.stats.kills,
    bossKills: state.stats.bossKills,
    rebirths: state.prestige.rebirths,
    maxCombo: state.stats.maxCombo,
    playTimeMs: state.stats.playTimeMs,
    achievements: Object.keys(state.achievements).length,
    peakDps: state.stats.peakDps || 0,
    hellBestFloor: state.hell?.bestFloor || 0, // rekord hloubky výtahu (kolektivní cechový žebříček)
  };
}
