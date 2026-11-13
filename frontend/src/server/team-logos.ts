import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SportType } from './types';

export type CrestPattern =
  | 'stripes'
  | 'diagonal'
  | 'chevron'
  | 'halves'
  | 'star'
  | 'esports'
  | 'medallion'
  | 'solid';

interface ClubProfile {
  aliases: string[];
  sportHint?: SportType;
  enQuery: string;
  ruWiki: string;
  code: string;
  primary: string;
  secondary: string;
  accent: string;
  pattern: CrestPattern;
}

const CLUB_PROFILES: ClubProfile[] = [
  // === РПЛ (Футбол РФ) ===
  {
    aliases: ['краснодар', 'фк краснодар', 'krasnodar'],
    sportHint: 'FOOTBALL',
    enQuery: 'FC Krasnodar',
    ruWiki: 'Краснодар (футбольный клуб)',
    code: 'КРС',
    primary: '#006838',
    secondary: '#111827',
    accent: '#D4AF37',
    pattern: 'halves',
  },
  {
    aliases: ['зенит', 'зенит санкт-петербург', 'фк зенит', 'zenit'],
    sportHint: 'FOOTBALL',
    enQuery: 'Zenit St Petersburg',
    ruWiki: 'Зенит (футбольный клуб, Санкт-Петербург)',
    code: 'ЗЕН',
    primary: '#009EE0',
    secondary: '#004B87',
    accent: '#FFFFFF',
    pattern: 'chevron',
  },
  {
    aliases: ['спартак', 'спартак москва', 'фк спартак', 'spartak moscow'],
    sportHint: 'FOOTBALL',
    enQuery: 'Spartak Moscow',
    ruWiki: 'Спартак (футбольный клуб, Москва)',
    code: 'СПА',
    primary: '#D91A2A',
    secondary: '#FFFFFF',
    accent: '#F59E0B',
    pattern: 'diagonal',
  },
  {
    aliases: ['цска', 'пфк цска', 'цска москва', 'cska moscow'],
    sportHint: 'FOOTBALL',
    enQuery: 'CSKA Moscow',
    ruWiki: 'ЦСКА (футбольный клуб, Москва)',
    code: 'ЦСК',
    primary: '#D01027',
    secondary: '#0038A8',
    accent: '#FBBF24',
    pattern: 'stripes',
  },
  {
    aliases: ['локомотив', 'локомотив москва', 'фк локомотив', 'lokomotiv moscow'],
    sportHint: 'FOOTBALL',
    enQuery: 'Lokomotiv Moscow',
    ruWiki: 'Локомотив (футбольный клуб, Москва)',
    code: 'ЛОК',
    primary: '#D61F26',
    secondary: '#00843D',
    accent: '#FFFFFF',
    pattern: 'halves',
  },
  {
    aliases: ['динамо', 'динамо москва', 'фк динамо', 'dynamo moscow'],
    sportHint: 'FOOTBALL',
    enQuery: 'Dynamo Moscow',
    ruWiki: 'Динамо (футбольный клуб, Москва)',
    code: 'ДИН',
    primary: '#0055A5',
    secondary: '#FFFFFF',
    accent: '#93C5FD',
    pattern: 'diagonal',
  },
  {
    aliases: ['ростов', 'фк ростов', 'rostov'],
    sportHint: 'FOOTBALL',
    enQuery: 'FC Rostov',
    ruWiki: 'Ростов (футбольный клуб)',
    code: 'РОС',
    primary: '#FACC15',
    secondary: '#1E3A8A',
    accent: '#FFFFFF',
    pattern: 'halves',
  },
  {
    aliases: ['рубин', 'рубин казань', 'rubin kazan'],
    sportHint: 'FOOTBALL',
    enQuery: 'Rubin Kazan',
    ruWiki: 'Рубин (футбольный клуб)',
    code: 'РУБ',
    primary: '#7F1D1D',
    secondary: '#065F46',
    accent: '#D4AF37',
    pattern: 'chevron',
  },
  {
    aliases: ['крылья советов', 'крылья', 'krylya sovetov'],
    sportHint: 'FOOTBALL',
    enQuery: 'Krylia Sovetov',
    ruWiki: 'Крылья Советов (футбольный клуб, Самара)',
    code: 'КРС',
    primary: '#0284C7',
    secondary: '#1E3A8A',
    accent: '#FFFFFF',
    pattern: 'chevron',
  },
  {
    aliases: ['акрон', 'акрон тольятти', 'akron'],
    sportHint: 'FOOTBALL',
    enQuery: 'FC Akron Togliatti',
    ruWiki: 'Акрон (футбольный клуб)',
    code: 'АКР',
    primary: '#B91C1C',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'stripes',
  },
  {
    aliases: ['ахмат', 'грозный', 'akhmat'],
    sportHint: 'FOOTBALL',
    enQuery: 'Akhmat Grozny',
    ruWiki: 'Ахмат (футбольный клуб)',
    code: 'АХМ',
    primary: '#15803D',
    secondary: '#FFFFFF',
    accent: '#FACC15',
    pattern: 'stripes',
  },
  {
    aliases: ['пари нн', 'нижний новгород', 'pari nn'],
    sportHint: 'FOOTBALL',
    enQuery: 'Pari Nizhny Novgorod',
    ruWiki: 'Пари Нижний Новгород (футбольный клуб)',
    code: 'ПНН',
    primary: '#0EA5E9',
    secondary: '#0F172A',
    accent: '#FFFFFF',
    pattern: 'halves',
  },

  // === КХЛ (Хоккей) ===
  {
    aliases: ['ска', 'хк ска', 'ска санкт-петербург', 'ska'],
    sportHint: 'HOCKEY',
    enQuery: 'SKA Saint Petersburg',
    ruWiki: 'СКА (хоккейный клуб)',
    code: 'СКА',
    primary: '#003087',
    secondary: '#C8102E',
    accent: '#FFFFFF',
    pattern: 'star',
  },
  {
    aliases: ['ак барс', 'хк ак барс', 'ak bars'],
    sportHint: 'HOCKEY',
    enQuery: 'Ak Bars Kazan',
    ruWiki: 'Ак Барс (хоккейный клуб)',
    code: 'АКБ',
    primary: '#006847',
    secondary: '#CE1126',
    accent: '#FFFFFF',
    pattern: 'chevron',
  },
  {
    aliases: ['авангард', 'авангард омск', 'хк авангард', 'avangard omsk'],
    sportHint: 'HOCKEY',
    enQuery: 'Avangard Omsk',
    ruWiki: 'Авангард (хоккейный клуб)',
    code: 'АВГ',
    primary: '#C8102E',
    secondary: '#111827',
    accent: '#F59E0B',
    pattern: 'chevron',
  },
  {
    aliases: ['металлург', 'металлург магнитогорск', 'магнитка', 'metallurg magnitogorsk'],
    sportHint: 'HOCKEY',
    enQuery: 'Metallurg Magnitogorsk',
    ruWiki: 'Металлург (хоккейный клуб, Магнитогорск)',
    code: 'ММГ',
    primary: '#1E3A8A',
    secondary: '#DC2626',
    accent: '#FFFFFF',
    pattern: 'diagonal',
  },
  {
    aliases: ['трактор', 'трактор челябинск', 'хк трактор', 'traktor chelyabinsk'],
    sportHint: 'HOCKEY',
    enQuery: 'Traktor Chelyabinsk',
    ruWiki: 'Трактор (хоккейный клуб)',
    code: 'ТРК',
    primary: '#111827',
    secondary: '#FFFFFF',
    accent: '#EF4444',
    pattern: 'halves',
  },
  {
    aliases: ['салават юлаев', 'салават', 'salavat yulaev'],
    sportHint: 'HOCKEY',
    enQuery: 'Salavat Yulaev Ufa',
    ruWiki: 'Салават Юлаев (хоккейный клуб)',
    code: 'СЮЛ',
    primary: '#16A34A',
    secondary: '#0284C7',
    accent: '#FFFFFF',
    pattern: 'chevron',
  },
  {
    aliases: ['автомобилист', 'автомобилист екатеринбург', 'avtomobilist'],
    sportHint: 'HOCKEY',
    enQuery: 'Avtomobilist Yekaterinburg',
    ruWiki: 'Автомобилист (хоккейный клуб)',
    code: 'АВТ',
    primary: '#B91C1C',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'diagonal',
  },
  {
    aliases: ['локомотив ярославль', 'хк локомотив'],
    sportHint: 'HOCKEY',
    enQuery: 'Lokomotiv Yaroslavl',
    ruWiki: 'Локомотив (хоккейный клуб, Ярославль)',
    code: 'ЛОК',
    primary: '#B91C1C',
    secondary: '#1E3A8A',
    accent: '#FFFFFF',
    pattern: 'halves',
  },

  // === Топ Футбол Европы (ЛЧ, АПЛ, Ла Лига, Серия А, Бундеслига, Лига 1) ===
  {
    aliases: ['реал мадрид', 'реал', 'real madrid'],
    sportHint: 'FOOTBALL',
    enQuery: 'Real Madrid',
    ruWiki: 'Реал Мадрид (футбольный клуб)',
    code: 'RMA',
    primary: '#1E3A8A',
    secondary: '#F8FAFC',
    accent: '#F59E0B',
    pattern: 'diagonal',
  },
  {
    aliases: ['барселона', 'барса', 'barcelona', 'fc barcelona'],
    sportHint: 'FOOTBALL',
    enQuery: 'FC Barcelona',
    ruWiki: 'Барселона (футбольный клуб)',
    code: 'BAR',
    primary: '#A50044',
    secondary: '#004D98',
    accent: '#EDBB00',
    pattern: 'stripes',
  },
  {
    aliases: ['атлетико', 'атлетико мадрид', 'atletico madrid'],
    sportHint: 'FOOTBALL',
    enQuery: 'Atletico Madrid',
    ruWiki: 'Атлетико Мадрид',
    code: 'ATM',
    primary: '#CB3524',
    secondary: '#272E61',
    accent: '#FFFFFF',
    pattern: 'stripes',
  },
  {
    aliases: ['манчестер сити', 'ман сити', 'manchester city', 'man city'],
    sportHint: 'FOOTBALL',
    enQuery: 'Manchester City',
    ruWiki: 'Манчестер Сити',
    code: 'MCI',
    primary: '#6CABDD',
    secondary: '#1C2C5B',
    accent: '#FFC659',
    pattern: 'solid',
  },
  {
    aliases: ['арсенал', 'арсенал лондон', 'arsenal'],
    sportHint: 'FOOTBALL',
    enQuery: 'Arsenal FC',
    ruWiki: 'Арсенал (футбольный клуб, Лондон)',
    code: 'ARS',
    primary: '#EF0107',
    secondary: '#063672',
    accent: '#FFFFFF',
    pattern: 'halves',
  },
  {
    aliases: ['ливерпуль', 'liverpool'],
    sportHint: 'FOOTBALL',
    enQuery: 'Liverpool FC',
    ruWiki: 'Ливерпуль (футбольный клуб)',
    code: 'LIV',
    primary: '#C8102E',
    secondary: '#00B2A9',
    accent: '#F6EB61',
    pattern: 'solid',
  },
  {
    aliases: ['челси', 'chelsea'],
    sportHint: 'FOOTBALL',
    enQuery: 'Chelsea FC',
    ruWiki: 'Челси (футбольный клуб)',
    code: 'CHE',
    primary: '#034694',
    secondary: '#1E40AF',
    accent: '#DBA111',
    pattern: 'solid',
  },
  {
    aliases: ['манчестер юнайтед', 'ман юнайтед', 'мю', 'manchester united'],
    sportHint: 'FOOTBALL',
    enQuery: 'Manchester United',
    ruWiki: 'Манчестер Юнайтед',
    code: 'MUN',
    primary: '#DA291C',
    secondary: '#111827',
    accent: '#FBE122',
    pattern: 'halves',
  },
  {
    aliases: ['бавария', 'бавария мюнхен', 'bayern', 'bayern munich'],
    sportHint: 'FOOTBALL',
    enQuery: 'Bayern Munich',
    ruWiki: 'Бавария (футбольный клуб)',
    code: 'BAY',
    primary: '#DC052D',
    secondary: '#0066B2',
    accent: '#FFFFFF',
    pattern: 'diagonal',
  },
  {
    aliases: ['байер', 'байер леверкузен', 'bayer leverkusen'],
    sportHint: 'FOOTBALL',
    enQuery: 'Bayer Leverkusen',
    ruWiki: 'Байер 04',
    code: 'B04',
    primary: '#E32221',
    secondary: '#111827',
    accent: '#FACC15',
    pattern: 'halves',
  },
  {
    aliases: ['боруссия дортмунд', 'боруссия д', 'дортмунд', 'borussia dortmund'],
    sportHint: 'FOOTBALL',
    enQuery: 'Borussia Dortmund',
    ruWiki: 'Боруссия (футбольный клуб, Дортмунд)',
    code: 'BVB',
    primary: '#FDE100',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'diagonal',
  },
  {
    aliases: ['интер', 'интернационале', 'интер милан', 'inter milan', 'internazionale'],
    sportHint: 'FOOTBALL',
    enQuery: 'Inter Milan',
    ruWiki: 'Интернационале',
    code: 'INT',
    primary: '#010E80',
    secondary: '#111827',
    accent: '#D4AF37',
    pattern: 'stripes',
  },
  {
    aliases: ['милан', 'ас милан', 'ac milan'],
    sportHint: 'FOOTBALL',
    enQuery: 'AC Milan',
    ruWiki: 'Милан (футбольный клуб)',
    code: 'MIL',
    primary: '#FB090B',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'stripes',
  },
  {
    aliases: ['ювентус', 'юве', 'juventus'],
    sportHint: 'FOOTBALL',
    enQuery: 'Juventus',
    ruWiki: 'Ювентус',
    code: 'JUV',
    primary: '#111827',
    secondary: '#475569',
    accent: '#FFFFFF',
    pattern: 'stripes',
  },
  {
    aliases: ['наполи', 'napoli'],
    sportHint: 'FOOTBALL',
    enQuery: 'SSC Napoli',
    ruWiki: 'Наполи',
    code: 'NAP',
    primary: '#12A0D7',
    secondary: '#003C82',
    accent: '#FFFFFF',
    pattern: 'solid',
  },
  {
    aliases: ['псж', 'пари сен-жермен', 'psg', 'paris saint-germain'],
    sportHint: 'FOOTBALL',
    enQuery: 'Paris Saint-Germain',
    ruWiki: 'Пари Сен-Жермен',
    code: 'PSG',
    primary: '#004170',
    secondary: '#DA291C',
    accent: '#FFFFFF',
    pattern: 'stripes',
  },

  // === Киберспорт (CS2 / Dota 2) ===
  {
    aliases: ['team spirit', 'spirit', 'тим спирит', 'спирит'],
    sportHint: 'ESPORTS',
    enQuery: 'Team Spirit',
    ruWiki: 'Team Spirit',
    code: 'TS',
    primary: '#0F172A',
    secondary: '#334155',
    accent: '#F8FAFC',
    pattern: 'esports',
  },
  {
    aliases: ['natus vincere', 'navi', 'na\'vi', 'нави'],
    sportHint: 'ESPORTS',
    enQuery: 'Natus Vincere',
    ruWiki: 'Natus Vincere',
    code: 'NV',
    primary: '#FACC15',
    secondary: '#111827',
    accent: '#111827',
    pattern: 'esports',
  },
  {
    aliases: ['virtus.pro', 'virtus pro', 'виртус про', 'vp'],
    sportHint: 'ESPORTS',
    enQuery: 'Virtus.pro',
    ruWiki: 'Virtus.pro',
    code: 'VP',
    primary: '#F97316',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'esports',
  },
  {
    aliases: ['betboom', 'betboom team', 'бетбум'],
    sportHint: 'ESPORTS',
    enQuery: 'BetBoom Team',
    ruWiki: 'BetBoom Team',
    code: 'BB',
    primary: '#EF4444',
    secondary: '#111827',
    accent: '#FACC15',
    pattern: 'esports',
  },
  {
    aliases: ['g2', 'g2 esports'],
    sportHint: 'ESPORTS',
    enQuery: 'G2 Esports',
    ruWiki: 'G2 Esports',
    code: 'G2',
    primary: '#111827',
    secondary: '#DC2626',
    accent: '#FFFFFF',
    pattern: 'esports',
  },
  {
    aliases: ['faze', 'faze clan'],
    sportHint: 'ESPORTS',
    enQuery: 'FaZe Clan',
    ruWiki: 'FaZe Clan',
    code: 'FZ',
    primary: '#DC2626',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'esports',
  },
  {
    aliases: ['vitality', 'team vitality'],
    sportHint: 'ESPORTS',
    enQuery: 'Team Vitality',
    ruWiki: 'Team Vitality',
    code: 'VIT',
    primary: '#EAB308',
    secondary: '#111827',
    accent: '#111827',
    pattern: 'esports',
  },
  {
    aliases: ['mouz', 'mousesports'],
    sportHint: 'ESPORTS',
    enQuery: 'MOUZ',
    ruWiki: 'MOUZ',
    code: 'MZ',
    primary: '#E11D48',
    secondary: '#111827',
    accent: '#FFFFFF',
    pattern: 'esports',
  },

  // === Теннис ATP / WTA ===
  {
    aliases: ['даниил медведев', 'медведев', 'daniil medvedev', 'medvedev'],
    sportHint: 'TENNIS',
    enQuery: 'Daniil Medvedev',
    ruWiki: 'Медведев, Даниил Сергеевич',
    code: 'ДМ',
    primary: '#1D4ED8',
    secondary: '#0F172A',
    accent: '#FFFFFF',
    pattern: 'medallion',
  },
  {
    aliases: ['янник синнер', 'синнер', 'jannik sinner', 'sinner'],
    sportHint: 'TENNIS',
    enQuery: 'Jannik Sinner',
    ruWiki: 'Синнер, Янник',
    code: 'JS',
    primary: '#EA580C',
    secondary: '#0F172A',
    accent: '#FFFFFF',
    pattern: 'medallion',
  },
  {
    aliases: ['карлос алькарас', 'алькарас', 'carlos alcaraz', 'alcaraz'],
    sportHint: 'TENNIS',
    enQuery: 'Carlos Alcaraz',
    ruWiki: 'Алькарас, Карлос',
    code: 'CA',
    primary: '#DC2626',
    secondary: '#991B1B',
    accent: '#FACC15',
    pattern: 'medallion',
  },
  {
    aliases: ['арина соболенко', 'соболенко', 'aryna sabalenka', 'sabalenka'],
    sportHint: 'TENNIS',
    enQuery: 'Aryna Sabalenka',
    ruWiki: 'Соболенко, Арина Сергеевна',
    code: 'АС',
    primary: '#DB2777',
    secondary: '#4C1D95',
    accent: '#FFFFFF',
    pattern: 'medallion',
  },
  {
    aliases: ['андрей рублев', 'рублев', 'andrey rublev'],
    sportHint: 'TENNIS',
    enQuery: 'Andrey Rublev',
    ruWiki: 'Рублёв, Андрей Андреевич',
    code: 'АР',
    primary: '#DC2626',
    secondary: '#1E293B',
    accent: '#FFFFFF',
    pattern: 'medallion',
  },

  // === UFC / MMA ===
  {
    aliases: ['ислам махачев', 'махачев', 'islam makhachev', 'makhachev'],
    sportHint: 'MMA',
    enQuery: 'Islam Makhachev',
    ruWiki: 'Махачев, Ислам Рамазанович',
    code: 'ИМ',
    primary: '#111827',
    secondary: '#B45309',
    accent: '#FBBF24',
    pattern: 'medallion',
  },
  {
    aliases: ['арман царукян', 'царукян', 'arman tsarukyan'],
    sportHint: 'MMA',
    enQuery: 'Arman Tsarukyan',
    ruWiki: 'Царукян, Арман Наирович',
    code: 'АЦ',
    primary: '#B91C1C',
    secondary: '#1E3A8A',
    accent: '#F59E0B',
    pattern: 'medallion',
  },
  {
    aliases: ['алекс перейра', 'перейра', 'alex pereira'],
    sportHint: 'MMA',
    enQuery: 'Alex Pereira',
    ruWiki: 'Перейра, Алекс',
    code: 'AP',
    primary: '#15803D',
    secondary: '#111827',
    accent: '#FACC15',
    pattern: 'medallion',
  },
  {
    aliases: ['хамзат чимаев', 'чимаев', 'khamzat chimaev'],
    sportHint: 'MMA',
    enQuery: 'Khamzat Chimaev',
    ruWiki: 'Чимаев, Хамзат Хизарович',
    code: 'ХЧ',
    primary: '#111827',
    secondary: '#DC2626',
    accent: '#FFFFFF',
    pattern: 'medallion',
  },
];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

interface CachedBinaryLogo {
  contentType: string;
  buffer: Buffer;
  fetchedAt: number;
}

const memoryLogoCache = new Map<string, CachedBinaryLogo>();
const negativeLookupUntil = new Map<string, number>();

const DISK_CACHE_DIR = path.join(process.cwd(), '.data', 'logo-cache');
const DISK_TTL_MS = 30 * 24 * 3600_000; // 30 суток
const NEGATIVE_RETRY_MS = 8 * 60_000; // 8 минут до повторной попытки

function normalizeLookupName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findClubProfile(teamName: string, sport?: SportType): ClubProfile | null {
  const norm = normalizeLookupName(teamName);
  if (!norm) return null;

  // Сначала точное совпадение с учетом вида спорта
  for (const prof of CLUB_PROFILES) {
    if (sport && prof.sportHint && prof.sportHint !== sport) continue;
    if (prof.aliases.some((a) => norm === a)) return prof;
  }

  // Затем частичное вхождение с учетом вида спорта
  for (const prof of CLUB_PROFILES) {
    if (sport && prof.sportHint && prof.sportHint !== sport) continue;
    if (prof.aliases.some((a) => a.length >= 4 && norm.includes(a))) return prof;
  }

  // Наконец без жесткого фильтра спорта
  for (const prof of CLUB_PROFILES) {
    if (prof.aliases.some((a) => norm === a || (a.length >= 5 && norm.includes(a)))) {
      return prof;
    }
  }

  return null;
}

function buildMonogramCode(teamName: string): string {
  const cleaned = teamName
    .replace(/\b(ФК|ХК|ПФК|БК|МФК|FC|HC|BC|SC|CF|AC|AS|RB)\b/gi, '')
    .replace(/[«»"'()]/g, '')
    .trim();
  const parts = cleaned.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return (parts[0] || teamName).slice(0, 3).toUpperCase();
}

const FALLBACK_PALETTES: Array<{
  primary: string;
  secondary: string;
  accent: string;
  pattern: CrestPattern;
}> = [
  { primary: '#1D4ED8', secondary: '#0F172A', accent: '#FFFFFF', pattern: 'chevron' },
  { primary: '#DC2626', secondary: '#111827', accent: '#FACC15', pattern: 'stripes' },
  { primary: '#047857', secondary: '#064E3B', accent: '#FFFFFF', pattern: 'halves' },
  { primary: '#7C3AED', secondary: '#1E1B4B', accent: '#FDE047', pattern: 'diagonal' },
  { primary: '#0369A1', secondary: '#0C4A6E', accent: '#FFFFFF', pattern: 'halves' },
  { primary: '#B91C1C', secondary: '#1E3A8A', accent: '#FFFFFF', pattern: 'stripes' },
  { primary: '#EA580C', secondary: '#18181B', accent: '#FFFFFF', pattern: 'chevron' },
  { primary: '#0F766E', secondary: '#111827', accent: '#99F6E4', pattern: 'diagonal' },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Генерирует четкую клубную эмблему / спортивный медальон в фирменных цветах команды (SVG)
 */
export function renderClubCrestSvg(
  teamName: string,
  sport?: SportType,
): string {
  const prof = findClubProfile(teamName, sport);
  const hashNum = createHash('md5').update(teamName).digest()[0];
  const fallback = FALLBACK_PALETTES[hashNum % FALLBACK_PALETTES.length];

  const primary = prof?.primary || fallback.primary;
  const secondary = prof?.secondary || fallback.secondary;
  const accent = prof?.accent || fallback.accent;
  const code = escapeXml(prof?.code || buildMonogramCode(teamName));

  let pattern: CrestPattern = prof?.pattern || fallback.pattern;
  if (!prof) {
    if (sport === 'ESPORTS') pattern = 'esports';
    else if (sport === 'TENNIS' || sport === 'MMA') pattern = 'medallion';
  }

  const uid = createHash('md5')
    .update(`${teamName}_${sport || ''}`)
    .digest('hex')
    .slice(0, 6);

  // Киберспорт — кибер-гексагон
  if (pattern === 'esports') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <linearGradient id="g_${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${secondary}"/>
    </linearGradient>
  </defs>
  <polygon points="48,5 86,26 86,70 48,91 10,70 10,26" fill="url(#g_${uid})" stroke="${accent}" stroke-width="3.5"/>
  <polygon points="48,12 79,30 79,66 48,84 17,66 17,30" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
  <text x="48" y="55" text-anchor="middle" font-family="Inter,system-ui,-apple-system,sans-serif" font-weight="900" font-size="${code.length > 2 ? '23' : '28'}" fill="${accent}" letter-spacing="-0.5">${code}</text>
</svg>`;
  }

  // Теннис / UFC — круглый атлетический медальон
  if (pattern === 'medallion') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <linearGradient id="m_${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${secondary}"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="43" fill="url(#m_${uid})" stroke="#E2E8F0" stroke-width="3"/>
  <circle cx="48" cy="48" r="36" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="2"/>
  <text x="48" y="56" text-anchor="middle" font-family="Inter,system-ui,-apple-system,sans-serif" font-weight="900" font-size="${code.length > 2 ? '22' : '27'}" fill="#FFFFFF">${code}</text>
</svg>`;
  }

  // Классический геральдический щит футбольного / хоккейного / баскетбольного клуба
  const shieldPath =
    'M48 6 L84 18 L84 47 C84 70 67 84 48 91 C29 84 12 70 12 47 L12 18 Z';

  let innerArt = '';
  if (pattern === 'stripes') {
    innerArt = `
      <rect x="10" y="4" width="76" height="90" fill="${primary}"/>
      <rect x="26" y="4" width="14" height="90" fill="${secondary}"/>
      <rect x="56" y="4" width="14" height="90" fill="${secondary}"/>
    `;
  } else if (pattern === 'diagonal') {
    innerArt = `
      <rect x="10" y="4" width="76" height="90" fill="${primary}"/>
      <polygon points="8,64 76,4 92,4 92,22 22,90 8,90" fill="${secondary}"/>
    `;
  } else if (pattern === 'halves') {
    innerArt = `
      <rect x="10" y="4" width="38" height="90" fill="${primary}"/>
      <rect x="48" y="4" width="38" height="90" fill="${secondary}"/>
    `;
  } else if (pattern === 'chevron') {
    innerArt = `
      <rect x="10" y="4" width="76" height="90" fill="${primary}"/>
      <polygon points="10,22 48,48 86,22 86,40 48,66 10,40" fill="${secondary}"/>
    `;
  } else if (pattern === 'star') {
    innerArt = `
      <rect x="10" y="4" width="76" height="90" fill="${primary}"/>
      <rect x="10" y="62" width="76" height="14" fill="${secondary}"/>
      <polygon points="48,15 51,24 60,24 53,29 55,38 48,33 41,38 43,29 36,24 45,24" fill="${secondary}"/>
    `;
  } else {
    innerArt = `
      <rect x="10" y="4" width="76" height="90" fill="${primary}"/>
      <circle cx="48" cy="48" r="26" fill="${secondary}" fill-opacity="0.45"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <clipPath id="clip_${uid}">
      <path d="${shieldPath}"/>
    </clipPath>
    <linearGradient id="shine_${uid}" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#clip_${uid})">
    ${innerArt}
    <rect x="10" y="34" width="76" height="28" fill="#0B0F19" fill-opacity="0.68"/>
    <path d="${shieldPath}" fill="url(#shine_${uid})"/>
  </g>
  <path d="${shieldPath}" fill="none" stroke="#CBD5E1" stroke-width="3.2"/>
  <path d="${shieldPath}" fill="none" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.4"/>
  <text x="48" y="54.5" text-anchor="middle" font-family="Inter,system-ui,-apple-system,sans-serif" font-weight="900" font-size="${code.length > 2 ? '19.5' : '23'}" fill="#FFFFFF" letter-spacing="0.4">${code}</text>
</svg>`;
}

async function fetchImageBinary(url: string): Promise<CachedBinaryLogo | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(4500),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;

    const ab = await res.arrayBuffer();
    if (ab.byteLength < 120 || ab.byteLength > 1_600_000) return null;

    return {
      contentType: ct.split(';')[0],
      buffer: Buffer.from(ab),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function lookupEspnLogoUrl(
  query: string,
  isIndividual: boolean,
): Promise<string | null> {
  try {
    const typeParam = isIndividual ? 'player' : 'team';
    const url = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(
      query,
    )}&limit=4&type=${typeParam}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(3800),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{
        logos?: Array<{ href?: string }>;
        images?: Array<{ url?: string }>;
      }>;
    };
    for (const item of json.items || []) {
      const href = item.logos?.[0]?.href || item.images?.[0]?.url;
      if (href && href.startsWith('http')) return href;
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupSportsDbLogoUrl(
  query: string,
  isIndividual: boolean,
): Promise<string | null> {
  try {
    const endpoint = isIndividual
      ? `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(query)}`
      : `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(query)}`;
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(3800),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      teams?: Array<{ strBadge?: string; strLogo?: string }>;
      player?: Array<{ strCutout?: string; strThumb?: string }>;
    };
    if (isIndividual) {
      const p = json.player?.[0];
      return p?.strCutout || p?.strThumb || null;
    }
    const t = json.teams?.[0];
    return t?.strBadge || t?.strLogo || null;
  } catch {
    return null;
  }
}

async function lookupWikipediaPageImage(
  lang: 'ru' | 'en',
  exactTitleOrQuery: string,
  useSearchFallback: boolean,
): Promise<string | null> {
  const host = `https://${lang}.wikipedia.org/w/api.php`;
  try {
    const directUrl = `${host}?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=240&redirects=1&format=json&titles=${encodeURIComponent(
      exactTitleOrQuery,
    )}`;
    const res = await fetch(directUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(3800),
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      const pages = Object.values(json.query?.pages || {});
      const thumb = pages[0]?.thumbnail?.source;
      if (thumb && thumb.startsWith('http')) return thumb;
    }

    if (!useSearchFallback) return null;

    const searchUrl = `${host}?action=query&generator=search&gsrsearch=${encodeURIComponent(
      exactTitleOrQuery,
    )}&gsrlimit=2&prop=pageimages&piprop=thumbnail&pithumbsize=240&format=json`;
    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(3800),
      cache: 'no-store',
    });
    if (!sRes.ok) return null;
    const sJson = (await sRes.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };
    for (const pg of Object.values(sJson.query?.pages || {})) {
      if (pg.thumbnail?.source?.startsWith('http')) {
        return pg.thumbnail.source;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getSportSearchSuffixRu(sport?: SportType): string {
  if (sport === 'FOOTBALL') return 'футбольный клуб';
  if (sport === 'HOCKEY') return 'хоккейный клуб';
  if (sport === 'BASKETBALL') return 'баскетбольный клуб';
  if (sport === 'ESPORTS') return 'киберспорт команда';
  if (sport === 'TENNIS') return 'теннис';
  if (sport === 'MMA') return 'боец мма';
  return 'спортивный клуб';
}

async function discoverOfficialLogoBinary(params: {
  teamName: string;
  sport?: SportType;
  directUrl?: string | null;
}): Promise<CachedBinaryLogo | null> {
  // 1. Прямая ссылка (например из фида БК / ESPN / ручного поля)
  if (params.directUrl && /^https?:\/\//i.test(params.directUrl.trim())) {
    const directImg = await fetchImageBinary(params.directUrl.trim());
    if (directImg) return directImg;
  }

  const prof = findClubProfile(params.teamName, params.sport);
  const isIndividual = params.sport === 'TENNIS' || params.sport === 'MMA';
  const enQuery = prof?.enQuery || params.teamName;
  const ruWikiExact = prof?.ruWiki;

  // 2. Параллельно опрашиваем официальные спортивные базы (ESPN + TheSportsDB + Русская Википедия)
  const [espnUrl, sportsDbUrl, ruWikiUrl] = await Promise.all([
    lookupEspnLogoUrl(enQuery, isIndividual),
    lookupSportsDbLogoUrl(enQuery, isIndividual),
    ruWikiExact
      ? lookupWikipediaPageImage('ru', ruWikiExact, false)
      : lookupWikipediaPageImage(
          'ru',
          `${params.teamName} ${getSportSearchSuffixRu(params.sport)}`,
          true,
        ),
  ]);

  const candidateUrls = [espnUrl, sportsDbUrl, ruWikiUrl].filter(
    (u): u is string => Boolean(u),
  );

  // Резерв по английской Википедии, если ни один из первых трех не дал URL
  if (candidateUrls.length === 0) {
    const enWikiUrl = await lookupWikipediaPageImage('en', enQuery, true);
    if (enWikiUrl) candidateUrls.push(enWikiUrl);
  }

  for (const url of candidateUrls) {
    const bin = await fetchImageBinary(url);
    if (bin) return bin;
  }

  return null;
}

export async function resolveTeamLogoResponse(params: {
  teamName: string;
  sport?: SportType;
  directUrl?: string | null;
}): Promise<{
  contentType: string;
  body: Buffer | string;
  isOfficialBinary: boolean;
}> {
  const cleanTeam = (params.teamName || 'Team').trim().slice(0, 90);
  const cacheKey = createHash('sha1')
    .update(
      `${normalizeLookupName(cleanTeam)}__${params.sport || 'ANY'}__${
        params.directUrl || ''
      }`,
    )
    .digest('hex');

  // 1. In-memory кэш
  const mem = memoryLogoCache.get(cacheKey);
  if (mem && Date.now() - mem.fetchedAt < DISK_TTL_MS) {
    return {
      contentType: mem.contentType,
      body: mem.buffer,
      isOfficialBinary: true,
    };
  }

  // 2. Дисковый кэш (.data/logo-cache/<hash>.json)
  const diskFile = path.join(DISK_CACHE_DIR, `${cacheKey}.json`);
  try {
    const rawJson = await fs.readFile(diskFile, 'utf8');
    const parsed = JSON.parse(rawJson) as {
      contentType: string;
      base64: string;
      fetchedAt: number;
    };
    if (
      parsed.base64 &&
      parsed.contentType &&
      Date.now() - parsed.fetchedAt < DISK_TTL_MS
    ) {
      const buf = Buffer.from(parsed.base64, 'base64');
      memoryLogoCache.set(cacheKey, {
        contentType: parsed.contentType,
        buffer: buf,
        fetchedAt: parsed.fetchedAt,
      });
      return {
        contentType: parsed.contentType,
        body: buf,
        isOfficialBinary: true,
      };
    }
  } catch {
    // файла еще нет в кэше
  }

  // 3. Проверяем краткосрочный негативный кэш (чтобы не тормозить при оффлайне)
  const negUntil = negativeLookupUntil.get(cacheKey) || 0;
  if (Date.now() < negUntil) {
    return {
      contentType: 'image/svg+xml; charset=utf-8',
      body: renderClubCrestSvg(cleanTeam, params.sport),
      isOfficialBinary: false,
    };
  }

  // 4. Живой поиск логотипа во внешних базах и сохранение на диск
  const discovered = await discoverOfficialLogoBinary({
    teamName: cleanTeam,
    sport: params.sport,
    directUrl: params.directUrl,
  });

  if (discovered) {
    if (memoryLogoCache.size > 300) {
      const oldestKey = memoryLogoCache.keys().next().value;
      if (oldestKey) memoryLogoCache.delete(oldestKey);
    }
    memoryLogoCache.set(cacheKey, discovered);

    void (async () => {
      try {
        await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
        await fs.writeFile(
          diskFile,
          JSON.stringify({
            contentType: discovered.contentType,
            base64: discovered.buffer.toString('base64'),
            fetchedAt: discovered.fetchedAt,
          }),
          'utf8',
        );
      } catch {
        // игнорируем ошибки записи на read-only ФС
      }
    })();

    return {
      contentType: discovered.contentType,
      body: discovered.buffer,
      isOfficialBinary: true,
    };
  }

  negativeLookupUntil.set(cacheKey, Date.now() + NEGATIVE_RETRY_MS);

  return {
    contentType: 'image/svg+xml; charset=utf-8',
    body: renderClubCrestSvg(cleanTeam, params.sport),
    isOfficialBinary: false,
  };
}
