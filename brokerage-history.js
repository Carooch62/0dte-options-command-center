export function decodeArchive(index){
 if(index?.version!==1||!Array.isArray(index.snapshots)||!Array.isArray(index.trend_contexts))throw Error('Invalid scanner archive index');
 return index.snapshots.map(s=>{if(!Array.isArray(s.candidate_state))throw Error('Invalid archived candidate state');return {...s,candidate_state:s.candidate_state.map(c=>{if(c.trend_context_ref===undefined)return c;if(!Number.isInteger(c.trend_context_ref)||c.trend_context_ref<0||c.trend_context_ref>=index.trend_contexts.length)throw Error('Missing archived trend context');const {trend_context_ref,...row}=c;return {...row,trend_context:index.trend_contexts[trend_context_ref]};})};});
}
