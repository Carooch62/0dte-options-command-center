// Local planning references and sensitivity scenarios; never orders or price forecasts.
const num=v=>v===null||v===undefined||String(v).trim()===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const round=v=>Math.round(v*100)/100;
const options=c=>[...(c?.options||[]),...Object.values(c?.expiry_groups||{}).flatMap(g=>g.options||[])];
export function savedExitContract(trade,candidate){
 const option=options(candidate).find(o=>o.contract_id===trade.contract&&o.expiry===trade.expiry);
 return option?{ticker:trade.ticker,contract_id:option.contract_id,expiry:option.expiry,side:option.side,strike:option.strike}:{ticker:trade.ticker,contract_id:trade.contract,expiry:trade.expiry};
}
export function exitBenchmarks({contract,candidate,snapshot,entry,enteredAt,now=Date.now()}){
 const paid=num(entry),at=Date.parse(enteredAt),scan=Date.parse(snapshot?.generated_at),gaps=[];
 const option=options(candidate).find(o=>Boolean(contract?.contract_id)&&o.contract_id===contract.contract_id&&o.expiry===contract.expiry&&o.side===contract.side&&Number(o.strike)===Number(contract.strike));
 const delta=num(option?.delta),gamma=num(option?.gamma),theta=num(option?.theta),spot=num(candidate?.price),invalid=num(candidate?.invalidation_price),t1=num(candidate?.key_levels?.target_1),t2=num(candidate?.key_levels?.target_2);
 const quote=Date.parse(option?.option_timestamp),bar=Date.parse(candidate?.bar_end),close=Date.parse(snapshot?.session_close_at),sign=contract?.side==='call'?1:contract?.side==='put'?-1:0;
 const day=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/New_York'}),expiry=contract?.expiry;
 const expiryValid=typeof expiry==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(expiry)&&Number.isFinite(Date.parse(expiry))&&new Date(expiry).toISOString().slice(0,10)===expiry;
 if(!(paid>0))gaps.push('Actual purchase premium missing');
 if(!Number.isFinite(at)||at>now)gaps.push('Actual purchase time missing or future');
 if(!expiryValid||expiry<day)gaps.push('Exact expiration missing, invalid or past');
 if(!option)gaps.push('Exact contract absent');
 if(!Number.isFinite(scan)||!Number.isFinite(at)||Math.abs(scan-at)>300000||now-scan>300000||scan>now||snapshot?.market_session!=='OPEN'||!Number.isFinite(close)||now>=close)gaps.push('No current OPEN scan aligned within five minutes of entry');
 if(!Number.isFinite(quote)||Math.abs(quote-at)>300000||now-quote>300000||quote>now||num(option?.minimum_delay_minutes)>0)gaps.push('Option quote time missing, delayed, stale or not aligned with entry');
 if(!Number.isFinite(bar)||Math.abs(bar-at)>300000||now-bar>300000||bar>now)gaps.push('Underlying price time missing, stale or not aligned with entry');
 if(delta===null||!option?.delta_verified||sign*delta<=0||Math.abs(delta)>1||gamma===null||gamma<0||theta===null||theta>0||option?.theta_available!==true)gaps.push('Usable signed delta, gamma or daily theta missing');
 if(!(spot>0)||!(invalid>0)||!(t1>0)||!(t2>0)||sign*(t1-spot)<=0||sign*(t2-t1)<0||sign*(invalid-spot)>=0)gaps.push('Directional stock targets or invalidation unavailable');
 const bid=num(option?.bid),ask=num(option?.ask),spread=bid>0&&ask>=bid?ask-bid:null;
 if(spread===null)gaps.push('Usable two-sided spread missing');
 const levels=[15,30,60].map((minutes,i)=>({minutes,adverse:spot+(invalid-spot)*(i+1)/3,favorable:i===0?spot+(t1-spot)/2:i===1?t1:t2}));
 if(Number.isFinite(at)&&levels.some(r=>at+r.minutes*60000<=now||Number.isFinite(close)&&at+r.minutes*60000>close))gaps.push('Full 15/30/60-minute scenario window has elapsed or exceeds this session');
 if(spot>0&&levels.some(r=>[r.adverse,r.favorable].some(s=>Math.abs(s-spot)/spot>.03)))gaps.push('Stock moves exceed the local 3% sensitivity boundary');
 const model=gaps.length===0;
 const rows=levels.map(({minutes,adverse,favorable},i)=>{
   const value=s=>round(Math.max(0,paid+delta*(s-spot)+.5*gamma*(s-spot)**2+theta*minutes/1440-spread));
   const a=paid>0?(model?value(adverse):round(paid*(1-[.1,.2,.3][i]))):null;
   const b=paid>0?(model?value(favorable):round(paid*(1+[.25,.5,.75][i]))):null;
   const loss=a!==null&&a<paid?a:null,profit=b!==null&&b>paid?b:null;
   return {tier:i+1,minutes,mode:model?'GREEKS_SCENARIO':'REFERENCE_ONLY',loss,profit,stock_loss:model?adverse:null,stock_profit:model?favorable:null,
     theta_cost:theta===null||theta>0||option?.theta_available!==true?null:-theta*minutes/1440,
     loss_return:loss!==null?round((loss/paid-1)*100):null,profit_return:profit!==null?round((profit/paid-1)*100):null};
 });
 return {rows,primary:rows[1].profit,mode:model?'PROVISIONAL_SCENARIOS':'REFERENCE_ONLY',gaps,
  context:{catalyst:candidate?.catalyst_level||'UNKNOWN',news_status:candidate?.news_status||'UNKNOWN',headline:candidate?.news_items?.[0]?.title||null,news_at:candidate?.news_items?.[0]?.published_at||null,news_checked_at:candidate?.news_checked_at||null,pattern:candidate?.pattern_research?.status||'UNKNOWN',relative_volume:num(candidate?.volume_ratio),momentum:candidate?.momentum_state||'UNKNOWN',trend:candidate?.trend_context?.alignment||'UNKNOWN',qualified:candidate?.setup_qualified===true,delta,gamma,theta,scan_at:snapshot?.generated_at||null,quote_at:option?.option_timestamp||null,entered_at:Number.isFinite(at)?new Date(at).toISOString():null,expiry:expiry||null,days_to_expiry:expiryValid?Math.round((Date.parse(expiry)-Date.parse(day))/86400000):null},
  limitation:'Reference tiers are uncalibrated examples (loss −10/20/30%; profit +25/50/75%). Greek scenarios assume unchanged IV and locally constant Greeks, deduct the observed full spread as a conservative friction proxy, and are not executable bids or forecasts. Greek calculation time and future liquidity are unverified; catalysts provide thesis context, not a numeric price boost. Horizons run from purchase time, apply only within the current session, and do not extrapolate through expiration. No real-time monitoring or sell notifications are active.'};
}

export function benchmarkHtml(result,escape){
 const money=v=>v===null?'Unavailable':'$'+v.toFixed(2),model=result.mode==='PROVISIONAL_SCENARIOS',c=result.context;
 return `<section class="exit-benchmarks"><h4>${model?'Provisional scenario profit review':'Purchase-price reference profit review'}: ${money(result.primary)}</h4><p class="smallnote">${model?'Tier 2 sensitivity estimate. Stock scenarios and assumptions below; this is not a predicted sale price.':'Tier 2 reference only. Current evidence does not support a context-derived sell price.'} Review a current executable bid before acting. ${c.days_to_expiry===null?'Expiration unknown.':`${c.days_to_expiry} calendar day(s) to expiry.`}</p><div class="scroll"><table><caption>Three loss and profit checkpoints · ${model?'intraday sensitivity scenarios':'purchase-price references'}</caption><thead><tr><th>${model?'Tier / from fill':'Tier'}</th><th>Loss review</th><th>Profit review</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td>${r.tier}${model?` · ${r.minutes} min`:''}</td><td>${money(r.loss)}<br><small>${r.loss_return??'—'}% vs paid</small></td><td>${money(r.profit)}<br><small>${r.profit_return??'—'}% vs paid</small></td></tr>`).join('')}</tbody></table></div><details><summary>Inputs, timing &amp; reasoning · ${escape(result.mode)}</summary><p>Purchase ${escape(c.entered_at||'time needed below')} · expiry ${escape(c.expiry||'unknown')}. Scan ${escape(c.scan_at||'unknown')} · option quote ${escape(c.quote_at||'unknown')}. These are source observations, not a live feed.</p><p>Catalyst ${escape(c.catalyst)} · news ${escape(c.news_status)} · setup qualified ${c.qualified?'yes':'unknown or no'} · momentum ${escape(c.momentum)} · trend ${escape(c.trend)} · pattern evidence ${escape(c.pattern)} · volume ratio ${c.relative_volume??'unknown'}. Reassess if the catalyst is resolved/reversed, the directional stock invalidation breaks, or setup support deteriorates; a strong catalyst does not cancel a loss checkpoint.</p>${c.headline?`<p>Latest available headline: ${escape(c.headline)}. Published ${escape(c.news_at||'unknown')}; news checked ${escape(c.news_checked_at||'unknown')}. This may postdate the purchase.</p>`:''}<p>Observed Δ ${c.delta??'unknown'} · Γ ${c.gamma??'unknown'} · daily Θ ${c.theta??'unknown'}. Holding other inputs fixed, linear theta sensitivity over 15 / 30 / 60 minutes: ${result.rows.map(r=>r.theta_cost===null?'unknown':'$'+r.theta_cost.toFixed(4)).join(' / ')} per share; this diagnostic uses observed theta, whose calculation time is unverified. Theta is not constant.</p>${model?`<p>Loss stock levels: ${result.rows.map(r=>money(r.stock_loss)).join(' / ')}. Profit stock levels: ${result.rows.map(r=>money(r.stock_profit)).join(' / ')}. Option proxy = paid premium + Δ × stock move + ½Γ × stock move² + daily Θ × minutes/1440 − observed spread.</p>`:`<p>Context pricing withheld: ${escape(result.gaps.join('; '))}.</p>`}<p>${escape(result.limitation)}</p><a href="https://www.optionseducation.org/advancedconcepts/volatility-the-greeks" target="_blank" rel="noopener">About Greek sensitivity estimates</a></details></section>`;
}
