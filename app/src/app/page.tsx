"use client";

import { useState } from "react";
import { getResult } from "@/lib/getResult";
import type { AnalysisResult } from "@/types";
import { UploadScreen } from "@/components/UploadScreen";
import { ResultsDashboard } from "@/components/ResultsDashboard";

type View = "upload" | "results";

export default function Home() {
  const [view, setView] = useState<View>("upload");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  function handleLoadSample() {
    setResult(getResult());
    setView("results");
  }

  function handleResult(r: AnalysisResult) {
    setResult(r);
    setView("results");
  }

  function handleBack() {
    setView("upload");
    setResult(null);
  }

  if (view === "results" && result) {
    return (
      <ResultsDashboard
        result={result}
        onBack={handleBack}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((v) => !v)}
      />
    );
  }

  return (
    <UploadScreen onResult={handleResult} onLoadSample={handleLoadSample} />
  );
}
