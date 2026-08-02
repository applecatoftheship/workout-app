export type DateString = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export type ProgramType = 'strength' | 'cardio' | 'mobility' | 'rest' | 'recovery';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type FatigueLevel = 1 | 2 | 3 | 4 | 5;

export interface BaseRecord {
  id?: string;
  createdAt?: DateString;
  updatedAt?: DateString;
}

export interface Exercise extends BaseRecord {
  name: string;
  sets: number;
  targetReps: string;
  targetWeight?: string;
  restSeconds?: number;
  notes?: string;
}

export interface CardioPlan extends BaseRecord {
  durationMinutes: number;
  intensity: 'easy' | 'moderate' | 'hard';
  notes?: string;
}

export interface DailyProgram extends BaseRecord {
  date: DateString;
  type: ProgramType;
  title: string;
  description: string;
  exercises: Exercise[];
  cardio?: CardioPlan | null;
  notes?: string;
}

export interface MonthlyProgram extends BaseRecord {
  year: number;
  month: number;
  title: string;
  description: string;
  goals: string[];
  dailyPrograms: DailyProgram[];
}

export interface TrainingLog extends BaseRecord {
  date: DateString;
  exercises: Exercise[];
  cardio?: CardioPlan | null;
  notes?: string;
  completed: boolean;
}

export interface MealLog extends BaseRecord {
  date: DateString;
  mealType: MealType;
  foods: string[];
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  notes?: string;
}

export interface DailyCondition extends BaseRecord {
  date: DateString;
  weight: number;
  sleepHours: number;
  fatigue: FatigueLevel;
  notes?: string;
}

export interface ProgressRecord extends BaseRecord {
  date: DateString;
  weight: number;
  bodyFat?: number;
  waist?: number;
  notes?: string;
}

export interface AppDataModel extends BaseRecord {
  monthlyPrograms: MonthlyProgram[];
  trainingLogs: TrainingLog[];
  mealLogs: MealLog[];
  dailyConditions: DailyCondition[];
  progressRecords: ProgressRecord[];
}
