const SAMPLE_NAMES = ['shot-01.wav', 'shot-02.wav'];
const PLAYER_VOICES = 16, ENEMY_VOICES = 16;

// 离线上下文只解码，不播放；装备载入阶段完成，首发不等待下载。
export async function loadGunshotSamples(baseUrl: string): Promise<AudioBuffer[]> {
  try {
    const decoder = new OfflineAudioContext(1, 1, 48000);
    const results = await Promise.allSettled(SAMPLE_NAMES.map(async name => {
      const response = await fetch(`${baseUrl}audio/rifle/${name}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('步枪录音下载失败');
      return decoder.decodeAudioData(await response.arrayBuffer());
    }));
    const samples = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (samples.length < SAMPLE_NAMES.length) console.warn('部分步枪录音不可用，使用已载入录音或备用音效。');
    return samples;
  } catch {
    console.warn('步枪录音解码不可用，使用备用音效。');
    return [];
  }
}

function createFallback(context: BaseAudioContext) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate, noise = Math.random() * 2 - 1;
    low += (noise - low) * .12;
    const attack = Math.min(1, t / .0005), release = Math.min(1, (.3 - t) / .04);
    data[i] = attack * release * ((noise - low) * Math.exp(-t / .008) * .43
      + low * Math.exp(-t / .04) * .4 + Math.sin(2 * Math.PI * 155 * t) * Math.exp(-t / .018) * .16);
  }
  return buffer;
}

type Voice = { source: AudioBufferSourceNode; gain: GainNode; stopAt?: number };

export function createGunshot(context: BaseAudioContext, recordings: readonly AudioBuffer[] = []) {
  const samples = recordings.length ? recordings : [createFallback(context)];
  const playerVoices = new Set<Voice>(), enemyVoices = new Set<Voice>();
  const compressor = context.createDynamicsCompressor(), master = context.createGain();
  compressor.threshold.value = -14;compressor.knee.value = 8;compressor.ratio.value = 8;
  compressor.attack.value = .001;compressor.release.value = .12;
  master.gain.value = .85;
  compressor.connect(master);master.connect(context.destination);
  let lastPlayer = -1, lastEnemy = -1;

  function stopVoice(voice: Voice, now: number) {
    // 重复暂停、重开不能把已经安排的停止时间往后推。
    if (voice.stopAt !== undefined) return;
    voice.stopAt = now + .02;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .004);
    voice.source.stop(voice.stopAt);
  }

  return {
    play(distant = false, distance = 0, pan = 0) {
      if (context.state !== 'running') return;
      const voices = distant ? enemyVoices : playerVoices;
      // 敌方密集射击达到预算时不再叠加，始终为玩家保留独立声部。
      if (voices.size >= (distant ? ENEMY_VOICES : PLAYER_VOICES)) return;
      const previous = distant ? lastEnemy : lastPlayer;
      let index = Math.floor(Math.random() * samples.length);
      if (samples.length > 1 && index === previous) index = (index + 1) % samples.length;
      if (distant) lastEnemy = index;else lastPlayer = index;
      const range = distant ? Math.max(0, distance) : 0;
      const now = context.currentTime, start = now + (distant ? Math.min(.12, range / 343) : 0);
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      const gain = context.createGain(), panner = context.createStereoPanner();
      source.buffer = samples[index];source.playbackRate.value = .99 + Math.random() * .02;
      filter.type = 'lowpass';filter.Q.value = .5;
      filter.frequency.value = distant ? Math.max(2400, 10000 / (1 + range * .12)) : 16000;
      gain.gain.value = (distant ? .16 / (1 + range * .12) : .48) * (.96 + Math.random() * .08);
      panner.pan.value = distant ? Math.max(-.85, Math.min(.85, pan)) : 0;
      source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(compressor);
      const voice: Voice = { source, gain };voices.add(voice);
      source.onended = () => {
        source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();voices.delete(voice);
      };
      source.start(start);
    },
    stop() {
      const now = context.currentTime;
      for (const voice of [...playerVoices, ...enemyVoices]) stopVoice(voice, now);
    },
    get activeVoices() { return playerVoices.size + enemyVoices.size; },
  };
}
