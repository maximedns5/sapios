// Faux client Supabase en mémoire pour les tests : il enregistre chaque opération (tables, RPC,
// stockage) afin de vérifier ce qu'une fonction a écrit, et surtout ce qu'elle n'a pas écrit.
import type { SupabaseClient } from "../deps.ts";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "neq" | "in" | "is_not" | "gte"; column: string; value: unknown };

export interface RecordedOp {
  table: string;
  action: "select" | "update" | "insert" | "delete";
  values?: Row;
  filters: Filter[];
}

export type RpcHandler = (args: Record<string, unknown>) => unknown;

function columnValue(row: Row, column: string): unknown {
  const path = column.split("->>");
  if (path.length === 1) return row[column];
  const json = row[path[0]] as Row | null | undefined;
  const v = json?.[path[1]];
  return v === null || v === undefined ? null : String(v);
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = columnValue(row, f.column);
    switch (f.op) {
      case "eq":
        return v === f.value;
      case "neq":
        return v !== f.value;
      case "in":
        return (f.value as unknown[]).includes(v);
      case "is_not":
        return v !== null && v !== undefined;
      case "gte":
        return String(v) >= String(f.value);
    }
  });
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private action: RecordedOp["action"] | null = null;
  private values?: Row;
  private filters: Filter[] = [];
  private single: "single" | "maybe" | null = null;
  private returning = false;
  private limitN: number | null = null;

  constructor(private db: FakeSupabase, private table: string) {}

  select(_columns?: string) {
    if (this.action === null) this.action = "select";
    else this.returning = true;
    return this;
  }
  update(values: Row) {
    this.action = "update";
    this.values = values;
    return this;
  }
  insert(values: Row) {
    this.action = "insert";
    this.values = values;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value });
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error(`not(${operator}) non géré`);
    this.filters.push({ op: "is_not", column, value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }

  private run(): { data: unknown; error: null } {
    const action = this.action ?? "select";
    this.db.ops.push({ table: this.table, action, values: this.values, filters: this.filters });
    const rows = (this.db.tables[this.table] ??= []);
    let result: Row[];
    if (action === "insert") {
      const row = { ...this.values };
      rows.push(row);
      result = [row];
    } else {
      result = rows.filter((r) => matches(r, this.filters));
      if (action === "update") for (const r of result) Object.assign(r, structuredClone(this.values));
      if (action === "delete") this.db.tables[this.table] = rows.filter((r) => !result.includes(r));
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);
    const copy = structuredClone(result);
    if (this.single === "maybe") return { data: copy[0] ?? null, error: null };
    if (action !== "select" && !this.returning) return { data: null, error: null };
    return { data: copy, error: null };
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  files: Record<string, Uint8Array> = {};
  ops: RecordedOp[] = [];
  rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  storageOps: { bucket: string; action: string; path: string }[] = [];
  /** Comptes d'authentification lus par `auth.admin.getUserById`. */
  users: Record<string, Row> = {};
  authCalls: string[] = [];

  constructor(private rpcHandlers: Record<string, RpcHandler> = {}) {}

  get auth() {
    return {
      admin: {
        getUserById: (id: string) => {
          this.authCalls.push(id);
          const user = this.users[id];
          return Promise.resolve(
            user
              ? { data: { user: structuredClone(user) }, error: null }
              : { data: { user: null }, error: { message: "User not found", status: 404, code: "user_not_found" } },
          );
        },
      },
    };
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(name: string, args: Record<string, unknown> = {}) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcHandlers[name];
    if (!handler) return Promise.resolve({ data: null, error: { message: `rpc inconnue ${name}`, code: "PGRST202" } });
    return Promise.resolve({ data: handler(args), error: null });
  }

  get storage() {
    return {
      from: (bucket: string) => ({
        download: (path: string) => {
          this.storageOps.push({ bucket, action: "download", path });
          const bytes = this.files[`${bucket}/${path}`];
          return Promise.resolve(
            bytes
              ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null }
              : { data: null, error: { message: "Object not found", statusCode: "404" } },
          );
        },
      }),
    };
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  /** Toutes les écritures (insert/update/delete) enregistrées. */
  writes(): RecordedOp[] {
    return this.ops.filter((o) => o.action !== "select");
  }
}
