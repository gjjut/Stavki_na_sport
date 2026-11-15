import fs from 'node:fs';
import { ImageResponse } from 'next/og';
import { readState } from '@/server/database';
import { isLegacyStarterDemoPrediction } from '@/server/prediction-data-policy';

export const runtime = 'nodejs';
const size = { width: 1200, height: 630 };

let cachedRegularFont: ArrayBuffer | null = null;
let cachedBoldFont: ArrayBuffer | null = null;

function loadSystemCyrillicFonts() {
  if (!cachedRegularFont) {
    for (const p of [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/TTF/DejaVuSans.ttf',
    ]) {
      if (fs.existsSync(/* turbopackIgnore: true */ p)) {
        const buf = fs.readFileSync(/* turbopackIgnore: true */ p);
        cachedRegularFont = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        );
        break;
      }
    }
  }
  if (!cachedBoldFont) {
    for (const p of [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    ]) {
      if (fs.existsSync(/* turbopackIgnore: true */ p)) {
        const buf = fs.readFileSync(/* turbopackIgnore: true */ p);
        cachedBoldFont = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        );
        break;
      }
    }
  }

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: 'normal';
  }> = [];

  if (cachedRegularFont) {
    fonts.push({
      name: 'DejaVuSans',
      data: cachedRegularFont,
      weight: 400,
      style: 'normal',
    });
  }
  if (cachedBoldFont) {
    fonts.push({
      name: 'DejaVuSans',
      data: cachedBoldFont,
      weight: 700,
      style: 'normal',
    });
  }
  return fonts;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const state = await readState();
  const pred = state.predictions.find((p) => p.slug === slug);
  if (!pred || isLegacyStarterDemoPrediction(pred)) return new Response('Not found', { status: 404 });

  const brandLabel = `${state.settings.brandName || 'VALUEX'}.`;
  const league = pred.leagueName || 'Спортивная аналитика';
  const matchTitle = `${pred.homeTeam} — ${pred.awayTeam}`;
  const teaserText = pred.analysisTeaser?.slice(0, 145) ||
    'Информационный разбор матча. Результат не гарантирован.';

  const priceText = pred.accessTier === 'FREE'
    ? 'Бесплатный прогноз (0 ₽)'
    : `Разовый доступ: ${pred.singlePriceRub ?? state.settings.defaultSinglePriceRub} ₽`;

  const badgeText = pred.insuredOnLoss && pred.accessTier === 'PAID_SINGLE'
    ? 'Начисление на баланс по условиям оферты'
    : 'Контрольная сумма прогноза SHA-256';

  const fonts = loadSystemCyrillicFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0B0F19',
          color: '#FFFFFF',
          padding: '56px 64px',
          fontFamily: fonts.length > 0 ? 'DejaVuSans' : 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
              }}
            >
              VX
            </div>
            <div style={{ display: 'flex', fontSize: '30px', fontWeight: 700 }}>
              {brandLabel}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(37, 99, 235, 0.22)',
              color: '#93C5FD',
              padding: '10px 22px',
              borderRadius: '999px',
              fontSize: '20px',
              fontWeight: 700,
            }}
          >
            {league}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '54px',
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            {matchTitle}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '24px',
              fontWeight: 400,
              color: '#CBD5E1',
              lineHeight: 1.4,
            }}
          >
            {teaserText}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255,255,255,0.14)',
            paddingTop: '28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '21px',
              fontWeight: 700,
              color: '#6EE7B7',
            }}
          >
            {badgeText}
          </div>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#2563EB',
              padding: '14px 28px',
              borderRadius: '16px',
              fontSize: '23px',
              fontWeight: 700,
            }}
          >
            {priceText}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
