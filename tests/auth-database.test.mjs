import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.GENESIS_PGLITE_MODULE||'@electric-sql/pglite');
const admin='10000000-0000-4000-8000-000000000001';
const member='10000000-0000-4000-8000-000000000002';
const victim='10000000-0000-4000-8000-000000000003';
const sid='20000000-0000-4000-8000-000000000001';
test('database rejects anonymous writes, suspends only the verified attacker, persists alerts, and preserves IDs across browser resets',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',updated_at timestamptz,raw_app_meta_data jsonb default '{}',banned_until timestamptz);
      create table auth.sessions(id uuid,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
      grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
      create table public.genesis_devices(id bigint generated always as identity primary key,device_token uuid unique not null,display_id smallint unique not null,active boolean not null default true,last_seen timestamptz default now());
      create table public.genesis_admin_actions(id bigint generated always as identity primary key,display_id smallint,action text);
      create table public.genesis_announcements(id bigint generated always as identity primary key,message text,duration_ms integer);
    `);
    await db.exec(readFileSync(new URL('../GENESIS_AUTH_SECURITY.sql',import.meta.url),'utf8'));
    await db.query('insert into auth.users(id,raw_app_meta_data) values($1,$4::jsonb),($2,\'{}\'),($3,\'{}\')',[admin,member,victim,JSON.stringify({role:'admin'})]);
    for(const user of [admin,member,victim])await db.query('insert into auth.sessions values($1,$2)',[sid,user]);
    await db.query('insert into genesis_private.account_access(user_id,approved) values($1,true),($2,true)',[member,victim]);
    const asUser=async(user,query,session=sid)=>{
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[user,session]);
      await db.exec('set role authenticated');
      try{return (await db.query(query)).rows}finally{await db.exec('reset role')}
    };
    const first=(await asUser(member,'select * from public.genesis_session_access()'))[0];
    assert.equal(first.active,true);
    const reset=(await asUser(member,"select * from public.genesis_register_device('90000000-0000-4000-8000-000000000001')"))[0];
    assert.equal(reset.display_id,first.display_id);
    const v=(await asUser(victim,'select * from public.genesis_session_access()'))[0];
    await db.exec('set role anon');
    await assert.rejects(db.query(`select public.genesis_set_device_status(${v.display_id}::smallint,false)`),/permission denied/);
    await db.exec('reset role');
    const denied=await asUser(member,`select public.genesis_set_device_status(${v.display_id}::smallint,false) as allowed`);
    assert.equal(denied[0].allowed,false);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()'))[0].active,false);
    assert.equal((await asUser(victim,'select * from public.genesis_session_access()'))[0].active,true);
    assert.equal((await asUser(victim,'select * from public.genesis_security_incidents')).length,0);
    const alerts=await asUser(admin,'select * from public.genesis_security_incidents');
    assert.equal(alerts.length,1);assert.equal(alerts[0].user_id,member);
    assert.equal(alerts[0].reason,'unauthorized_admin_request');
    assert.equal((await asUser(admin,`select public.genesis_set_device_status(${first.display_id}::smallint,true) as allowed`))[0].allowed,true);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()'))[0].active,true);
    await db.query('delete from auth.sessions where user_id=$1',[member]);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()')).length,0);
    await db.exec(readFileSync(new URL('../GENESIS_SINGLE_LOGIN.sql',import.meta.url),'utf8'));
    await db.query('insert into auth.sessions values($1,$2)',[sid,member]);
    const stable=(await asUser(member,'select * from public.genesis_session_access()'))[0];
    assert.equal(stable.display_id,first.display_id);
    assert.equal((await asUser(member,"select public.genesis_set_username('Renamed LK') as name"))[0].name,'Renamed LK');
    assert.equal((await asUser(member,'select * from public.genesis_session_access()'))[0].display_id,stable.display_id);
    assert.equal((await asUser(victim,'select * from public.genesis_session_access()'))[0].active,true);
    await assert.rejects(asUser(victim,"select public.genesis_set_username('renamed lk')"),/duplicate key/);
    const second='20000000-0000-4000-8000-000000000002';
    // Background throttling must not let the first session's claim expire.
    await db.query("update genesis_private.login_presence set seen_at=now()-interval '1 day' where user_id=$1",[member]);
    await db.query('insert into auth.sessions values($1,$2)',[second,member]);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()',second))[0].role,'conflict');
    assert.equal((await db.query('select count(*)::int as count from auth.sessions where user_id=$1',[member])).rows[0].count,0);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()')).length,0);
    assert.equal((await asUser(victim,'select * from public.genesis_session_access()'))[0].active,true);
    await db.query('insert into auth.sessions values($1,$2)',[second,member]);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()',second))[0].display_id,stable.display_id);
    assert.equal((await asUser(member,'select public.genesis_release_login() as released',second))[0].released,true);
    await db.query('insert into auth.sessions values($1,$2)',[sid,member]);
    assert.equal((await asUser(member,'select * from public.genesis_session_access()',sid))[0].active,true);
  }finally{await db.close()}
});
