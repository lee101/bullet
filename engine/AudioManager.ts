
export type MusicCategory = 'menu' | 'battle' | 'town' | 'boss' | 'explore';

interface TrackInfo {
  path: string;
  audio: HTMLAudioElement;
}

export class AudioManager {
  private tracksByCategory: Map<MusicCategory, TrackInfo[]> = new Map();
  private currentCategory: MusicCategory | null = null;
  private currentTrackIndex: number = 0;
  private masterVolume: number = 0.5;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;
  private trackSwitchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadTracks();
  }

  private loadTracks() {
    // Multiple tracks per category for variety
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
        audio.loop = false; // We'll handle looping manually to crossfade
        audio.volume = 0;
        audio.preload = 'auto';
        audio.addEventListener('ended', () => this.onTrackEnded(category as MusicCategory));
        return { path, audio };
      });
      this.tracksByCategory.set(category as MusicCategory, tracks);
    });
  }

  private onTrackEnded(category: MusicCategory) {
    if (this.currentCategory !== category) return;
    // Crossfade to next track in category
    this.playNextInCategory();
  }

  private playNextInCategory() {
    if (!this.currentCategory) return;
    const tracks = this.tracksByCategory.get(this.currentCategory);
    if (!tracks || tracks.length === 0) return;

    const currentTrack = tracks[this.currentTrackIndex];
    const nextIndex = (this.currentTrackIndex + 1) % tracks.length;
    const nextTrack = tracks[nextIndex];

    // Crossfade between tracks
    this.crossfade(currentTrack.audio, nextTrack.audio, 2000);
    this.currentTrackIndex = nextIndex;
  }

  public play(category: MusicCategory) {
    if (this.currentCategory === category) return;

    const tracks = this.tracksByCategory.get(category);
    if (!tracks || tracks.length === 0) return;

    // Stop current category
    if (this.currentCategory) {
      const oldTracks = this.tracksByCategory.get(this.currentCategory);
      if (oldTracks) {
        oldTracks.forEach(t => this.fadeOut(t.audio, 1500));
      }
    }

    // Pick random track from category
    this.currentTrackIndex = Math.floor(Math.random() * tracks.length);
    const newTrack = tracks[this.currentTrackIndex];

    this.currentCategory = category;
    newTrack.audio.currentTime = 0;
    newTrack.audio.play().catch(() => {});
    this.fadeIn(newTrack.audio, 2000);
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
      // Use equal-power crossfade for smoother transitions
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
}

export const audioManager = new AudioManager();
