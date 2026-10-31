import { spawnSync } from 'node:child_process';
if(process.env.LIVE!=='1'){console.error('Live tests are opt-in. Use LIVE=1 LIVE_PLACE_URL="<Google Maps place URL>" npm run test:live');process.exitCode=64;}
else if(!process.env.LIVE_PLACE_URL){console.error('Set LIVE_PLACE_URL to the public place to validate (at least 30 reviews).');process.exitCode=64;}
else {const result=spawnSync(process.execPath,['--test','tests/live/smoke.test.js'],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;}
