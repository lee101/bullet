import { CharacterProgress, Challenge } from '../types';
import { CHALLENGES, STARTER_CHARACTERS } from '../constants';

const STORAGE_KEY = 'bullet_game_progress';

export class ProgressManager {
  private static instance: ProgressManager;
  private progress: CharacterProgress;

  private constructor() {
    this.progress = this.load();
  }

  public static getInstance(): ProgressManager {
    if (!ProgressManager.instance) {
      ProgressManager.instance = new ProgressManager();
    }
    return ProgressManager.instance;
  }

  private load(): CharacterProgress {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
    return {
      unlockedCharacters: STARTER_CHARACTERS.map(c => c.id),
      completedChallenges: [],
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }

  public getProgress(): CharacterProgress {
    return { ...this.progress };
  }

  public isCharacterUnlocked(characterId: string): boolean {
    return this.progress.unlockedCharacters.includes(characterId);
  }

  public isChallengeCompleted(challengeId: string): boolean {
    return this.progress.completedChallenges.includes(challengeId);
  }

  public unlockCharacter(characterId: string): void {
    if (!this.progress.unlockedCharacters.includes(characterId)) {
      this.progress.unlockedCharacters.push(characterId);
      this.save();
    }
  }

  public completeChallenge(challengeId: string): string | null {
    if (this.progress.completedChallenges.includes(challengeId)) return null;
    this.progress.completedChallenges.push(challengeId);
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (challenge) {
      this.unlockCharacter(challenge.unlocksCharacter);
      this.save();
      return challenge.unlocksCharacter;
    }
    this.save();
    return null;
  }

  public getUnlockedCharacters(): string[] {
    return [...this.progress.unlockedCharacters];
  }

  public reset(): void {
    this.progress = {
      unlockedCharacters: STARTER_CHARACTERS.map(c => c.id),
      completedChallenges: [],
    };
    this.save();
  }
}

export const progressManager = ProgressManager.getInstance();
