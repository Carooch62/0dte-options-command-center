// Public staging research reader. Fixed paths only; no private data or scan dispatch.
const base='https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/staging-algorithm/data/';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
export async function handleShadowResearch(request,fetcher=fetch){
 const match=/^\/data\/staging-shadow-(evidence-latest|review-queue|outcomes)\.json$/.exec(new URL(request.url).pathname);
 if(!match)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response(JSON.stringify({error:'Read-only staging research endpoint'}),{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 const options={cf:{cacheTtl:0},signal:AbortSignal.timeout(15000)};
 const marker=await fetcher(base+'staging-environment.json?v='+Date.now(),options);
 if(!marker.ok||(await marker.json()).environment!=='staging')return new Response(JSON.stringify({error:'Staging research has not initialized'}),{status:503,headers});
 const r=await fetcher(base+'shadow-'+match[1]+'.json?v='+Date.now(),options);
 return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers});
}
