import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramVipService {
  private readonly logger = new Logger(TelegramVipService.name);
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  private readonly vipChannelId = process.env.TELEGRAM_VIP_CHANNEL_ID ?? ''; // напр. "-1002145987654"

  private async callTelegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API [${method}] error: ${data.description ?? 'Unknown error'}`);
    }
    return data.result;
  }

  /**
   * Генерирует персональную ОДНОРАЗОВУЮ инвайт-ссылку в закрытый VIP-канал
   * после успешного Webhook `payment.succeeded` от ЮKassa и отправляет юзеру в бота.
   */
  async issuePersonalVipChannelInvite(telegramUserId: number, subscriptionId: string): Promise<string> {
    const expireUnix = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Ссылка живет 24 часа

    const invite = await this.callTelegramApi<{ invite_link: string }>('createChatInviteLink', {
      chat_id: this.vipChannelId,
      name: `sub_${subscriptionId.slice(0, 8)}`,
      expire_date: expireUnix,
      member_limit: 1, // Строго 1 вход — переслать ссылку другу бесполезно
    });

    await this.callTelegramApi('sendMessage', {
      chat_id: telegramUserId,
      parse_mode: 'HTML',
      text: [
        '✅ <b>Оплата подтверждена! Доступ к VIP активирован.</b>',
        '',
        'Ваша персональная одноразовая ссылка в закрытый VIP-канал (действует 24 часа, только на 1 вход):',
        invite.invite_link,
      ].join('\n'),
    });

    return invite.invite_link;
  }

  /**
   * Мягкое удаление из закрытого VIP-канала при истечении подписки или возврате (refund):
   * banChatMember + мгновенный unbanChatMember удаляет юзера из канала,
   * но позволяет ему снова зайти по новой ссылке после продления оплаты.
   */
  async removeUserFromVipChannel(telegramUserId: number): Promise<void> {
    try {
      await this.callTelegramApi('banChatMember', {
        chat_id: this.vipChannelId,
        user_id: telegramUserId,
      });
      await this.callTelegramApi('unbanChatMember', {
        chat_id: this.vipChannelId,
        user_id: telegramUserId,
        only_if_banned: true,
      });
    } catch (err) {
      this.logger.warn(`Не удалось исключить TG user ${telegramUserId} из VIP-канала: ${String(err)}`);
    }
  }

  /**
   * Автоматический пуш нового прогноза в закрытый VIP-канал сразу после публикации в Админ-панели.
   */
  async publishPredictionToVipChannel(params: {
    sportLabel: string;
    leagueName: string;
    homeTeam: string;
    awayTeam: string;
    startsAtFormatted: string;
    selectionTitle: string;
    fixedOdds: number;
    minAcceptableOdds?: number | null;
    stakePercent: number;
    stakeUnits: number;
    analysisFull: string;
    verificationHash: string;
  }): Promise<number> {
    const minOddsLine = params.minAcceptableOdds
      ? `📉 Валуй актуален до кэфа: <b>${params.minAcceptableOdds.toFixed(2)}</b>\n`
      : '';

    const message = await this.callTelegramApi<{ message_id: number }>('sendMessage', {
      chat_id: this.vipChannelId,
      parse_mode: 'HTML',
      text: [
        `🔥 <b>VIP ПРОГНОЗ | ${params.sportLabel} · ${params.leagueName}</b>`,
        `🏟 <b>${params.homeTeam} — ${params.awayTeam}</b>`,
        `🕒 Старт: ${params.startsAtFormatted} (МСК)`,
        '',
        `🎯 Исход: <b>${params.selectionTitle}</b>`,
        `📈 Зафиксированный кэф: <b>${params.fixedOdds.toFixed(2)}</b>`,
        minOddsLine + `💼 Ставка (Флэт): <b>${params.stakePercent}% от банка (${params.stakeUnits} u)</b>`,
        '',
        `📊 <b>Аналитика:</b>\n${params.analysisFull}`,
        '',
        `🔐 <code>SHA-256: ${params.verificationHash.slice(0, 16)}...</code>`,
      ].join('\n'),
    });

    return message.message_id;
  }
}
