import { spawn } from "node:child_process";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checkBinary(
  bin: string,
  args: string[],
): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () =>
      resolve({ name: bin, ok: false, detail: "not found" }),
    );
    child.on("close", (code: number | null) => {
      if (code === 0) resolve({ name: bin, ok: true, detail: out.trim() });
      else resolve({ name: bin, ok: false, detail: `exit code ${code}` });
    });
  });
}

export async function checkCurlCffi(): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const child = spawn(
      "python3",
      ["-c", "import curl_cffi; print(curl_cffi.__version__)"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () =>
      resolve({
        name: "curl_cffi",
        ok: false,
        detail: "python3 not found",
      }),
    );
    child.on("close", (code: number | null) => {
      if (code === 0)
        resolve({
          name: "curl_cffi",
          ok: true,
          detail: `v${out.trim()}`,
        });
      else
        resolve({
          name: "curl_cffi",
          ok: false,
          detail: "not installed (pip install curl_cffi)",
        });
    });
  });
}
