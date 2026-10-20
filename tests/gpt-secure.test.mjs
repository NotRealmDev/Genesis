import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("../genesis-gpt.js",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/genesis-gpt/index.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../GPT_DEFAULTS.sql",import.meta.url),"utf8");
const config=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8");

test("browser does not load or publish shared OpenAI keys",()=>{
  assert.doesNotMatch(code,/api_key|gpt-shared-key|genesis_gpt_config/);
  assert.match(code,/functions\/v1\/["']?\+FUNCTION_NAME/);
  assert.match(code,/getSessionToken\(\{interactive:false\}\)/);
});
test("Edge Function verifies identity and loads secret server-side",()=>{
  assert.match(edge,/Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge,/auth\.getUser\(jwt\)/);
  assert.match(edge,/user\.email\?\.toLowerCase\(\)!==adminEmail/);
  assert.match(edge,/genesis_gpt_consume_quota/);
  assert.match(edge,/max_output_tokens:1200/);
  assert.match(config,/verify_jwt = false/);
});
test("SQL revokes public access to old shared-key column and quota",()=>{
  assert.match(sql,/drop column if exists api_key/);
  assert.match(sql,/revoke all on public\.genesis_gpt_config from anon, authenticated/);
  assert.match(sql,/revoke all on function public\.genesis_gpt_consume_quota\(uuid\) from public, anon, authenticated/);
});
