import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CareerPoster } from "./CareerPoster.jsx";
import {
  careerPosterFixture,
  longRecordValuesCareerPosterFixture,
  longUsernameCareerPosterFixture,
  missingRecordsCareerPosterFixture,
} from "../scripts/fixtures/career-poster.fixture.js";
import "./styles.css";
import "./poster-preview.css";

const scenario = new URLSearchParams(window.location.search).get("scenario");
const fixture = scenario === "long-username"
  ? longUsernameCareerPosterFixture
  : scenario === "long-record-values"
    ? longRecordValuesCareerPosterFixture
  : scenario === "missing-records"
    ? missingRecordsCareerPosterFixture
    : careerPosterFixture;

createRoot(document.getElementById("poster-preview-root")).render(
  <StrictMode>
    <main className="career-poster-preview-stage">
      <CareerPoster {...fixture} />
    </main>
  </StrictMode>,
);
