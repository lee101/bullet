
export type MusicCategory = 'menu' | 'battle' | 'town' | 'boss' | 'explore';

interface TrackInfo {
  path: string;
  audio: HTMLAudioElement;
  source?: MediaElementAudioSourceNode;
}

export class AudioManager {
  private tracksByCategory: Map<MusicCategory, TrackInfo[]> = new Map();
  private currentCategory: MusicCategory | null = null;
  private currentTrackIndex: number = 0;
  private masterVolume: number = 0.5;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;

  // Web Audio API for procedural effects
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private convolver: ConvolverNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;

  // Boss blend state
  private bossBlendLevel: number = 0;
  private bossBlendTarget: number = 0;
  private bossTrackGain: GainNode | null = null;
  private battleTrackGain: GainNode | null = null;
  private isBossBlending: boolean = false;
  private currentBossTrack: HTMLAudioElement | null = null;
  private currentBattleTrack: HTMLAudioElement | null = null;

  constructor() {
    this.loadTracks();
  }

  private initAudioContext() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();

    // Master gain
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.masterVolume;

    // Lowpass filter for underwater/danger effects
    this.lowpassFilter = this.audioContext.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 20000;
    this.lowpassFilter.Q.value = 1;

    // Highpass for tension
    this.highpassFilter = this.audioContext.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = 20;
    this.highpassFilter.Q.value = 1;

    // Reverb dry/wet mix
    this.dryGain = this.audioContext.createGain();
    this.dryGain.gain.value = 1;
    this.wetGain = this.audioContext.createGain();
    this.wetGain.gain.value = 0;

    // Create impulse response for reverb
    this.convolver = this.audioContext.createConvolver();
    this.createReverbImpulse(2, 2);

    // Boss/battle blend gains
    this.battleTrackGain = this.audioContext.createGain();
    this.bossTrackGain = this.audioContext.createGain();
    this.battleTrackGain.gain.value = 1;
    this.bossTrackGain.gain.value = 0;

    // Chain: source -> blend gains -> filters -> dry/wet -> master -> destination
    this.battleTrackGain.connect(this.lowpassFilter);
    this.bossTrackGain.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.highpassFilter);
    this.highpassFilter.connect(this.dryGain);
    this.highpassFilter.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.dryGain.connect(this.masterGain);
    this.wetGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  private createReverbImpulse(duration: number, decay: number) {
    if (!this.audioContext || !this.convolver) return;
    const rate = this.audioContext.sampleRate;
    const length = rate * duration;
    const impulse = this.audioContext.createBuffer(2, length, rate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    this.convolver.buffer = impulse;
  }

  private loadTracks() {
    const trackFiles: Record<MusicCategory, string[]> = {
      menu: ['/music/menu.mp3', '/music/menu2.mp3'],
      battle: ['/music/battle.mp3', '/music/battle2.mp3', '/music/battle3.mp3'],
      town: ['/music/town.mp3', '/music/town2.mp3'],
      boss: ['/music/boss.mp3', '/music/boss2.mp3'],
      explore: ['/music/explore.mp3', '/music/explore2.mp3']
    };

    Object.entries(trackFiles).forEach(([category, paths]) => {
      const tracks: TrackInfo[] = paths.map(path => {
        const audio = new Audio(path);
        audio.loop = false;
        audio.volume = 0;
        audio.preload = 'auto';
        audio.addEventListener('ended', () => this.onTrackEnded(category as MusicCategory));
        return { path, audio };
      });
      this.tracksByCategory.set(category as MusicCategory, tracks);
    });
  }

  private connectTrackToContext(track: TrackInfo, gainNode: GainNode) {
    if (!this.audioContext || track.source) return;
    track.source = this.audioContext.createMediaElementSource(track.audio);
    track.source.connect(gainNode);
  }

  private onTrackEnded(category: MusicCategory) {
    if (this.currentCategory !== category) return;
    this.playNextInCategory();
  }

  private playNextInCategory() {
    if (!this.currentCategory) return;
    const tracks = this.tracksByCategory.get(this.currentCategory);
    if (!tracks || tracks.length === 0) return;

    const currentTrack = tracks[this.currentTrackIndex];
    const nextIndex = (this.currentTrackIndex + 1) % tracks.length;
    const nextTrack = tracks[nextIndex];

    this.crossfade(currentTrack.audio, nextTrack.audio, 2000);
    this.currentTrackIndex = nextIndex;
  }

  public play(category: MusicCategory) {
    if (this.currentCategory === category) return;
    this.initAudioContext();

    const tracks = this.tracksByCategory.get(category);
    if (!tracks || tracks.length === 0) return;

    if (this.currentCategory) {
      const oldTracks = this.tracksByCategory.get(this.currentCategory);
      if (oldTracks) {
        oldTracks.forEach(t => this.fadeOut(t.audio, 1500));
      }
    }

    // Stop boss blending when switching categories
    if (this.isBossBlending && category !== 'battle' && category !== 'boss') {
      this.stopBossBlend();
    }

    this.currentTrackIndex = Math.floor(Math.random() * tracks.length);
    const newTrack = tracks[this.currentTrackIndex];

    this.currentCategory = category;
    newTrack.audio.currentTime = 0;
    newTrack.audio.volume = this.masterVolume;
    newTrack.audio.play().catch(() => {});
    this.fadeIn(newTrack.audio, 2000);
  }

  // Boss music blending - smoothly blend boss track over battle
  public blendBossMusic(intensity: number) {
    this.initAudioContext();
    if (!this.audioContext || !this.battleTrackGain || !this.bossTrackGain) return;

    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    this.bossBlendTarget = clampedIntensity;

    if (!this.isBossBlending && clampedIntensity > 0) {
      this.startBossBlend();
    } else if (this.isBossBlending && clampedIntensity === 0) {
      this.endBossBlend();
    }

    // Smooth transition
    const smoothing = 0.05;
    this.bossBlendLevel += (this.bossBlendTarget - this.bossBlendLevel) * smoothing;

    // Equal power crossfade
    const battleVol = Math.cos(this.bossBlendLevel * Math.PI / 2);
    const bossVol = Math.sin(this.bossBlendLevel * Math.PI / 2);

    this.battleTrackGain.gain.setTargetAtTime(battleVol, this.audioContext.currentTime, 0.1);
    this.bossTrackGain.gain.setTargetAtTime(bossVol, this.audioContext.currentTime, 0.1);
  }

  private startBossBlend() {
    if (this.isBossBlending) return;
    this.isBossBlending = true;

    const bossTracks = this.tracksByCategory.get('boss');
    const battleTracks = this.tracksByCategory.get('battle');
    if (!bossTracks || !battleTracks || !this.bossTrackGain || !this.battleTrackGain) return;

    // Pick random boss track
    const bossTrack = bossTracks[Math.floor(Math.random() * bossTracks.length)];
    this.currentBossTrack = bossTrack.audio;
    this.connectTrackToContext(bossTrack, this.bossTrackGain);

    // Connect current battle track if playing
    if (this.currentCategory === 'battle') {
      const battleTrack = battleTracks[this.currentTrackIndex];
      this.currentBattleTrack = battleTrack.audio;
      this.connectTrackToContext(battleTrack, this.battleTrackGain);
    }

    bossTrack.audio.currentTime = 0;
    bossTrack.audio.volume = this.masterVolume;
    bossTrack.audio.play().catch(() => {});
  }

  private endBossBlend() {
    if (!this.isBossBlending) return;
    this.isBossBlending = false;

    if (this.currentBossTrack) {
      this.fadeOut(this.currentBossTrack, 1500, () => {
        this.currentBossTrack?.pause();
        this.currentBossTrack = null;
      });
    }
  }

  private stopBossBlend() {
    this.isBossBlending = false;
    this.bossBlendLevel = 0;
    this.bossBlendTarget = 0;
    if (this.currentBossTrack) {
      this.currentBossTrack.pause();
      this.currentBossTrack = null;
    }
  }

  // Procedural effects
  public setLowpassFrequency(freq: number) {
    if (!this.lowpassFilter || !this.audioContext) return;
    const clampedFreq = Math.max(200, Math.min(20000, freq));
    this.lowpassFilter.frequency.setTargetAtTime(clampedFreq, this.audioContext.currentTime, 0.1);
  }

  public setHighpassFrequency(freq: number) {
    if (!this.highpassFilter || !this.audioContext) return;
    const clampedFreq = Math.max(20, Math.min(2000, freq));
    this.highpassFilter.frequency.setTargetAtTime(clampedFreq, this.audioContext.currentTime, 0.1);
  }

  public setReverbMix(wet: number) {
    if (!this.dryGain || !this.wetGain || !this.audioContext) return;
    const clampedWet = Math.max(0, Math.min(1, wet));
    this.dryGain.gain.setTargetAtTime(1 - clampedWet * 0.5, this.audioContext.currentTime, 0.1);
    this.wetGain.gain.setTargetAtTime(clampedWet, this.audioContext.currentTime, 0.1);
  }

  // Preset effects
  public applyDangerEffect(intensity: number) {
    const freq = 20000 - (intensity * 15000);
    this.setLowpassFrequency(freq);
    this.setReverbMix(intensity * 0.3);
  }

  public applyUnderwaterEffect(depth: number) {
    const freq = 20000 - (depth * 18000);
    this.setLowpassFrequency(freq);
    this.setHighpassFrequency(20 + depth * 100);
    this.setReverbMix(depth * 0.5);
  }

  public clearEffects() {
    this.setLowpassFrequency(20000);
    this.setHighpassFrequency(20);
    this.setReverbMix(0);
  }

  public stop() {
    if (this.currentCategory) {
      const tracks = this.tracksByCategory.get(this.currentCategory);
      if (tracks) {
        tracks.forEach(t => {
          this.fadeOut(t.audio, 500, () => {
            t.audio.pause();
            t.audio.currentTime = 0;
          });
        });
      }
      this.currentCategory = null;
    }
    this.stopBossBlend();
  }

  private crossfade(fromAudio: HTMLAudioElement, toAudio: HTMLAudioElement, duration: number = 2000) {
    const steps = 40;
    const stepTime = duration / steps;
    let currentStep = 0;
    const fromStartVol = fromAudio.volume;

    toAudio.currentTime = 0;
    toAudio.volume = 0;
    toAudio.play().catch(() => {});

    if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);

    this.crossfadeInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      fromAudio.volume = Math.max(0, fromStartVol * Math.cos(progress * Math.PI / 2));
      toAudio.volume = Math.min(this.masterVolume, this.masterVolume * Math.sin(progress * Math.PI / 2));

      if (currentStep >= steps) {
        if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
        fromAudio.pause();
        fromAudio.currentTime = 0;
      }
    }, stepTime);
  }

  private fadeIn(audio: HTMLAudioElement, duration: number = 1000) {
    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = this.masterVolume / steps;

    audio.volume = 0;
    let currentStep = 0;

    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.min(this.masterVolume, volumeStep * currentStep);
      if (currentStep >= steps) clearInterval(fade);
    }, stepTime);
  }

  private fadeOut(audio: HTMLAudioElement, duration: number = 500, onComplete?: () => void) {
    const startVolume = audio.volume;
    if (startVolume === 0) {
      audio.pause();
      if (onComplete) onComplete();
      return;
    }

    const steps = 10;
    const stepTime = duration / steps;
    const volumeStep = startVolume / steps;

    let currentStep = 0;

    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.max(0, startVolume - volumeStep * currentStep);
      if (currentStep >= steps) {
        clearInterval(fade);
        audio.pause();
        if (onComplete) onComplete();
      }
    }, stepTime);
  }

  public setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.audioContext.currentTime, 0.05);
    }
    if (this.currentCategory) {
      const tracks = this.tracksByCategory.get(this.currentCategory);
      if (tracks) {
        tracks.forEach(t => {
          if (!t.audio.paused) t.audio.volume = this.masterVolume;
        });
      }
    }
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public getCurrentTrack(): MusicCategory | null {
    return this.currentCategory;
  }

  public getBossBlendLevel(): number {
    return this.bossBlendLevel;
  }
}

export const audioManager = new AudioManager();
