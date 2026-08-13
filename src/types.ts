export type DateString = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type FatigueLevel = 1 | 2 | 3 | 4 | 5;

export interface BaseRecord {
  id?: string;
  createdAt?: DateString;
  updatedAt?: DateString;
}

export type BodyPart = '胸' | '肩' | '腕' | '背' | '脚' | '腹' | '有酸素' | 'その他';
export type EquipmentType = 'バーベル' | 'ダンベル' | 'マシン' | '自重' | 'その他';

export interface ExerciseDefinition extends BaseRecord {
  name: string;
  bodyPart: BodyPart;
  equipmentType?: EquipmentType;
  isPreset: boolean;
  userId?: string;
}

export interface TrainingSet extends BaseRecord {
  setNumber: number;
  weight?: number;
  reps?: number;
  isWarmup: boolean;
}

export interface TrainingLogExercise extends BaseRecord {
  exerciseId: string;
  orderIndex: number;
  exercise?: ExerciseDefinition;
  sets: TrainingSet[];
}

export interface TrainingTemplateExercise extends BaseRecord {
  exerciseId: string;
  exercise?: ExerciseDefinition;
  orderIndex: number;
  targetSets?: number;
  targetReps?: string;
  targetWeight?: number;
  restSeconds?: number;
}

export interface TrainingTemplate extends BaseRecord {
  name: string;
  description?: string;
  userId?: string;
  exercises: TrainingTemplateExercise[];
}

export interface CardioPlan extends BaseRecord {
  durationMinutes: number;
  intensity: 'easy' | 'moderate' | 'hard';
  notes?: string;
}

export interface TrainingLog extends BaseRecord {
  date: DateString;
  exercises: TrainingLogExercise[];
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

export interface FoodItem extends BaseRecord {
  name: string;
  servingAmount: number;
  servingUnit: string;
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  category?: string | null;
  emoji?: string | null;
  isDeleted?: boolean;
}

export interface MealLogFoodItem extends BaseRecord {
  foodItemId: string;
  foodItem?: FoodItem;
  amount: number;
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
}

export interface Dish extends BaseRecord {
  name: string;
  userId?: string;
}

export interface DishFoodItem {
  dishId: string;
  foodItemId: string;
  foodItem?: FoodItem;
  amount: number;
  unit: string;
}

export interface MealSize extends BaseRecord {
  name: string;
  multiplier: number;
  sortOrder: number;
}

export interface DishWithDetails extends Dish {
  items: DishFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbohydrates: number;
}

export interface DailyCondition extends BaseRecord {
  date: DateString;
  weight: number;
  sleepHours: number;
  fatigue: FatigueLevel;
  notes?: string;
}

export type TrainingScheduleStatus = 'scheduled' | 'completed' | 'cancelled';

export interface TrainingSchedule extends BaseRecord {
  userId: string;
  scheduledDate: DateString;
  templateId?: string | null;
  title: string;
  emoji: string;
  status: TrainingScheduleStatus;
  notes?: string | null;
}

export interface SoccerLog extends BaseRecord {
  userId?: string;
  date: DateString;
  activityType: string;
  trainingMenu?: string;
  durationMinutes?: number;
  distanceKm?: number;
  sprintCount?: number;
  maxSpeedKmh?: number;
  caloriesBurned?: number;
  notes?: string;
}
