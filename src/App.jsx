import { useEffect, useRef, useState } from "react";
import archiveBishopImage from "../image/archive-bishop.webp";
import archiveCourierKnightImage from "../image/archive-courier-knight-loading.webp";
import bishopImage from "../image/bishop.webp";
import bloodiestVictoryPawnImage from "../image/bloodiest-victory-pawn.webp";
import fastestCheckmateKnightImage from "../image/fastest-checkmate-knight.webp";
import kingImage from "../image/king.webp";
import knightImage from "../image/knight.webp";
import longestBattleRookImage from "../image/longest-battle-rook.webp";
import pawnImage from "../image/pawn.webp";
import queenImage from "../image/queen.webp";
import rookImage from "../image/rook.webp";
import { CareerPosterDialog } from "./CareerPosterDialog.jsx";
import { validateUsername } from "./chess-com-client.js";
import { readCachedResult, writeCachedResult } from "./web/result-cache.js";

const PIECES = [
  {
    key: "pawn",
    label: "Piyon",
    image: pawnImage,
    imageAlt: "Elini alnına götüren piyon karakteri",
    tribute: "Ön saflarda yürüdüler, kariyerinin yükünü omuzladılar.",
  },
  {
    key: "knight",
    label: "At",
    image: knightImage,
    imageAlt: "Koşan at karakteri",
    tribute: "L çizip geldiler, iz bırakıp gittiler.",
  },
  {
    key: "bishop",
    label: "Fil",
    image: bishopImage,
    imageAlt: "İşaret eden fil karakteri",
    tribute: "Çapraz yolların zarif öncüleri.",
  },
  {
    key: "rook",
    label: "Kale",
    image: rookImage,
    imageAlt: "Kollarını kavuşturan kale karakteri",
    tribute: "Dosdoğru gittiler, kolay kolay eğilmediler.",
  },
  {
    key: "queen",
    label: "Vezir",
    image: queenImage,
    imageAlt: "Sunum yapan vezir karakteri",
    tribute: "Tahtanın en görkemli vedaları.",
  },
];

const CAREER_RECORD_DEFINITIONS = [
  {
    key: "bloodiestWin",
    kicker: "BEDELİ EN AĞIR ZAFER",
    title: "En kanlı zafer",
    image: bloodiestVictoryPawnImage,
    imageAlt: "Zafer bayrağı taşıyan yaralı piyon illüstrasyonu",
  },
  {
    key: "longestBattle",
    kicker: "SON HAMLEYE KADAR",
    title: "En uzun savaş",
    image: longestBattleRookImage,
    imageAlt: "Uzun maç kaydını inceleyen kale illüstrasyonu",
  },
  {
    key: "fastestCheckmate",
    kicker: "GÖZ AÇIP KAPAYANA KADAR",
    title: "En hızlı mat",
    image: fastestCheckmateKnightImage,
    imageAlt: "Bitiş çizgisine koşan at illüstrasyonu",
  },
];

const LOSS_DETAIL_LABELS = [
  ["pawn", "piyon"],
  ["knight", "at"],
  ["bishop", "fil"],
  ["rook", "kale"],
  ["queen", "vezir"],
];

const TIME_CLASS_LABELS = Object.freeze({
  daily: "Daily",
  rapid: "Rapid",
  blitz: "Blitz",
  bullet: "Bullet",
});

const numberFormatter = new Intl.NumberFormat("tr-TR");
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const careerDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
});

function formatCount(value) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatCareerDate(endTime) {
  if (typeof endTime !== "number" || !Number.isFinite(endTime)) {
    return null;
  }

  const date = new Date(endTime * 1_000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    dateTime: date.toISOString(),
    label: careerDateFormatter.format(date),
  };
}

function formatTimeClass(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().toLocaleLowerCase("en-US");
  return TIME_CLASS_LABELS[normalized]
    ?? `${normalized.charAt(0).toLocaleUpperCase("tr-TR")}${normalized.slice(1)}`;
}

function formatOutcome(value) {
  if (value === "win") {
    return "Kazandın";
  }

  if (value === "loss") {
    return "Kaybettin";
  }

  if (value === "draw") {
    return "Berabere";
  }

  return "Sonuç bilinmiyor";
}

function formatLossBreakdown(lostPieces) {
  const parts = LOSS_DETAIL_LABELS.flatMap(([key, label]) => {
    const value = lostPieces?.[key];
    return Number.isInteger(value) && value > 0 ? [`${formatCount(value)} ${label}`] : [];
  });

  return parts.length > 0 ? parts.join(" · ") : "Taş kaybı yok.";
}

function safeChessComGameUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    const chessComHost = url.hostname === "chess.com" || url.hostname.endsWith(".chess.com");
    return url.protocol === "https:" && chessComHost ? url.href : null;
  } catch {
    return null;
  }
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Number(milliseconds ?? 0)) / 1_000;
  if (seconds < 60) {
    return `${seconds.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} dk ${remainingSeconds} sn`;
}

function readHeapBytes() {
  const usedBytes = globalThis.performance?.memory?.usedJSHeapSize;
  return Number.isFinite(usedBytes) ? usedBytes : null;
}

function toMiB(bytes) {
  return bytes === null ? null : Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function getStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function displayUsernameResult(result, submittedUsername) {
  const displayUsername = [submittedUsername, result?.displayUsername, result?.username]
    .find((value) => typeof value === "string" && value.trim());

  if (!result || !displayUsername || result.displayUsername === displayUsername.trim()) {
    return result;
  }

  return { ...result, displayUsername: displayUsername.trim() };
}

function requestStageLabel(error) {
  if (error?.stage === "profile") {
    return "Chess.com profil isteği";
  }

  if (error?.stage === "archiveList") {
    return "Chess.com arşiv listesi isteği";
  }

  if (error?.stage === "archiveMonth") {
    return error.archive
      ? `Chess.com ${error.archive} arşiv ayı isteği`
      : "Chess.com aylık arşiv isteği";
  }

  return "Chess.com isteği";
}

function logDevelopmentFailure(label, error) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.error(`[Düşen Taşlar] ${label}`, {
    name: error?.name ?? null,
    code: error?.code ?? null,
    message: error?.message ?? null,
    status: error?.status ?? null,
    stage: error?.stage ?? null,
    requestUrl: error?.requestUrl ?? null,
    requestPath: error?.requestPath ?? null,
    archive: error?.archive ?? null,
    causeName: error?.causeName ?? null,
    causeMessage: error?.causeMessage ?? null,
    stack: error?.stack ?? null,
    filename: error?.filename ?? null,
    line: error?.line ?? null,
    column: error?.column ?? null,
  });
}

function friendlyError(error) {
  const stageLabel = requestStageLabel(error);

  if (error?.code === "NOT_FOUND") {
    return error.stage === "profile"
      ? "Bu Chess.com kullanıcı adı bulunamadı veya herkese açık değil."
      : `${stageLabel} bulunamadı.`;
  }

  if (error?.code === "RATE_LIMITED") {
    return `${stageLabel} için istek sınırına ulaşıldı. Bir süre sonra yeniden dene.`;
  }

  if (error?.code === "TIMEOUT") {
    return `${stageLabel} zaman aşımına uğradı. Bir süre sonra yeniden deneyebilirsin.`;
  }

  if (error?.code === "NETWORK_ERROR") {
    return `${stageLabel} tamamlanamadı. Tarayıcı gizlilik/eklenti ayarı, geçici ağ engeli veya Chess.com erişimi buna neden olabilir.`;
  }

  if (error?.code === "FETCH_INVOCATION_ERROR") {
    return `${stageLabel} tarayıcı tarafından başlatılamadı. Teknik ayrıntı geliştirme konsoluna kaydedildi.`;
  }

  if (error?.code === "HTTP_ERROR") {
    return `${stageLabel} başarısız oldu${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : ""}.`;
  }

  if (error?.code === "INVALID_RESPONSE") {
    return `${stageLabel} beklenen veri biçimini döndürmedi.`;
  }

  if (error?.code === "GONE") {
    return `${stageLabel} artık Chess.com tarafından sunulmuyor.`;
  }

  if (error?.code === "UNSUPPORTED_BROWSER") {
    return "Bu tarayıcı güvenli tarama için gereken modern ağ özelliklerini desteklemiyor. Tarayıcıyı güncelleyip yeniden dene.";
  }

  return error?.message || "Tarama tamamlanamadı.";
}

function progressText(progress, retryEvent) {
  if (retryEvent) {
    const seconds = Math.ceil(retryEvent.delayMs / 1_000);
    const reason = retryEvent.reason === "rateLimited"
      ? "istek sınırına ulaşıldı"
      : retryEvent.reason === "serverError"
        ? `sunucu HTTP ${retryEvent.status} yanıtı verdi`
        : retryEvent.reason === "timeout"
          ? "istek zaman aşımına uğradı"
          : "geçici erişim hatası oluştu";
    return `${requestStageLabel(retryEvent)}: ${reason}; ${seconds} saniye sonra güvenli biçimde yeniden denenecek.`;
  }

  if (!progress) {
    return "Profil ve arşiv listesi alınıyor…";
  }

  const { processed, total, current } = progress.archives;
  if (progress.stage === "archiveStarted" && current) {
    return `${current.year}/${current.month} arşivi işleniyor — ${processed}/${total} ay tamamlandı.`;
  }

  if (progress.stage === "scanCompleted") {
    return `${total}/${total} ay tamamlandı.`;
  }

  return `${processed}/${total} ay tamamlandı.`;
}

function CareerRecordCard({ definition, record }) {
  const gameUrl = safeChessComGameUrl(record?.url);
  const date = formatCareerDate(record?.endTime);
  const timeClass = formatTimeClass(record?.timeClass);
  const opponentUsername = typeof record?.opponent?.username === "string"
    ? record.opponent.username.trim()
    : "";
  const opponentRating = Number.isFinite(record?.opponent?.rating)
    ? formatCount(record.opponent.rating)
    : null;
  const metadata = [];

  if (opponentUsername) {
    metadata.push({
      key: "opponent",
      content: `Rakip: ${opponentUsername}${opponentRating ? ` (${opponentRating})` : ""}`,
    });
  }

  if (date) {
    metadata.push({
      key: "date",
      content: <time dateTime={date.dateTime}>{date.label}</time>,
    });
  }

  if (timeClass) {
    metadata.push({ key: "timeClass", content: timeClass });
  }

  if (definition.key === "bloodiestWin" && Number.isInteger(record?.moveCount)) {
    metadata.push({ key: "moveCount", content: `${formatCount(record.moveCount)} hamle` });
  }

  let mainSentence = null;
  if (record) {
    if (definition.key === "bloodiestWin") {
      mainSentence = `${formatCount(record.lostPieces?.total)} taş kaybettin, yine de kazandın.`;
    } else if (definition.key === "longestBattle") {
      mainSentence = `${formatCount(record.moveCount)} hamle sürdü.`;
    } else {
      mainSentence = `${formatCount(record.moveCount)} hamlede mat.`;
    }
  }

  return (
    <article
      className={`career-record-card career-record-card--${definition.key}`}
      data-testid={`career-record-${definition.key}`}
    >
      <div className="career-record-card__media">
        <img
          src={definition.image}
          alt={definition.imageAlt}
          width="1254"
          height="1254"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="career-record-card__body">
        <p className="career-record-card__kicker">{definition.kicker}</p>
        <h4>{definition.title}</h4>

        {record ? (
          <>
            <p className="career-record-card__statement">{mainSentence}</p>
            {definition.key === "bloodiestWin" ? (
              <p className="career-record-card__losses">
                {formatLossBreakdown(record.lostPieces)}
              </p>
            ) : null}
            {definition.key === "longestBattle" ? (
              <p className="career-record-card__outcome">{formatOutcome(record.userResult)}</p>
            ) : null}
            {metadata.length > 0 ? (
              <ul className="career-record-card__metadata" aria-label="Maç bilgileri">
                {metadata.map((item) => <li key={item.key}>{item.content}</li>)}
              </ul>
            ) : null}
            {gameUrl ? (
              <a
                className="career-record-link"
                href={gameUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${definition.title} maçını Chess.com'da yeni sekmede aç`}
              >
                Maçı Chess.com’da aç <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </>
        ) : (
          <p className="career-record-card__empty">Bu kayıt için uygun maç bulunamadı.</p>
        )}
      </div>
    </article>
  );
}

function CareerRecordsSection({ careerRecords, onRescan }) {
  if (!careerRecords) {
    return (
      <section
        className="career-records-empty"
        aria-label="Kariyer kayıtları"
        data-testid="career-records-fallback"
      >
        <p>Kariyer kayıtlarını görmek için hesabını yeniden tara.</p>
        <button className="secondary-button" type="button" onClick={onRescan}>
          Yeniden tara
        </button>
      </section>
    );
  }

  return (
    <section
      className="career-records-section"
      aria-labelledby="career-records-title"
      data-testid="career-records"
    >
      <header className="career-records-heading">
        <p className="career-records-heading__kicker">KARİYER ARŞİVİNDEN</p>
        <h3 id="career-records-title">Unutulmayan üç savaş</h3>
        <p>Binlerce maçın arasında öne çıkan üç kariyer kaydı.</p>
      </header>

      <div className="career-records-grid">
        {CAREER_RECORD_DEFINITIONS.map((definition) => (
          <CareerRecordCard
            key={definition.key}
            definition={definition}
            record={careerRecords[definition.key] ?? null}
          />
        ))}
      </div>

      <dl className="career-record-badges" aria-label="Kariyer zafer istatistikleri">
        <div>
          <dt>Vezir kaybıyla zafer</dt>
          <dd data-testid="career-badge-queen-loss-wins">
            {formatCount(careerRecords.queenLossWins)}
          </dd>
        </div>
        <div>
          <dt>Kayıpsız zafer</dt>
          <dd data-testid="career-badge-flawless-wins">
            {formatCount(careerRecords.flawlessWins)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ArchiveBishopCard() {
  return (
    <aside className="archive-bishop-card" aria-labelledby="archive-bishop-title">
      <div className="archive-bishop-card__media">
        <img
          src={archiveBishopImage}
          alt="Maç kayıtlarını inceleyen Arşivci Fil illüstrasyonu"
          width="1254"
          height="1254"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="archive-bishop-card__content">
        <p className="archive-bishop-card__kicker">KAYDIN NASIL HAZIRLANDI?</p>
        <h3 id="archive-bishop-title">Arşivci Fil kayıtlarını inceledi.</h3>
        <p>
          Herkese açık standart maçların bu cihazda tarandı. Hamleler yeniden oynatıldı
          ve yalnızca tahtada gerçekten alınan taşların sayıldı. Ham maç verilerin
          sunucumuza gönderilmedi.
        </p>
      </div>
    </aside>
  );
}

function ResultView({ result, source, savedAt, onBack, onRescan, sectionRef }) {
  const [isPosterOpen, setIsPosterOpen] = useState(false);
  const posterButtonRef = useRef(null);
  const workerMemory = result.performance?.memory;
  const browserPerformance = result.browserPerformance;
  const pawn = PIECES[0];
  const officers = PIECES.slice(1);
  const displayUsername = result.displayUsername ?? result.username;
  const posterProps = {
    displayUsername,
    scanDate: savedAt,
    totalGames: result.uniqueGamesProcessed,
    totalLosses: result.lostPieces.total,
    lostPieces: result.lostPieces,
    careerRecords: result.careerRecords ?? {},
  };

  function closePoster() {
    setIsPosterOpen(false);
    requestAnimationFrame(() => posterButtonRef.current?.focus({ preventScroll: true }));
  }

  return (
    <section
      ref={sectionRef}
      className="result-panel"
      aria-labelledby="result-title"
      data-testid="result"
    >
      <nav className="result-toolbar" aria-label="Sonuç işlemleri">
        <button className="back-link" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> Geri dön
        </button>
        <button className="secondary-button" type="button" onClick={onRescan}>
          Yeniden tara
        </button>
      </nav>

      <header className="result-hero">
        <div className="result-identity">
          <p className="result-kicker">KARİYER TARAMASI TAMAMLANDI</p>
          <h2 id="result-title">{displayUsername}</h2>
          <p>Tahtada verilen uzun emeğin, cesur hamlelerin ve unutulmaz taşların dökümü.</p>
          {source === "cache" && savedAt ? (
            <p className="result-saved-at">
              Son kayıt: <time dateTime={new Date(savedAt).toISOString()}>{dateFormatter.format(new Date(savedAt))}</time>
            </p>
          ) : null}
        </div>

        <dl className="career-totals" aria-label="Kariyer toplamları">
          <div>
            <dt>Toplam maç</dt>
            <dd data-testid="total-games">{formatCount(result.uniqueGamesProcessed)}</dd>
          </div>
          <div>
            <dt>Toplam kayıp</dt>
            <dd data-testid="total-losses">{formatCount(result.lostPieces.total)}</dd>
          </div>
        </dl>
      </header>

      <div className="result-announcement" role="status">
        {formatCount(result.uniqueGamesProcessed)} maçlık kariyer taraması tamamlandı.
      </div>

      <section className="honor-roll" aria-labelledby="honor-roll-title">
        <div className="honor-roll-heading">
          <p className="eyebrow">KARİYERİNİN GERİDE BIRAKTIKLARI</p>
          <h3 id="honor-roll-title">Düşen taşların</h3>
        </div>

        <article className="king-card">
          <div className="king-card__media">
            <img src={kingImage} alt="Ellerini beline koyan şah karakteri" />
          </div>
          <div className="king-card__content">
            <div className="king-card__title-row">
              <h4>Şah</h4>
              <strong>{formatCount(0)} kayıp</strong>
            </div>
            <p>Sen kaybetsen de o düşmez.</p>
          </div>
        </article>

        <article className="piece-card piece-card--pawn">
          <div className="piece-card__content">
            <p className="piece-card__eyebrow">Ön safların kahramanı</p>
            <h4>{pawn.label}</h4>
            <p className="piece-card__count">
              <strong data-testid="loss-pawn">{formatCount(result.lostPieces.pawn)}</strong>
              <span> kayıp</span>
            </p>
            <p className="piece-card__tribute">{pawn.tribute}</p>
          </div>
          <div className="piece-card__media piece-card__media--pawn">
            <img src={pawn.image} alt={pawn.imageAlt} />
          </div>
        </article>

        <div className="piece-grid">
          {officers.map((piece) => (
            <article className={`piece-card piece-card--${piece.key}`} key={piece.key}>
              <div className="piece-card__media">
                <img src={piece.image} alt={piece.imageAlt} />
              </div>
              <div className="piece-card__content">
                <h4>{piece.label}</h4>
                <p className="piece-card__count">
                  <strong data-testid={`loss-${piece.key}`}>
                    {formatCount(result.lostPieces[piece.key])}
                  </strong>
                  <span> kayıp</span>
                </p>
                <p className="piece-card__tribute">{piece.tribute}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <CareerRecordsSection careerRecords={result.careerRecords} onRescan={onRescan} />

      <div className="career-poster-cta">
        <button
          ref={posterButtonRef}
          className="primary-button"
          type="button"
          onClick={() => setIsPosterOpen(true)}
        >
          Kariyer kartını hazırla
        </button>
      </div>

      {isPosterOpen ? (
        <CareerPosterDialog posterProps={posterProps} onClose={closePoster} />
      ) : null}

      <ArchiveBishopCard />

      <div className="result-notes">
        <details className="technical-details">
          <summary>Teknik ayrıntılar</summary>
          <dl className="metrics">
            <div>
              <dt>İncelenen maç</dt>
              <dd>{formatCount(result.gamesExamined)}</dd>
            </div>
            <div>
              <dt>Atlanan kayıt</dt>
              <dd>{formatCount(result.gamesSkipped)}</dd>
            </div>
            <div>
              <dt>Arşiv ayı</dt>
              <dd>{formatCount(result.archiveMonthsProcessed)}</dd>
            </div>
            <div>
              <dt>Tarama süresi</dt>
              <dd data-testid="scan-duration">
                {formatDuration(browserPerformance?.durationMs ?? result.performance?.durationMs)}
              </dd>
            </div>
            <div>
              <dt>Ana arayüz en uzun gecikme</dt>
              <dd data-testid="main-thread-delay">
                {browserPerformance
                  ? `${browserPerformance.maxMainThreadDelayMs.toLocaleString("tr-TR", {
                      maximumFractionDigits: 1,
                    })} ms`
                  : "Önbellekte ölçüm yok"}
              </dd>
            </div>
            <div>
              <dt>Yaklaşık JS bellek değişimi</dt>
              <dd data-testid="memory-change">
                {browserPerformance?.heapAvailable
                  ? `${browserPerformance.heapChangeMiB.toLocaleString("tr-TR", {
                      maximumFractionDigits: 2,
                    })} MiB`
                  : workerMemory?.available
                    ? `${workerMemory.heapUsedChangeMiB.toLocaleString("tr-TR")} MiB`
                    : "Tarayıcı raporlamıyor"}
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}

export default function App() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(null);
  const [retryEvent, setRetryEvent] = useState(null);
  const [result, setResult] = useState(null);
  const [resultSource, setResultSource] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const workerRef = useRef(null);
  const scanTokenRef = useRef(0);
  const heartbeatRef = useRef(null);
  const scanStartedAtRef = useRef(0);
  const initialHeapRef = useRef(null);
  const progressPanelRef = useRef(null);
  const resultPanelRef = useRef(null);
  const introRef = useRef(null);
  const usernameInputRef = useRef(null);
  const returningToFormRef = useRef(false);

  function stopHeartbeat() {
    const heartbeat = heartbeatRef.current;
    if (!heartbeat) {
      return 0;
    }

    clearInterval(heartbeat.intervalId);
    heartbeatRef.current = null;
    return heartbeat.maxDelayMs;
  }

  function startHeartbeat() {
    stopHeartbeat();
    const intervalMs = 100;
    const heartbeat = {
      lastTick: performance.now(),
      maxDelayMs: 0,
      intervalId: null,
    };

    heartbeat.intervalId = setInterval(() => {
      const now = performance.now();
      const delay = Math.max(0, now - heartbeat.lastTick - intervalMs);
      heartbeat.maxDelayMs = Math.max(heartbeat.maxDelayMs, delay);
      heartbeat.lastTick = now;
    }, intervalMs);
    heartbeatRef.current = heartbeat;
  }

  function finishBrowserPerformance() {
    const finalHeap = readHeapBytes();
    const initialHeap = initialHeapRef.current;
    return {
      durationMs: Math.round(performance.now() - scanStartedAtRef.current),
      maxMainThreadDelayMs: Math.round(stopHeartbeat() * 10) / 10,
      heapAvailable: initialHeap !== null && finalHeap !== null,
      initialHeapMiB: toMiB(initialHeap),
      finalHeapMiB: toMiB(finalHeap),
      heapChangeMiB:
        initialHeap !== null && finalHeap !== null ? toMiB(finalHeap - initialHeap) : null,
    };
  }

  function stopWorker() {
    const worker = workerRef.current;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    workerRef.current = null;
  }

  function showCachedResult(record, requestedUsername) {
    stopWorker();
    stopHeartbeat();
    setProgress(null);
    setRetryEvent(null);
    setErrorMessage("");
    setResult(displayUsernameResult(record.result, requestedUsername));
    setResultSource("cache");
    setSavedAt(record.savedAt);
    setStatus("complete");
  }

  function startLiveScan(requestedUsername) {
    if (typeof Worker !== "function") {
      setErrorMessage("Bu tarayıcı Web Worker özelliğini desteklemiyor.");
      setStatus("error");
      return;
    }

    stopWorker();
    const token = ++scanTokenRef.current;
    let worker;
    try {
      worker = new Worker(new URL("./web/history.worker.js", import.meta.url), {
        type: "module",
        name: "satranc-mezarligi-history",
      });
    } catch (error) {
      logDevelopmentFailure("Worker başlatılamadı", {
        name: error?.name,
        code: "WORKER_START_ERROR",
        message: error?.message,
        stack: error?.stack,
        stage: "workerStartup",
      });
      setErrorMessage("Tarama iş parçacığı bu tarayıcıda başlatılamadı.");
      setStatus("error");
      return;
    }
    workerRef.current = worker;
    scanStartedAtRef.current = performance.now();
    initialHeapRef.current = readHeapBytes();
    startHeartbeat();
    setStatus("scanning");
    setProgress(null);
    setRetryEvent(null);
    setResult(null);
    setResultSource(null);
    setSavedAt(null);
    setErrorMessage("");

    worker.onmessage = (event) => {
      if (token !== scanTokenRef.current) {
        return;
      }

      const message = event.data;
      if (message?.scanId !== token) {
        return;
      }

      if (message?.type === "progress") {
        if (message.event?.type === "retry") {
          setRetryEvent(message.event);
        } else {
          setRetryEvent(null);
          setProgress(message.event);
        }
        return;
      }

      if (message?.type === "result") {
        const browserPerformance = finishBrowserPerformance();
        const completedResult = displayUsernameResult(
          { ...message.result, browserPerformance },
          requestedUsername,
        );
        stopWorker();
        const storage = getStorage();
        const now = Date.now();
        writeCachedResult(storage, requestedUsername, completedResult, now);
        if (
          message.result.username.toLocaleLowerCase("en-US") !==
          requestedUsername.toLocaleLowerCase("en-US")
        ) {
          writeCachedResult(storage, message.result.username, completedResult, now);
        }
        setResult(completedResult);
        setResultSource("live");
        setSavedAt(now);
        setStatus("complete");
        return;
      }

      if (message?.type === "error") {
        logDevelopmentFailure("Worker taraması başarısız oldu", message.error);
        finishBrowserPerformance();
        stopWorker();
        setErrorMessage(friendlyError(message.error));
        setStatus("error");
      }
    };

    worker.onerror = (event) => {
      if (token !== scanTokenRef.current) {
        return;
      }
      logDevelopmentFailure("Worker çalışma zamanı hatası", {
        name: "Error",
        code: "WORKER_RUNTIME_ERROR",
        message: event.message,
        stage: "workerRuntime",
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
      finishBrowserPerformance();
      stopWorker();
      setErrorMessage("Tarama iş parçacığı beklenmedik biçimde durdu.");
      setStatus("error");
    };

    worker.onmessageerror = () => {
      if (token !== scanTokenRef.current) {
        return;
      }
      logDevelopmentFailure("Worker mesajı okunamadı", {
        name: "DataCloneError",
        code: "WORKER_MESSAGE_ERROR",
        message: "Worker mesajı ana iş parçacığında ayrıştırılamadı.",
        stage: "workerMessage",
      });
      finishBrowserPerformance();
      stopWorker();
      setErrorMessage("Tarama iş parçacığından gelen veri okunamadı.");
      setStatus("error");
    };

    try {
      worker.postMessage({ type: "start", scanId: token, username: requestedUsername });
    } catch (error) {
      logDevelopmentFailure("Worker başlangıç mesajı gönderilemedi", {
        name: error?.name,
        code: "WORKER_START_MESSAGE_ERROR",
        message: error?.message,
        stack: error?.stack,
        stage: "workerMessage",
      });
      finishBrowserPerformance();
      stopWorker();
      setErrorMessage("Tarama iş parçacığına başlangıç bilgisi gönderilemedi.");
      setStatus("error");
    }
  }

  function beginScan({ force = false } = {}) {
    let validatedUsername;
    try {
      validatedUsername = validateUsername(username);
    } catch (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }

    if (!force) {
      const cached = readCachedResult(getStorage(), validatedUsername);
      if (cached) {
        showCachedResult(cached, validatedUsername);
        return;
      }
    }

    startLiveScan(validatedUsername);
  }

  function handleSubmit(event) {
    event.preventDefault();
    beginScan();
  }

  function cancelScan() {
    ++scanTokenRef.current;
    stopWorker();
    stopHeartbeat();
    setRetryEvent(null);
    setStatus("cancelled");
  }

  function returnToForm() {
    returningToFormRef.current = true;
    setProgress(null);
    setRetryEvent(null);
    setErrorMessage("");
    setStatus("idle");
  }

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    globalThis.__SATRANC_MEZARLIGI_TEST__ = {
      status,
      progress,
      retryEvent,
      result,
      source: resultSource,
      error: errorMessage,
    };
  }, [errorMessage, progress, result, resultSource, retryEvent, status]);

  useEffect(() => {
    const target = status === "scanning"
      ? progressPanelRef.current
      : status === "complete"
        ? resultPanelRef.current
        : status === "idle" && returningToFormRef.current
          ? introRef.current
          : null;

    if (!target) {
      return;
    }

    if (status === "idle") {
      returningToFormRef.current = false;
      usernameInputRef.current?.focus({ preventScroll: true });
    }

    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      ?? false;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [status]);

  useEffect(
    () => () => {
      ++scanTokenRef.current;
      stopWorker();
      stopHeartbeat();
      if (import.meta.env.DEV) {
        delete globalThis.__SATRANC_MEZARLIGI_TEST__;
      }
    },
    [],
  );

  const monthsProcessed = progress?.archives?.processed ?? 0;
  const monthsTotal = progress?.archives?.total ?? 0;
  const gamesProcessed = progress?.games?.uniqueProcessed ?? 0;

  return (
    <main className={`page-shell${status === "complete" ? " page-shell--result" : ""}`}>
      {status !== "complete" ? (
        <section ref={introRef} className="intro" aria-labelledby="page-title">
          <div className="intro-hero">
            <div className="intro-copy">
              <p className="eyebrow">CHESS.COM KARİYER ARŞİVİ</p>
              <div className="intro-title-row">
                <h1 id="page-title">Düşen Taşlar</h1>
                <div
                  className="intro-archive-bishop"
                  data-testid="intro-archive-bishop"
                  aria-hidden="true"
                >
                  <img
                    src={archiveBishopImage}
                    alt=""
                    width="1254"
                    height="1254"
                    decoding="async"
                    draggable="false"
                  />
                </div>
              </div>
              <p className="lede">
                Chess.com kullanıcı adını gir. Herkese açık kariyerindeki maçlar taransın;
                düşen taşların ve unutulmayan savaşların ortaya çıksın.
              </p>
            </div>
          </div>

          <form className="search-form" onSubmit={handleSubmit}>
            <label htmlFor="username">Chess.com kullanıcı adı</label>
            <div className="input-row">
              <input
                ref={usernameInputRef}
                id="username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Örn. Hiy-Z"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck="false"
                disabled={status === "scanning"}
                required
              />
              <button className="primary-button" type="submit" disabled={status === "scanning"}>
                Tüm kariyeri tara
              </button>
            </div>
          </form>

          <p className="privacy-note">
            Ham maç verileri sunucumuza gönderilmez. Tarama süresi kariyer uzunluğuna ve
            cihaz hızına göre değişebilir.
          </p>
        </section>
      ) : null}

      {status === "scanning" ? (
        <section
          ref={progressPanelRef}
          className="progress-panel"
          aria-labelledby="progress-title"
          data-testid="progress-panel"
        >
          <div className="progress-heading">
            <div>
              <p className="eyebrow">Tarama sürüyor</p>
              <h2 id="progress-title">{progressText(progress, retryEvent)}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={cancelScan}>
              İptal et
            </button>
          </div>

          <div className="progress-route">
            <div className="archive-courier" data-testid="archive-courier" aria-hidden="true">
              <img
                src={archiveCourierKnightImage}
                alt=""
                width="421"
                height="512"
                draggable="false"
              />
            </div>
            <progress
              aria-label="Arşiv ayları ilerlemesi"
              max={monthsTotal || 1}
              {...(monthsTotal ? { value: monthsProcessed } : {})}
            />
          </div>
          <div className="progress-stats" aria-live="polite">
            <span>
              <strong>{formatCount(monthsProcessed)}</strong> / {formatCount(monthsTotal)} ay
            </span>
            <span>
              <strong>{formatCount(gamesProcessed)}</strong> maç işlendi
            </span>
          </div>
        </section>
      ) : null}

      {status === "cancelled" ? (
        <p className="status-message" role="status">
          Tarama iptal edildi. İstersen aynı kullanıcı adıyla yeniden başlatabilirsin.
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="status-message status-message--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {status === "complete" && result ? (
        <ResultView
          result={result}
          source={resultSource}
          savedAt={savedAt}
          onBack={returnToForm}
          onRescan={() => beginScan({ force: true })}
          sectionRef={resultPanelRef}
        />
      ) : null}
    </main>
  );
}
