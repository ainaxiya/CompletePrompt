// 直接用 PG 官方二进制初始化并启动数据库（绕开中文工作目录导致的编码问题）
// 幂等：已启动则直接退出。用法: node scripts/db-manual.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// PG 二进制必须位于纯 ASCII 路径：postgres 后端会从 exe 路径推导 share/ 目录
// （含 postgres.bki / SQL 模板），中文路径会产生 UTF8 非法字节
const BIN = "C:/Users/ainax/AppData/Local/pgbin-prompthub/bin";
const DATA = "C:/Users/ainax/AppData/Local/prompthub-pgdata";
const PORT = 5432;
// 所有子进程都在 ASCII cwd 下运行，避免 GBK 路径污染
const SAFE_CWD = "C:/Users/ainax/AppData/Local";

// 最小化环境变量：过滤掉含中文/非 ASCII 的变量（postgres 后端会读取环境，
// 终端注入的 GBK 路径变量会导致 UTF8 编码 FATAL）
const SAFE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k, v]) =>
      /^(SystemRoot|SystemDrive|ComSpec|TEMP|TMP|PATH|ProgramFiles|ProgramFiles\(x86\)|ProgramData|USERPROFILE|USERNAME|COMPUTERNAME|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|OS|PROCESSOR_ARCHITECTURE|WINDIR|PGCLIENTENCODING)$/i.test(k) &&
      /^[\x00-\x7F]*$/.test(v)
  )
);
SAFE_ENV.PGCLIENTENCODING = "UTF8";

const run = (exe, args, opts = {}) => {
  const r = spawnSync(path.join(BIN, exe), args, {
    cwd: SAFE_CWD,
    encoding: "utf-8",
    env: SAFE_ENV,
    ...opts,
  });
  if (r.stdout?.trim()) console.log(`[${exe}]`, r.stdout.trim().split("\n")[0]);
  if (r.stderr?.trim()) console.error(`[${exe}:err]`, r.stderr.trim().split("\n")[0]);
  return r;
};

const ready = () => {
  const r = run("pg_isready.exe", ["-h", "127.0.0.1", "-p", String(PORT)], { stdio: "pipe" });
  return r.stdout?.includes("accepting connections");
};

if (ready()) {
  console.log("[pg] already running");
} else {
  if (!fs.existsSync(path.join(DATA, "PG_VERSION"))) {
    fs.rmSync(DATA, { recursive: true, force: true });
    const r = run("initdb.exe", [
      "-D", DATA, "-U", "postgres", "--auth=trust",
      "--locale=C", "--encoding=UTF8", "--no-instructions",
    ]);
    if (r.status !== 0) {
      console.error("[pg] initdb failed");
      process.exit(1);
    }
    console.log("[pg] initdb ok");
  }
  const r = run("pg_ctl.exe", [
    "-D", DATA, "-l", path.join(DATA, "server.log"),
    "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`,
    "start",
  ]);
  if (r.status !== 0) {
    console.error("[pg] pg_ctl start failed");
    process.exit(1);
  }
  for (let i = 0; i < 30 && !ready(); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  console.log("[pg] started on 127.0.0.1:" + PORT);
}

// 建库（幂等）
const psql = run("psql.exe", [
  "-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "-d", "postgres",
  "-tAc", "SELECT 1 FROM pg_database WHERE datname='prompthub'",
], { stdio: "pipe" });
if (!psql.stdout?.includes("1")) {
  run("psql.exe", [
    "-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "-d", "postgres",
    "-c", "CREATE DATABASE prompthub ENCODING 'UTF8' TEMPLATE template0",
  ]);
  console.log("[pg] database prompthub created");
} else {
  console.log("[pg] database prompthub exists");
}
console.log("[PG READY]");
