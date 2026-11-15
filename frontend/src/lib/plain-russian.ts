/**
 * Осторожные пояснения к распознаваемым рынкам. Неизвестные или составные
 * исходы нельзя угадывать: правила расчёта и период определяет букмекер.
 */
export function explainMarketInPlainRussian(
  selectionTitle: string,
  homeTeam: string,
  awayTeam: string,
): {
  whereToFindInBk: string;
  whenYouWin: string;
} {
  const title = selectionTitle.trim();
  const market = title.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const disclaimer = 'Проверьте период и правила расчёта у выбранного букмекера.';
  const fallback = {
    whereToFindInBk: `Ищите исход «${title}» для события «${homeTeam} — ${awayTeam}» в линии букмекера.`,
    whenYouWin: `Условия зависят от точной формулировки исхода. ${disclaimer}`,
  };
  const linePattern = '([+-]?\\d+(?:[.,]\\d+)?)';
  const supportedLine = (value: string): number | null => {
    const line = Number(value.replace(',', '.'));
    // Quarter lines can have partial wins or losses; do not simplify them.
    return Number.isFinite(line) && Number.isInteger(line * 2) ? line : null;
  };

  const winner = market.match(/^(?:победа\s*([12])|п([12]))(?:\s*(\(\s*основное время\s*\)|в основное время|в матче|с учетом\s+(?:от|overtime|овертайма?|буллитов?)))?$/);
  if (winner) {
    const team = (winner[1] || winner[2]) === '1' ? homeTeam : awayTeam;
    return {
      whereToFindInBk: `Раздел исходов → «${title}» (${team}).`,
      whenYouWin: `Выбранная команда должна победить в периоде, указанном в исходе. ${disclaimer}`,
    };
  }

  if (['1x', '1х', 'x2', 'х2'].includes(market)) {
    const team = market.startsWith('1') ? homeTeam : awayTeam;
    return {
      whereToFindInBk: `Раздел «Двойной шанс» → ${title}.`,
      whenYouWin: `«${team}» должна победить или сыграть вничью в указанном периоде. ${disclaimer}`,
    };
  }

  const bothScore = market.match(/^(?:обе забьют|обе команды забьют)(?::?\s*(да|нет))?$/);
  if (bothScore) {
    const no = bothScore[1] === 'нет';
    return {
      whereToFindInBk: `Раздел голов → «${title}».`,
      whenYouWin: no
        ? `Хотя бы одна команда не должна забить в указанном периоде. ${disclaimer}`
        : `Обе команды должны забить хотя бы по одному голу в указанном периоде. ${disclaimer}`,
    };
  }

  const teamTotal = market.match(new RegExp(
    `^(?:индивидуальный\\s+тотал\\s*([12])\\s*(больше|меньше)|ит([бм])([12]))\\s*\\(?\\s*${linePattern}\\s*\\)?$`,
  ));
  if (teamTotal) {
    const team = (teamTotal[1] || teamTotal[4]) === '1' ? homeTeam : awayTeam;
    const direction = teamTotal[2] || (teamTotal[3] === 'б' ? 'больше' : 'меньше');
    const line = supportedLine(teamTotal[5]);
    if (line === null) return fallback;
    return {
      whereToFindInBk: `Индивидуальный тотал «${team}» → ${direction} (${line}).`,
      whenYouWin: `Показатель «${team}» за указанный период должен быть ${direction} ${line}.${Number.isInteger(line) ? ' При точном совпадении обычно предусмотрен возврат ставки.' : ''} ${disclaimer}`,
    };
  }

  const total = market.match(new RegExp(
    `^(?:тотал(?:\\s+матча)?\\s*(больше|меньше)|т([бм]))\\s*\\(?\\s*${linePattern}\\s*\\)?$`,
  ));
  if (total) {
    const direction = total[1] || (total[2] === 'б' ? 'больше' : 'меньше');
    const line = supportedLine(total[3]);
    if (line === null) return fallback;
    return {
      whereToFindInBk: `Раздел «Тоталы» → ${direction} (${line}).`,
      whenYouWin: `Суммарный показатель за указанный период должен быть ${direction} ${line}.${Number.isInteger(line) ? ' При точном совпадении обычно предусмотрен возврат ставки.' : ''} ${disclaimer}`,
    };
  }

  const handicap = market.match(new RegExp(`^(?:фора\\s*([12])|ф([12]))\\s*\\(?\\s*${linePattern}\\s*\\)?$`));
  if (handicap) {
    const team = (handicap[1] || handicap[2]) === '1' ? homeTeam : awayTeam;
    const line = supportedLine(handicap[3]);
    if (line === null) return fallback;
    return {
      whereToFindInBk: `Раздел «Форы» → «${team}» (${line > 0 ? '+' : ''}${line}).`,
      whenYouWin: `К разнице результата «${team}» и соперника добавляют фору ${line > 0 ? '+' : ''}${line}. Выигрыш возможен, если полученная разница положительна.${Number.isInteger(line) ? ' При нулевой разнице обычно предусмотрен возврат ставки.' : ''} ${disclaimer}`,
    };
  }

  return fallback;
}

export function isPlaceholderLegalInn(legalSellerName: string, legalInn: string): boolean {
  const combined = `${legalSellerName} ${legalInn}`.toLowerCase();
  const digits = legalInn.replace(/\D/g, '');
  return (
    !legalSellerName.trim() ||
    ![10, 12].includes(digits.length) ||
    /^0+$/.test(digits) ||
    combined.includes('укажите реквизиты') ||
    combined.includes('инн 770000000000')
  );
}
