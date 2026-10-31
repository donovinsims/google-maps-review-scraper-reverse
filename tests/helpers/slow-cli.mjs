// Offline subprocess fixture: exercise the real CLI, runner, storage and signal handling.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { buildProgram } from '../../src/cli/program.js';
import { collectForPlaces } from '../../src/cli/runner.js';
import { createStore } from '../../src/core/store.js';
const collector=async(items,config)=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  const exited=once(child,'exit');
  config.signal.addEventListener('abort',()=>child.kill('SIGTERM'),{once:true});
  console.log(`READY ${child.pid}`);
  await exited;
  return [];
};
await buildProgram({collectForPlaces:config=>collectForPlaces(config,{
  createStore(p){const store=createStore(p),close=store.close;store.close=()=>{close();console.log('STORE_CLOSED');};return store;},
  launchBatchCollector:collector,
})}).parseAsync(process.argv);
