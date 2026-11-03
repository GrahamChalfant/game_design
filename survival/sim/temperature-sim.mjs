// Node simulation of the temperature rules. Run: node sim/temperature-sim.mjs
import { Survival, GAME_MINUTES_PER_SECOND, stepTemperature, FREEZING } from '../src/survival.js';
const SEC_PER_HOUR = 60 / GAME_MINUTES_PER_SECOND;
const dt = 0.1; let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
// (Wearing the jacket unless a test says otherwise: you start in just a shirt.)
const J = { outfit: 'jacket' };
const run = (s, env, secs) => { for (let t = 0; t < secs; t += dt) s.update(dt, { ...J, ...env }); };
const setHour = (s, h) => { s.minutesSurvived = ((h - 8 + 24) % 24) * 60; };

// 1) lake: full temp -> freezing within ~75 s, then HP drains
let s = new Survival(); setHour(s, 10); s.temperature = 100; s.health = 100;
let t = 0; while (s.temperature > FREEZING) { s.update(dt, { ...J, wet: true }); t += dt; }
ok(t >= 70 && t <= 80, `1 lake 100->freezing in ${t.toFixed(1)} real s`);
const hp = s.health; run(s, { wet: true }, 10); ok(s.health < hp && s.isWet && s.isFreezing, `1 HP drains in water (${hp.toFixed(1)} -> ${s.health.toFixed(1)})`);

// 2) warming rates, caps, wet
const rise = (env, wet = 0) => stepTemperature({ temperature: 30, wetHours: wet }, { night: false, ...J, ...env }, 1).temperature - 30;
const out = rise({}), shel = rise({ shelter: true }), fire = rise({ fire: true });
ok(out < shel && shel < fire, `2 per-hour warming outdoors ${out}, shelter ${shel}, fire ${fire}`);
const capAfter = (env) => { let st = { temperature: 30, wetHours: 0 }; for (let i = 0; i < 100; i++) st = stepTemperature(st, { night: false, ...J, ...env }, 0.1); return st.temperature; };
ok(capAfter({}) === 60 && capAfter({ shelter: true }) === 85 && capAfter({ fire: true }) === 100, `2 caps day ${capAfter({})}, shelter ${capAfter({ shelter: true })}, fire ${capAfter({ fire: true })}`);
ok(rise({ fire: true }, 1) === 5 && rise({ shelter: true }, 1) === 5, '2 while Wet, fire/shelter warm only +5/h');
s = new Survival(); setHour(s, 10); run(s, { wet: true }, 1); run(s, {}, SEC_PER_HOUR * 0.99); ok(s.isWet, '2 Wet still on just under 1 h after leaving water');
run(s, {}, SEC_PER_HOUR * 0.02); ok(!s.isWet, '2 Wet clears after 1 game hour');

// 3) regen only after 1 h at >=80 with hunger & thirst >=25
s = new Survival(); setHour(s, 10); s.temperature = 95; s.health = 50; s.hunger = 30; s.thirst = 30;
run(s, { fire: true }, SEC_PER_HOUR * 0.95); ok(s.health === 50, '3 no regen before 1 h at >=80');
run(s, { fire: true }, SEC_PER_HOUR * 0.5); ok(s.health > 50, `3 regen after 1 h at >=80 (${s.health.toFixed(2)})`);
s = new Survival(); setHour(s, 10); s.temperature = 95; s.health = 50; s.hunger = 22; s.thirst = 80;
run(s, { fire: true }, SEC_PER_HOUR * 2); ok(s.health === 50, '3 no regen when hunger < 25');
s = new Survival(); setHour(s, 10); s.temperature = 85; s.health = 50;
run(s, { shelter: true }, SEC_PER_HOUR * 3); ok(s.health > 50, `3 a shelter (85) heals too (${s.health.toFixed(2)})`);
s = new Survival(); setHour(s, 10); s.temperature = 60; s.health = 50;
run(s, {}, SEC_PER_HOUR * 3); ok(s.health === 50, '3 no regen outdoors by day (60)');

// 4) full night outdoors from full temp
s = new Survival(); setHour(s, 20); s.temperature = 100; s.health = 100;
while (s.hourOfDay >= 20 || s.hourOfDay < 5) s.update(dt, J);
ok(s.isFreezing && s.health < 100, `4 night 20:00->05:00 ends at temp ${s.temperature.toFixed(1)}, HP ${s.health.toFixed(1)}`);

// 5) HUD flags
ok(typeof s.isWet === 'boolean' && s.isFreezing === true, '5 isWet / isFreezing flags drive HUD indicators');
// 6) mountain cold (#87): freezing by day up high, unless there's a fire or a shelter
s = new Survival(); setHour(s, 10); s.temperature = 60;
t = 0; while (s.temperature > FREEZING && t < 600) { s.update(dt, { ...J, cold: 1 }); t += dt; }
ok(t > 30 && t < 60, `6 daytime at the coldest: 60 -> freezing in ${t.toFixed(1)} real s`);
ok(capAfter({ cold: 1, fire: true }) === 100 && capAfter({ cold: 1, shelter: true }) === 85, '6 a fire or shelter still warms you up the mountains');
ok(capAfter({ cold: 0 }) === 60, '6 no change in the lowlands');
ok(rise({ cold: 0.5 }) < 0, `6 halfway up, you cool by day (${rise({ cold: 0.5 })} per hour)`);
// 7) the hide parka (#88) keeps most of the mountain cold and half the night's chill out
ok(rise({ cold: 1, outfit: 'parka' }) >= 0, `7 in a parka, daytime at the coldest no longer chills you (${rise({ cold: 1, outfit: 'parka' })} per hour)`);
const night = (outfit) => stepTemperature({ temperature: 60, wetHours: 0 }, { night: true, outfit }, 1).temperature - 60;
ok(night('parka') === night('jacket') / 2, `7 a night outdoors chills half as fast (${night('parka')} vs ${night('jacket')} per hour)`);

// 8) you start in just a shirt (cold), and the jacket from the luggage warms you up
s = new Survival(); setHour(s, 9);
ok(s.temperature === 40, `8 you come to cold (${s.temperature})`);
const shirtCap = (() => { let st = { temperature: 60, wetHours: 0 }; for (let i = 0; i < 100; i++) st = stepTemperature(st, { night: false }, 0.1); return st.temperature; })();
ok(shirtCap === 40, `8 in a shirt a day outdoors only gets you to ${shirtCap}`);
ok(capAfter({}) === 60, '8 in the jacket it gets you to 60');
const shirtNight = stepTemperature({ temperature: 60, wetHours: 0 }, { night: true }, 1).temperature - 60;
ok(shirtNight < night('jacket'), `8 a night in a shirt chills faster (${shirtNight} vs ${night('jacket')} per hour)`);
s = new Survival(); setHour(s, 9); run(s, { outfit: null }, SEC_PER_HOUR * 3);
ok(!s.isFreezing, `8 a shirt alone by day isn't deadly (${s.temperature.toFixed(1)} after 3 h)`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
