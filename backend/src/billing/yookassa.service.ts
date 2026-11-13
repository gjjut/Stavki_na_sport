import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

export interface CreateYooKassaPaymentParams {
  idempotenceKey: string;
  amountRub: string; // Строго формат "990.00"
  description: string;
  receiptEmail: string;
  receiptItemTitle: string;
  returnUrl?: string;
  savePaymentMethod?: boolean; // true при оформлении подписки с автопродлением
  savedPaymentMethodId?: string; // заполняется при фоновом рекуррентном списании
  metadata: {
    transactionId: string;
    userId: string;
    txType: 'SINGLE_PREDICTION' | 'SUBSCRIPTION_INITIAL' | 'SUBSCRIPTION_RENEWAL' | 'BALANCE_TOPUP';
    predictionId?: string;
    planId?: string;
    subscriptionId?: string;
  };
}

export interface YooKassaPaymentObject {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: { value: string; currency: 'RUB' };
  confirmation?: { type: 'redirect'; confirmation_url: string };
  payment_method?: {
    id: string;
    type: string;
    saved: boolean;
    title?: string;
  };
  receipt_registration?: 'pending' | 'succeeded' | 'canceled';
  cancellation_details?: { party: string; reason: string };
  metadata?: Record<string, string>;
}

@Injectable()
export class YooKassaService {
  private readonly logger = new Logger(YooKassaService.name);
  private readonly apiBaseUrl = 'https://api.yookassa.ru/v3';

  private getAuthHeader(): string {
    const shopId = process.env.YOOKASSA_SHOP_ID ?? '';
    const secretKey = process.env.YOOKASSA_SECRET_KEY ?? '';
    const credentials = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Создание платежа в ЮKassa (разовый, первичный рекуррентный или автопродление без участия юзера)
   * + автоматическая фискализация чека по 54-ФЗ с отправкой на email покупателя.
   */
  async createPayment(params: CreateYooKassaPaymentParams): Promise<YooKassaPaymentObject> {
    const isSilentAutoCharge = Boolean(params.savedPaymentMethodId);

    const body: Record<string, unknown> = {
      amount: {
        value: Number(params.amountRub).toFixed(2),
        currency: 'RUB',
      },
      capture: true, // Одностадийное списание сразу после оплаты
      description: params.description.slice(0, 128),
      metadata: params.metadata,

      // Чек 54-ФЗ (ЮKassa сама пробьет чек в ОФД и отправит квитанцию на почту юзеру)
      // Важно для модерации СБ ЮKassa: предмет расчета — информационно-аналитическая услуга
      receipt: {
        customer: {
          email: params.receiptEmail,
        },
        items: [
          {
            description: params.receiptItemTitle.slice(0, 128),
            quantity: '1.00',
            amount: {
              value: Number(params.amountRub).toFixed(2),
              currency: 'RUB',
            },
            vat_code: Number(process.env.YOOKASSA_VAT_CODE ?? 1), // 1 = без НДС (УСН/НПД)
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
    };

    if (isSilentAutoCharge) {
      // Безакцептное списание по сохраненному способу оплаты (автопродление VIP)
      body.payment_method_id = params.savedPaymentMethodId;
    } else {
      // Интерактивная оплата на стороне ЮKassa (Карта РФ, СБП, SberPay, T-Pay)
      body.confirmation = {
        type: 'redirect',
        return_url: params.returnUrl,
      };
      if (params.savePaymentMethod) {
        body.save_payment_method = true;
      }
    }

    const response = await fetch(`${this.apiBaseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Idempotence-Key': params.idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`YooKassa createPayment failed (${response.status}): ${errorText}`);
      throw new InternalServerErrorException('Ошибка инициализации платежа на стороне ЮKassa');
    }

    return (await response.json()) as YooKassaPaymentObject;
  }

  /**
   * Server-to-Server верификация статуса платежа.
   * Вызывается при получении любого Webhook от ЮKassa, чтобы исключить подделку тела запроса.
   */
  async verifyPaymentById(yookassaPaymentId: string): Promise<YooKassaPaymentObject> {
    const response = await fetch(`${this.apiBaseUrl}/payments/${encodeURIComponent(yookassaPaymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`YooKassa verifyPaymentById failed (${response.status}): ${errorText}`);
      throw new InternalServerErrorException('Не удалось верифицировать статус платежа в ЮKassa');
    }

    return (await response.json()) as YooKassaPaymentObject;
  }
}
