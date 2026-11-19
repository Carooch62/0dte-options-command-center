import {exitBenchmarks,benchmarkHtml,savedExitContract} from './exit-benchmarks.js?v=20261118-benchmarks';
// Browser-local journal helper. Scanner observations are never brokerage fills.
export function purchasePremium(value) {
  const text=String(value??'').trim().replace(/^\$/, '');
  if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)||!Number.isFinite(Number(text))||Number(text)<=0)throw Error('Enter a positive premium per share, such as 0.20—not the total contract cost.');
  return Number(text);
}
export function purchaseRecordAction(candidate, option) {
  const exact = option && option.contract_id && option.expiry && ['call','put'].includes(option.side) && Number(option.strike) > 0;
  return exact ? {
    label: 'I bought this contract · record fill',
    contract: {ticker:candidate.ticker,contract_id:option.contract_id,expiry:option.expiry,side:option.side,strike:Number(option.strike)}
  } : {label:'Record an option purchase',contract:{ticker:candidate.ticker}};
}

export function exitPlanDraft(contract, candidate, snapshot, entry, quantity=1, lossPct=30, profitPct=50) {
  const options=[...(candidate?.options||[]),...Object.values(candidate?.expiry_groups||{}).flatMap(g=>g.options||[])];
  const option=options.find(o=>o.contract_id===contract?.contract_id&&o.expiry===contract?.expiry&&o.side===contract?.side&&Number(o.strike)===Number(contract?.strike));
  const actual=entry!==null&&entry!==''&&Number.isFinite(Number(entry))&&Number(entry)>0;
  const observed=Number(option?.ask),basis=actual?Number(entry):Number.isFinite(observed)&&observed>0?observed:null;
  const q=Number.isInteger(Number(quantity))&&Number(quantity)>0?Number(quantity):null;
  const valid=basis!==null&&Number.isFinite(lossPct)&&lossPct>0&&lossPct<100&&Number.isFinite(profitPct)&&profitPct>0;
  const round=n=>Math.round(n*100)/100;
  return {basis,source:actual?'ACTUAL_FILL':'OBSERVED_RESEARCH_ASK',quote_at:option?.option_timestamp||null,scan_at:snapshot?.generated_at||null,
    loss:valid?round(basis*(1-lossPct/100)):null,target:valid?round(basis*(1+profitPct/100)):null,
    premium_at_risk:basis!==null&&q?round(basis*q*100):null,
    invalidation:candidate?.invalidation_price??null,side:contract?.side||null,expiry:contract?.expiry||null};
}

export function exitReview(trade, candidate, snapshot) {
  if (!trade || trade.exit !== null) return null;
  const notes = [];
  if(Number(trade.entry)>.30)notes.push('Recorded entry exceeds the scanner’s $0.30 premium limit. This personal trade remains separate from scanner-qualified entries.');
  if (trade.lossReview == null || trade.target == null) notes.push('Set your own loss-review and profit-review bids before relying on a price checkpoint.');
  else notes.push(`Review a sale if a current executable bid reaches your loss checkpoint ($${Number(trade.lossReview).toFixed(2)}) or profit checkpoint ($${Number(trade.target).toFixed(2)}). These are reminders, not orders or guaranteed fills.`);
  if (trade.exitConditions) notes.push(`Reassess if your stated setup ends: ${trade.exitConditions}`);
  else notes.push('Define the underlying-price invalidation or catalyst change that ends your thesis.');
  if (trade.expiry) notes.push(`Expiration ${trade.expiry}: check the broker’s exercise/assignment and close-out rules before the deadline; the entire premium is at risk.`);
  else notes.push('Add the exact expiration and check the broker’s close-out deadline.');
  if (candidate && snapshot?.generated_at) {
    const observed = candidate.last_status?.observed_at || snapshot.generated_at;
    const later = Number.isFinite(Date.parse(observed)) && Date.parse(observed) > Date.parse(trade.time);
    if (later && candidate.setup_qualified === false) notes.unshift(`Shadow review: a later delayed scanner observation (${observed}) marks this ticker unqualified. Recheck the current underlying and live option bid; this is not an automatic exit signal.`);
  }
  return notes;
}

export function attachTradeExitAssistant({board, journal, getSnapshot}) {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const heading = journal.closest('section') || journal.parentElement;
  const plan = document.createElement('div');
  let awaitingFill = false, lookupVersion = 0;
  plan.id = 'exitReviewPanel';
  plan.setAttribute('aria-live', 'polite');
  journal.before(plan);
  const draft=document.createElement('div');draft.id='purchaseExitDraft';draft.setAttribute('aria-live','polite');
  $('jt').closest('.grid').before(draft);
  let draftContract=null,draftCandidate=null,draftSnapshot=null;
  function renderDraft() {
    if(!draftContract)return;
    if(!$('je').value.trim()||!(Number($('je').value)>0)){
      draft.innerHTML='<h3>Your exit plan needs your purchase price</h3><p>Enter the actual premium paid per share below. Scanner quotes will not substitute for your fill.</p>';
      if(!draft.dataset.manualCheckpoints){$('jloss').value='';$('jtarget').value='';}
      return;
    }
    const result=exitPlanDraft(draftContract,draftCandidate,draftSnapshot,$('je').value,$('jq').value);
    const benchmarks=exitBenchmarks({contract:draftContract,candidate:draftCandidate,snapshot:draftSnapshot,entry:$('je').value,enteredAt:$('jtime').value});
    result.loss=benchmarks.rows[1].loss;result.target=benchmarks.primary;
    if(draft.dataset.manualCheckpoints){for(const [key,id] of [['loss','jloss'],['target','jtarget']])result[key]=$(id).value.trim()&&Number.isFinite(Number($(id).value))?Number($(id).value):null;}
    const money=n=>n===null?'Unknown':'$'+Number(n).toFixed(2);
    draft.innerHTML=`<h3>Your option exit-plan draft</h3><p><b>${escape(draftContract.ticker)} ${escape(draftContract.contract_id||'Select exact contract below')}</b> · expiration ${escape(draftContract.expiry||'unknown')}</p><p>${result.source==='ACTUAL_FILL'?'Based on your entered fill':'Estimate based on the displayed research ask, not your execution'}: ${money(result.basis)}. Source quote time ${escape(result.quote_at||'unknown')}; scan ${escape(result.scan_at||'unknown')}.</p><ul><li>Loss-review bid: <b>${money(result.loss)}</b> ${draft.dataset.manualCheckpoints?'(your edited checkpoint)':'(tier 2 checkpoint; review before saving)' }.</li><li>Profit-review bid: <b>${money(result.target)}</b> ${draft.dataset.manualCheckpoints?'(your edited checkpoint)':'(tier 2 checkpoint; review before saving)' }.</li><li>Underlying invalidation: ${result.invalidation===null?'not available':escape(result.side==='put'?'review a move above ':result.side==='call'?'review a move below ':'review the level ')+money(Number(result.invalidation))}.</li><li>Premium at risk for the entered quantity, assuming standard 100-share contracts: ${money(result.premium_at_risk)} before fees; the entire premium can be lost.</li><li>Expiration ${escape(result.expiry||'unknown')}: verify the broker’s exercise/close-out deadline and reassess before it.</li></ul><p class="smallnote">Checkpoint prices are editable planning levels, not validated strategy thresholds. Change Loss-review bid and Profit-review bid below to your own plan. Use a current executable bid to review a sale; quotes may be stale and stops are not guaranteed. This draft places no orders and does not confirm a purchase.</p>`;
    draft.insertAdjacentHTML('beforeend',benchmarkHtml(benchmarks,escape));
    if(!draft.dataset.manualCheckpoints){$('jloss').value=result.loss??'';$('jtarget').value=result.target??'';}
  }
  for(const id of ['je','jq','jtime'])$(id).addEventListener('input',renderDraft);
  for(const id of ['jloss','jtarget'])$(id).addEventListener('input',()=>{draft.dataset.manualCheckpoints='true';renderDraft();});
  for(const id of ['jt','jc','jexpiry'])$(id).addEventListener('input',()=>{draftContract={ticker:$('jt').value.trim().toUpperCase(),contract_id:$('jc').value.trim(),expiry:$('jexpiry').value};draftCandidate=null;draftSnapshot=null;delete draft.dataset.manualCheckpoints;for(const field of ['je','jtime','jf','jconditions','jreason'])$(field).value='';renderDraft();});
  function renderPlan() {
    let trades = [];
    try { trades = JSON.parse(localStorage.getItem('0dteJournal') || '[]'); } catch { /* unavailable */ }
    const snapshot = getSnapshot();
    const candidates = new Map((snapshot?.candidates || []).map(x => [x.ticker, x]));
    const open = Array.isArray(trades) ? trades.filter(t => t.exit == null) : [];
    plan.innerHTML = `<h3>Open positions · exit review</h3><p class="smallnote">Manual fills and plans saved only in this browser. Scanner status and option quotes are delayed research, not current executable prices. Nothing here places an order.</p>` + (open.length ? open.map(t => {
      const candidate=candidates.get(t.ticker);
      const notes = exitReview(t, candidate, snapshot);
      const benchmarks=exitBenchmarks({contract:savedExitContract(t,candidate),candidate,snapshot,entry:t.entry,enteredAt:t.time});
      return `<div class="contract-pick"><b>${escape(t.ticker)} ${escape(t.contract)}</b><p class="smallnote">Recorded fill $${Number(t.entry).toFixed(2)} × ${Number(t.qty)}; verify this entry and the contract multiplier against Robinhood. Premium paid for a standard 100-share contract, before fees: $${(Number(t.entry) * Number(t.qty) * 100).toFixed(2)}.</p><ul>${notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul><p class="smallnote">Use Edit fill / plan below to set checkpoints. Saved checkpoints above remain your plan; reference tiers below do not overwrite them. No net P/L is calculated here.</p>${benchmarkHtml(benchmarks,escape)}</div>`;
    }).join('') : '<p class="smallnote">No open fills recorded here.</p>');
  }
  function addButtons() {
    for (const watch of board.querySelectorAll('.contract-pick button[data-watch]')) {
      if (watch.parentElement.querySelector('[data-record-fill]')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.recordFill = watch.dataset.watch;
      button.textContent = 'I bought this contract · record fill';
      watch.after(button);
    }
  }
  async function lookupAndOffer(contract, notice) {
    const version = ++lookupVersion;
    if (!contract.contract_id || !contract.expiry || !['call','put'].includes(contract.side) || !(Number(contract.strike)>0)) {
      notice.append(document.createTextNode(' Enter the exact option contract and expiration manually. No contract was selected by the scanner for this record.'));
      return;
    }
    if (!location.hostname.endsWith('.workers.dev')) {
      notice.append(document.createTextNode(' Private lookup requires the Access-protected Cloudflare dashboard; manual entry remains available here.'));
      return;
    }
    const status = document.createElement('p');
    status.textContent = 'Checking confirmed Robinhood executions for this exact contract…';
    notice.append(status);
    try {
      const response = await fetch('/private/plaid/robinhood/fills', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify({ticker:contract.ticker,expiry:contract.expiry,side:contract.side,strike:contract.strike}),signal:AbortSignal.timeout(60000)});
      if (!response.headers.get('Content-Type')?.includes('application/json')) throw Error('Private sign-in is required');
      const result = await response.json();
      if (version !== lookupVersion) return;
      if(response.status===503){status.textContent='Automatic fill lookup is disabled or not configured. Enter your confirmed execution manually; reconnecting alone does not enable lookup.';return;}
      if (!response.ok || !result.ok) throw Error(result.error || 'Private lookup unavailable');
      status.textContent = `${result.fills.length} confirmed opening execution(s) in the 30-day order window. Current open contracts: ${result.open_quantity}. Fees: unknown; verify them separately. Nothing has been saved.`;
      for (const fill of result.fills) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = `Use fill ${fill.executed_at} · ${fill.quantity} contract(s) at $${fill.price.toFixed(2)} · order ${fill.order_state}`;
        choose.disabled = fill.prefill_eligible!==true||result.open_quantity < fill.quantity;
        choose.onclick = () => {
          $('addTrade').dataset.executionId=fill.execution_id;
          $('addTrade').dataset.executedAt=fill.executed_at;
          $('je').value = fill.price;
          $('jq').value = fill.quantity;
          const date = new Date(fill.executed_at);
          $('jtime').value = new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
          $('jf').value = '';
          renderDraft();
          status.textContent = 'Confirmed execution prefilled. Verify this fill and enter known total fees; then save the journal entry yourself. Separate partial fills must be reviewed separately.';
          $('je').focus();
        };
        notice.append(choose);
      }
      if(result.reconciliation_status==='MANUAL_RECONCILIATION_REQUIRED')status.textContent+=' Earlier sales, missing fills or a position mismatch prevent automatic prefill. Reconcile manually.';
      if (!result.fills.length) status.textContent += ' No purchase is inferred from an unfilled order.';
      if (result.fills.some(fill => result.open_quantity < fill.quantity)) status.textContent += ' Some fills exceed the current open quantity and need sale/re-entry reconciliation; they were not prefilled.';
    } catch (error) { if (version === lookupVersion) status.textContent = `Automatic lookup unavailable: ${error.message}. Enter a confirmed fill manually or reconnect privately.`; }
  }
  board.addEventListener('click', event => {
    const button = event.target.closest('[data-record-fill]');
    if (!button) return;
    let contract;
    try { contract = JSON.parse(decodeURIComponent(button.dataset.recordFill)); } catch { return; }
    let paid;
    while(paid===undefined){
      const value=window.prompt(`What did you pay for ${contract.ticker} ${contract.contract_id||'this option'}? Enter the premium PER SHARE (for example 0.20 = $20 per standard contract), not total cost.`,'');
      if(value===null)return;
      try{paid=purchasePremium(value);}catch(error){window.alert(error.message);}
    }
    const snapshot = getSnapshot();
    const candidate = snapshot?.candidates?.find(x => x.ticker === contract.ticker);
    delete $('addTrade').dataset.executionId;delete $('addTrade').dataset.executedAt;
    document.dispatchEvent(new Event('recordNewFill'));
    $('jt').value = contract.ticker;
    $('jc').value = contract.contract_id || '';
    $('jexpiry').value = contract.expiry || '';
    $('je').value = String(paid);
    $('jx').value = '';
    $('jq').value = '1';
    $('jf').value = '';
    $('jloss').value = '';
    $('jtarget').value = '';
    $('jmax').value = '';
    $('jconditions').value = candidate?.invalidation_price != null ? `Review if underlying moves ${contract.side==='put'?'above':contract.side==='call'?'below':'through'} ${candidate.invalidation_price} (scanner observation; verify live)` : '';
    $('jreason').value = candidate ? `Scanner observation: ${candidate.direction||'unknown direction'} / ${candidate.execution_state||'unknown state'}; setup qualified ${candidate.setup_qualified===true?'yes':candidate.setup_qualified===false?'no':'unknown'}. Verify the pre-entry evidence separately.` : '';
    $('jtime').value = '';
    $('jconfirm').value = '';
    draftContract=contract;draftCandidate=candidate;draftSnapshot=snapshot;delete draft.dataset.manualCheckpoints;
    renderDraft();
    awaitingFill = true;
    const collapsible = heading.closest('#cleanJournal');
    if (collapsible) collapsible.open = true;
    draft.scrollIntoView({block:'start'});
    const notice = $('journalNotice');
    notice.textContent = (candidate?.setup_qualified === false ? 'Shadow review: the latest displayed ticker setup is unqualified in delayed research. Verify the actual pre-entry snapshot and live quote. ' : '') + 'Enter the actual Robinhood fill premium, quantity, execution time, and total known fees. Scanner ask is not your fill. Saving is a separate confirmation.';
    void lookupAndOffer(contract, notice);
  }, true);
  for(const id of ['jt','jc','jexpiry','je','jq','jtime'])$(id).addEventListener('input',()=>{delete $('addTrade').dataset.executionId;delete $('addTrade').dataset.executedAt;});
  $('addTrade').addEventListener('click', event => {
    if (!awaitingFill) return;
    if (!$('jtime').value || !$('jf').value.trim()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('journalNotice').textContent = 'Enter the actual execution time and known total fees (enter 0 only if confirmed zero) before saving this fill.';
      return;
    }
    // Keep the guard active if journal validation rejects the save.
  }, true);
  journal.addEventListener('click', event => { if (event.target.closest('[data-edit]')) awaitingFill = false; }, true);
  new MutationObserver(addButtons).observe(board, {childList:true,subtree:true});
  new MutationObserver(renderPlan).observe(journal, {childList:true});
  addButtons();
  renderPlan();
  return {renderPlan};
}

