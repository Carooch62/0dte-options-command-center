// Each file contains one complete view from one scan; never combine scan versions.
const windows=new Set(['today','week','two_weeks','month']);
export async function loadDashboardSnapshot(base,window,read){
 if(!windows.has(window))throw Error('Unknown expiration window');
 const full=async()=>{
  const legacy=await read(`${base}market-dashboard.json?v=${Date.now()}`);
  if(!legacy.ok)throw Error(`HTTP ${legacy.status}`);
  const snapshot=await legacy.json();
  if(!Array.isArray(snapshot?.candidates)||!Number.isFinite(Date.parse(snapshot.generated_at)))throw Error('Invalid research snapshot');
  return snapshot;
 };
 if(window!=='today')return full();
 const response=await read(`${base}market-dashboard-today.json?v=${Date.now()}`);
 if(response.status===404)return full();
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 const snapshot=await response.json();
 if(snapshot?.delivery_window!==window||!snapshot.scan_id||!Array.isArray(snapshot.candidates)||!Number.isFinite(Date.parse(snapshot.generated_at)))throw Error('Invalid expiration snapshot');
 return snapshot;
}
