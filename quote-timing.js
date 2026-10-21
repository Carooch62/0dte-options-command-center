// Request durations measure transport work, never exchange-to-screen latency.
export function quoteRequestTiming(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const durations=Object.fromEntries(['setup_ms','quote_ms','worker_ms','browser_ms']
  .filter(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=600000)
  .map(k=>[k,Math.round(value[k])]));
 if(typeof value.setup_reused==='boolean')durations.setup_reused=value.setup_reused;
 if(['session','stateless'].includes(value.setup_mode))durations.setup_mode=value.setup_mode;
 if(['hit','miss','expired'].includes(value.setup_cache_status))durations.setup_cache_status=value.setup_cache_status;
 return durations;
}
