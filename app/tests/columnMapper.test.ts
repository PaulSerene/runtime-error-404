import { describe, it, expect, vi } from "vitest";
import {
  normalizeHeader,
  resolveColumnMap,
  buildColumnMap,
} from "@/engine/ingest/columnMapper";

describe("columnMapper — normalizeHeader", () => {
  it("lowercases and strips spaces, underscores, hyphens, and dots", () => {
    expect(normalizeHeader("Target_User_Name")).toBe("targetusername");
    expect(normalizeHeader("Subject.User.Name")).toBe("subjectusername");
    expect(normalizeHeader("Account-Name")).toBe("accountname");
    expect(normalizeHeader("  IP  Address  ")).toBe("ipaddress");
    expect(normalizeHeader("Workstation.Name")).toBe("workstationname");
    expect(normalizeHeader("Time.Created")).toBe("timecreated");
    expect(normalizeHeader("System-Time")).toBe("systemtime");
    expect(normalizeHeader("Event.ID")).toBe("eventid");
    expect(normalizeHeader("Key_Words")).toBe("keywords");
    expect(normalizeHeader("Computer-Name")).toBe("computername");
  });

  it("handles empty or falsy strings gracefully", () => {
    expect(normalizeHeader("")).toBe("");
  });
});

describe("columnMapper — Windows export aliases", () => {
  it("maps all requested Windows export aliases correctly", () => {
    const headers = [
      "TimeCreated",
      "TargetUserName",
      "IpAddress",
      "WorkstationName",
      "EventId",
      "Keywords",
      "LogonType",
    ];

    const result = resolveColumnMap(headers);
    expect(result.fieldToColumn.get("timestamp")).toBe("TimeCreated");
    expect(result.fieldToColumn.get("username")).toBe("TargetUserName");
    expect(result.fieldToColumn.get("sourceIp")).toBe("IpAddress");
    expect(result.fieldToColumn.get("host")).toBe("WorkstationName");
    expect(result.fieldToColumn.get("eventType")).toBe("EventId");
    expect(result.fieldToColumn.get("result")).toBe("Keywords");
    expect(result.fieldToColumn.get("logonType")).toBe("LogonType");
  });

  it("recognizes alternative Windows aliases", () => {
    const headers = [
      "SystemTime",
      "SubjectUserName",
      "Computer",
      "AccountName",
    ];

    const result = resolveColumnMap(headers);
    expect(result.fieldToColumn.get("timestamp")).toBe("SystemTime");
    expect(result.fieldToColumn.get("host")).toBe("Computer");
    // Both SubjectUserName and AccountName map to username; AccountName has higher priority than SubjectUserName
    expect(result.fieldToColumn.get("username")).toBe("AccountName");
  });
});

describe("columnMapper — conflict resolution and logging", () => {
  it("picks TargetUserName over SubjectUserName and logs the decision", () => {
    const logger = vi.fn();
    const headers = ["SubjectUserName", "TargetUserName", "TimeCreated"];

    const result = resolveColumnMap(headers, { logger });

    expect(result.fieldToColumn.get("username")).toBe("TargetUserName");
    expect(result.columnMap.get("TargetUserName")).toBe("username");
    expect(result.columnMap.has("SubjectUserName")).toBe(false);

    expect(result.logs.length).toBe(1);
    expect(result.logs[0]).toContain('Multiple columns matched field "username"');
    expect(result.logs[0]).toContain("TargetUserName");
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it("picks TimeCreated over SystemTime and logs the decision", () => {
    const logger = vi.fn();
    const headers = ["SystemTime", "TimeCreated"];

    const result = resolveColumnMap(headers, { logger });

    expect(result.fieldToColumn.get("timestamp")).toBe("TimeCreated");
    expect(result.columnMap.get("TimeCreated")).toBe("timestamp");
    expect(result.columnMap.has("SystemTime")).toBe(false);

    expect(result.logs.length).toBe(1);
    expect(result.logs[0]).toContain('Multiple columns matched field "timestamp"');
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it("respects silent option to prevent console warnings", () => {
    const logger = vi.fn();
    const headers = ["SystemTime", "TimeCreated"];

    const result = resolveColumnMap(headers, { logger, silent: true });

    expect(result.logs.length).toBe(1);
    expect(logger).not.toHaveBeenCalled();
  });

  it("buildColumnMap returns Map<string, string> compatible with ingestion", () => {
    const headers = ["TargetUserName", "IpAddress", "TimeCreated"];
    const map = buildColumnMap(headers, { silent: true });

    expect(map.get("TargetUserName")).toBe("username");
    expect(map.get("IpAddress")).toBe("sourceIp");
    expect(map.get("TimeCreated")).toBe("timestamp");
  });
});
