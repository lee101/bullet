
export type MusicTrack = 'menu' | 'battle' | 'town' | 'boss';

export class AudioManager {
  private tracks: Map<MusicTrack, HTMLAudioElement> = new Map();
  private currentTrack: MusicTrack | null = null;
  private masterVolume: number = 0.5;
  private fadeInterval: number | null = null;

  constructor() {
    this.loadTracks();
  }

  private loadTracks() {
    const trackFiles: Record<MusicTrack, string> = {
      menu: '/music/menu.mp3',
      battle: '/music/battle.mp3',
      town: '/music/town.mp3',
      boss: '/music/boss.mp3'
    };

    Object.entries(trackFiles).forEach(([name, path]) => {
      const audio = new Audio(path);
      audio.loop = true;
      audio.volume = 0;
      audio.preload = 'auto';
      this.tracks.set(name as MusicTrack, audio);
    });
  }

  public play(track: MusicTrack) {
    if (this.currentTrack === track) return;

    const newAudio = this.tracks.get(track);
    if (!newAudio) return;

    // Fade out current track
    if (this.currentTrack) {
      const oldAudio = this.tracks.get(this.currentTrack);
      if (oldAudio) this.fadeOut(oldAudio);
    }

    // Fade in new track
    this.currentTrack = track;
    newAudio.currentTime = 0;
    newAudio.play().catch(() => {});
    this.fadeIn(newAudio);
  }

  public stop() {
    if (this.currentTrack) {
      const audio = this.tracks.get(this.currentTrack);
      if (audio) {
        this.fadeOut(audio, () => {
          audio.pause();
          audio.currentTime = 0;
        });
      }
      this.currentTrack = null;
    }
  }

  private fadeIn(audio: HTMLAudioElement, duration: number = 1000) {
    const startVolume = 0;
    const targetVolume = this.masterVolume;
    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = (targetVolume - startVolume) / steps;

    audio.volume = startVolume;
    let currentStep = 0;

    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.min(targetVolume, startVolume + volumeStep * currentStep);
      if (currentStep >= steps) clearInterval(fade);
    }, stepTime);
  }

  private fadeOut(audio: HTMLAudioElement, onComplete?: () => void, duration: number = 500) {
    const startVolume = audio.volume;
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
    if (this.currentTrack) {
      const audio = this.tracks.get(this.currentTrack);
      if (audio) audio.volume = this.masterVolume;
    }
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public getCurrentTrack(): MusicTrack | null {
    return this.currentTrack;
  }
}

export const audioManager = new AudioManager();
