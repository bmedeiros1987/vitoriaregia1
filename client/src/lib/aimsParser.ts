/**
 * Parser for "Escala de Tripulante Convertida para padrão AIMS" PDF format.
 * This format has a column-per-day layout extracted as sequential text blocks.
 */

import type { CrewRoster, RosterDay, FlightLeg } from './pdfParser';
import { findRosterCodes, getRosterCodeDefinition, isKnownRosterCode } from './rosterCodes';

const MONTH_MAP: Record<string, number> = {
  'jan': 1, 'fev': 2, 'feb': 2, 'mar': 3, 'abr': 4, 'apr': 4,
  'mai': 5, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'aug': 8,
  'set': 9, 'sep': 9, 'out': 10, 'oct': 10, 'nov': 11, 'dez': 12, 'dec': 12
};

function parseMonthFromCode(code: string): number {
  // Code like "Ma" from "01May" -> extract month
  // Or from header date "01/05/2026"
  const lower = code.toLowerCase();
  for (const [key, val] of Object.entries(MONTH_MAP)) {
    if (lower.startsWith(key)) return val;
  }
  return 0;
}

export function isAimsFormat(text: string): boolean {
  return text.includes('Convertida para padrão AIMS') || 
         text.includes('Convertida para padrao AIMS') ||
         text.includes('Convertida para padr');
}



type AimsVisualItem = { str: string; x: number; y: number; page: number };
type AimsVisualRow = { page: number; key: number; text: string; items: AimsVisualItem[] };

const WEEKDAY_TOKENS = new Set(['MON','TUE','WED','THU','FRI','SAT','SUN','SEG','TER','QUA','QUI','SEX','SAB','SÁB','DOM']);
const FOOTER_TOKENS = ['TIMEZONE', 'BRASÍLIA', 'BRASILIA', 'CONFIRA', 'ESCALA PUBLICADA', 'TRIPULAÇÕES', 'TRIPULACOES'];

export function parseAimsRoster(fullText: string, visualRows?: AimsVisualRow[]): CrewRoster {
  if (visualRows?.length) {
    const parsed = parseAimsRosterFromVisualRows(fullText, visualRows);
    if (parsed && parsed.days.length >= 5) return parsed;
  }
  return parseAimsRosterLegacy(fullText);
}

function parseAimsRosterFromVisualRows(fullText: string, visualRows: AimsVisualRow[]): CrewRoster | null {
  const header = parseAimsHeader(fullText);
  const allItems = visualRows
    .flatMap(row => row.items || [])
    .map(item => ({ ...item, str: String(item.str || '').trim() }))
    .filter(item => item.str.length > 0);

  const dateItems = allItems
    .map(item => ({ item, marker: parseAimsDateMarker(item.str, header.month, header.year) }))
    .filter((entry): entry is { item: AimsVisualItem; marker: { day: number; month: number; year: number; token: string } } => Boolean(entry.marker));

  if (dateItems.length < 3) return null;

  const byPage = new Map<number, typeof dateItems>();
  dateItems.forEach(entry => {
    const arr = byPage.get(entry.item.page) || [];
    arr.push(entry);
    byPage.set(entry.item.page, arr);
  });

  const days: RosterDay[] = [];
  const seen = new Set<string>();

  for (const [page, markers] of byPage.entries()) {
    const sorted = markers.sort((a, b) => a.item.x - b.item.x);
    const pageItems = allItems.filter(item => item.page === page);

    sorted.forEach((entry, index) => {
      const prev = sorted[index - 1];
      const next = sorted[index + 1];
      const left = prev ? (prev.item.x + entry.item.x) / 2 : entry.item.x - 999;
      const right = next ? (entry.item.x + next.item.x) / 2 : entry.item.x + 999;
      const topY = entry.item.y;

      const columnItems = pageItems
        .filter(item => item !== entry.item)
        .filter(item => item.x >= left && item.x < right)
        .filter(item => item.y < topY - 1)
        .filter(item => !shouldIgnoreAimsItem(item.str))
        .sort((a, b) => {
          const dy = b.y - a.y;
          if (Math.abs(dy) > 2) return dy;
          return a.x - b.x;
        });

      const tokens = columnItems
        .flatMap(item => item.str.split(/\s+/))
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => !shouldIgnoreAimsItem(t));

      // AIMS pode trazer transbordos do mês anterior/posterior na mesma grade.
      // Para evitar tela com dois meses, mantemos somente o mês de referência.
      if (entry.marker.month !== header.month || entry.marker.year !== header.year) return;
      const dateFormatted = `${String(entry.marker.day).padStart(2, '0')}/${String(entry.marker.month).padStart(2, '0')}/${entry.marker.year}`;
      if (seen.has(dateFormatted)) return;
      seen.add(dateFormatted);

      const dateObj = new Date(entry.marker.year, entry.marker.month - 1, entry.marker.day);
      const dayOfWeekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const dayOfWeek = dayOfWeekNames[dateObj.getDay()];
      const parsed = parseDayContent(tokens.join('\n'), header.base);
      const rawText = tokens.join(' ');

      days.push({
        date: dateFormatted,
        dayOfWeek,
        type: parsed.type,
        pairingCode: parsed.pairingCode,
        dutyReport: parsed.dutyReport,
        dutyDebrief: parsed.dutyDebrief,
        legs: parsed.legs,
        dutyHours: parsed.dutyHours,
        flyingHours: parsed.flyingHours,
        isNextDay: parsed.isNextDay,
        hotel: parsed.hotel,
        base: header.base,
        rawText,
      });
    });
  }

  days.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));

  return {
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: 'LATAM',
    month: header.month,
    year: header.year,
    days,
    rawText: fullText,
  };
}

function parseAimsHeader(fullText: string): { crewName: string; crewId: string; base: string; rank: string; month: number; year: number } {
  const compact = fullText.replace(/\s+/g, ' ');
  const match = compact.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d+)(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  return {
    crewName: cleanAimsCrewName(match?.[1] || ''),
    crewId: match?.[2] || '',
    base: match?.[3] || 'BSB',
    rank: /\bCCM\b/i.test(fullText) ? 'CCM' : /\bCC\b/i.test(fullText) ? 'CC' : 'CCM',
    month: match ? Number(match[5]) : new Date().getMonth() + 1,
    year: match ? Number(match[6]) : new Date().getFullYear(),
  };
}

function cleanAimsCrewName(value: string): string {
  return String(value || '').replace(/\b(Tripulante|BP|Base)\b/gi, ' ').replace(/\s+/g, ' ').trim() || 'Tripulante';
}

function parseAimsDateMarker(value: string, baseMonth: number, baseYear: number): { day: number; month: number; year: number; token: string } | null {
  const match = value.match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  const code = match[2].toLowerCase();
  let month = parseMonthFromCode(code);
  if (code === 'ma') month = baseMonth === 6 ? 5 : 3;
  if (!month) return null;
  let year = baseYear;
  if (month < baseMonth - 6) year += 1;
  if (month > baseMonth + 6) year -= 1;
  return { day, month, year, token: value };
}

function shouldIgnoreAimsItem(value: string): boolean {
  const v = value.trim();
  const upper = v.toUpperCase();
  if (!v) return true;
  if (WEEKDAY_TOKENS.has(upper)) return true;
  if (upper === 'Y') return true;
  if (/^\d{2}(JAN|FEB|MAR|APR|MAY|MA|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(v)) return true;
  if (FOOTER_TOKENS.some(term => upper.includes(term))) return true;
  return false;
}

function parseDateForSort(date: string): number {
  const [d, m, y] = date.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function parseAimsRosterLegacy(fullText: string): CrewRoster {
  // Extract header info
  // "Tripulante: NOME DO TRIPULANTE -BP:00000000 -Base: BSB -01/05/2026 até31/05/2026"
  const headerMatch = fullText.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d+)(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  
  let crewName = 'Tripulante';
  let crewId = '';
  let base = 'BSB';
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();
  
  if (headerMatch) {
    crewName = cleanAimsCrewName(headerMatch[1]);
    crewId = headerMatch[2];
    base = headerMatch[3];
    month = parseInt(headerMatch[5]);
    year = parseInt(headerMatch[6]);
  }
  
  // Parse all pages text into lines
  const lines = fullText.split('\n');
  const allLines: string[] = [];
  
  for (const line of lines) {
    // Skip headers and footers
    if (line.includes('Convertida para padr') || 
        line.includes('Tripulante:') || 
        line.includes('Confira na') ||
        line.includes('Timezone') ||
        line.includes('Tripulações') ||
        line.trim() === '') continue;
    allLines.push(line.trim());
  }
  
  // Join all content and split by day markers
  // Day markers are like "01Ma", "02Ma", etc. or "01Jun" for next month overflow
  const content = allLines.join('\n');
  
  // Split by day markers: pattern is DDMon (e.g., "01Ma", "10Ma", "01Jun")
  // These can appear concatenated with previous content like "(320)10Ma" or "21:0019Ma"
  const dayPattern = /(\d{2})(Jan|Feb|Mar|Apr|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ja|Fe|Ma|Ab|Mai|Ju|Jul|Ag|Se|Ou|No|De)/gi;
  
  // Find all day markers and their positions
  const dayMarkers: { day: number; monthCode: string; pos: number }[] = [];
  let match;
  
  while ((match = dayPattern.exec(content)) !== null) {
    const dayNum = parseInt(match[1]);
    const monthCode = match[2];
    if (dayNum >= 1 && dayNum <= 31) {
      dayMarkers.push({ day: dayNum, monthCode, pos: match.index });
    }
  }
  
  // Parse each day's content
  const days: RosterDay[] = [];
  const seenDates = new Set<string>();
  
  for (let i = 0; i < dayMarkers.length; i++) {
    const marker = dayMarkers[i];
    const startPos = marker.pos + `${marker.day.toString().padStart(2, '0')}${marker.monthCode}`.length;
    const endPos = i < dayMarkers.length - 1 ? dayMarkers[i + 1].pos : content.length;
    const dayContent = content.substring(startPos, endPos).trim();
    
    // Determine if this is the target month or overflow (next month)
    let dayMonth = month;
    let dayYear = year;
    const mc = marker.monthCode.toLowerCase();
    
    // Check if it's a different month (e.g., "01Jun" when month is May)
    const parsedMonth = parseMonthFromCode(mc);
    if (parsedMonth > 0 && parsedMonth !== month) {
      dayMonth = parsedMonth;
      if (parsedMonth < month) dayYear++;
    }
    
    // Mantém também dias de transbordo do PDF (mês anterior/posterior),
    // porque a programação pode começar antes do dia 1º ou terminar após o fechamento do mês.
    
    const dateFormatted = `${marker.day.toString().padStart(2, '0')}/${dayMonth.toString().padStart(2, '0')}/${dayYear}`;
    
    // Deduplicate: keep only the first occurrence of each date
    if (seenDates.has(dateFormatted)) continue;
    seenDates.add(dateFormatted);
    
    const dateObj = new Date(dayYear, dayMonth - 1, marker.day);
    const dayOfWeekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dayOfWeek = dayOfWeekNames[dateObj.getDay()];
    
    // Parse the day content
    const parsed = parseDayContent(dayContent, base);
    
    days.push({
      date: dateFormatted,
      dayOfWeek,
      type: parsed.type,
      pairingCode: parsed.pairingCode,
      dutyReport: parsed.dutyReport,
      dutyDebrief: parsed.dutyDebrief,
      legs: parsed.legs,
      dutyHours: parsed.dutyHours,
      flyingHours: parsed.flyingHours,
      isNextDay: parsed.isNextDay,
      hotel: parsed.hotel,
      base
    });
  }
  
  // Sort days by date
  days.sort((a, b) => {
    const [da, ma] = a.date.split('/').map(Number);
    const [db, mb] = b.date.split('/').map(Number);
    if (ma !== mb) return ma - mb;
    return da - db;
  });
  
  return {
    crewName,
    crewId,
    base,
    rank: 'CCM',
    month,
    year,
    days,
    rawText: fullText
  };
}

interface ParsedDay {
  type: RosterDay['type'];
  pairingCode: string;
  dutyReport: string | null;
  dutyDebrief: string | null;
  legs: FlightLeg[];
  dutyHours: number | null;
  flyingHours: number | null;
  isNextDay: boolean;
  hotel: string | null;
}

function parseDayContent(content: string, homeBase: string): ParsedDay {
  // Split by both newlines AND whitespace to handle space-separated tokens from column extraction
  // First split by newlines, then split each line by spaces to get individual tokens
  const rawLines = content.split('\n').filter(l => l.trim() !== '');
  const lines: string[] = [];
  for (const line of rawLines) {
    // Split each line by whitespace to get individual tokens
    const tokens = line.split(/\s+/).filter(t => t.trim() !== '');
    lines.push(...tokens);
  }
  
  // First token might be "y" (year indicator), skip it
  let idx = 0;
  if (idx < lines.length && lines[idx] === 'y') idx++;
  
  // Next token is day of week (Fri, Sat, etc.), skip it
  if (idx < lines.length && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(lines[idx])) idx++;
  
  // Now determine the day type from remaining content
  const remaining = lines.slice(idx);
  
  if (remaining.length === 0) {
    return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null };
  }
  
  // Check first meaningful token
  const firstLine = remaining[0];
  const laAnywhereIdx = remaining.findIndex(l => l === 'LA');

  // Activity + flight on the same day (e.g. C32F + LA4546)
  if (laAnywhereIdx > 0 && isKnownGroundActivity(firstLine)) {
    const flight = parseFlightDay(remaining.slice(laAnywhereIdx), homeBase, false);
    return {
      ...flight,
      pairingCode: firstLine,
      rawActivityCode: firstLine,
    } as ParsedDay;
  }

  // Standalone ground activities
  if (isKnownGroundActivity(firstLine)) {
    return parseGroundActivity(remaining, firstLine);
  }
  
  // Day off types
  if (firstLine === 'DO' || firstLine.startsWith('DO')) {
    return { type: 'DO', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'DOF' || firstLine.startsWith('DOF')) {
    return { type: 'DOF', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'DR' || firstLine.startsWith('DR')) {
    return { type: 'DR', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'OFF' || firstLine.startsWith('OFF')) {
    return { type: 'OFF', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // HSB/HSBE - Standby
  if (firstLine === 'HSB' || firstLine.startsWith('HSB')) {
    return parseStandby(remaining, firstLine.includes('HSBE') ? 'HSBE' : 'HSB');
  }
  if (firstLine === 'HSBE') {
    return parseStandby(remaining, 'HSBE');
  }
  
  // CRM Training
  if (firstLine === 'CRMB' || firstLine === 'CRM' || firstLine.startsWith('CRM') || /^C\d{2,3}F$/.test(firstLine)) {
    return parseCRM(remaining);
  }
  
  // ASB - Airport Standby
  if (firstLine === 'ASB' || firstLine.startsWith('ASB')) {
    return parseASB(remaining);
  }
  
  // Check if it's a layover continuation (starts with "(...)" indicating previous day's activity continues)
  if (firstLine === '(...)' || firstLine.startsWith('(...)')) {
    const afterEllipsis = remaining.slice(1);
    
    // Em AIMS, (...) costuma ser apenas continuação/pernoite. Checamos códigos
    // operacionais antes de DO/DR/OFF para não transformar ASB em inativo/folga.
    const asbIdx = afterEllipsis.findIndex(l => l === 'ASB' || /^ASB/.test(l));
    if (asbIdx >= 0) return parseASB(afterEllipsis.slice(asbIdx));

    const hsbIdx = afterEllipsis.findIndex(l => l === 'HSBE' || l === 'HSB');
    if (hsbIdx >= 0) {
      const hsbType = afterEllipsis[hsbIdx] === 'HSBE' ? 'HSBE' : 'HSB';
      return parseStandby(afterEllipsis.slice(hsbIdx), hsbType);
    }

    const doIdx = afterEllipsis.findIndex(l => l === 'DO' || l === 'DOF' || l === 'DR' || l === 'OFF');
    if (doIdx >= 0) {
      const typeStr = afterEllipsis[doIdx] as RosterDay['type'];
      return { type: typeStr, pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
    }
    
    // Check for CRM after (...)
    const knownIdx = afterEllipsis.findIndex(l => isKnownGroundActivity(l));
    if (knownIdx >= 0) {
      return parseGroundActivity(afterEllipsis.slice(knownIdx), afterEllipsis[knownIdx]);
    }
    
    // Check for flights after (...)
    const hasFlights = afterEllipsis.some(l => l === 'LA');
    if (hasFlights) {
      const laStart = afterEllipsis.findIndex(l => l === 'LA');
      return parseFlightDay(afterEllipsis.slice(laStart), homeBase, true);
    }
    
    // Pure layover - check for station (non-home-base)
    const stationLine = afterEllipsis.find(l => /^[A-Z]{3}$/.test(l) && l !== homeBase);
    if (stationLine) {
      return { 
        type: 'LAYOVER', 
        pairingCode: '', 
        dutyReport: null, 
        dutyDebrief: null, 
        legs: [], 
        dutyHours: 0, 
        flyingHours: 0, 
        isNextDay: false, 
        hotel: stationLine 
      };
    }
    
    // If no station found and no other type, it might be a rest day
    return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // Flight day - starts with "LA" or has "[extra]" marker
  if (firstLine === 'LA' || firstLine === '[extra]') {
    const startIdx = firstLine === '[extra]' ? 1 : 0;
    return parseFlightDay(remaining.slice(startIdx), homeBase, false);
  }
  
  // Check if it's a DO/DOF that was preceded by (...) 
  // Pattern: (...) \n STATION \n time \n time \n DO/DOF
  const doIdx = remaining.findIndex(l => l === 'DO' || l === 'DOF' || l === 'DR');
  if (doIdx > 0) {
    const typeStr = remaining[doIdx] as RosterDay['type'];
    return { type: typeStr, pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // Fallback: check for LA anywhere
  const laIdx = remaining.findIndex(l => l === 'LA');
  if (laIdx >= 0) {
    return parseFlightDay(remaining.slice(laIdx), homeBase, false);
  }
  
  return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null };
}


function isKnownGroundActivity(token: string): boolean {
  return isKnownRosterCode(token);
}

function parseGroundActivity(lines: string[], code: string): ParsedDay {
  const def = getRosterCodeDefinition(code);
  const canonicalCode = def?.code || code;

  // Folgas/marcadores normalmente vêm sem janela de horário e não devem ser
  // confundidos com atividades de solo. Mantemos o código para tradução direta.
  if (def?.category === 'DAY_OFF') {
    const type = canonicalCode === 'DR' ? 'DR' : canonicalCode === 'DOF' ? 'DOF' : canonicalCode === 'OFF' ? 'OFF' : 'DO';
    return { type, pairingCode: canonicalCode, dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }

  const window = collectDutyWindow(lines);
  const startTime = window.start;
  const endTime = window.end;
  let dutyHours: number | null = null;
  if (startTime && endTime) dutyHours = diffHours(startTime, endTime);

  let type: RosterDay['type'] = 'OTHER';
  if (def?.category === 'RESERVE') type = 'ASB';
  else if (def?.category === 'STANDBY') type = canonicalCode === 'HSBE' ? 'HSBE' : 'HSB';
  else if (/^C\d{2,3}F$/i.test(canonicalCode) || /^(CRM|CBF|EMER)$/i.test(canonicalCode)) type = 'CRM';

  return {
    type,
    pairingCode: canonicalCode,
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: Boolean(startTime && endTime && minutesOfDay(endTime) <= minutesOfDay(startTime)),
    hotel: null
  };
}

function collectDutyWindow(lines: string[]): { start: string | null; end: string | null } {
  const airports = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
  const tokens = lines.map(line => String(line || '').trim()).filter(Boolean);
  const stationTimes: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (airports.has(tokens[i].toUpperCase()) && /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(tokens[i + 1])) {
      stationTimes.push(normalizeSimpleTime(tokens[i + 1]));
    }
  }
  if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };

  const times = collectTimes(tokens).filter(time => !looksLikeDuration(time));
  if (!times.length) return { start: null, end: null };
  const start = times[0];
  let end = times[1] || times[0];
  for (const candidate of times.slice(1)) {
    const h = diffHours(start, candidate);
    if (h >= 0.25 && h <= 14) end = candidate;
  }
  return { start, end };
}

function collectTimes(lines: string[]): string[] {
  return Array.from(new Set(lines.map(line => line.match(/^(\d{1,2}:\d{2}(?:\(\+1\))?)/)?.[1]).filter((time): time is string => Boolean(time)).map(normalizeSimpleTime)));
}

function normalizeSimpleTime(time: string): string {
  return time.replace(/^([0-9]):/, '0$1:').replace('(+1)', '');
}

function looksLikeDuration(time: string): boolean {
  return ['00:59','01:25','01:40','01:45','01:50','02:00','02:05','02:10','02:15','02:25','02:30','02:40','02:45','02:50','03:00','03:10','03:15','05:20','06:00','06:25','07:30','07:35','07:40','08:55','10:30','10:45','10:55','11:30'].includes(time);
}

function minutesOfDay(time: string): number {
  const [h, m] = time.replace('(+1)', '').split(':').map(Number);
  return h * 60 + m;
}

function diffHours(start: string, end: string): number {
  let diff = minutesOfDay(end) - minutesOfDay(start);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function parseStandby(lines: string[], type: 'HSB' | 'HSBE'): ParsedDay {
  // Format in extracted text:
  // HSB (or HSBE)
  // 10:05     <- start time
  // 10:05     <- (repeated)
  // BSB       <- station
  // BSB       <- (repeated)
  // 21:00     <- end time
  // 21:00     <- (repeated or concatenated with next day)
  
  let startTime: string | null = null;
  let endTime: string | null = null;
  
  const timePattern = /^(\d{1,2}:\d{2})/;
  const times: string[] = [];
  
  for (const line of lines) {
    const tm = line.match(timePattern);
    if (tm) {
      times.push(tm[1]);
    }
  }
  
  // For HSB/HSBE: first time is start, third unique time is end
  // Times array typically: [start, start, end, end] (each repeated)
  if (times.length >= 3) {
    startTime = times[0];
    // Find the first time that's different from start
    endTime = times.find(t => t !== startTime) || times[times.length - 1];
  } else if (times.length >= 2) {
    startTime = times[0];
    endTime = times[1];
  }
  
  let dutyHours: number | null = null;
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin < 0) diffMin += 24 * 60;
    dutyHours = diffMin / 60;
  }
  
  return {
    type,
    pairingCode: '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: false,
    hotel: null
  };
}

function parseCRM(lines: string[]): ParsedDay {
  // CRM training day
  // CRMB
  // SB
  // 09:00
  // ...
  // 18:00
  
  const times: string[] = [];
  const timePattern = /^(\d{1,2}:\d{2})/;
  
  for (const line of lines) {
    const tm = line.match(timePattern);
    if (tm) times.push(tm[1]);
  }
  
  let startTime: string | null = null;
  let endTime: string | null = null;
  
  if (times.length >= 2) {
    const uniqueTimes = Array.from(new Set(times));
    startTime = uniqueTimes[0];
    endTime = uniqueTimes[1] || uniqueTimes[0];
    for (const candidate of uniqueTimes.slice(1)) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = candidate.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      if (diff >= 15 && diff <= 14 * 60) endTime = candidate;
    }
  }
  
  let dutyHours: number | null = null;
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin < 0) diffMin += 24 * 60;
    dutyHours = diffMin / 60;
  }
  
  return {
    type: 'CRM',
    pairingCode: findRosterCodes(lines.join(' '))[0] || '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: false,
    hotel: null
  };
}

function parseASB(lines: string[]): ParsedDay {
  const times: string[] = [];
  const timePattern = /^(\d{1,2}:\d{2})/;
  
  for (const line of lines) {
    const tm = line.match(timePattern);
    if (tm) times.push(tm[1]);
  }
  
  let startTime: string | null = null;
  let endTime: string | null = null;
  
  if (times.length >= 2) {
    const uniqueTimes = Array.from(new Set(times));
    startTime = uniqueTimes[0];
    endTime = uniqueTimes[1] || uniqueTimes[0];
    for (const candidate of uniqueTimes.slice(1)) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = candidate.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      if (diff >= 15 && diff <= 14 * 60) endTime = candidate;
    }
  }
  
  let dutyHours: number | null = null;
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin < 0) diffMin += 24 * 60;
    dutyHours = diffMin / 60;
  }
  
  return {
    type: 'ASB',
    pairingCode: '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: false,
    hotel: null
  };
}


function findBestAimsLegPattern(tokens: string[]): { origin: string; destination: string; departureTime: string; arrivalTime: string } | null {
  const airports = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
  const isTime = (value: string) => /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(value);
  const upper = tokens.map(t => String(t || '').toUpperCase());
  const candidates: Array<{ origin: string; destination: string; departureTime: string; arrivalTime: string; score: number }> = [];
  for (let i = 0; i < upper.length; i++) {
    if (!airports.has(upper[i])) continue;
    for (let j = i + 1; j < Math.min(upper.length, i + 5); j++) {
      if (!isTime(tokens[j])) continue;
      for (let k = j + 1; k < Math.min(upper.length, j + 5); k++) {
        if (!airports.has(upper[k])) continue;
        for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
          if (!isTime(tokens[l])) continue;
          const departureTime = tokens[j].replace(/^([0-9]):/, '0$1:');
          const arrivalTime = tokens[l].replace(/^([0-9]):/, '0$1:').replace('(+1)', '');
          const [dh, dm] = departureTime.replace('(+1)', '').split(':').map(Number);
          const [ah, am] = arrivalTime.split(':').map(Number);
          let duration = (ah * 60 + am) - (dh * 60 + dm);
          if (duration <= 0) duration += 24 * 60;
          if (duration < 15 || duration > 450) continue;
          const score = 100 - (upper[i] === upper[k] ? 20 : 0) - Math.abs(duration / 60 - 1.8);
          candidates.push({ origin: upper[i], destination: upper[k], departureTime, arrivalTime, score });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function parseFlightDay(lines: string[], homeBase: string, isLayoverStart: boolean): ParsedDay {
  // Flight day format (each flight leg):
  // LA
  // 3953        <- flight number
  // 13:25       <- departure time (or report time for first leg)
  // 14:12       <- actual departure (or second time)
  // BSB         <- origin
  // POA         <- destination
  // 16:45       <- arrival time
  // (320)       <- aircraft type
  //
  // Then next leg:
  // LA
  // 3590
  // ...
  
  const legs: FlightLeg[] = [];
  let i = 0;
  let firstReportTime: string | null = null;
  let lastArrivalTime: string | null = null;
  let explicitDebriefTime: string | null = null;
  let isNextDay = false;
  let hotel: string | null = null;
  let totalFlyingMin = 0;
  
  while (i < lines.length) {
    if (lines[i] === 'LA') {
      i++;
      if (i >= lines.length) break;
      
      // Flight number
      const flightNum = 'LA' + lines[i];
      i++;
      
      // Next lines: times, origin, destination, arrival
      // Pattern varies:
      // Time1 (report/departure)
      // Time2 (departure if different from report) OR Origin
      // Origin
      // Destination
      // Arrival time
      // Optional: second arrival time (block time)
      // Aircraft type (320) or (328) etc.
      
      let departureTime = '';
      let arrivalTime = '';
      let origin = '';
      let destination = '';
      
      // Collect remaining tokens for this leg until next "LA" or end
      const legTokens: string[] = [];
      while (i < lines.length && lines[i] !== 'LA' && !lines[i].startsWith('(...)')) {
        legTokens.push(lines[i]);
        i++;
      }
      
      // Parse leg tokens
      // Tokens pattern: [time1, time2?, ORIGIN, DESTINATION, arrivalTime, arrivalTime2?, (aircraft)]
      const timeRegex = /^\d{1,2}:\d{2}$/;
      const stationRegex = /^[A-Z]{3}$/;
      const aircraftRegex = /^\(\d{3}\w?\)$|^\(3\d\w\)$/;
      
      const best = findBestAimsLegPattern(legTokens);
      const times: string[] = [];
      for (const token of legTokens) if (timeRegex.test(token)) times.push(token);

      if (best) {
        origin = best.origin;
        destination = best.destination;
        departureTime = best.departureTime;
        arrivalTime = best.arrivalTime;
        if (!firstReportTime) {
          const reportCandidate = times.find(t => t !== departureTime) || departureTime;
          firstReportTime = reportCandidate;
        }
      } else {
        const stations: string[] = [];
        for (const token of legTokens) {
          if (stationRegex.test(token) && !aircraftRegex.test(`(${token})`)) stations.push(token);
        }
        if (stations.length >= 2) { origin = stations[0]; destination = stations[1]; }
        else if (stations.length === 1) { destination = stations[0]; origin = legs.length > 0 ? legs[legs.length - 1].destination : homeBase; }
        if (times.length >= 2) { departureTime = times[0]; arrivalTime = times[1]; if (!firstReportTime) firstReportTime = times[0]; }
      }
      
      // Calculate flying time for this leg
      if (departureTime && arrivalTime) {
        const [dh, dm] = departureTime.split(':').map(Number);
        const [ah, am] = arrivalTime.split(':').map(Number);
        let flyMin = (ah * 60 + am) - (dh * 60 + dm);
        if (flyMin < 0) flyMin += 24 * 60;
        totalFlyingMin += flyMin;
      }
      
      if (times.length >= 3 && firstReportTime && legs.length > 0) explicitDebriefTime = times[times.length - 1];
      lastArrivalTime = arrivalTime || lastArrivalTime;
      
      legs.push({
        flightNumber: flightNum,
        origin,
        destination,
        departureTime,
        arrivalTime,
        workType: 'OP'
      });
    } else if (lines[i] === '(...)') {
      // End of day - next day continuation
      // Check what station we're at
      if (i + 1 < lines.length && /^[A-Z]{3}$/.test(lines[i + 1])) {
        hotel = lines[i + 1];
      }
      break;
    } else {
      // Skip non-LA lines (could be station info for layover)
      if (/^[A-Z]{3}$/.test(lines[i]) && legs.length === 0) {
        // This might be the origin station for a layover continuation
      }
      i++;
    }
  }
  
  // Calculate duty times
  let dutyReport = firstReportTime;
  let dutyDebrief: string | null = null;
  let dutyHours: number | null = null;
  
  if (explicitDebriefTime) {
    dutyDebrief = explicitDebriefTime;
  } else if (lastArrivalTime) {
    // Debrief = last arrival + 30 min
    const [ah, am] = lastArrivalTime.split(':').map(Number);
    const debriefMin = ah * 60 + am + 30;
    const debH = Math.floor(debriefMin / 60) % 24;
    const debM = debriefMin % 60;
    dutyDebrief = `${debH.toString().padStart(2, '0')}:${debM.toString().padStart(2, '0')}`;
    
    if (debriefMin >= 24 * 60) isNextDay = true;
  }
  
  // For first leg, report time is typically 1h before departure
  // But in this format, the first time shown might already be the report time
  if (dutyReport && legs.length > 0) {
    // If report time equals departure time of first leg, subtract 1h for actual report
    if (dutyReport === legs[0].departureTime && legs[0].origin === homeBase) {
      // Report is typically shown separately in this format
      // Keep as-is since the format shows report time explicitly
    }
  }
  
  if (dutyReport && dutyDebrief) {
    const [rh, rm] = dutyReport.split(':').map(Number);
    const [dh, dm] = dutyDebrief.split(':').map(Number);
    let diff = (dh * 60 + dm) - (rh * 60 + rm);
    if (diff < 0 || isNextDay) diff += 24 * 60;
    dutyHours = diff / 60;
  }
  
  // Check if last destination is not home base (layover)
  if (legs.length > 0 && legs[legs.length - 1].destination !== homeBase) {
    hotel = legs[legs.length - 1].destination;
  }
  
  const flyingHours = totalFlyingMin > 0 ? totalFlyingMin / 60 : null;
  
  return {
    type: 'VOO',
    pairingCode: legs.length > 0 ? legs[0].flightNumber : '',
    dutyReport,
    dutyDebrief,
    legs,
    dutyHours,
    flyingHours,
    isNextDay,
    hotel
  };
}
