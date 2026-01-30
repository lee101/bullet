import { CharacterProgress, Challenge } from '../types';
import { CHALLENGES, STARTER_CHARACTERS } from '../constants';

const STORAGE_KEY = 'bullet_game_progress';

export class ProgressManager {
  private static instance: ProgressManager;
  private progress: CharacterProgress;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueued = false;

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
        const parsed = JSON.parse(data) as CharacterProgress;
        if (!parsed.challengeProgress) parsed.challengeProgress = {};
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
    return {
      unlockedCharacters: STARTER_CHARACTERS.map(c => c.id),
      completedChallenges: [],
      challengeProgress: {},
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }

  private queueSave(): void {
    this.saveQueued = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.saveQueued) {
        this.saveQueued = false;
        this.save();
      }
    }, 500);
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
      this.queueSave();
    }
  }

  public completeChallenge(challengeId: string): string | null {
    if (this.progress.completedChallenges.includes(challengeId)) return null;
    this.progress.completedChallenges.push(challengeId);
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (challenge) {
      this.unlockCharacter(challenge.unlocksCharacter);
      this.queueSave();
      return challenge.unlocksCharacter;
    }
    this.queueSave();
    return null;
  }

  public getChallengeProgress(challengeId: string): number {
    if (!this.progress.challengeProgress) this.progress.challengeProgress = {};
    return this.progress.challengeProgress[challengeId] || 0;
  }

  public setChallengeProgress(challengeId: string, value: number): string | null {
    if (!this.progress.challengeProgress) this.progress.challengeProgress = {};
    this.progress.challengeProgress[challengeId] = value;
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (challenge?.condition.amount && value >= challenge.condition.amount) {
      return this.completeChallenge(challengeId);
    }
    this.queueSave();
    return null;
  }

  public addChallengeProgress(challengeId: string, amount: number = 1): string | null {
    if (this.progress.completedChallenges.includes(challengeId)) return null;
    if (!this.progress.challengeProgress) this.progress.challengeProgress = {};
    const next = (this.progress.challengeProgress[challengeId] || 0) + amount;
    this.progress.challengeProgress[challengeId] = next;

    const challenge = CHALLENGES.find(c => c.id === challengeId);
    const required = challenge?.condition.amount ?? 1;
    if (next >= required) {
      return this.completeChallenge(challengeId);
    }
    this.queueSave();
    return null;
  }

  public getUnlockedCharacters(): string[] {
    return [...this.progress.unlockedCharacters];
  }

  public reset(): void {
    this.progress = {
      unlockedCharacters: STARTER_CHARACTERS.map(c => c.id),
      completedChallenges: [],
      challengeProgress: {},
    };
    this.save();
  }
}

export const progressManager = ProgressManager.getInstance();
