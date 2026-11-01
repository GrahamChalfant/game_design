// Node simulation of the temperature rules. Run: node sim/temperature-sim.mjs
import { Survival, GAME_MINUTES_PER_SECOND, stepTemperature, FREEZING } from '../src/survival.js';
const SEC_PER_HOUR = 60 / GAME_MINUTES_PER_SECOND;
const dt = 0.1; let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const run = (s, env, secs) => { for (let t = 0; t < secs; t += dt) s.update(dt, env); };
const setHour = (s, h) => { s.minutesSurvived = ((h - 8 + 24) % 24) * 60; };

// 1) lake: full temp -> freezing within ~75 s, then HP drains
let s = new Survival(); setHour(s, 10); s.temperature = 100; s.health = 100;
let t = 0; while (s.temperature > FREEZING) { s.update(dt, { wet: true }); t += dt; }
ok(t <= 75, `1 lake 100->freezing in ${t.toFixed(1)} real s`);
const hp = s.health; run(s, { wet: true }, 10); ok(s.health < hp && s.isWet && s.isFreezing, `1 HP drains in water (${hp.toFixed(1)} -> ${s.health.toFixed(1)})`);

// 2) warming rates, caps, wet
const rise = (env, wet = 0) => stepTemperature({ temperature: 30, wetHours: wet }, { night: false, ...env }, 1).temperature - 30;
const out = rise({}), shel = rise({ shelter: true }), fire = rise({ fire: true });
ok(out < shel && shel < fire, `2 per-hour warming outdoors ${out}, shelter ${shel}, fire ${fire}`);
const capAfter = (env) => { let st = { temperature: 30, wetHours: 0 }; for (let i = 0; i < 100; i++) st = stepTemperature(st, { night: false, ...env }, 0.1); return st.temperature; };
ok(capAfter({}) === 60 && capAfter({ shelter: true }) === 85 && capAfter({ fire: true }) === 100, `2 caps day ${capAfter({})}, shelter ${capAfter({ shelter: true })}, fire ${capAfter({ fire: true })}`);
ok(rise({ fire: true }, 1) === 5 && rise({ shelter: true }, 1) === 5, '2 while Wet, fire/shelter warm only +5/h');
s = new Survival(); setHour(s, 10); run(s, { wet: true }, 1); run(s, {}, SEC_PER_HOUR * 0.99); ok(s.isWet, '2 Wet still on just under 1 h after leaving water');
run(s, {}, SEC_PER_HOUR * 0.02); ok(!s.isWet, '2 Wet clears after 1 game hour');

// 3) regen only after 1 h at >=90 with hunger & thirst >=25
s = new Survival(); setHour(s, 10); s.temperature = 95; s.health = 50; s.hunger = 30; s.thirst = 30;
run(s, { fire: true }, SEC_PER_HOUR * 0.95); ok(s.health === 50, '3 no regen before 1 h at >=90');
run(s, { fire: true }, SEC_PER_HOUR * 0.5); ok(s.health > 50, `3 regen after 1 h at >=90 (${s.health.toFixed(2)})`);
s = new Survival(); setHour(s, 10); s.temperature = 95; s.health = 50; s.hunger = 22; s.thirst = 80;
run(s, { fire: true }, SEC_PER_HOUR * 2); ok(s.health === 50, '3 no regen when hunger < 25');
s = new Survival(); setHour(s, 10); s.temperature = 85; s.health = 50;
run(s, { shelter: true }, SEC_PER_HOUR * 3); ok(s.health === 50, '3 no regen at 85 (shelter)');

// 4) full night outdoors from full temp
s = new Survival(); setHour(s, 20); s.temperature = 100; s.health = 100;
while (s.hourOfDay >= 20 || s.hourOfDay < 5) s.update(dt, {});
ok(s.isFreezing && s.health < 100, `4 night 20:00->05:00 ends at temp ${s.temperature.toFixed(1)}, HP ${s.health.toFixed(1)}`);

// 5) HUD flags
ok(typeof s.isWet === 'boolean' && s.isFreezing === true, '5 isWet / isFreezing flags drive HUD indicators');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
