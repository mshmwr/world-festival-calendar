// 精簡的 JSON Schema 驗證器，只支援 data/schema/ 用到的關鍵字，讓專案不需要外部套件。
import { readFileSync } from "node:fs";

const schemaDir = new URL("../data/schema/", import.meta.url);
const cache = {};
const load = file => (cache[file] ??= JSON.parse(readFileSync(new URL(file, schemaDir), "utf8")));
const typeOf = v => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
const SUPPORTED = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "type", "properties", "required", "additionalProperties",
  "propertyNames", "pattern", "enum", "const", "minLength", "minItems", "maxItems", "uniqueItems", "items", "prefixItems", "oneOf", "anyOf", "minProperties"]);

function resolve(ref, file) {
  const [f, ptr = ""] = ref.split("#");
  const target = f || file;
  let node = load(target);
  for (const key of ptr.split("/").filter(Boolean)) node = node[key];
  return { node, file: target };
}

function check(schema, value, path, file, errors) {
  for (const k of Object.keys(schema)) if (!SUPPORTED.has(k)) throw new Error(`schema 使用了未支援的關鍵字 ${k}`);
  const err = msg => errors.push(`${path || "（根）"}：${msg}`);
  if (schema.$ref) { const r = resolve(schema.$ref, file); check(r.node, value, path, r.file, errors); }
  const t = typeOf(value);
  if (schema.type && schema.type !== t && !(schema.type === "number" && t === "number")) return err(`應為 ${schema.type}，實際是 ${t}`);
  if ("const" in schema && value !== schema.const) err(`只能是 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) err(`只能是 ${schema.enum.join("、")} 其中之一，實際是 ${JSON.stringify(value)}`);
  if (t === "string") {
    if (schema.minLength != null && value.length < schema.minLength) err("不可為空字串");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err(`格式不符：${JSON.stringify(value)}`);
  }
  if (t === "array") {
    if (schema.minItems != null && value.length < schema.minItems) err(`至少要 ${schema.minItems} 項`);
    if (schema.maxItems != null && value.length > schema.maxItems) err(`最多 ${schema.maxItems} 項`);
    if (schema.uniqueItems) { const seen = new Set(); for (const v of value) { const k = JSON.stringify(v); if (seen.has(k)) err(`重複：${k}`); seen.add(k); } }
    const pre = schema.prefixItems || [];
    value.forEach((v, i) => {
      if (pre[i]) check(pre[i], v, `${path}[${i}]`, file, errors);
      else if (schema.items) check(schema.items, v, `${path}[${i}]`, file, errors);
    });
  }
  if (t === "object") {
    for (const k of schema.required || []) if (!(k in value)) err(`缺少欄位 ${k}`);
    if (schema.minProperties != null && Object.keys(value).length < schema.minProperties) err(`至少要 ${schema.minProperties} 個欄位`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.propertyNames) check({ type: "string", ...schema.propertyNames }, k, `${path}（欄位名 ${k}）`, file, errors);
      if (schema.properties && k in schema.properties) check(schema.properties[k], v, `${path}.${k}`, file, errors);
      else if (schema.additionalProperties === false) err(`不認得的欄位 ${k}`);
      else if (typeof schema.additionalProperties === "object") check(schema.additionalProperties, v, `${path}.${k}`, file, errors);
    }
  }
  for (const [kw, need] of [["oneOf", 1], ["anyOf", 0]]) {
    if (!schema[kw]) continue;
    const ok = schema[kw].filter(s => { const e = []; check(s, value, path, file, e); return !e.length; }).length;
    if (kw === "oneOf" ? ok !== 1 : ok < 1) {
      const req = schema[kw].map(s => (s.required || []).join("+")).filter(Boolean);
      err(kw === "oneOf" ? `${req.join(" 和 ")} 必須剛好填一個` : `${req.join(" 或 ")} 至少要填一個`);
    }
  }
}

export function validate(schemaFile, data) {
  const errors = [];
  check(load(schemaFile), data, "", schemaFile, errors);
  return errors;
}
