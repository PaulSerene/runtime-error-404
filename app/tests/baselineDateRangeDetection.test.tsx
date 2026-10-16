import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  detectFileTimestamps,
  detectDateRangeFromFiles,
  computeDatasetFingerprint,
  formatIsoToDateInput,
  isAmbiguousDate,
  saveConfirmedBaseline,
  getConfirmedBaseline,
  type InputCsvFile,
} from "@/lib/dateDetector";
import { DateRangePreviewDialog } from "@/components/DateRangePreviewDialog";
import { UploadScreen } from "@/components/UploadScreen";

describe("Baseline Date Range Detection & Calibration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ─── 1. Default Date Behavior ──────────────────────────────────────────────
  describe("1. Default Date Behavior", () => {
    it("renders blank baseline start and end date fields by default for first-time user", () => {
      const onResult = vi.fn();
      const onLoadSample = vi.fn();
      render(<UploadScreen onResult={onResult} onLoadSample={onLoadSample} />);

      const startInput = document.getElementById("training-start") as HTMLInputElement;
      const endInput = document.getElementById("training-end") as HTMLInputElement;

      expect(startInput).toBeInTheDocument();
      expect(endInput).toBeInTheDocument();
      expect(startInput.value).toBe("");
      expect(endInput.value).toBe("");
    });

    it("keeps both date fields editable for manual date entry", () => {
      const onResult = vi.fn();
      const onLoadSample = vi.fn();
      render(<UploadScreen onResult={onResult} onLoadSample={onLoadSample} />);

      const startInput = document.getElementById("training-start") as HTMLInputElement;
      const endInput = document.getElementById("training-end") as HTMLInputElement;

      fireEvent.change(startInput, { target: { value: "2026-10-01" } });
      fireEvent.change(endInput, { target: { value: "2026-10-15" } });

      expect(startInput.value).toBe("2026-10-01");
      expect(endInput.value).toBe("2026-10-15");
    });
  });

  // ─── 2. Multi-File Range Calculation ────────────────────────────────────────
  describe("2. Timestamp Detection Across Multiple CSVs", () => {
    it("calculates earliest and latest valid timestamps across multiple files", () => {
      const logCsv: InputCsvFile = {
        role: "log",
        fileName: "security_log.csv",
        content: `TimeCreated,TargetUserName,IpAddress,WorkstationName,EventId,Keywords
2026-10-10 10:00:00,user1,10.0.0.1,WS1,4624,Audit Success
2026-10-15 18:30:00,user2,10.0.0.2,WS2,4624,Audit Success`,
      };

      const assetsCsv: InputCsvFile = {
        role: "assets",
        fileName: "hosts_catalog.csv",
        content: `host,role,last_seen
WS1,workstation,2026-10-08 08:00:00
WS2,workstation,2026-10-12 14:00:00`,
      };

      const result = detectDateRangeFromFiles([logCsv, assetsCsv], "UTC");

      expect(result.hasAnyValidTimestamps).toBe(true);
      expect(result.overallEarliestDateInput).toBe("2026-10-08");
      expect(result.overallLatestDateInput).toBe("2026-10-15");
      expect(result.totalValid).toBe(4);
      expect(result.totalInvalid).toBe(0);
    });

    it("recognizes various column aliases including event_time, datetime, and timecreated", () => {
      const csvWithEventTime: InputCsvFile = {
        role: "log",
        fileName: "event_time.csv",
        content: `event_time,user,ip\n2026-10-11T12:00:00Z,alice,1.1.1.1`,
      };
      const rep1 = detectFileTimestamps(csvWithEventTime, "UTC");
      expect(rep1.status).toBe("success");
      expect(rep1.timestampColumn).toBe("event_time");

      const csvWithDateTime: InputCsvFile = {
        role: "log",
        fileName: "datetime.csv",
        content: `DateTime,user,ip\n2026-10-11T12:00:00Z,alice,1.1.1.1`,
      };
      const rep2 = detectFileTimestamps(csvWithDateTime, "UTC");
      expect(rep2.status).toBe("success");
      expect(rep2.timestampColumn).toBe("DateTime");
    });
  });

  // ─── 3. Timestamp Parsing & Timezone Normalization ──────────────────────────
  describe("3. Timestamp Parsing & Timezone Normalization", () => {
    it("normalizes different timezone offsets to UTC and calculates the true chronological range", () => {
      // 14:00 +05:30 -> 08:30 UTC on 2026-10-16
      // 06:00 -04:00 -> 10:00 UTC on 2026-10-16
      const csv: InputCsvFile = {
        role: "log",
        fileName: "mixed_offsets.csv",
        content: `timestamp,user\n2026-10-16 14:00:00+05:30,user1\n2026-10-16 06:00:00-04:00,user2`,
      };

      const result = detectDateRangeFromFiles([csv], "UTC");
      expect(result.hasAnyValidTimestamps).toBe(true);
      expect(result.overallEarliestIso).toBe("2026-10-16T08:30:00.000Z");
      expect(result.overallLatestIso).toBe("2026-10-16T10:00:00.000Z");
    });

    it("formats dates in the selected timezone accurately", () => {
      // 2026-10-16T02:00:00Z in America/New_York (UTC-4 in Oct) is 2026-10-15 22:00:00
      const iso = "2026-10-16T02:00:00.000Z";
      expect(formatIsoToDateInput(iso, "UTC")).toBe("2026-10-16");
      expect(formatIsoToDateInput(iso, "America/New_York")).toBe("2026-10-15");
      expect(formatIsoToDateInput(iso, "Asia/Kolkata")).toBe("2026-10-16");
    });

    it("parses Unix timestamps in seconds and milliseconds when in recognized timestamp column", () => {
      const csv: InputCsvFile = {
        role: "log",
        fileName: "epoch.csv",
        content: `SystemTime,user\n1710510181,user1\n1710510200000,user2`,
      };
      const rep = detectFileTimestamps(csv, "UTC");
      expect(rep.status).toBe("success");
      expect(rep.validCount).toBe(2);
      expect(rep.earliestIso).toBe("2024-03-15T13:43:01.000Z");
    });

    it("parses date-only formats such as 16/10/2026 and 2026-10-16", () => {
      const csv: InputCsvFile = {
        role: "log",
        fileName: "date_only.csv",
        content: `timestamp,user\n16/10/2026,user1\n2026-10-20,user2`,
      };
      const rep = detectFileTimestamps(csv, "UTC");
      expect(rep.status).toBe("success");
      expect(rep.validCount).toBe(2);
      expect(rep.earliestIso).toBe("2026-10-16T00:00:00.000Z");
      expect(rep.latestIso).toBe("2026-10-20T00:00:00.000Z");
    });
  });

  // ─── 4. Invalid Timestamps & Ambiguities ────────────────────────────────────
  describe("4. Invalid and Ambiguous Timestamps", () => {
    it("ignores invalid timestamp rows for range calculation and displays warnings", () => {
      const csv: InputCsvFile = {
        role: "log",
        fileName: "dirty_timestamps.csv",
        content: `timestamp,user
2026-10-10T12:00:00Z,alice
not-a-timestamp,bob
2026-10-12T15:00:00Z,charlie
99999999999999999999999,dave`,
      };

      const rep = detectFileTimestamps(csv, "UTC");
      expect(rep.status).toBe("success");
      expect(rep.validCount).toBe(2);
      expect(rep.invalidCount).toBe(2);
      expect(rep.sampleInvalidValues).toContain("not-a-timestamp");
      expect(rep.warnings.length).toBeGreaterThan(0);
      expect(rep.earliestIso).toBe("2026-10-10T12:00:00.000Z");
      expect(rep.latestIso).toBe("2026-10-12T15:00:00.000Z");
    });

    it("detects and flags ambiguous date formats where both day and month are <= 12", () => {
      expect(isAmbiguousDate("05/06/2026 14:00:00")).toBe(true);
      expect(isAmbiguousDate("15/06/2026 14:00:00")).toBe(false);
      expect(isAmbiguousDate("2026-10-16 14:00:00")).toBe(false);

      const csv: InputCsvFile = {
        role: "log",
        fileName: "ambiguous.csv",
        content: `timestamp,user\n05/06/2026,alice`,
      };
      const rep = detectFileTimestamps(csv, "UTC");
      expect(rep.ambiguousCount).toBe(1);
      expect(rep.warnings.some((w) => w.includes("ambiguous"))).toBe(true);
    });
  });

  // ─── 5. Files Without Timestamp Columns ─────────────────────────────────────
  describe("5. Files Without Timestamp Columns", () => {
    it("excludes files without timestamp columns and explains why", () => {
      const assetsCsv: InputCsvFile = {
        role: "assets",
        fileName: "assets.csv",
        content: `host,role,privileged\nWS01,workstation,false\nDC01,domain_controller,true`,
      };

      const rep = detectFileTimestamps(assetsCsv, "UTC");
      expect(rep.status).toBe("no_column");
      expect(rep.timestampColumn).toBeNull();
      expect(rep.warnings[0]).toContain("Excluded from date calculation");
      expect(rep.warnings[0]).toContain("No recognizable timestamp column found");
    });

    it("calculates date range from eligible files when some files lack timestamps", () => {
      const logCsv: InputCsvFile = {
        role: "log",
        fileName: "log.csv",
        content: `timestamp,user\n2026-10-10T00:00:00Z,alice\n2026-10-12T00:00:00Z,bob`,
      };

      const ipLocCsv: InputCsvFile = {
        role: "ipLocation",
        fileName: "ip_loc.csv",
        content: `cidr,location\n10.0.0.0/24,HQ-Building-A`,
      };

      const res = detectDateRangeFromFiles([logCsv, ipLocCsv], "UTC");
      expect(res.hasAnyValidTimestamps).toBe(true);
      expect(res.overallEarliestDateInput).toBe("2026-10-10");
      expect(res.overallLatestDateInput).toBe("2026-10-12");
      expect(res.fileReports.find((r) => r.role === "ipLocation")?.status).toBe("no_column");
    });
  });

  // ─── 6. No Valid Timestamps Anywhere ────────────────────────────────────────
  describe("6. No Valid Timestamps Scenario", () => {
    it("reports failure and provides general warnings when no valid timestamps exist anywhere", () => {
      const badCsv: InputCsvFile = {
        role: "log",
        fileName: "corrupt.csv",
        content: `timestamp,user\ncorrupt-val-a,alice\ncorrupt-val-b,bob`,
      };

      const res = detectDateRangeFromFiles([badCsv], "UTC");
      expect(res.hasAnyValidTimestamps).toBe(false);
      expect(res.totalValid).toBe(0);
      expect(res.totalInvalid).toBe(2);
      expect(res.generalWarnings.length).toBeGreaterThan(0);
    });

    it("disables Apply Range button in preview dialog when no valid timestamps exist", () => {
      const result = detectDateRangeFromFiles(
        [
          {
            role: "log",
            fileName: "empty.csv",
            content: `timestamp,user\nfoo,bar`,
          },
        ],
        "UTC"
      );

      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <DateRangePreviewDialog
          isOpen={true}
          result={result}
          currentTimezone="UTC"
          currentDates={{ start: "", end: "" }}
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      const applyBtn = document.getElementById("apply-range-btn") as HTMLButtonElement;
      expect(applyBtn).toBeDisabled();
      expect(screen.getByText(/No Valid Timestamps Found/i)).toBeInTheDocument();
    });
  });

  // ─── 7. Preview Dialog Interactions ─────────────────────────────────────────
  describe("7. Preview Dialog Actions (Apply, Cancel, Overwrite Notice)", () => {
    const mockValidResult = detectDateRangeFromFiles(
      [
        {
          role: "log",
          fileName: "auth.csv",
          content: `TimeCreated,TargetUserName\n2026-10-01 10:00:00,user1\n2026-10-15 15:00:00,user2`,
        },
      ],
      "UTC"
    );

    it("calls onCancel and preserves current dates without modification", () => {
      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <DateRangePreviewDialog
          isOpen={true}
          result={mockValidResult}
          currentTimezone="UTC"
          currentDates={{ start: "2026-09-01", end: "2026-09-30" }}
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      const cancelBtn = document.getElementById("cancel-range-btn") as HTMLButtonElement;
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onApply).not.toHaveBeenCalled();
    });

    it("calls onApply with calculated date range when confirmed", () => {
      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <DateRangePreviewDialog
          isOpen={true}
          result={mockValidResult}
          currentTimezone="UTC"
          currentDates={{ start: "", end: "" }}
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      const applyBtn = document.getElementById("apply-range-btn") as HTMLButtonElement;
      expect(applyBtn).toBeEnabled();
      fireEvent.click(applyBtn);

      expect(onApply).toHaveBeenCalledWith({
        start: "2026-10-01",
        end: "2026-10-15",
      });
    });

    it("displays overwrite warning if applying will replace existing dates", () => {
      render(
        <DateRangePreviewDialog
          isOpen={true}
          result={mockValidResult}
          currentTimezone="UTC"
          currentDates={{ start: "2026-08-01", end: "2026-08-15" }}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByText(/Existing Baseline Dates Will Be Overwritten/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/2026-08-01 → 2026-08-15/)).toBeInTheDocument();
    });
  });

  // ─── 8. Dataset Fingerprinting & Storage Persistence ────────────────────────
  describe("8. Dataset Fingerprinting & Browser Storage", () => {
    const csvContent1 = `timestamp,user\n2026-10-01,user1`;
    const csvContent2 = `timestamp,user\n2026-10-02,user2`;

    it("generates stable cryptographic fingerprints across file renames", async () => {
      const fpA = await computeDatasetFingerprint([
        { role: "log", content: csvContent1 },
      ]);
      const fpB = await computeDatasetFingerprint([
        { role: "log", content: csvContent1 },
      ]);
      const fpDifferent = await computeDatasetFingerprint([
        { role: "log", content: csvContent2 },
      ]);

      expect(fpA).toBe(fpB);
      expect(fpA).not.toBe(fpDifferent);
    });

    it("changes fingerprint if file roles are different", async () => {
      const fpLog = await computeDatasetFingerprint([
        { role: "log", content: csvContent1 },
      ]);
      const fpAssets = await computeDatasetFingerprint([
        { role: "assets", content: csvContent1 },
      ]);
      expect(fpLog).not.toBe(fpAssets);
    });

    it("saves and restores confirmed baseline dates for the matching fingerprint", async () => {
      const fp = await computeDatasetFingerprint([
        { role: "log", content: csvContent1 },
      ]);

      saveConfirmedBaseline(fp, {
        trainingStart: "2026-10-01",
        trainingEnd: "2026-10-10",
        timezone: "UTC",
      });

      const retrieved = getConfirmedBaseline(fp);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.trainingStart).toBe("2026-10-01");
      expect(retrieved?.trainingEnd).toBe("2026-10-10");

      const differentFp = await computeDatasetFingerprint([
        { role: "log", content: csvContent2 },
      ]);
      expect(getConfirmedBaseline(differentFp)).toBeNull();
    });

    it("handles browser storage exceptions gracefully without crashing", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      expect(() => {
        saveConfirmedBaseline("test_fp", {
          trainingStart: "2026-10-01",
          trainingEnd: "2026-10-10",
          timezone: "UTC",
        });
      }).not.toThrow();

      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      expect(() => {
        getConfirmedBaseline("test_fp");
      }).not.toThrow();
    });
  });

  // ─── 9. Date Validation Warnings ───────────────────────────────────────────
  describe("9. Date Validation Warnings", () => {
    it("displays date order warning when start date is later than end date", () => {
      render(<UploadScreen onResult={vi.fn()} onLoadSample={vi.fn()} />);

      const startInput = document.getElementById("training-start") as HTMLInputElement;
      const endInput = document.getElementById("training-end") as HTMLInputElement;

      fireEvent.change(startInput, { target: { value: "2026-10-20" } });
      fireEvent.change(endInput, { target: { value: "2026-10-10" } });

      const warning = document.getElementById("date-order-warning");
      expect(warning).toBeInTheDocument();
      expect(warning?.textContent).toContain("cannot be later than Baseline End date");
    });

    it("prevents analysis when baseline dates are blank", async () => {
      render(<UploadScreen onResult={vi.fn()} onLoadSample={vi.fn()} />);

      // Create a dummy log CSV file
      const file = new File(
        [`TimeCreated,TargetUserName\n2026-10-01,user1`],
        "log.csv",
        { type: "text/csv" }
      );
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement;
      fireEvent.click(analyzeBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Both Baseline Start and Baseline End dates are required/i)
        ).toBeInTheDocument();
      });
    });
  });
});
