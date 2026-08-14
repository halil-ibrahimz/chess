import { sha256Hex } from "./sha256.js";

function normalizedString(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

export async function getGameIdentities(game) {
  const identities = [];
  const uuid = normalizedString(game?.uuid);
  if (uuid) {
    identities.push(`uuid:${uuid}`);
  }

  const url = normalizedString(game?.url).replace(/\/$/, "");
  if (url) {
    identities.push(`url:${url}`);
  }

  const fingerprintSource = JSON.stringify([
    Number(game?.end_time ?? 0),
    normalizedString(game?.white?.username),
    normalizedString(game?.black?.username),
    typeof game?.pgn === "string" ? game.pgn : "",
    typeof game?.fen === "string" ? game.fen : "",
  ]);
  const fingerprint = await sha256Hex(fingerprintSource);
  identities.push(`sha256:${fingerprint}`);
  return identities;
}

export async function getGameIdentity(game) {
  return (await getGameIdentities(game))[0];
}
