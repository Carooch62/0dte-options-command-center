import {watchTransitions} from './contract-watch.js';

// Pure decision layer for the scheduled Worker. No webhook or private data is read here.
export function pendingWatchEvents(watches,previous,current,deliveredKeys=[],now=Date.now()) {
  const delivered=new Set(deliveredKeys);
  return watchTransitions(watches,previous,current,now).filter(event=>!delivered.has(event.key));
}

export function nextWatchCheckpoint(previous,current,events,deliveredKeys=[]) {
  const oldTime=Date.parse(previous?.generated_at||'');
  const newTime=Date.parse(current?.generated_at||'');
  if(!Number.isFinite(newTime)||newTime<=oldTime||!current?.scan_id)return {previous,deliveredKeys};
  // Do not advance past a scan whose notification failed; it can be retried.
  if(events.length)return {previous,deliveredKeys};
  return {previous:current,deliveredKeys:deliveredKeys.slice(-100)};
}
