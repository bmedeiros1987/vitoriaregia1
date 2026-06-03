import { isAimsFormat, parseAimsRoster } from './aimsParser';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';

let pdfjsModulePromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/legacy/build/pdf').then((module: any) => {
      // Required on mobile Chrome/Safari: without an explicit workerSrc PDF.js
      // can throw "No GlobalWorkerOptions.workerSrc specified". We still keep
      // a no-worker retry below for devices that block Worker creation.
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return module;
    });
  }
  return pdfjsModulePromise;
}

export interface FlightLeg {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  workType: string; // OP, PS, DH, etc.
  duration?: number;
  aircraftType?: string;
  isNextDay?: boolean;
}

export interface RosterDay {
  date: string; // DD/MM/YYYY
  dayOfWeek: string;
  dayNumber?: number;
  month?: number;
  year?: number;
  type: 'VOO' | 'DO' | 'DOF' | 'DR' | 'HSB' | 'HSBE' | 'ASB' | 'OFF' | 'CRM' | 'LAYOVER' | 'RES' | 'OTHER';
  pairingCode: string;
  dutyReport: string | null; // HH:MM
  dutyDebrief: string | null; // HH:MM
  legs: FlightLeg[];
  dutyHours: number | null;
  flyingHours: number | null;
  isNextDay: boolean;
  hotel: string | null;
  base: string;
  rawText?: string;
}

export interface CrewRoster {
  crewName: string;
  crewId: string;
  base: string;
  rank: string;
  airline?: string;
  month: number;
  year: number;
  days: RosterDay[];
  rawText: string;
  totals?: {
    flightHours?: number;
    dutyHours?: number;
  };
}

type VisualItem = {
  str: string;
  x: number;
  y: number;
  page: number;
};

type VisualRow = {
  page: number;
  key: number;
  text: string;
  items: VisualItem[];
};

const DATE_TOKEN_RE = /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/;
const DATE_TOKEN_GLOBAL_RE = /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/g;

export async function parsePDF(file: File): Promise<CrewRoster> {
  const arrayBuffer = await readPdfFileAsArrayBuffer(file);
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(arrayBuffer);
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch (workerError) {
    // Last-resort mobile fallback: if the browser/PWA refuses to start the
    // worker, retry in fake-worker mode instead of crashing the whole app.
    pdf = await pdfjsLib.getDocument({
      data,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  }
  const rows = await extractVisualRows(pdf);
  const fullText = rows.map(row => row.text).join('\n');

  if (isAimsFormat(fullText)) {
    return parseAimsRoster(fullText, rows);
  }

  const isCrewRosterReport = /Roster\s+Report/i.test(fullText) || /CrewRosterReport/i.test(file.name);
  if (isCrewRosterReport) {
    const parsed = parseCrewRosterReportRows(rows, fullText);
    if (parsed.days.length > 0) return parsed;
  }

  const fallback = parseRosterText(fullText);
  if (fallback.days.length === 0) {
    throw new Error('Nao foi possivel interpretar este PDF. Envie um CrewRosterReport ou AIMS com texto selecionavel.');
  }
  return fallback;
}


async function readPdfFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  // iOS/Safari/PWA sometimes provides files from iCloud/Files with limited
  // Blob.arrayBuffer support or delayed access. FileReader is more reliable
  // on those devices, so we keep it as the primary fallback.
  if (file.arrayBuffer) {
    try {
      const buffer = await file.arrayBuffer();
      if (buffer && buffer.byteLength > 0) return buffer;
    } catch {
      // fall back below
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer && reader.result.byteLength > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('PDF vazio ou não acessível pelo navegador.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler PDF no dispositivo.'));
    reader.readAsArrayBuffer(file);
  });
}

async function extractVisualRows(pdf: any): Promise<VisualRow[]> {
  const allRows: VisualRow[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const items: VisualItem[] = (textContent.items as any[])
      .map((item: any) => ({
        str: cleanCellText(item.str || ''),
        x: Number(item.transform?.[4] || 0),
        y: Number(item.transform?.[5] || 0),
        page: pageNo,
      }))
      .filter((item: VisualItem) => item.str.length > 0);

    const normalRows = buildRows(items, 'y');
    const rotatedRows = buildRows(items, 'x');
    const chosen = scoreRows(rotatedRows) > scoreRows(normalRows) ? rotatedRows : normalRows;
    allRows.push(...chosen.map(row => ({ ...row, page: pageNo })));
  }

  return allRows;
}

function buildRows(items: VisualItem[], axis: 'x' | 'y'): VisualRow[] {
  const tolerance = 4;
  const groups: { key: number; items: VisualItem[] }[] = [];

  for (const item of items) {
    const key = axis === 'x' ? item.x : item.y;
    let group = groups.find(g => Math.abs(g.key - key) <= tolerance);
    if (!group) {
      group = { key, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  const rows = groups
    .map(group => {
      const sortedItems = [...group.items].sort((a, b) => {
        if (axis === 'x') return b.y - a.y; // rotated PDFs: visual left-to-right is descending Y
        return a.x - b.x;
      });
      return {
        page: sortedItems[0]?.page || 1,
        key: group.key,
        items: sortedItems,
        text: normalizeSpaces(sortedItems.map(i => i.str).join(' ')),
      };
    })
    .filter(row => row.text.length > 0);

  return rows.sort((a, b) => {
    if (axis === 'x') return a.key - b.key;
    return b.key - a.key;
  });
}

function scoreRows(rows: VisualRow[]): number {
  const text = rows.map(r => r.text).join('\n');
  let score = 0;
  if (/Roster\s+Report/i.test(text)) score += 8;
  if (/\d{2}-[A-Za-z]{3}-\d{4}\s+to\s+\d{2}-[A-Za-z]{3}-\d{4}/.test(text)) score += 10;
  if (/[A-ZÀ-Ú\s]{6,}\s*\|\s*\d{6,}\s*\|/.test(text)) score += 8;
  score += rows.filter(r => DATE_TOKEN_RE.test(r.text) && /\b(LA\d{3,4}|DO|DR|HSBE?|ASB|CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{1,4}J)\b/.test(r.text)).length * 3;
  score += rows.filter(r => /\bLA\d{3,4}\b.*\b(OP|PS|DH)\b.*\b[A-Z]{3}\s+\d{1,2}:\d{2}/.test(r.text)).length * 2;
  return score;
}

function parseCrewRosterReportRows(rows: VisualRow[], fullText: string): CrewRoster {
  const header = parseHeader(fullText);
  const visualDays = parseDaysFromRows(rows, header.month, header.year, header.base);
  const looseDays = parseCrewRosterReportLooseText(fullText, header.month, header.year, header.base);

  const visualScore = scoreParsedDays(visualDays, header.month, header.year);
  const looseScore = scoreParsedDays(looseDays, header.month, header.year);
  const mergedDays = mergeParsedDaySources(visualDays, looseDays, header.month, header.year);
  const days = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);

  return {
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: header.airline,
    month: header.month,
    year: header.year,
    days,
    rawText: fullText,
    totals: header.totals,
  };
}


function rescueFlightsFromFullText(days: RosterDay[], fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const byDate = new Map<string, RosterDay[]>();
  for (const day of days) {
    const list = byDate.get(day.date) || [];
    list.push(day);
    byDate.set(day.date, list);
  }

  for (const block of buildCrewRosterReportDateBlocks(fullText)) {
    const parsedDate = parseDateToken(block.dateToken, referenceMonth, referenceYear);
    if (parsedDate.month !== referenceMonth || parsedDate.year !== referenceYear) continue;
    const dateKey = formatRosterDate(parsedDate.day, parsedDate.month, parsedDate.year);
    const legs = extractFlightLegsFromReportBlock(block.text);
    if (!legs.length) continue;

    let list = byDate.get(dateKey) || [];
    let flightDay = list.find(day => day.legs?.length) || null;
    if (!flightDay) {
      flightDay = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
      list.push(flightDay);
    }

    for (const leg of legs) {
      if (!flightDay.legs.some(existing => existing.flightNumber === leg.flightNumber && existing.departureTime === leg.departureTime && existing.origin === leg.origin)) {
        flightDay.legs.push(leg);
      }
    }

    flightDay.legs = flightDay.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
    flightDay.type = 'VOO';
    flightDay.rawText = normalizeSpaces(`${flightDay.rawText || ''} ${block.text}`);
    flightDay.dutyReport = extractDutyReportFromReportBlock(block.text, flightDay.legs[0]?.flightNumber || '') || flightDay.dutyReport;
    const debrief = extractDutyDebriefFromReportBlock(block.text, flightDay.legs[flightDay.legs.length - 1]);
    if (debrief) flightDay.dutyDebrief = debrief;
    if (!flightDay.pairingCode) {
      const pairing = block.text.match(/\b(LA\d{3,4}[-/][A-Z0-9/ -]+?\d{6}[A-Z0-9/ -]*-P)\b/i)?.[1];
      flightDay.pairingCode = pairing ? normalizeSpaces(pairing) : flightDay.legs[0]?.flightNumber || '';
    }
    if (flightDay.legs.some(leg => leg.isNextDay)) flightDay.isNextDay = true;
    finalizeRosterDay(flightDay);
    byDate.set(dateKey, list);
  }

  return Array.from(byDate.values()).flat().sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}

function buildCrewRosterReportDateBlocks(fullText: string): { dateToken: string; text: string }[] {
  const lines = fullText
    .split(/\r?\n/)
    .map(line => stripUpdatedDate(normalizeSpaces(line)))
    .filter(line => line && !isHeaderOrFooterRow(line));

  const blocks: { dateToken: string; parts: string[] }[] = [];
  let current: { dateToken: string; parts: string[] } | null = null;

  for (const line of lines) {
    const dateMatch = line.match(DATE_TOKEN_RE);
    if (dateMatch && line.indexOf(dateMatch[0]) <= 18) {
      if (current) blocks.push(current);
      current = { dateToken: dateMatch[0], parts: [line.replace(dateMatch[0], '').trim()] };
      continue;
    }
    if (current && /\b(LA\d{3,4}|OP|PS|DH|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/.test(line)) {
      current.parts.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map(block => ({ dateToken: block.dateToken, text: normalizeSpaces(block.parts.join(' ')) }));
}

function extractFlightLegsFromReportBlock(text: string): FlightLeg[] {
  const legs: FlightLeg[] = [];
  const re = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime, destination, rawArrivalTime] = match;
    const isNextDay = /\(\+1\)/.test(rawArrivalTime) || timeToMinutes(cleanTime(rawArrivalTime)) < timeToMinutes(departureTime);
    const arrivalTime = cleanTime(rawArrivalTime);
    legs.push({
      flightNumber,
      origin,
      destination,
      departureTime: cleanTime(departureTime),
      arrivalTime,
      workType: explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP',
      aircraftType: inferAircraftType(text),
      duration: diffHours(departureTime, arrivalTime, isNextDay),
      isNextDay,
    });
  }
  return legs.filter((leg, index, all) => all.findIndex(other => other.flightNumber === leg.flightNumber && other.origin === leg.origin && other.departureTime === leg.departureTime) === index);
}

function extractDutyReportFromReportBlock(text: string, firstFlightNumber: string): string | null {
  if (!firstFlightNumber) return null;
  const fromBeforeFlight = extractDutyReportBeforeFirstFlight(text, firstFlightNumber);
  if (fromBeforeFlight) return cleanTime(fromBeforeFlight);
  const pairingReport = text.match(/\bLA\d{3,4}[/-][^\s]+\s+(\d{1,2}:\d{2})\s+LA\d{3,4}\b/);
  return pairingReport ? cleanTime(pairingReport[1]) : null;
}

function extractDutyDebriefFromReportBlock(text: string, lastLeg?: FlightLeg): string | null {
  if (!lastLeg) return null;
  const idx = text.lastIndexOf(lastLeg.flightNumber);
  const tail = idx >= 0 ? text.slice(idx) : text;
  const nextDayTimes = tail.match(/\b\d{1,2}:\d{2}\(\+1\)\b/g) || [];
  if (lastLeg.isNextDay && nextDayTimes.length >= 2) return cleanTime(nextDayTimes[nextDayTimes.length - 1]);
  const timeMatches = tail.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g) || [];
  const arrivalIndex = timeMatches.findIndex(time => cleanTime(time) === lastLeg.arrivalTime);
  if (arrivalIndex >= 0 && timeMatches[arrivalIndex + 1]) {
    const candidate = cleanTime(timeMatches[arrivalIndex + 1]);
    const gap = diffHours(lastLeg.arrivalTime, candidate, /\(\+1\)/.test(timeMatches[arrivalIndex + 1]));
    if (gap >= 0 && gap <= 3) return candidate;
  }
  return null;
}

function formatRosterDate(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function scoreParsedDays(days: RosterDay[], referenceMonth: number, referenceYear: number): number {
  const referenceDays = days.filter(day => day.month === referenceMonth && day.year === referenceYear);
  const dates = new Set(referenceDays.map(day => day.date));
  const flights = referenceDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
  const activities = referenceDays.filter(day => day.pairingCode || day.type !== 'OTHER').length;
  return dates.size * 6 + flights * 5 + activities * 2;
}


function mergeParsedDaySources(visualDays: RosterDay[], looseDays: RosterDay[], referenceMonth: number, referenceYear: number): RosterDay[] {
  const merged = new Map<string, RosterDay[]>();

  const add = (day: RosterDay) => {
    if (day.month !== referenceMonth || day.year !== referenceYear) return;
    const list = merged.get(day.date) || [];
    list.push(day);
    merged.set(day.date, list);
  };

  visualDays.forEach(add);

  for (const loose of looseDays) {
    if (loose.month !== referenceMonth || loose.year !== referenceYear) continue;
    const list = merged.get(loose.date) || [];

    if (loose.legs?.length) {
      const visualFlightIndex = list.findIndex(day => day.legs?.length);
      if (visualFlightIndex >= 0) {
        const current = list[visualFlightIndex];
        if (flightCoverageScore(loose) > flightCoverageScore(current)) {
          list[visualFlightIndex] = loose;
        } else {
          const missingLegs = (loose.legs || []).filter(leg => !current.legs.some(existing => existing.flightNumber === leg.flightNumber && existing.departureTime === leg.departureTime));
          if (missingLegs.length) {
            current.legs = [...current.legs, ...missingLegs];
            current.rawText = normalizeSpaces(`${current.rawText || ''} ${loose.rawText || ''}`);
            finalizeRosterDay(current);
          }
        }
      } else {
        list.push(loose);
      }
    } else {
      const exists = list.some(day => sameRosterRow(day, loose));
      if (!exists) list.push(loose);
    }

    merged.set(loose.date, list);
  }

  return Array.from(merged.values()).flat().sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}

function flightCoverageScore(day: RosterDay): number {
  const legs = day.legs || [];
  const nextDayBonus = day.isNextDay || legs.some(leg => leg.isNextDay) ? 4 : 0;
  return legs.length * 10 + routeSignatureForScore(legs).length + nextDayBonus;
}

function routeSignatureForScore(legs: FlightLeg[]): string {
  if (!legs.length) return '';
  const points = [legs[0].origin];
  for (const leg of legs) if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  return points.join('-');
}

function sameRosterRow(a: RosterDay, b: RosterDay): boolean {
  return a.date === b.date
    && (a.pairingCode || a.type) === (b.pairingCode || b.type)
    && (a.dutyReport || '') === (b.dutyReport || '')
    && (a.dutyDebrief || '') === (b.dutyDebrief || '')
    && (a.legs || []).length === (b.legs || []).length;
}

function cleanCrewName(value: string): string {
  return normalizeSpaces(String(value || '')
    .replace(/\b(Tripulante|Crew|Roster|Report|Date|BP|Base)\b/gi, ' ')
    .replace(/\s+-\s*$/g, ' ')
    .trim()) || 'Tripulante';
}

function parseHeader(fullText: string): {
  crewName: string;
  crewId: string;
  base: string;
  rank: string;
  airline?: string;
  month: number;
  year: number;
  totals: { flightHours?: number; dutyHours?: number };
} {
  let crewName = 'Tripulante';
  let crewId = '';
  let base = 'BSB';
  let rank = 'CCM';
  let airline = /LATAM|\bLA\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea';
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  const compactText = normalizeSpaces(fullText.replace(/\n/g, ' '));

  const aimsCrew = compactText.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d{3,})(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (aimsCrew) {
    crewName = cleanCrewName(aimsCrew[1]);
    crewId = aimsCrew[2];
    base = aimsCrew[3].toUpperCase();
    month = Number(aimsCrew[5]);
    year = Number(aimsCrew[6]);
  }

  const crewMatch = compactText.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
  if (crewMatch) {
    crewName = cleanCrewName(crewMatch[1]);
    crewId = crewMatch[2];
    base = crewMatch[4];
    rank = crewMatch[5];
  }

  const rosterFull = compactText.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
  if (rosterFull) {
    month = monthNameToNumber(rosterFull[2]);
    year = Number(rosterFull[3]);
    crewName = cleanCrewName(rosterFull[7]);
    crewId = rosterFull[8];
    base = rosterFull[10];
    rank = rosterFull[11];
  }

  const rangeMatch = compactText.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (rangeMatch) {
    month = monthNameToNumber(rangeMatch[2]);
    year = Number(rangeMatch[3]);
  }

  const totalsMatch = compactText.match(/FH\s*:\s*(\d{1,3}:\d{2})\s*\|\s*DH\s*:\s*(\d{1,3}:\d{2})/i);
  const totals = totalsMatch
    ? { flightHours: timeStringToHours(totalsMatch[1]), dutyHours: timeStringToHours(totalsMatch[2]) }
    : {};

  return { crewName, crewId, base, rank, airline, month, year, totals };
}

function parseDaysFromRows(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {
  const days: RosterDay[] = [];
  let currentDay: RosterDay | null = null;

  const finishCurrentDay = () => {
    if (!currentDay) return;
    finalizeRosterDay(currentDay);
    days.push(currentDay);
    currentDay = null;
  };

  for (const row of rows) {
    const rowText = stripUpdatedDate(normalizeSpaces(row.text));
    if (!rowText || isHeaderOrFooterRow(rowText)) continue;

    const primaryDate = getPrimaryDateFromRow(row);

    if (primaryDate) {
      finishCurrentDay();
      const parsedDate = parseDateToken(primaryDate, defaultMonth, defaultYear);
      currentDay = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
      currentDay.rawText = rowText;
      parseRowIntoDay(currentDay, rowText.replace(primaryDate, '').trim());
    } else if (currentDay && isContinuationRow(rowText)) {
      currentDay.rawText = `${currentDay.rawText || ''}\n${rowText}`.trim();
      parseRowIntoDay(currentDay, rowText);
    }
  }

  finishCurrentDay();

  return days.filter(day => {
    if (day.month !== defaultMonth || day.year !== defaultYear) return false;
    if (day.type === 'OTHER' && day.legs.length === 0 && !day.dutyReport && !day.pairingCode) return false;
    return true;
  });
}

function getPrimaryDateFromRow(row: VisualRow): string | null {
  const firstDateByText = row.text.trim().match(DATE_TOKEN_RE)?.[0] || null;
  if (firstDateByText && row.text.trim().startsWith(firstDateByText)) return firstDateByText;

  const dateIndex = row.items.findIndex(item => DATE_TOKEN_RE.test(item.str));
  if (dateIndex >= 0 && dateIndex <= 1) {
    const match = row.items[dateIndex].str.match(DATE_TOKEN_RE);
    return match?.[0] || null;
  }

  return null;
}

function parseRowIntoDay(day: RosterDay, rowText: string): void {
  const text = stripUpdatedDate(normalizeSpaces(rowText));
  if (!text) return;

  const type = inferDayType(text);
  if (type !== 'OTHER' || day.type === 'OTHER') day.type = type;

  const pairing = extractPairingCode(text);
  if (pairing && !day.pairingCode) day.pairingCode = pairing;

  parseFlightLegsIntoDay(day, text);
  parseActivityTimesIntoDay(day, text);
}

function parseFlightLegsIntoDay(day: RosterDay, text: string): void {
  const flightRegex = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g;
  let match: RegExpExecArray | null;

  while ((match = flightRegex.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime, destination, rawArrivalTime] = match;
    const isNextDay = /\(\+1\)/.test(rawArrivalTime);
    const arrivalTime = rawArrivalTime.replace('( +1)', '').replace('(+1)', '');
    const workType = explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP';
    const aircraftType = inferAircraftType(text);

    if (!day.legs.some(leg => leg.flightNumber === flightNumber && leg.origin === origin && leg.departureTime === departureTime)) {
      day.legs.push({
        flightNumber,
        origin,
        destination,
        departureTime,
        arrivalTime,
        workType,
        aircraftType,
        duration: diffHours(departureTime, arrivalTime, isNextDay),
        isNextDay,
      });
    }

    day.type = 'VOO';
    if (isNextDay) day.isNextDay = true;
  }

  if (day.legs.length > 0) {
    const firstLeg = day.legs[0];
    if (!day.dutyReport) {
      const reportCandidate = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber);
      day.dutyReport = reportCandidate || subtractMinutes(firstLeg.departureTime, 45);
    }
    day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, leg.isNextDay)), 0));
  }
}

function parseActivityTimesIntoDay(day: RosterDay, text: string): void {
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})(?:\(\+1\))?\b/g)].map(m => m[0]);
  const cleanTimes = times.map(cleanTime);

  if (day.type === 'DO' || day.type === 'DOF' || day.type === 'DR' || day.type === 'OFF') {
    day.dutyReport = null;
    day.dutyDebrief = null;
    day.dutyHours = 0;
    return;
  }

  if ((day.type === 'HSB' || day.type === 'HSBE' || day.type === 'ASB' || day.type === 'CRM' || day.type === 'OTHER') && day.legs.length === 0) {
    const stationTimes = [...text.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g)].map(m => m[1]);
    if (stationTimes.length >= 2) {
      day.dutyReport = cleanTime(stationTimes[0]);
      day.dutyDebrief = cleanTime(stationTimes[1]);
      day.isNextDay = stationTimes[1].includes('(+1)') || diffHours(day.dutyReport, day.dutyDebrief) > 18;
      day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, stationTimes[1].includes('(+1)')));
      return;
    }

    if (cleanTimes.length >= 2) {
      const uniqueTimes = Array.from(new Set(cleanTimes));
      day.dutyReport = uniqueTimes[0];
      let end = uniqueTimes[1] || uniqueTimes[0];
      for (const candidate of uniqueTimes.slice(1)) {
        const hours = diffHours(day.dutyReport, candidate);
        if (hours >= 0.25 && hours <= 14) end = candidate;
      }
      day.dutyDebrief = end;
      day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief));
      return;
    }
  }

  if (day.legs.length > 0) {
    const firstLeg = day.legs[0];
    if (!day.dutyReport) {
      day.dutyReport = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber) || subtractMinutes(firstLeg.departureTime, 45);
    }
    const lastLeg = day.legs[day.legs.length - 1];
    day.dutyDebrief = addMinutes(lastLeg.arrivalTime, 30);
    day.isNextDay = day.isNextDay || Boolean(lastLeg.isNextDay) || timeToMinutes(day.dutyDebrief) < timeToMinutes(day.dutyReport);
    day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
  }
}

function finalizeRosterDay(day: RosterDay): void {
  if (day.legs.length > 0) {
    day.type = 'VOO';
    const firstLeg = day.legs[0];
    const lastLeg = day.legs[day.legs.length - 1];
    day.dutyReport = day.dutyReport || subtractMinutes(firstLeg.departureTime, 45);
    day.dutyDebrief = day.dutyDebrief || addMinutes(lastLeg.arrivalTime, 30);
    day.isNextDay = day.isNextDay || Boolean(lastLeg.isNextDay) || timeToMinutes(day.dutyDebrief) < timeToMinutes(day.dutyReport);
    day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
    day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, leg.isNextDay)), 0));
  } else if (day.dutyReport && day.dutyDebrief && day.dutyHours === null) {
    day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
  }

  if (day.type === 'OTHER' && /\b(CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{1,4}J)\b/.test(day.rawText || '')) {
    day.flyingHours = 0;
  }
}

function createRosterDay(day: number, month: number, year: number, base: string): RosterDay {
  const dateObj = new Date(year, month - 1, day);
  return {
    date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    dayNumber: day,
    month,
    year,
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dateObj.getDay()],
    type: 'OTHER',
    pairingCode: '',
    dutyReport: null,
    dutyDebrief: null,
    legs: [],
    dutyHours: null,
    flyingHours: null,
    isNextDay: false,
    hotel: null,
    base,
  };
}

function inferDayType(text: string): RosterDay['type'] {
  const sample = ` ${text.toUpperCase()} `;
  // Prioridade operacional: evita ASB/HSBE/MT serem confundidos com descanso/inativo
  // quando o PDF/AIMS contém (...) ou restos de linhas de pernoite na mesma coluna.
  if (/\bLA\d{3,4}\b/.test(sample)) return 'VOO';
  if (/\bHSBE\b/.test(sample)) return 'HSBE';
  if (/\bHSB\b/.test(sample)) return 'HSB';
  if (/\bASB\b/.test(sample)) return 'ASB';
  if (/\bCRM\b/.test(sample)) return 'CRM';
  if (/\bC\d{2,3}F\b/.test(sample)) return 'CRM';
  if (/\bRES\b/.test(sample)) return 'RES';
  if (/\bDOF\b/.test(sample)) return 'DOF';
  if (/\bDO\b/.test(sample)) return 'DO';
  if (/\bDR\b/.test(sample)) return 'DR';
  if (/\bOFF\b/.test(sample)) return 'OFF';
  return 'OTHER';
}

function extractPairingCode(text: string): string {
  const direct = text.match(/\b(?:LA\d{3,4}|HSBE?|ASB|C\d{2,3}F|MT|CBF|EMER|NSJ?|IJ|DM|[A-Z]{1,4}J)[-/A-Z0-9]*\/\d{6}\/[A-Z0-9-]+\b/i)?.[0];
  if (direct) return direct;
  const activity = text.match(/\b(HSBE?|ASB|CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{1,4}J|DOF?|DR|CRM)\b/i)?.[0];
  return activity || '';
}

function extractDutyReportBeforeFirstFlight(text: string, flightNumber: string): string | null {
  const idx = text.indexOf(flightNumber);
  if (idx <= 0) return null;
  const beforeFlight = text.slice(0, idx);
  const times = beforeFlight.match(/\b\d{1,2}:\d{2}\b/g);
  return times?.[times.length - 1] || null;
}

function inferWorkTypeFromContext(text: string, index: number): string | null {
  const fragment = text.slice(Math.max(0, index - 20), index + 60);
  const match = fragment.match(/\b(OP|PS|DH)\b/);
  return match?.[1] || null;
}

function inferAircraftType(text: string): string | undefined {
  return text.match(/\b(320|321|32S|31R|39R|328)\b/)?.[1];
}

function isContinuationRow(text: string): boolean {
  return /\b(LA\d{3,4}|HSBE?|ASB|CBF|EMER|MT|NSJ?|IJ|DM|[A-Z]{1,4}J|DOF?|DR|CRM|C\d{2,3}F)\b/.test(text);
}

function isHeaderOrFooterRow(text: string): boolean {
  return /^(Date\b|Pairing\/Activity\b|Duty\b|Report\b|Item\b|Updated Date\b)/i.test(text)
    || /Roster\s+Report/i.test(text)
    || /\bDep Stn\b|\bArr\. Stn\b|\bUpdated By\b|\bACY Rep\b|\bA\/C\b/i.test(text)
    || /^\f+$/.test(text);
}

function stripUpdatedDate(text: string): string {
  return normalizeSpaces(text
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, '')
    .replace(/\b(SCHEDULER|msgsys|\d{6,})\b\s*$/i, '$1'));
}

function cleanCellText(text: string): string {
  return String(text).replace(/[\u0000-\u001F\uFFFE]/g, '').trim();
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanTime(time: string): string {
  return time.replace('(+1)', '').padStart(5, '0');
}

function monthNameToNumber(name: string): number {
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  return map[name.toLowerCase().substring(0, 3)] || 1;
}

function parseDateToken(token: string, defaultMonth: number, defaultYear: number): { day: number; month: number; year: number } {
  const match = token.match(DATE_TOKEN_RE);
  if (!match) return { day: 1, month: defaultMonth, year: defaultYear };
  return {
    day: Number(match[1]),
    month: monthNameToNumber(match[2]),
    year: Number(match[3]),
  };
}

function timeStringToHours(time: string): number {
  const [h, m] = cleanTime(time).split(':').map(Number);
  return h + m / 60;
}

function timeToMinutes(time: string): number {
  const [h, m] = cleanTime(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function diffHours(start: string, end: string, forceNextDay = false): number {
  let diff = timeToMinutes(cleanTime(end)) - timeToMinutes(cleanTime(start));
  if (diff < 0 || forceNextDay) diff += 24 * 60;
  return diff / 60;
}

function addMinutes(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes;
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function subtractMinutes(time: string, minutes: number): string {
  return addMinutes(time, -minutes);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}


function parseCrewRosterReportLooseText(fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const lines = fullText
    .split(/\r?\n/)
    .map(line => stripUpdatedDate(normalizeSpaces(line)))
    .filter(line => line && !isHeaderOrFooterRow(line));

  const blocks: { dateToken: string; text: string }[] = [];
  let current: { dateToken: string; parts: string[] } | null = null;

  for (const line of lines) {
    const dateMatch = line.match(DATE_TOKEN_RE);
    if (dateMatch && line.indexOf(dateMatch[0]) <= 18) {
      if (current) blocks.push({ dateToken: current.dateToken, text: current.parts.join(' ') });
      current = { dateToken: dateMatch[0], parts: [line.replace(dateMatch[0], '').trim()] };
      continue;
    }
    if (current && isRelevantContinuationText(line)) {
      current.parts.push(line);
    }
  }
  if (current) blocks.push({ dateToken: current.dateToken, text: current.parts.join(' ') });

  const days: RosterDay[] = [];
  for (const block of blocks) {
    const parsedDate = parseDateToken(block.dateToken, referenceMonth, referenceYear);
    if (parsedDate.month !== referenceMonth || parsedDate.year !== referenceYear) continue;
    const day = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
    day.rawText = normalizeSpaces(block.text);
    parseRowIntoDay(day, day.rawText);
    rescueSplitFlightLegsIntoDay(day, day.rawText);
    if (day.type === 'OTHER') {
      const type = inferDayType(day.rawText || '');
      if (type !== 'OTHER') day.type = type;
    }
    finalizeRosterDay(day);
    if (day.type === 'OTHER' && day.legs.length === 0 && !day.pairingCode && !day.dutyReport) continue;
    days.push(day);
  }

  const enriched = rescueActivitiesFromText(days, fullText, referenceMonth, referenceYear, base);
  return enriched.sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}


function rescueSplitFlightLegsIntoDay(day: RosterDay, text: string): void {
  // Alguns CrewRosterReport em PDF quebram a última perna noturna em várias
  // linhas/colunas: a estação de chegada e o debrief aparecem antes do número
  // do voo, enquanto o horário de chegada fica depois. Ex. do relatório real:
  // MAB 01:15(+1) ... LA3500 OP BSB 22:55 ... 00:45(+1)
  const startRe = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2})/g;
  let match: RegExpExecArray | null;
  let changed = false;

  while ((match = startRe.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime] = match;
    if (day.legs.some(leg => leg.flightNumber === flightNumber && leg.departureTime === departureTime)) continue;

    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    const before = text.slice(Math.max(0, match.index - 140), match.index);

    let destination = '';
    let rawArrivalTime = '';
    let rawDebriefTime = '';

    const directAfter = after.match(/^\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/);
    if (directAfter) {
      destination = directAfter[1];
      rawArrivalTime = directAfter[2];
      const debriefAfter = after.slice(directAfter.index || 0).match(/\b\d{1,2}:\d{2}\(\+1\)\b/g);
      if (debriefAfter && debriefAfter.length > 1) rawDebriefTime = debriefAfter[debriefAfter.length - 1];
    }

    if (!destination || !rawArrivalTime) {
      const stationBefore = [...before.matchAll(/\b([A-Z]{3})\s+(\d{1,2}:\d{2}\(\+1\))/g)].pop();
      const nextDayTimesAfter = after.match(/\b\d{1,2}:\d{2}\(\+1\)\b/g) || [];
      const destinationBefore = stationBefore?.[1];
      const debriefBefore = stationBefore?.[2];
      const arrivalAfter = nextDayTimesAfter[0];
      if (destinationBefore && debriefBefore && arrivalAfter) {
        destination = destinationBefore;
        rawDebriefTime = debriefBefore;
        // O primeiro horário (+1) depois do voo costuma ser a chegada; o debrief
        // normalmente aparece na coluna anterior como no caso MAB 00:45 / 01:15.
        rawArrivalTime = arrivalAfter;
      }
    }

    if (!destination || !rawArrivalTime) continue;

    const isNextDay = /\(\+1\)/.test(rawArrivalTime) || timeToMinutes(cleanTime(rawArrivalTime)) < timeToMinutes(departureTime);
    const arrivalTime = cleanTime(rawArrivalTime);
    const workType = explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP';

    day.legs.push({
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      workType,
      aircraftType: inferAircraftType(after) || inferAircraftType(text),
      duration: diffHours(departureTime, arrivalTime, isNextDay),
      isNextDay,
    });

    if (isNextDay) day.isNextDay = true;
    if (rawDebriefTime) day.dutyDebrief = cleanTime(rawDebriefTime);
    changed = true;
  }

  if (changed) {
    day.type = 'VOO';
    day.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
    finalizeRosterDay(day);
  }
}

function isRelevantContinuationText(line: string): boolean {
  return /\b(LA\d{3,4}|DOF?|DR|OFF|HSBE?|ASB|CBF|EMER|MT|CRM|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function rescueActivitiesFromText(days: RosterDay[], fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const existing = new Set(days.map(day => `${day.date}|${day.pairingCode}|${day.dutyReport || ''}|${day.legs.map(l => l.flightNumber).join(',')}`));
  const output = [...days];
  const compact = fullText.replace(/\r/g, '\n');
  const activityRe = new RegExp(`(\\d{2})-${monthNumberToEnglishAbbr(referenceMonth)}-${referenceYear}\\s+\\b(CBF|EMER|MT|CRM|C\\d{2,3}F|NSJ?|IJ|DM)\\b([\\s\\S]{0,180}?)(?=\\d{2}-[A-Za-z]{3}-\\d{4}|$)`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = activityRe.exec(compact)) !== null) {
    const dayNumber = Number(match[1]);
    const code = match[2].toUpperCase();
    const text = normalizeSpaces(`${code} ${match[3] || ''}`);
    const day = createRosterDay(dayNumber, referenceMonth, referenceYear, base);
    day.rawText = text;
    day.type = code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER';
    day.pairingCode = code;
    parseActivityTimesIntoDay(day, text);
    finalizeRosterDay(day);
    const key = `${day.date}|${day.pairingCode}|${day.dutyReport || ''}|`;
    if (!existing.has(key)) {
      existing.add(key);
      output.push(day);
    }
  }
  return output;
}

function monthNumberToEnglishAbbr(month: number): string {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1] || 'Jan';
}

function parseRosterText(fullText: string): CrewRoster {
  const header = parseHeader(fullText);
  const syntheticRows = fullText.split('\n').map((text, index) => ({
    page: 1,
    key: index,
    text: normalizeSpaces(text),
    items: normalizeSpaces(text).split(' ').map((str, i) => ({ str, x: i, y: 0, page: 1 })),
  }));
  const days = parseDaysFromRows(syntheticRows, header.month, header.year, header.base);

  return {
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: header.airline,
    month: header.month,
    year: header.year,
    days,
    rawText: fullText,
    totals: header.totals,
  };
}
