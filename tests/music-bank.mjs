import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMusicCatalogue, loadAudioCheckTrack } from '../backend/src/music.ts';
import { selectStaticTrack, selectInitialTrack, selectTransitionTrack, selectNextTrackInState } from '../backend/src/playbackPolicy.ts';
const manifest = JSON.parse(readFileSync(new URL('../config/playback-bank.json', import.meta.url), 'utf8'));
const catalogue = loadMusicCatalogue();
test('all approved replacement study WAV files load; comfort audio is isolated', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(catalogue).map(([key, tracks]) => [key, tracks.length])), {baseline:12, reduced:15, elevated:9});
    assert.equal(Object.values(catalogue).flat().length, manifest.tracks.length);
    const comfort = loadAudioCheckTrack();
    assert.equal(comfort.id, 'audio-check/B01.wav');
    assert.equal(comfort.relativeFilePath, 'music/Audio-Check/B01.wav');
    assert.ok(!Object.values(catalogue).flat().some(track => track.sourceSha256 === comfort.sourceSha256 || track.id === comfort.id));
    assert.ok(Object.values(catalogue).flat().every(track =>
        [track.integratedLoudnessLufs, track.truePeakDbtp].every(value => value === null || Number.isFinite(value))));
});
test('Static uses B09; all Adaptive entry, transition and continuation paths exclude B09 and comfort audio', () => {
    assert.equal(selectStaticTrack(catalogue).id, 'baseline/B09.wav');
    const allowed = new Set(manifest.tracks.map(track => track.id).filter(id => id !== 'baseline/B09.wav'));
    for (let i = 0; i < 100; i++) {
        const id = `bank-check-${i}`;
        assert.equal(selectInitialTrack(id, 2, 'Static music', catalogue).id, 'baseline/B09.wav');
        assert.ok(allowed.has(selectInitialTrack(id, 2, 'Adaptive music', catalogue).id));
        for (const state of ['baseline','reduced','elevated']) {
            assert.ok(allowed.has(selectTransitionTrack({id, musicDecisions:[]}, 2, state, null, catalogue).id));
            for (const track of catalogue[state].filter(track => allowed.has(track.id))) {
                const next = selectNextTrackInState(catalogue, state, track.id);
                assert.ok(allowed.has(next.id)); assert.notEqual(next.id, track.id);
            }
        }
    }
    assert.equal(selectInitialTrack('silent', 2, 'No music', catalogue), null);
});
