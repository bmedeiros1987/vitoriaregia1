import type { DayLoadAnalysis } from './complianceEngine';

export type RoutineActivityType = 'musculacao' | 'corrida' | 'caminhada' | 'crossfit' | 'estudo' | 'faculdade' | 'personalizado';
export type RoutineIntensity = 'baixa' | 'moderada' | 'alta';
export type RoutinePeriod = 'manha' | 'tarde' | 'noite' | 'qualquer';

export interface RoutineActivityConfig {
  id: string;
  type: RoutineActivityType;
  name: string;
  durationMinutes: number;
  intensity: RoutineIntensity;
  frequencyPerWeek: number;
  preferredPeriod: RoutinePeriod;
  notes?: string;
}

export interface RoutineSuggestion {
  id: string;
  date: string;
  dayOfWeek: string;
  activityName: string;
  activityType: RoutineActivityType;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  intensity: RoutineIntensity;
  score: number;
  suitability: 'ideal' | 'boa' | 'moderada' | 'evitar';
  confidence: 'alta' | 'media' | 'baixa';
  reason: string;
  caution: string;
  dayLabel: string;
}

const DEFAULT_ROUTINE_ACTIVITIES: RoutineActivityConfig[] = [
  { id: 'musculacao-60', type: 'musculacao', name: 'Musculação', durationMinutes: 60, intensity: 'moderada', frequencyPerWeek: 3, preferredPeriod: 'manha' },
  { id: 'caminhada-45', type: 'caminhada', name: 'Caminhada', durationMinutes: 45, intensity: 'baixa', frequencyPerWeek: 2, preferredPeriod: 'qualquer' },
  { id: 'estudo-90', type: 'estudo', name: 'Estudo', durationMinutes: 90, intensity: 'baixa', frequencyPerWeek: 3, preferredPeriod: 'noite' },
];

export function defaultRoutineActivities(): RoutineActivityConfig[] {
  return DEFAULT_ROUTINE_ACTIVITIES.map((item) => ({ ...item }));
}

export function getActivityLabel(type: RoutineActivityType): string {
  const labels: Record<RoutineActivityType, string> = {
    musculacao: 'Musculação',
    corrida: 'Corrida',
    caminhada: 'Caminhada',
    crossfit: 'Crossfit',
    estudo: 'Estudo',
    faculdade: 'Faculdade',
    personalizado: 'Personalizado',
  };
  return labels[type];
}

export function getActivityDefaultIntensity(type: RoutineActivityType): RoutineIntensity {
  if (type === 'crossfit' || type === 'corrida') return 'alta';
  if (type === 'musculacao') return 'moderada';
  return 'baixa';
}

export function getActivityDefaultDuration(type: RoutineActivityType): number {
  const defaults: Record<RoutineActivityType, number> = {
    musculacao: 60,
    corrida: 45,
    caminhada: 45,
    crossfit: 60,
    estudo: 90,
    faculdade: 120,
    personalizado: 60,
  };
  return defaults[type];
}

export function buildRoutineSuggestions(days: DayLoadAnalysis[], activities: RoutineActivityConfig[]): RoutineSuggestion[] {
  const chronological = [...days].sort((a, b) => parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime());
  const suggestions: RoutineSuggestion[] = [];
  const usedSlots = new Set<string>();

  activities.forEach((activity) => {
    const desired = Math.max(1, Math.min(7, Number(activity.frequencyPerWeek) || 1));
    const ranked = chronological
      .map((day, index) => {
        const previous = chronological[index - 1] || null;
        const next = chronological[index + 1] || null;
        return scoreDayForActivity(day, activity, previous, next);
      })
      .sort((a, b) => b.score - a.score || parseRosterDate(a.day.date).getTime() - parseRosterDate(b.day.date).getTime());

    let count = 0;
    for (const option of ranked) {
      if (count >= desired) break;
      if (option.score < 35 && isPhysicalActivity(activity.type)) continue;
      const slot = pickTimeSlot(option.day, activity, usedSlots);
      const key = `${option.day.date}-${slot.startTime}-${activity.id}`;
      if (usedSlots.has(key)) continue;
      usedSlots.add(key);
      suggestions.push({
        id: `${activity.id}-${option.day.date}-${count}`,
        date: option.day.date,
        dayOfWeek: option.day.dayOfWeek,
        activityName: activity.name || getActivityLabel(activity.type),
        activityType: activity.type,
        durationMinutes: activity.durationMinutes,
        startTime: slot.startTime,
        endTime: addMinutes(slot.startTime, activity.durationMinutes),
        intensity: activity.intensity,
        score: option.score,
        suitability: scoreToSuitability(option.score),
        confidence: option.confidence,
        reason: option.reason,
        caution: option.caution,
        dayLabel: option.day.label,
      });
      count++;
    }
  });

  return suggestions.sort((a, b) => parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime() || a.startTime.localeCompare(b.startTime));
}

function scoreDayForActivity(day: DayLoadAnalysis, activity: RoutineActivityConfig, previous: DayLoadAnalysis | null, next: DayLoadAnalysis | null) {
  const demand = activityDemand(activity);
  let score = 48;
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (day.isDayOff) {
    score += 30;
    reasons.push('dia de recuperação/folga');
  }
  if (day.type === 'LAYOVER') {
    score += isPhysicalActivity(activity.type) ? 10 : 18;
    reasons.push('pernoite/inativo com janela possível');
  }
  if (day.type === 'OTHER') {
    score -= 18;
    cautions.push('dia sem programação lida com alta confiança');
  }
  if (day.fatigueScore >= 70) {
    score -= demand.high * 0.38;
    cautions.push('dia operacional pesado');
  } else if (day.fatigueScore >= 45) {
    score -= demand.high * 0.18;
  } else {
    score += 8;
  }
  if (day.isNightDuty || day.isLateFinish) {
    score -= demand.sleep * 0.35;
    cautions.push('término tarde/madrugada: proteger sono');
  }
  if (day.isEarlyStart) {
    score -= demand.sleep * 0.22;
    cautions.push('apresentação cedo');
  }
  if (day.restBefore !== null && day.restBefore < 14) {
    score -= demand.sleep * 0.28;
    cautions.push(`repouso anterior curto (${day.restBefore}h)`);
  }
  if (day.restAfter !== null && day.restAfter < 14) {
    score -= demand.sleep * 0.38;
    cautions.push(`repouso posterior justo (${day.restAfter}h)`);
  }
  if (previous && previous.fatigueScore >= 70) {
    score -= demand.high * 0.2;
    cautions.push('vem de dia pesado');
  }
  if (next && next.fatigueScore >= 70) {
    score -= demand.high * 0.24;
    cautions.push('próximo dia é pesado');
  }
  if (activity.durationMinutes >= 120 && !day.isDayOff) {
    score -= 20;
    cautions.push('atividade longa em dia operacional');
  }
  if (!isPhysicalActivity(activity.type)) {
    score += day.isDayOff ? -5 : 8;
    if (day.isLateFinish || day.isNightDuty) score -= 10;
    reasons.push('atividade cognitiva pode caber em janela leve');
  }
  if (activity.type === 'crossfit' && !day.isDayOff) {
    score -= 25;
    cautions.push('crossfit exige margem alta de recuperação');
  }
  if (activity.type === 'caminhada') {
    score += 10;
    reasons.push('baixo impacto e boa opção de recuperação ativa');
  }

  score = Math.round(clamp(score, 0, 100));
  const confidence: RoutineSuggestion['confidence'] = day.type === 'OTHER' ? 'baixa' : day.type === 'LAYOVER' ? 'media' : 'alta';
  return {
    day,
    score,
    confidence,
    reason: reasons.length ? reasons.slice(0, 3).join(' · ') : 'janela compatível com a carga do dia',
    caution: cautions.length ? cautions.slice(0, 3).join(' · ') : 'manter hidratação, alimentação e margem para deslocamento/sono',
  };
}

function activityDemand(activity: RoutineActivityConfig) {
  let high = 35;
  let sleep = 30;
  if (activity.intensity === 'alta') { high += 35; sleep += 25; }
  if (activity.intensity === 'moderada') { high += 16; sleep += 12; }
  if (activity.durationMinutes >= 90) { high += 12; sleep += 8; }
  if (activity.durationMinutes >= 120) { high += 15; sleep += 12; }
  if (activity.type === 'crossfit') { high += 24; sleep += 16; }
  if (activity.type === 'corrida') { high += 14; sleep += 8; }
  if (activity.type === 'caminhada') { high -= 18; sleep -= 12; }
  if (!isPhysicalActivity(activity.type)) { high -= 16; sleep += 8; }
  return { high: clamp(high, 10, 100), sleep: clamp(sleep, 10, 100) };
}

function pickTimeSlot(day: DayLoadAnalysis, activity: RoutineActivityConfig, usedSlots: Set<string>) {
  const candidates = candidateTimes(day, activity);
  for (const candidate of candidates) {
    const key = `${day.date}-${candidate}-${activity.type}`;
    if (!usedSlots.has(key)) return { startTime: candidate };
  }
  return { startTime: candidates[0] || '10:00' };
}

function candidateTimes(day: DayLoadAnalysis, activity: RoutineActivityConfig): string[] {
  const byPeriod: Record<RoutinePeriod, string[]> = {
    manha: ['08:00', '09:00', '10:00'],
    tarde: ['14:00', '15:30', '16:30'],
    noite: ['18:30', '19:30', '20:00'],
    qualquer: ['09:00', '10:30', '15:30', '18:30'],
  };
  let candidates = byPeriod[activity.preferredPeriod] || byPeriod.qualquer;
  if (day.isEarlyStart) candidates = ['17:30', '18:30', '19:00'];
  if (day.isLateFinish || day.isNightDuty) candidates = isPhysicalActivity(activity.type) ? ['10:30', '15:30'] : ['11:00', '16:00'];
  if (day.isDayOff) candidates = activity.preferredPeriod === 'noite' ? ['18:00', '19:00'] : activity.preferredPeriod === 'tarde' ? ['14:30', '16:00'] : ['08:30', '10:00', '15:30'];
  if (day.type === 'LAYOVER') candidates = ['10:00', '16:30', '18:00'];
  return candidates;
}

function scoreToSuitability(score: number): RoutineSuggestion['suitability'] {
  if (score >= 78) return 'ideal';
  if (score >= 62) return 'boa';
  if (score >= 42) return 'moderada';
  return 'evitar';
}

export function isPhysicalActivity(type: RoutineActivityType): boolean {
  return ['musculacao', 'corrida', 'caminhada', 'crossfit', 'personalizado'].includes(type);
}

function parseRosterDate(value: string): Date {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const dayMinutes = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(dayMinutes / 60)).padStart(2, '0')}:${String(dayMinutes % 60).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
