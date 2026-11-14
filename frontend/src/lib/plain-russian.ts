/**
 * Переводчик букмекерских терминов и исходов на простой человеческий русский язык
 * для обычного болельщика в РФ (Фонбет, Винлайн, Пари, Бетбум).
 */

export function explainMarketInPlainRussian(
  selectionTitle: string,
  homeTeam: string,
  awayTeam: string,
): {
  whereToFindInBk: string;
  whenYouWin: string;
} {
  const s = selectionTitle.trim();
  const lower = s.toLowerCase();

  // 1. Чистые победы (П1 / П2 / с ОТ)
  if (lower.includes('победа 1') || lower === 'п1' || lower.startsWith('победа ' + homeTeam.toLowerCase())) {
    if (lower.includes('от') || lower.includes('буллит') || lower.includes('матч')) {
      return {
        whereToFindInBk: `Раздел «Исходы» → Победа в матче: ${homeTeam}`,
        whenYouWin: `Ставка выиграет, если «${homeTeam}» победит в основное время, овертайме или по буллитам.`,
      };
    }
    return {
      whereToFindInBk: `Основная линия → П1 (Победа «${homeTeam}»)`,
      whenYouWin: `Ставка выиграет, если «${homeTeam}» одержит победу.`,
    };
  }

  if (lower.includes('победа 2') || lower === 'п2' || lower.startsWith('победа ' + awayTeam.toLowerCase())) {
    if (lower.includes('от') || lower.includes('буллит') || lower.includes('матч')) {
      return {
        whereToFindInBk: `Раздел «Исходы» → Победа в матче: ${awayTeam}`,
        whenYouWin: `Ставка выиграет, если «${awayTeam}» победит с учетом овертайма или буллитов.`,
      };
    }
    return {
      whereToFindInBk: `Основная линия → П2 (Победа «${awayTeam}»)`,
      whenYouWin: `Ставка выиграет, если победит команда «${awayTeam}».`,
    };
  }

  // 2. Двойной шанс (1X / X2 / не проиграет)
  if (lower === '1x' || lower.includes('1x') || (lower.includes('не проиграет') && lower.includes('1'))) {
    return {
      whereToFindInBk: `Двойной шанс → 1X («${homeTeam}» не проиграет)`,
      whenYouWin: `Ставка выиграет, если «${homeTeam}» победит ИЛИ сыграет вничью в основное время.`,
    };
  }
  if (lower === 'x2' || lower.includes('x2') || (lower.includes('не проиграет') && lower.includes('2'))) {
    return {
      whereToFindInBk: `Двойной шанс → X2 («${awayTeam}» не проиграет)`,
      whenYouWin: `Ставка выиграет, если «${awayTeam}» победит ИЛИ сыграет вничью в основное время.`,
    };
  }

  // 3. Обе забьют
  if (lower.includes('обе забьют')) {
    if (lower.includes('тб') || lower.includes('больше')) {
      return {
        whereToFindInBk: 'Комбинированные ставки → Обе забьют: Да + Тотал больше 2.5',
        whenYouWin: `Обе команды должны забить хотя бы по одному голу, а суммарно в матче должно быть минимум 3 гола (например, 2:1, 1:2, 2:2).`,
      };
    }
    return {
      whereToFindInBk: 'Голы → Обе команды забьют: Да',
      whenYouWin: `Ставка выиграет, если и «${homeTeam}», и «${awayTeam}» забьют хотя бы по 1 голу (любой счет вроде 1:1, 2:1, 1:3).`,
    };
  }

  // 4. Индивидуальный тотал
  if (lower.includes('индивидуальный тотал') || lower.includes('голы ') || lower.includes('итб') || lower.includes('итм')) {
    const numMatch = s.match(/\((\d+(?:[.,]\d+)?)\)/) || s.match(/(\d+(?:[.,]\d+)?)\s*$/);
    const val = numMatch ? Number(numMatch[1].replace(',', '.')) : 1.5;
    const isTeam2 = lower.includes(' 2') || lower.includes('итб2') || lower.includes(awayTeam.toLowerCase());
    const team = isTeam2 ? awayTeam : homeTeam;
    const isUnder = lower.includes('меньше') || lower.includes('итм');
    const isWhole = Number.isInteger(val);

    if (!isUnder) {
      return {
        whereToFindInBk: `Индивидуальный тотал → «${team}» Больше (${val})`,
        whenYouWin: isWhole
          ? `Нужно, чтобы «${team}» забила больше ${val} голов (если забьет ровно ${val} — букмекер просто вернет сумму ставки обратно на счет).`
          : `Нужно, чтобы команда «${team}» забила минимум ${Math.ceil(val)} мяча/шайбы за игру (итоговый исход самого матча не важен).`,
      };
    }
    return {
      whereToFindInBk: `Индивидуальный тотал → «${team}» Меньше (${val})`,
      whenYouWin: `Нужно, чтобы команда «${team}» забила не больше ${Math.floor(val)} голов за игру.`,
    };
  }

  // 5. Общий тотал (ТБ / ТМ / геймы / раунды / карты)
  if (lower.includes('тотал')) {
    const numMatch = s.match(/\((\d+(?:[.,]\d+)?)\)/) || s.match(/(\d+(?:[.,]\d+)?)/);
    const val = numMatch ? Number(numMatch[1].replace(',', '.')) : 2.5;
    const isUnder = lower.includes('меньше') || lower.includes('тм');
    const isWhole = Number.isInteger(val);
    const unit = lower.includes('гейм')
      ? 'геймов'
      : lower.includes('раунд')
        ? 'полных раундов'
        : lower.includes('карт')
          ? 'карт'
          : 'голов/шайб (в сумме у обеих команд)';

    if (!isUnder) {
      return {
        whereToFindInBk: `Раздел «Тоталы» → Тотал больше (${val})`,
        whenYouWin: isWhole
          ? `Ставка выиграет, если в матче будет ${val + 1} или больше ${unit}. Если ровно ${val} — букмекер вернет деньги на ваш счет (расход).`
          : `Ставка выиграет, если обе команды на двоих наберут минимум ${Math.ceil(val)} ${unit}. Кто победит в матче — значения не имеет.`,
      };
    }
    return {
      whereToFindInBk: `Раздел «Тоталы» → Тотал меньше (${val})`,
      whenYouWin: isWhole
        ? `Ставка выиграет, если в матче будет меньше ${val} ${unit} (если ровно ${val} — возврат суммы ставки).`
        : `Ставка выиграет, если за игру будет не больше ${Math.floor(val)} ${unit}.`,
    };
  }

  // 6. Форы (Ф1 / Ф2)
  if (lower.includes('фора')) {
    const numMatch = s.match(/\(([+-]?\d+(?:[.,]\d+)?)\)/);
    const val = numMatch ? Number(numMatch[1].replace(',', '.')) : -1;
    const isTeam2 = lower.includes('фора 2') || lower.includes(awayTeam.toLowerCase());
    const team = isTeam2 ? awayTeam : homeTeam;
    const abs = Math.abs(val);
    const isWhole = Number.isInteger(abs);

    if (val === 0) {
      return {
        whereToFindInBk: `Раздел «Форы» → Фора «${team}» (0)`,
        whenYouWin: `Ставка выиграет при победе «${team}». Если случится ничья — вы ничего не теряете, букмекер вернет всю сумму ставки.`,
      };
    }
    if (val < 0) {
      return {
        whereToFindInBk: `Раздел «Форы» → Фора «${team}» (${val})`,
        whenYouWin: isWhole
          ? `«${team}» должна победить с разницей в ${abs + 1}+ мяча/шайбы. Если выиграет ровно в ${abs} (например, 1:0 или 2:1 при форе -1) — букмекер вернет вам деньги.`
          : `«${team}» должна победить с разницей минимум в ${Math.ceil(abs)} гола/шайбы/карты.`,
      };
    }
    return {
      whereToFindInBk: `Раздел «Форы» → Плюсовая фора «${team}» (+${abs})`,
      whenYouWin: `Ставка выиграет, если «${team}» победит, сыграет вничью или даже уступит не крупнее допустимой форы.`,
    };
  }

  return {
    whereToFindInBk: `Основная роспись матча в вашем приложении БК (Фонбет, Винлайн, Пари, Бетбум)`,
    whenYouWin: `Выберите указанный исход «${s}» в линии на матч «${homeTeam} — ${awayTeam}».`,
  };
}

export function isPlaceholderLegalInn(legalSellerName: string, legalInn: string): boolean {
  const combined = `${legalSellerName} ${legalInn}`.toLowerCase();
  return (
    combined.includes('00000000') ||
    combined.includes('укажите реквизиты') ||
    combined.includes('инн 770000000000')
  );
}
