import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  Post,
} from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
import { YooKassaPaymentObject, YooKassaService } from './yookassa.service';

export interface YooKassaWebhookPayload {
  type: 'notification';
  event:
    | 'payment.succeeded'
    | 'payment.waiting_for_capture'
    | 'payment.canceled'
    | 'refund.succeeded';
  object: {
    id: string;
    payment_id?: string; // присутствует в событии refund.succeeded
    status: string;
    amount: { value: string; currency: 'RUB' };
    metadata?: Record<string, string>;
  };
}

/**
 * Интерфейсы инфраструктурных портов (PostgreSQL Unit-of-Work и очередь фоновых задач BullMQ)
 */
export interface BillingUnitOfWork {
  runInTransaction<T>(fn: (tx: BillingTxRepo) => Promise<T>): Promise<T>;
}

export interface BillingTxRepo {
  tryRegisterWebhookEvent(event: string, objectId: string, ip: string, raw: unknown): Promise<boolean>;
  lockTransactionByYooKassaId(yookassaPaymentId: string): Promise<{
    id: string;
    userId: string;
    txType: 'SINGLE_PREDICTION' | 'SUBSCRIPTION_INITIAL' | 'SUBSCRIPTION_RENEWAL' | 'BALANCE_TOPUP';
    predictionId: string | null;
    planId: string | null;
    subscriptionId: string | null;
    amountRub: string;
    status: string;
  } | null>;
  markTransactionSucceeded(params: {
    txId: string;
    paymentMethodType?: string;
    savedPaymentMethodId?: string;
    receiptStatus: 'REGISTERED' | 'PENDING' | 'FAILED';
  }): Promise<void>;
  markTransactionCanceled(txId: string, reason: string): Promise<void>;
  grantSinglePredictionAccess(userId: string, predictionId: string, txId: string, priceRub: string): Promise<void>;
  activateOrExtendSubscription(params: {
    userId: string;
    planId: string;
    subscriptionId: string | null;
    savedPaymentMethodId?: string;
  }): Promise<{ subscriptionId: string; includesVipTelegram: boolean; expiresAt: Date | null }>;
  handleFailedRenewalAttempt(subscriptionId: string): Promise<{ shouldKickTelegram: boolean; userId: string }>;
  revokeAccessOnRefund(yookassaPaymentId: string): Promise<{ userId: string; kickFromVipTelegram: boolean } | null>;
  accrueAffiliateCommissionIfEligible(params: {
    userId: string;
    txId: string;
    amountRub: string;
    isRenewal: boolean;
  }): Promise<void>;
}

export interface NotificationQueueService {
  enqueueTelegramVipInvite(userId: string, subscriptionId: string): Promise<void>;
  enqueueTelegramVipKick(userId: string, reason: string): Promise<void>;
  enqueueUnlockedPredictionNotification(userId: string, predictionId: string): Promise<void>;
  enqueueRenewalPaymentFailedAlert(userId: string, subscriptionId: string): Promise<void>;
}

@Controller('api/v1/webhooks/yookassa')
export class YooKassaWebhookController {
  private readonly logger = new Logger(YooKassaWebhookController.name);
  private readonly yookassaAllowlist = new BlockList();

  constructor(
    private readonly yookassaService: YooKassaService,
    private readonly uow: BillingUnitOfWork,
    private readonly notificationsQueue: NotificationQueueService,
  ) {
    // Официальные подсети уведомлений ЮKassa (https://yookassa.ru/developers/using-api/webhooks)
    this.yookassaAllowlist.addSubnet('185.71.76.0', 27, 'ipv4');
    this.yookassaAllowlist.addSubnet('185.71.77.0', 27, 'ipv4');
    this.yookassaAllowlist.addSubnet('77.75.153.0', 25, 'ipv4');
    this.yookassaAllowlist.addSubnet('77.75.154.128', 25, 'ipv4');
    this.yookassaAllowlist.addAddress('77.75.156.11', 'ipv4');
    this.yookassaAllowlist.addAddress('77.75.156.35', 'ipv4');
    this.yookassaAllowlist.addSubnet('2a02:5180::', 32, 'ipv6');
  }

  private assertTrustedYooKassaIp(rawIp: string): string {
    const cleanIp = rawIp.replace(/^::ffff:/, '');
    const family = isIP(cleanIp);
    if (!family || !this.yookassaAllowlist.check(cleanIp, family === 6 ? 'ipv6' : 'ipv4')) {
      this.logger.warn(`Отклонен Webhook с недоверенного IP: ${cleanIp}`);
      throw new ForbiddenException('Untrusted webhook source IP');
    }
    return cleanIp;
  }

  /**
   * POST /api/v1/webhooks/yookassa
   * ЮKassa ожидает HTTP 200 OK в течение 10 секунд, иначе повторит отправку уведомления.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: YooKassaWebhookPayload,
    @Ip() senderIp: string,
  ): Promise<{ received: true }> {
    const cleanIp = this.assertTrustedYooKassaIp(senderIp);

    if (payload.event === 'payment.succeeded') {
      // S2S-проверка: никогда не доверяем только JSON из тела вебхука
      const verifiedPayment = await this.yookassaService.verifyPaymentById(payload.object.id);
      if (verifiedPayment.status === 'succeeded' && verifiedPayment.paid) {
        await this.processSucceededPayment(verifiedPayment, cleanIp, payload);
      }
      return { received: true };
    }

    if (payload.event === 'payment.canceled') {
      const verifiedPayment = await this.yookassaService.verifyPaymentById(payload.object.id);
      if (verifiedPayment.status === 'canceled') {
        await this.processCanceledPayment(verifiedPayment, cleanIp, payload);
      }
      return { received: true };
    }

    if (payload.event === 'refund.succeeded' && payload.object.payment_id) {
      await this.processRefundSucceeded(payload.object.id, payload.object.payment_id, cleanIp, payload);
      return { received: true };
    }

    return { received: true };
  }

  private async processSucceededPayment(
    payment: YooKassaPaymentObject,
    senderIp: string,
    rawPayload: unknown,
  ): Promise<void> {
    const postCommitJobs: Array<() => Promise<void>> = [];

    await this.uow.runInTransaction(async (tx) => {
      // 1. Проверка идемпотентности по таблице payment_webhook_events
      const isFirstDelivery = await tx.tryRegisterWebhookEvent(
        'payment.succeeded',
        payment.id,
        senderIp,
        rawPayload,
      );
      if (!isFirstDelivery) {
        return; // Дубль вебхука — безопасно выходим
      }

      // 2. Пессимистичная блокировка транзакции (SELECT ... FOR UPDATE)
      const localTx = await tx.lockTransactionByYooKassaId(payment.id);
      if (!localTx || localTx.status === 'SUCCEEDED') {
        return;
      }

      // Сверка суммы с точностью до копейки
      if (Number(localTx.amountRub).toFixed(2) !== Number(payment.amount.value).toFixed(2)) {
        throw new Error(
          `Несовпадение суммы платежа ${payment.id}: ожидалось ${localTx.amountRub}, получено ${payment.amount.value}`,
        );
      }

      const savedMethodId = payment.payment_method?.saved ? payment.payment_method.id : undefined;
      const receiptStatus =
        payment.receipt_registration === 'succeeded'
          ? 'REGISTERED'
          : payment.receipt_registration === 'canceled'
            ? 'FAILED'
            : 'PENDING';

      // 3. Фиксируем успешную оплату и статус фискального чека 54-ФЗ
      await tx.markTransactionSucceeded({
        txId: localTx.id,
        paymentMethodType: payment.payment_method?.type,
        savedPaymentMethodId: savedMethodId,
        receiptStatus,
      });

      // 4. Выдача оплаченного продукта (разовый прогноз ИЛИ VIP-подписка)
      if (localTx.txType === 'SINGLE_PREDICTION' && localTx.predictionId) {
        await tx.grantSinglePredictionAccess(
          localTx.userId,
          localTx.predictionId,
          localTx.id,
          localTx.amountRub,
        );
        postCommitJobs.push(() =>
          this.notificationsQueue.enqueueUnlockedPredictionNotification(
            localTx.userId,
            localTx.predictionId!,
          ),
        );
      } else if (
        (localTx.txType === 'SUBSCRIPTION_INITIAL' || localTx.txType === 'SUBSCRIPTION_RENEWAL') &&
        localTx.planId
      ) {
        const subResult = await tx.activateOrExtendSubscription({
          userId: localTx.userId,
          planId: localTx.planId,
          subscriptionId: localTx.subscriptionId,
          savedPaymentMethodId: savedMethodId,
        });

        if (subResult.includesVipTelegram) {
          postCommitJobs.push(() =>
            this.notificationsQueue.enqueueTelegramVipInvite(localTx.userId, subResult.subscriptionId),
          );
        }
      }

      // 5. Начисление реферального вознаграждения вебмастеру (в статус HELD на время холда)
      await tx.accrueAffiliateCommissionIfEligible({
        userId: localTx.userId,
        txId: localTx.id,
        amountRub: localTx.amountRub,
        isRenewal: localTx.txType === 'SUBSCRIPTION_RENEWAL',
      });
    });

    // 6. Асинхронные задачи запускаем ТОЛЬКО после успешного COMMIT в PostgreSQL
    await Promise.allSettled(postCommitJobs.map((job) => job()));
  }

  private async processCanceledPayment(
    payment: YooKassaPaymentObject,
    senderIp: string,
    rawPayload: unknown,
  ): Promise<void> {
    let failedSubAlert: { userId: string; subscriptionId: string; kickTelegram: boolean } | null = null;

    await this.uow.runInTransaction(async (tx) => {
      const isFirst = await tx.tryRegisterWebhookEvent('payment.canceled', payment.id, senderIp, rawPayload);
      if (!isFirst) return;

      const localTx = await tx.lockTransactionByYooKassaId(payment.id);
      if (!localTx || localTx.status === 'SUCCEEDED') return;

      const reason = payment.cancellation_details?.reason ?? 'canceled_by_provider';
      await tx.markTransactionCanceled(localTx.id, reason);

      // Если не прошло рекуррентное автопродление — обрабатываем грейс-период (3 попытки)
      if (localTx.txType === 'SUBSCRIPTION_RENEWAL' && localTx.subscriptionId) {
        const retryOutcome = await tx.handleFailedRenewalAttempt(localTx.subscriptionId);
        failedSubAlert = {
          userId: retryOutcome.userId,
          subscriptionId: localTx.subscriptionId,
          kickTelegram: retryOutcome.shouldKickTelegram,
        };
      }
    });

    if (failedSubAlert) {
      if (failedSubAlert.kickTelegram) {
        await this.notificationsQueue.enqueueTelegramVipKick(
          failedSubAlert.userId,
          'Подписка истекла после неуспешных попыток автосписания',
        );
      } else {
        await this.notificationsQueue.enqueueRenewalPaymentFailedAlert(
          failedSubAlert.userId,
          failedSubAlert.subscriptionId,
        );
      }
    }
  }

  private async processRefundSucceeded(
    refundId: string,
    yookassaPaymentId: string,
    senderIp: string,
    rawPayload: unknown,
  ): Promise<void> {
    let revokedInfo: { userId: string; kickFromVipTelegram: boolean } | null = null;

    await this.uow.runInTransaction(async (tx) => {
      const isFirst = await tx.tryRegisterWebhookEvent('refund.succeeded', refundId, senderIp, rawPayload);
      if (!isFirst) return;

      // Отзываем доступ + переводим партнерскую комиссию вебмастера в REVERSED
      revokedInfo = await tx.revokeAccessOnRefund(yookassaPaymentId);
    });

    if (revokedInfo?.kickFromVipTelegram) {
      await this.notificationsQueue.enqueueTelegramVipKick(
        revokedInfo.userId,
        'Возврат средств (refund.succeeded)',
      );
    }
  }
}
