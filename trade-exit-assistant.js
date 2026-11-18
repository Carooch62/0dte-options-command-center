// Browser-local journal helper. Scanner observations are never brokerage fills.
export function exitReview(trade, candidate, snapshot) {
  if (!trade || trade.exit !== null) return null;
  const notes = [];
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
  function renderPlan() {
    let trades = [];
    try { trades = JSON.parse(localStorage.getItem('0dteJournal') || '[]'); } catch { /* unavailable */ }
    const snapshot = getSnapshot();
    const candidates = new Map((snapshot?.candidates || []).map(x => [x.ticker, x]));
    const open = Array.isArray(trades) ? trades.filter(t => t.exit == null) : [];
    plan.innerHTML = `<h3>Open positions · exit review</h3><p class="smallnote">Manual fills and plans saved only in this browser. Scanner status and option quotes are delayed research, not current executable prices. Nothing here places an order.</p>` + (open.length ? open.map(t => {
      const notes = exitReview(t, candidates.get(t.ticker), snapshot);
      return `<div class="contract-pick"><b>${escape(t.ticker)} ${escape(t.contract)}</b><p class="smallnote">Recorded fill $${Number(t.entry).toFixed(2)} × ${Number(t.qty)}; verify this entry and the contract multiplier against Robinhood. Premium paid for a standard 100-share contract, before fees: $${(Number(t.entry) * Number(t.qty) * 100).toFixed(2)}.</p><ul>${notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul><p class="smallnote">Use Edit fill / plan below to set checkpoints. No net P/L is calculated here.</p></div>`;
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
      if (!response.ok || !result.ok) throw Error(result.error || 'Private lookup unavailable');
      status.textContent = `${result.fills.length} confirmed opening execution(s) in the 30-day order window. Current open contracts: ${result.open_quantity}. Fees: unknown; verify them separately. Nothing has been saved.`;
      for (const fill of result.fills) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = `Use fill ${fill.executed_at} · ${fill.quantity} contract(s) at $${fill.price.toFixed(2)} · order ${fill.order_state}`;
        choose.disabled = result.open_quantity < fill.quantity;
        choose.onclick = () => {
          $('je').value = fill.price;
          $('jq').value = fill.quantity;
          const date = new Date(fill.executed_at);
          $('jtime').value = new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
          $('jf').value = '';
          status.textContent = 'Confirmed execution prefilled. Verify this fill and enter known total fees; then save the journal entry yourself. Separate partial fills must be reviewed separately.';
          $('je').focus();
        };
        notice.append(choose);
      }
      if (!result.fills.length) status.textContent += ' No purchase is inferred from an unfilled order.';
      if (result.fills.some(fill => result.open_quantity < fill.quantity)) status.textContent += ' Some fills exceed the current open quantity and need sale/re-entry reconciliation; they were not prefilled.';
    } catch (error) { if (version === lookupVersion) status.textContent = `Automatic lookup unavailable: ${error.message}. Enter a confirmed fill manually or reconnect privately.`; }
  }
  board.addEventListener('click', event => {
    const button = event.target.closest('[data-record-fill]');
    if (!button) return;
    let contract;
    try { contract = JSON.parse(decodeURIComponent(button.dataset.recordFill)); } catch { return; }
    const snapshot = getSnapshot();
    const candidate = snapshot?.candidates?.find(x => x.ticker === contract.ticker);
    document.dispatchEvent(new Event('recordNewFill'));
    $('jt').value = contract.ticker;
    $('jc').value = contract.contract_id;
    $('jexpiry').value = contract.expiry || '';
    $('je').value = '';
    $('jx').value = '';
    $('jq').value = '1';
    $('jf').value = '';
    $('jloss').value = '';
    $('jtarget').value = '';
    $('jmax').value = '';
    $('jconditions').value = candidate?.invalidation_price != null ? `Review if underlying breaks ${candidate.invalidation_price} (scanner observation; verify live)` : '';
    $('jreason').value = '';
    $('jtime').value = '';
    $('jconfirm').value = '';
    awaitingFill = true;
    const collapsible = heading.closest('#cleanJournal');
    if (collapsible) collapsible.open = true;
    $('jt').scrollIntoView({block:'center'});
    $('je').focus();
    const notice = $('journalNotice');
    notice.textContent = (candidate?.setup_qualified === false ? 'Shadow review: the latest displayed ticker setup is unqualified in delayed research. Verify the actual pre-entry snapshot and live quote. ' : '') + 'Enter the actual Robinhood fill premium, quantity, execution time, and total known fees. Scanner ask is not your fill. Saving is a separate confirmation.';
    void lookupAndOffer(contract, notice);
  }, true);
  $('addTrade').addEventListener('click', event => {
    if (!awaitingFill) return;
    if (!$('jtime').value || !$('jf').value.trim()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('journalNotice').textContent = 'Enter the actual execution time and known total fees (enter 0 only if confirmed zero) before saving this fill.';
      return;
    }
    awaitingFill = false;
  }, true);
  journal.addEventListener('click', event => { if (event.target.closest('[data-edit]')) awaitingFill = false; }, true);
  new MutationObserver(addButtons).observe(board, {childList:true,subtree:true});
  new MutationObserver(renderPlan).observe(journal, {childList:true});
  addButtons();
  renderPlan();
  return {renderPlan};
}
