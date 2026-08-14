import assert from "node:assert/strict";
import test from "node:test";
import { safeCareerPosterFilename } from "../src/career-poster-export.js";

test("kariyer posteri dosya adını güvenli ve kararlı biçimde üretir", () => {
  assert.equal(safeCareerPosterFilename("Hiy-Z"), "dusen-taslar-hiy-z.png");
  assert.equal(
    safeCareerPosterFilename("  Uğur Çelik 24 / Şampiyon  "),
    "dusen-taslar-ugur-celik-24-sampiyon.png",
  );
  assert.equal(safeCareerPosterFilename("***"), "dusen-taslar-kullanici.png");
});
