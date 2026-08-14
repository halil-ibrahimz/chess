import { useLayoutEffect, useRef } from "react";
import bloodiestVictoryPawnImage from "../image/bloodiest-victory-pawn.webp";
import bishopImage from "../image/bishop.webp";
import fastestCheckmateKnightImage from "../image/fastest-checkmate-knight.webp";
import kingImage from "../image/king.webp";
import knightImage from "../image/knight.webp";
import longestBattleRookImage from "../image/longest-battle-rook.webp";
import pawnImage from "../image/pawn.webp";
import queenImage from "../image/queen.webp";
import rookImage from "../image/rook.webp";
import { CAREER_POSTER_HEIGHT, CAREER_POSTER_WIDTH } from "./career-poster-constants.js";
import "./career-poster.css";

export { CAREER_POSTER_HEIGHT, CAREER_POSTER_WIDTH };

const numberFormatter = new Intl.NumberFormat("tr-TR");
const scanDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const OFFICERS = [
  { key: "knight", label: "At", image: knightImage, alt: "Koşan at karakteri" },
  { key: "bishop", label: "Fil", image: bishopImage, alt: "İşaret eden fil karakteri" },
  { key: "rook", label: "Kale", image: rookImage, alt: "Kollarını kavuşturan kale karakteri" },
  { key: "queen", label: "Vezir", image: queenImage, alt: "Sunum yapan vezir karakteri" },
];

function formatCount(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function formattedScanDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? { dateTime: null, label: "Tarih bulunamadı" }
    : { dateTime: date.toISOString(), label: scanDateFormatter.format(date) };
}

function recordCount(record, kind) {
  if (!record) {
    return null;
  }

  if (kind === "loss") {
    return Number.isFinite(record?.lostPieces?.total) ? record.lostPieces.total : null;
  }

  return Number.isFinite(record.moveCount) ? record.moveCount : null;
}

function CareerRecord({ label, record, kind, suffix, testId, image, imageAlt }) {
  const count = recordCount(record, kind);
  const valueRef = useRef(null);
  const value = count === null ? "Kayıt bulunamadı" : `${formatCount(count)} ${suffix}`;

  useLayoutEffect(() => {
    const element = valueRef.current;
    if (!element) {
      return;
    }

    let fontSize = 31;
    element.style.fontSize = `${fontSize}px`;
    while (element.scrollWidth > element.clientWidth && fontSize > 18) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;
    }
  }, [value]);

  return (
    <div className="career-poster__record">
      <dt>{label}</dt>
      <dd ref={valueRef} data-testid={testId}>
        {value}
      </dd>
      <img src={image} alt={imageAlt} width="1254" height="1254" />
    </div>
  );
}

export function CareerPoster({
  displayUsername,
  scanDate,
  totalGames,
  totalLosses,
  lostPieces = {},
  careerRecords = {},
  posterRef,
}) {
  const frameRef = useRef(null);
  const usernameRef = useRef(null);
  const username = typeof displayUsername === "string" && displayUsername.trim()
    ? displayUsername.trim()
    : "Kullanıcı";
  const formattedDate = formattedScanDate(scanDate);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }

    const updateScale = () => {
      frame.style.setProperty(
        "--career-poster-scale",
        String(Math.min(1, frame.clientWidth / CAREER_POSTER_WIDTH)),
      );
    };

    updateScale();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateScale);
      observer.observe(frame);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useLayoutEffect(() => {
    const heading = usernameRef.current;
    if (!heading) {
      return;
    }

    let fontSize = 104;
    heading.style.fontSize = `${fontSize}px`;
    while (heading.scrollWidth > heading.clientWidth && fontSize > 18) {
      fontSize -= 2;
      heading.style.fontSize = `${fontSize}px`;
    }
  }, [username]);

  return (
    <div className="career-poster-frame" ref={frameRef}>
      <article
        ref={posterRef}
        className="career-poster"
        data-testid="career-poster-canvas"
        aria-label={`${username} için Düşen Taşlar kariyer posteri`}
      >
        <header className="career-poster__header">
          <div>
            <p className="career-poster__brand">DÜŞEN TAŞLAR</p>
            <p className="career-poster__subtitle">CHESS.COM KARİYER KAYDI</p>
          </div>
          <div className="career-poster__date">
            <span>TARAMA TARİHİ</span>
            {formattedDate.dateTime ? (
              <time dateTime={formattedDate.dateTime}>{formattedDate.label}</time>
            ) : (
              <p>{formattedDate.label}</p>
            )}
          </div>
        </header>

        <section className="career-poster__summary" aria-label="Kariyer özeti">
          <div className="career-poster__identity">
            <p>OYUNCU</p>
            <h1 ref={usernameRef} data-testid="career-poster-username">{username}</h1>
          </div>
          <dl className="career-poster__totals">
            <div>
              <dt>Toplam maç</dt>
              <dd data-testid="career-poster-total-games">{formatCount(totalGames)}</dd>
            </div>
            <div>
              <dt>Toplam kayıp</dt>
              <dd data-testid="career-poster-total-losses">{formatCount(totalLosses)}</dd>
            </div>
          </dl>
        </section>

        <section className="career-poster__king-note" aria-label="Şah kaydı">
          <img src={kingImage} alt="Ellerini beline koyan şah karakteri" />
          <div>
            <p>Şah</p>
            <strong>0 kayıp</strong>
          </div>
          <p>Sen kaybetsen de o düşmez.</p>
        </section>

        <section className="career-poster__army" aria-label="Ordu dökümü">
          <article className="career-poster__pawn">
            <div className="career-poster__pawn-copy">
              <p className="career-poster__kicker">ÖN SAFLARIN KAHRAMANI</p>
              <h2>Piyon</h2>
              <strong data-testid="career-poster-loss-pawn">{formatCount(lostPieces.pawn)}</strong>
              <span>kayıp</span>
              <p>Ön saflarda yürüdüler, kariyerinin yükünü omuzladılar.</p>
            </div>
            <img src={pawnImage} alt="Elini alnına götüren piyon karakteri" />
          </article>

          <div className="career-poster__officers" role="list" aria-label="Diğer taş kayıpları">
            {OFFICERS.map((piece) => (
              <article className="career-poster__officer" role="listitem" key={piece.key}>
                <img src={piece.image} alt={piece.alt} />
                <div>
                  <h2>{piece.label}</h2>
                  <p>
                    <strong data-testid={`career-poster-loss-${piece.key}`}>
                      {formatCount(lostPieces[piece.key])}
                    </strong>
                    <span>kayıp</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="career-poster__records" aria-labelledby="career-poster-records-title">
          <h2 id="career-poster-records-title">KARİYER KAYITLARI</h2>
          <dl>
            <CareerRecord
              label="En kanlı zafer"
              record={careerRecords.bloodiestWin}
              kind="loss"
              suffix="taş"
              testId="career-poster-record-bloodiest"
              image={bloodiestVictoryPawnImage}
              imageAlt="En kanlı zafer kaydını temsil eden piyon karakteri"
            />
            <CareerRecord
              label="En uzun savaş"
              record={careerRecords.longestBattle}
              kind="moves"
              suffix="hamle"
              testId="career-poster-record-longest"
              image={longestBattleRookImage}
              imageAlt="En uzun savaş kaydını temsil eden kale karakteri"
            />
            <CareerRecord
              label="En hızlı mat"
              record={careerRecords.fastestCheckmate}
              kind="moves"
              suffix="hamle"
              testId="career-poster-record-fastest"
              image={fastestCheckmateKnightImage}
              imageAlt="En hızlı mat kaydını temsil eden at karakteri"
            />
          </dl>
        </section>

        <footer className="career-poster__footer">
          <p>DÜŞEN TAŞLAR • KARİYER ARŞİVİ</p>
          <p>Resmî Chess.com ürünü değildir.</p>
        </footer>
      </article>
    </div>
  );
}
