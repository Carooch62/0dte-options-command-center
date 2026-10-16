// Request durations measure transport work, never exchange-to-screen latency.
export function quoteRequestTiming(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(['setup_ms','quote_ms','worker_ms','browser_ms']
  .filter(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=600000)
  .map(k=>[k,Math.round(value[k])]));
}
