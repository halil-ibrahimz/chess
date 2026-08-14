import { useEffect, useRef, useState } from "react";
import { CareerPoster } from "./CareerPoster.jsx";
import { downloadCareerPosterPng } from "./career-poster-export.js";

function developmentError(error) {
  if (import.meta.env.DEV) {
    console.error("[Düşen Taşlar] Kariyer kartı hazırlanamadı", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      cause: error?.cause,
    });
  }
}

export function CareerPosterDialog({ posterProps, onClose }) {
  const dialogRef = useRef(null);
  const posterRef = useRef(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }

    dialog.showModal();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  function requestClose() {
    if (!isPreparing) {
      onClose();
    }
  }

  async function handleDownload() {
    if (isPreparing) {
      return;
    }

    setIsPreparing(true);
    setErrorMessage("");
    try {
      await downloadCareerPosterPng(posterRef.current, posterProps.displayUsername);
    } catch (error) {
      developmentError(error);
      setErrorMessage(
        error?.code === "IMAGE_LOAD_FAILED" || error?.code === "IMAGE_INVALID"
          ? "Taş görsellerinden biri yüklenemedi. Sayfayı yenileyip tekrar deneyin."
          : "Kariyer kartı PNG olarak hazırlanamadı. Lütfen yeniden deneyin.",
      );
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="career-poster-dialog"
      aria-labelledby="career-poster-dialog-title"
      aria-describedby="career-poster-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div className="career-poster-dialog__panel">
        <header className="career-poster-dialog__header">
          <div>
            <p className="eyebrow">KARİYER ARŞİVİ</p>
            <h2 id="career-poster-dialog-title">Kariyer kartın</h2>
            <p id="career-poster-dialog-description">
              PNG indirmeden önce kartını kontrol edebilirsin.
            </p>
          </div>
          <button
            className="career-poster-dialog__close"
            type="button"
            onClick={requestClose}
            disabled={isPreparing}
            aria-label="Kariyer kartı ön izlemesini kapat"
            autoFocus
          >
            ×
          </button>
        </header>

        <div className="career-poster-dialog__preview">
          <CareerPoster {...posterProps} posterRef={posterRef} />
        </div>

        <footer className="career-poster-dialog__actions">
          <div className="career-poster-dialog__status" aria-live="polite">
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={handleDownload}
            disabled={isPreparing}
          >
            {isPreparing ? "Kart hazırlanıyor…" : "PNG indir"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={requestClose}
            disabled={isPreparing}
          >
            Kapat
          </button>
        </footer>
      </div>
    </dialog>
  );
}
