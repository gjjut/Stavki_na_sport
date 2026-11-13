import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { YooKassaService } from './yookassa.service';

export interface DueSubscriptionItem {
  subscriptionId: string;
  userId: string;
  userEmail: string;
  planId: string;
  planName: string;
  priceRub: string;
  yookassaPaymentMethodId: string;
}

export interface RecurringSubscriptionsRepository {
  findSubscriptionsDueForRenewal(limit: number): Promise<DueSubscriptionItem[]>;
  createRenewalTransactionRecord(params: {
    idempotenceKey: string;
    userId: string;
    planId: string;
    subscriptionId: string;
    amountRub: string;
    receiptEmail: string;
  }): Promise<{ txId: string }>;
  attachYooKassaIdToTransaction(txId: string, yookassaPaymentId: string): Promise<void>;
}

/**
 * Фоновый воркер рекуррентных автопродлений подписок ЮKassa.
 * Запускается по расписанию (напр. раз в 15 минут через @nestjs/schedule или BullMQ repeatable job),
 * списывает средства по сохраненному `yookassa_payment_method_id` и пробивает чек 54-ФЗ.
 * Итоговое продление подписки происходит строго через централизованный `YooKassaWebhookController`.
 */
@Injectable()
export class RecurringBillingService {
  private readonly logger = new Logger(RecurringBillingService.name);

  constructor(
    private readonly yookassaService: YooKassaService,
    private readonly subsRepo: RecurringSubscriptionsRepository,
  ) {}

  async processDueRenewalsBatch(batchSize = 50): Promise<{ initiatedCount: number }> {
    const dueList = await this.subsRepo.findSubscriptionsDueForRenewal(batchSize);
    let initiatedCount = 0;

    for (const item of dueList) {
      const idempotenceKey = randomUUID();
      try {
        const { txId } = await this.subsRepo.createRenewalTransactionRecord({
          idempotenceKey,
          userId: item.userId,
          planId: item.planId,
          subscriptionId: item.subscriptionId,
          amountRub: item.priceRub,
          receiptEmail: item.userEmail,
        });

        const payment = await this.yookassaService.createPayment({
          idempotenceKey,
          amountRub: item.priceRub,
          description: `Автопродление подписки ${item.planName}`,
          receiptEmail: item.userEmail,
          receiptItemTitle: `Информационно-аналитическая подписка (${item.planName})`,
          savedPaymentMethodId: item.yookassaPaymentMethodId,
          metadata: {
            transactionId: txId,
            userId: item.userId,
            txType: 'SUBSCRIPTION_RENEWAL',
            planId: item.planId,
            subscriptionId: item.subscriptionId,
          },
        });

        await this.subsRepo.attachYooKassaIdToTransaction(txId, payment.id);
        initiatedCount += 1;
      } catch (err) {
        this.logger.error(
          `Ошибка инициации автопродления для подписки ${item.subscriptionId}: ${String(err)}`,
        );
      }
    }

    return { initiatedCount };
  }
}
