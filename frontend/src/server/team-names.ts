import type { SportType } from './types';

// Расширенный русский словарь клубов РПЛ, Европы, НХЛ и НБА.
// Единый источник правды для: сканера Фонбет/ESPN, сверки счёта матчей
// и резолвера эмблем команд (строгий матчинг «картинка = именно эта команда»).
export const EN_TO_RU_TEAMS: Record<string, string> = {
  // Россия · Мир РПЛ
  'Zenit St Petersburg': 'Зенит',
  'FC Zenit Saint Petersburg': 'Зенит',
  Zenit: 'Зенит',
  Krasnodar: 'Краснодар',
  'FC Krasnodar': 'Краснодар',
  'Spartak Moscow': 'Спартак Москва',
  'CSKA Moscow': 'ЦСКА Москва',
  'Lokomotiv Moscow': 'Локомотив Москва',
  'Dynamo Moscow': 'Динамо Москва',
  'Dinamo Moscow': 'Динамо Москва',
  'FC Rostov': 'Ростов',
  Rostov: 'Ростов',
  'Rubin Kazan': 'Рубин Казань',
  'Krylia Sovetov': 'Крылья Советов',
  'Krylya Sovetov': 'Крылья Советов',
  'Akhmat Grozny': 'Ахмат',
  'Pari Nizhny Novgorod': 'Пари НН',
  'Nizhny Novgorod': 'Пари НН',
  'Fakel Voronezh': 'Факел Воронеж',
  'FC Orenburg': 'Оренбург',
  Orenburg: 'Оренбург',
  'FC Khimki': 'Химки',
  Khimki: 'Химки',
  'Akron Togliatti': 'Акрон Тольятти',
  'Dynamo Makhachkala': 'Динамо Махачкала',
  'Baltika Kaliningrad': 'Балтика',
  'PFC Sochi': 'Сочи',
  'Ural Yekaterinburg': 'Урал',
  'Torpedo Moscow': 'Торпедо Москва',

  // Англия · АПЛ
  Arsenal: 'Арсенал',
  Liverpool: 'Ливерпуль',
  'Manchester City': 'Манчестер Сити',
  'Manchester United': 'Манчестер Юнайтед',
  Chelsea: 'Челси',
  'Tottenham Hotspur': 'Тоттенхэм',
  'Newcastle United': 'Ньюкасл Юнайтед',
  'Aston Villa': 'Астон Вилла',
  'Brighton & Hove Albion': 'Брайтон',
  'West Ham United': 'Вест Хэм',
  'Crystal Palace': 'Кристал Пэлас',
  Fulham: 'Фулхэм',
  Brentford: 'Брентфорд',
  'AFC Bournemouth': 'Борнмут',
  Bournemouth: 'Борнмут',
  'Nottingham Forest': 'Ноттингем Форест',
  Everton: 'Эвертон',
  'Wolverhampton Wanderers': 'Вулверхэмптон',
  'Leicester City': 'Лестер Сити',
  'Leeds United': 'Лидс Юнайтед',
  Southampton: 'Саутгемптон',
  'Ipswich Town': 'Ипсвич Таун',

  // Испания · Ла Лига
  'Real Madrid': 'Реал Мадрид',
  Barcelona: 'Барселона',
  'Atletico Madrid': 'Атлетико Мадрид',
  'Atlético Madrid': 'Атлетико Мадрид',
  'Athletic Club': 'Атлетик Бильбао',
  'Real Sociedad': 'Реал Сосьедад',
  Villarreal: 'Вильярреал',
  'Real Betis': 'Реал Бетис',
  Sevilla: 'Севилья',
  Valencia: 'Валенсия',
  Girona: 'Жирона',
  'Celta Vigo': 'Сельта',
  Osasuna: 'Осасуна',
  Getafe: 'Хетафе',
  'Rayo Vallecano': 'Райо Вальекано',
  Mallorca: 'Мальорка',

  // Италия · Серия А
  Internazionale: 'Интер Милан',
  'Inter Milan': 'Интер Милан',
  'AC Milan': 'Милан',
  Juventus: 'Ювентус',
  Napoli: 'Наполи',
  Atalanta: 'Аталанта',
  'AS Roma': 'Рома',
  Lazio: 'Лацио',
  Fiorentina: 'Фиорентина',
  Bologna: 'Болонья',
  Torino: 'Торино',
  Udinese: 'Удинезе',
  Genoa: 'Дженоа',
  Como: 'Комо',
  Parma: 'Парма',

  // Германия и Франция + Еврокубки
  'Bayern Munich': 'Бавария',
  'Borussia Dortmund': 'Боруссия Дортмунд',
  'Bayer Leverkusen': 'Байер Леверкузен',
  'RB Leipzig': 'РБ Лейпциг',
  'VfB Stuttgart': 'Штутгарт',
  'Eintracht Frankfurt': 'Айнтрахт Франкфурт',
  'SC Freiburg': 'Фрайбург',
  'VfL Wolfsburg': 'Вольфсбург',
  'Borussia Monchengladbach': 'Боруссия М',
  'Werder Bremen': 'Вердер Бремен',
  'Paris Saint-Germain': 'ПСЖ',
  Marseille: 'Марсель',
  'AS Monaco': 'Монако',
  Monaco: 'Монако',
  Lyon: 'Лион',
  Lille: 'Лилль',
  Nice: 'Ницца',
  Lens: 'Ланс',
  Benfica: 'Бенфика',
  'Sporting CP': 'Спортинг',
  'FC Porto': 'Порту',
  Ajax: 'Аякс',
  PSV: 'ПСВ Эйндховен',
  Feyenoord: 'Фейеноорд',
  Galatasaray: 'Галатасарай',
  Fenerbahce: 'Фенербахче',
  Celtic: 'Селтик',

  // НХЛ
  'Washington Capitals': 'Вашингтон Кэпиталз',
  'Tampa Bay Lightning': 'Тампа-Бэй Лайтнинг',
  'Florida Panthers': 'Флорида Пантерз',
  'New York Rangers': 'Нью-Йорк Рейнджерс',
  'New York Islanders': 'Нью-Йорк Айлендерс',
  'Pittsburgh Penguins': 'Питтсбург Пингвинз',
  'Edmonton Oilers': 'Эдмонтон Ойлерз',
  'Colorado Avalanche': 'Колорадо Эвеланш',
  'Toronto Maple Leafs': 'Торонто Мэйпл Лифс',
  'Vegas Golden Knights': 'Вегас Голден Найтс',
  'Dallas Stars': 'Даллас Старз',
  'Carolina Hurricanes': 'Каролина Харрикейнз',
  'New Jersey Devils': 'Нью-Джерси Девилз',
  'Boston Bruins': 'Бостон Брюинз',
  'Minnesota Wild': 'Миннесота Уайлд',
  'Winnipeg Jets': 'Виннипег Джетс',
  'Vancouver Canucks': 'Ванкувер Кэнакс',
  'Los Angeles Kings': 'Лос-Анджелес Кингз',
  'Detroit Red Wings': 'Детройт Ред Уингз',
  'Philadelphia Flyers': 'Филадельфия Флайерз',
  'Columbus Blue Jackets': 'Коламбус Блю Джекетс',
  'Montreal Canadiens': 'Монреаль Канадиенс',
  'Ottawa Senators': 'Оттава Сенаторз',

  // НБА
  'Boston Celtics': 'Бостон Селтикс',
  'Denver Nuggets': 'Денвер Наггетс',
  'Los Angeles Lakers': 'Лос-Анджелес Лейкерс',
  'LA Clippers': 'ЛА Клипперс',
  'Golden State Warriors': 'Голден Стэйт Уорриорз',
  'Milwaukee Bucks': 'Милуоки Бакс',
  'Phoenix Suns': 'Финикс Санз',
  'Oklahoma City Thunder': 'Оклахома-Сити Тандер',
  'New York Knicks': 'Нью-Йорк Никс',
  'Cleveland Cavaliers': 'Кливленд Кавальерс',
  'Dallas Mavericks': 'Даллас Маверикс',
  'Minnesota Timberwolves': 'Миннесота Тимбервулвз',
  'Miami Heat': 'Майами Хит',
  'Philadelphia 76ers': 'Филадельфия Сиксерс',
  'Houston Rockets': 'Хьюстон Рокетс',
  'Memphis Grizzlies': 'Мемфис Гриззлис',
  'Sacramento Kings': 'Сакраменто Кингз',
  'Indiana Pacers': 'Индиана Пэйсерс',
};

export function transliterateEnToRu(input: string): string {
  // Если уже есть кириллица — возвращаем как есть
  if (/[а-яА-ЯёЁ]/.test(input)) return input;
  let s = input;
  const digraphs: Array<[RegExp, string]> = [
    [/shch/gi, 'щ'],
    [/sch/gi, 'ш'],
    [/ch/gi, 'ч'],
    [/sh/gi, 'ш'],
    [/zh/gi, 'ж'],
    [/kh/gi, 'х'],
    [/ts/gi, 'ц'],
    [/ph/gi, 'ф'],
    [/th/gi, 'т'],
    [/ck/gi, 'к'],
    [/qu/gi, 'кв'],
  ];
  for (const [re, rep] of digraphs) {
    s = s.replace(re, (m) =>
      m[0] === m[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep,
    );
  }
  const map: Record<string, string> = {
    a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
    i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
    q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'у', x: 'кс',
    y: 'й', z: 'з',
  };
  return s
    .split('')
    .map((ch) => {
      const low = ch.toLowerCase();
      const mapped = map[low];
      if (!mapped) return ch;
      return ch === ch.toUpperCase()
        ? mapped[0].toUpperCase() + mapped.slice(1)
        : mapped;
    })
    .join('');
}

export function localizeTeamName(name: string, sport?: SportType): string {
  const trimmed = name.trim();
  if (EN_TO_RU_TEAMS[trimmed]) return EN_TO_RU_TEAMS[trimmed];
  // Для киберспорта оставляем оригинальные теги команд (Team Spirit, NAVI, MOUZ, FaZe)
  if (sport === 'ESPORTS') return trimmed;
  // Для тенниса, UFC и прочих команд без словаря аккуратно транслитерируем в кириллицу
  return transliterateEnToRu(trimmed);
}

export function normalizeTeamKey(home: string, away: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/фк|хк|пфк|бк|fc|hc|bc/g, '')
      .replace(/[^a-zа-я0-9]/g, '');
  return `${clean(home)}__${clean(away)}`;
}

/**
 * Нормализация имени команды для строгого сравнения «картинка/счёт = именно эта команда».
 * Срезает префиксы ФК/ХК/FC/HC, кавычки, пунктуацию; ё→е.
 */
export function normalizeTeamNameForMatch(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^(фк|хк|пфк|бк|мфк|fc|hc|bc|sc|cf|ac)\s+/i, '')
    .replace(/\s+(фк|хк|пфк|бк|мфк|fc|hc|bc|sc|cf|ac)$/i, '')
    .replace(/[«»"'()]/g, ' ')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalTeamName(raw: string, sport?: SportType): string {
  const trimmed = (raw || '').trim();
  const localized = EN_TO_RU_TEAMS[trimmed] || localizeTeamName(trimmed, sport);
  return normalizeTeamNameForMatch(localized);
}

/**
 * Строгая проверка: принимает только точный alias/каноническое совпадение.
 * Намеренно нет substring/fuzzy match: «Динамо» ≠ «Динамо Махачкала».
 */
export function teamNamesMatch(candidateName: string, wantedName: string): boolean {
  const a = canonicalTeamName(candidateName);
  const b = canonicalTeamName(wantedName);
  return Boolean(a && b && a === b);
}

export type TeamPairOrder = 'DIRECT' | 'SWAPPED' | null;

/**
 * Проверка пары команд с определением порядка — важно не перепутать хозяев и гостей
 * при сохранении счёта. Сопоставляет только точные нормализованные имена.
 */
export function matchTeamPairOrder(
  srcHome: string,
  srcAway: string,
  wantedHome: string,
  wantedAway: string,
  sport?: SportType,
): TeamPairOrder {
  const sh = canonicalTeamName(srcHome, sport);
  const sa = canonicalTeamName(srcAway, sport);
  const wh = canonicalTeamName(wantedHome, sport);
  const wa = canonicalTeamName(wantedAway, sport);
  if (!sh || !sa || !wh || !wa) return null;
  if (sh === wh && sa === wa) return 'DIRECT';
  if (sh === wa && sa === wh) return 'SWAPPED';
  return null;
}

export function teamPairMatches(
  srcHome: string,
  srcAway: string,
  wantedHome: string,
  wantedAway: string,
  sport?: SportType,
): boolean {
  return matchTeamPairOrder(srcHome, srcAway, wantedHome, wantedAway, sport) !== null;
}
