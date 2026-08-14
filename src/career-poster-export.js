import { domToBlob } from "modern-screenshot";
import { CAREER_POSTER_HEIGHT, CAREER_POSTER_WIDTH } from "./career-poster-constants.js";

function posterExportError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

async function waitForImage(image) {
  if (!image.complete) {
    await new Promise((resolve, reject) => {
      const handleLoad = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(posterExportError("Poster görsellerinden biri yüklenemedi.", "IMAGE_LOAD_FAILED"));
      };
      const cleanup = () => {
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
      };

      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
    });
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    throw posterExportError("Poster görsellerinden biri geçersiz.", "IMAGE_INVALID");
  }

  if (typeof image.decode === "function") {
    await image.decode().catch((cause) => {
      throw posterExportError("Poster görsellerinden biri çözümlenemedi.", "IMAGE_DECODE_FAILED", cause);
    });
  }
}

export async function waitForCareerPosterAssets(node) {
  if (!node) {
    throw posterExportError("Poster ön izlemesi bulunamadı.", "POSTER_MISSING");
  }

  const ownerDocument = node.ownerDocument;
  if (ownerDocument?.fonts?.ready) {
    await ownerDocument.fonts.ready;
  }

  await Promise.all([...node.querySelectorAll("img")].map(waitForImage));
}

async function blobDimensions(blob, ownerDocument) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = ownerDocument.createElement("img");
    image.src = objectUrl;
    await waitForImage(image);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function safeCareerPosterFilename(username) {
  const slug = String(username ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[ı]/gu, "i")
    .replace(/[ş]/gu, "s")
    .replace(/[ğ]/gu, "g")
    .replace(/[ü]/gu, "u")
    .replace(/[ö]/gu, "o")
    .replace(/[ç]/gu, "c")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replace(/-+$/gu, "");

  return `dusen-taslar-${slug || "kullanici"}.png`;
}

export async function createCareerPosterPng(node) {
  await waitForCareerPosterAssets(node);

  let blob;
  try {
    blob = await domToBlob(node, {
      width: CAREER_POSTER_WIDTH,
      height: CAREER_POSTER_HEIGHT,
      scale: 1,
      type: "image/png",
      backgroundColor: "#f5ebd6",
      timeout: 30_000,
      style: {
        transform: "none",
        transformOrigin: "top left",
      },
    });
  } catch (cause) {
    throw posterExportError("Kariyer kartı PNG olarak oluşturulamadı.", "PNG_RENDER_FAILED", cause);
  }

  const dimensions = await blobDimensions(blob, node.ownerDocument);
  if (dimensions.width !== CAREER_POSTER_WIDTH || dimensions.height !== CAREER_POSTER_HEIGHT) {
    throw posterExportError(
      `PNG ölçüsü ${dimensions.width}×${dimensions.height}; 1080×1350 olmalıydı.`,
      "PNG_DIMENSIONS_INVALID",
    );
  }

  return blob;
}

export async function downloadCareerPosterPng(node, username) {
  const blob = await createCareerPosterPng(node);
  const filename = safeCareerPosterFilename(username);
  const ownerDocument = node.ownerDocument;
  const objectUrl = URL.createObjectURL(blob);
  const link = ownerDocument.createElement("a");

  try {
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    ownerDocument.body.append(link);
    link.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return { filename, width: CAREER_POSTER_WIDTH, height: CAREER_POSTER_HEIGHT };
}
