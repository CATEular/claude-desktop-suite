/* tests/test_mpris.js
 * Unit test verifying production MPRIS prioritization and utilities (modules/mprisUtil.js).
 */

imports.searchPath.unshift('.');
const MprisUtilModule = imports.modules.mprisUtil;
const MprisUtil = MprisUtilModule.MprisUtil;

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runMprisTests() {
    print('--- Testing Production MPRIS Utility (modules/mprisUtil.js) ---');

    // 1. Test isBilibiliClientName
    assert(MprisUtil.isBilibiliClientName('org.mpris.MediaPlayer2.io.github.msojocs.bilibili') === true, 'bilibili desktop client should be true');
    assert(MprisUtil.isBilibiliClientName('org.mpris.MediaPlayer2.bilibili') === true, 'bilibili service should be true');
    assert(MprisUtil.isBilibiliClientName('org.mpris.MediaPlayer2.bilibili_web') === false, 'web bridge should be rejected');
    assert(MprisUtil.isBilibiliClientName('org.mpris.MediaPlayer2.chromium.instance123') === false, 'unverified chromium should be false');

    // 2. Test scorePlayerName directly on production module
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.io.github.msojocs.bilibili') === 100, 'bilibili client score should be 100');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.rhythmbox') === 60, 'rhythmbox score should be 60');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.vlc') === 60, 'vlc score should be 60');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.chromium.instance123') === 50, 'chromium score should be 50');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.google-chrome.instance123') === 50, 'chrome score should be 50');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.firefox.instance456') === 40, 'firefox score should be 40');
    assert(MprisUtil.scorePlayerName('org.mpris.MediaPlayer2.unknown_player') === 10, 'unknown player score should be 10');
    assert(MprisUtil.scorePlayerName(null) === 0, 'null should return 0');

    // 3. Test prioritizePlayerNames directly on production module
    let players = [
        'org.mpris.MediaPlayer2.unknown_player',
        'org.mpris.MediaPlayer2.chromium.instance558256',
        'org.mpris.MediaPlayer2.rhythmbox',
        'org.mpris.MediaPlayer2.firefox.instance1234',
        'org.mpris.MediaPlayer2.io.github.msojocs.bilibili'
    ];

    let sorted = MprisUtil.prioritizePlayerNames(players);

    assert(sorted[0] === 'org.mpris.MediaPlayer2.io.github.msojocs.bilibili', 'bilibili client must be first');
    assert(sorted[1] === 'org.mpris.MediaPlayer2.rhythmbox', 'rhythmbox must be second');
    assert(sorted[2] === 'org.mpris.MediaPlayer2.chromium.instance558256', 'chromium must be third');
    assert(sorted[3] === 'org.mpris.MediaPlayer2.firefox.instance1234', 'firefox must be fourth');
    assert(sorted[4] === 'org.mpris.MediaPlayer2.unknown_player', 'unknown player must be last');

    // 4. Test formatSeconds directly on production module
    assert(MprisUtil.formatSeconds(0) === '00:00', '0 should format to 00:00');
    assert(MprisUtil.formatSeconds(65) === '01:05', '65 should format to 01:05');
    assert(MprisUtil.formatSeconds(3600) === '60:00', '3600 should format to 60:00');
    assert(MprisUtil.formatSeconds(-10) === '00:00', 'negative seconds should clamp to 00:00');

    print('Prioritized order: ' + JSON.stringify(sorted));
    print('✓ Production MprisUtil tests PASSED with 100% real module execution.');
}

runMprisTests();
