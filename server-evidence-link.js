// Same-origin private export only. Dates refer to UTC receipt-day buckets.
export function evidenceExportLink(day){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Valid UTC date required');
 const stamp=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==day)throw Error('Valid UTC date required');
 return {href:'/private/plaid/robinhood/evidence?day='+encodeURIComponent(day),label:'Export server quote evidence · '+day+' UTC'};
}
