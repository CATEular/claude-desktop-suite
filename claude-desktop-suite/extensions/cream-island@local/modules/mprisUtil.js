/* modules/mprisUtil.js
 * Utility functions for local Bilibili MPRIS identification, scoring, and time formatting.
 */

function isBilibiliClientName(name) {
    if (typeof name !== 'string') return false;
    let lower = name.toLowerCase();
    return (lower.includes('bilibili') && !lower.includes('bilibili_web')) || lower.includes('io.github.msojocs.bilibili');
}

function scorePlayerName(name) {
    if (typeof name !== 'string') return 0;
    let lower = name.toLowerCase();
    if (isBilibiliClientName(name)) return 100;
    if (lower.includes('spotify') || lower.includes('rhythmbox') || lower.includes('vlc')) return 60;
    if (lower.includes('chromium') || lower.includes('chrome')) return 50;
    if (lower.includes('firefox')) return 40;
    return 10;
}

function prioritizePlayerNames(names) {
    if (!Array.isArray(names)) return [];
    return names.slice().sort((a, b) => {
        let scoreA = scorePlayerName(a);
        let scoreB = scorePlayerName(b);
        return scoreB - scoreA;
    });
}

function formatSeconds(sec) {
    let s = Math.max(0, Math.floor(sec || 0));
    let m = Math.floor(s / 60);
    let remainder = s % 60;
    return ('0' + m).slice(-2) + ':' + ('0' + remainder).slice(-2);
}

var MprisUtil = {
    isBilibiliClientName: isBilibiliClientName,
    scorePlayerName: scorePlayerName,
    prioritizePlayerNames: prioritizePlayerNames,
    formatSeconds: formatSeconds
};
