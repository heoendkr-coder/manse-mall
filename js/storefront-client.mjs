import { assessProduct, koreaMonth } from './recommendations.mjs';
/** Shared browser behavior for hosted and standalone storefronts. */
/** @param {Document | HTMLElement} root */
export function initStorefront(root = document) {
  const cleanups=[];
  const on=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
  const pickCards=[...root.querySelectorAll('[data-pick-valid-until]')],pickSection=root.querySelector('#top-picks');
  const pickLive=card=>!!card && !card.hidden && [card.dataset.pickValidUntil,...(card.dataset.pickComparisonValidUntil?[card.dataset.pickComparisonValidUntil]:[])].every(value=>Number.isFinite(Date.parse(value)) && Date.now()<Date.parse(value));
  const impressions=new Set(),clicks=new Set();
  const pickEvent=(card,kind,seen)=>{
    if(!pickLive(card)||seen.has(card.dataset.pick))return;
    seen.add(card.dataset.pick);
    const body=JSON.stringify({pickId:card.dataset.pick,kind});
    try {
      if(typeof navigator.sendBeacon==='function' && navigator.sendBeacon('/api/picks/events',new Blob([body],{type:'application/json'})))return;
    } catch { /* Try the same-origin keepalive transport once. */ }
    try { void fetch('/api/picks/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{}); } catch {}
  };
  if(pickCards.length && typeof IntersectionObserver==='function') {
    const intersections=new Map();
    const recordVisible=()=>{
      if(document.visibilityState==='hidden')return;
      for(const [card,visible] of intersections)if(visible && pickLive(card)) {
        pickEvent(card,'impression',impressions);observer.unobserve(card);intersections.delete(card);
      }
    };
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)intersections.set(entry.target,entry.isIntersecting && entry.intersectionRatio>=0.5);
      recordVisible();
    },{threshold:0.5});
    for(const card of pickCards)observer.observe(card);
    on(document,'visibilitychange',recordVisible);
    cleanups.push(()=>observer.disconnect());
  }
  for(const link of root.querySelectorAll('[data-pick-click]'))on(link,'click',()=>pickEvent(link.closest('[data-pick]'),'click',clicks));
  for(const link of root.querySelectorAll('[data-checkout-valid-until]'))on(link,'click',e=>{
    if(Date.now()>=Date.parse(link.dataset.checkoutValidUntil)||!Number.isFinite(Date.parse(link.dataset.checkoutValidUntil))){
      e.preventDefault();link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.classList.add('pending-link');link.textContent='판매 조건 확인 중 · 새로고침해 주세요';
    }
  });
  function expireOffers(){
    for(const card of pickCards)if(!pickLive(card))card.hidden=true;
    if(pickSection && !pickCards.some(card=>!card.hidden))pickSection.hidden=true;
    for(const link of root.querySelectorAll('[data-checkout-valid-until]'))if(Date.now()>=Date.parse(link.dataset.checkoutValidUntil)){
      link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.classList.add('pending-link');link.textContent='판매 조건 확인 중';
    }
    for(const price of root.querySelectorAll('[data-price-valid-until]'))if(Date.now()>=Date.parse(price.dataset.priceValidUntil))price.textContent='가격 확인 중';
    for(const badge of root.querySelectorAll('[data-badge-valid-until]'))if(Date.now()>=Date.parse(badge.dataset.badgeValidUntil))badge.textContent='대자만몰 · 판매 조건 확인 중';
  }
  const input=root.querySelector('#mall-search'),searchPanel=root.querySelector('#mall-search-panel'),searchToggle=root.querySelector('[data-search-toggle]');
  const setSearch=(open,focus=true)=>{if(!searchPanel||!searchToggle)return;searchPanel.hidden=!open;searchToggle.setAttribute('aria-expanded',String(open));searchToggle.setAttribute('aria-label',open?'상품 검색 닫기':'상품 검색 열기');if(focus)(open?input:searchToggle)?.focus({preventScroll:true});};
  if(searchToggle)on(searchToggle,'click',()=>setSearch(searchPanel.hidden));
  if(input)on(input,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();setSearch(false);}});
  const cards=[...root.querySelectorAll('[data-product]')],filters=[...root.querySelectorAll('[data-filter]')],views=[...root.querySelectorAll('[data-view]')];
  const count=root.querySelector('[data-count]'),summary=root.querySelector('[data-search-summary]'),empty=root.querySelector('[data-empty]'),catalog=root.querySelector('#products'),grid=root.querySelector('[data-product-grid]'),sort=root.querySelector('[data-sort]'),recStatus=root.querySelector('[data-recommendation-status]');
  let category='all',view='all',opened=null,returnFocus=null,previousHash='';
  const normalize=text=>text.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,' ').trim();
  const scrollCatalog=()=>catalog?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  let config={};try{config=JSON.parse(catalog?.dataset.rankingConfig||'{}');}catch{}
  const now=new Date();
  let assessed=new Map(),eligibleCount=0;
  function reassess(){
    const checkedAt=new Date();
    assessed=new Map(cards.map(card=>{
      let state={eligible:false,score:0,region:'',labels:[]};
      try{state=assessProduct(JSON.parse(card.dataset.ranking),config,checkedAt);}catch{}
      const labels=card.querySelector('[data-rec-labels]');
      if(labels){labels.replaceChildren(...state.labels.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));labels.hidden=!state.labels.length;}
      return [card,state];
    }));
    eligibleCount=[...assessed.values()].filter(x=>x.eligible).length;
  }
  const sorted=()=>{const arranged=sort?.value==='original'?cards:[...cards].sort((a,b)=>assessed.get(b).score-assessed.get(a).score||cards.indexOf(a)-cards.indexOf(b));if(!grid||arranged.every((card,index)=>grid.children[index]===card))return;for(const card of arranged)grid.append(card);};
  function filter(next=category) {
    category=next;const query=normalize(input?.value||''),words=query.split(' ').filter(Boolean);let visible=0;
    for(const card of cards){const state=assessed.get(card),haystack=normalize((card.dataset.search||'')+' '+state.region);const match=(category==='all'||card.dataset.category===category)&&words.every(word=>haystack.includes(word))&&(view==='all'||(state.eligible&&(view!=='regional'||state.region)));card.hidden=!match;if(match)visible++;}
    for(const button of filters){const active=button.dataset.filter===category;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));}
    for(const button of views){const active=button.dataset.view===view;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));}
    if(count)count.textContent=String(visible);if(empty)empty.hidden=visible>0;
    if(summary){summary.hidden=!query;summary.textContent=query?`“${input.value.trim()}” 검색 결과 ${visible}개`:'';}
    const title=root.querySelector('[data-empty-title]'),description=root.querySelector('[data-empty-description]');
    if(title)title.textContent=view==='regional'?'산지가 확인된 상품을 준비하고 있어요':view==='recommended'?'추천 조건을 확인하고 있어요':'찾으시는 상품이 없어요';
    if(description)description.textContent=view==='regional'?'경북·경남 원산지와 판매 조건이 확인된 상품부터 소개하겠습니다.':view==='recommended'?'구매 조건·구성·판매 상태를 최근에 확인한 상품이 여기에 표시됩니다.':'다른 검색어를 입력하거나 전체 상품을 둘러보세요.';
    if(recStatus)recStatus.textContent=eligibleCount?`최근 자료로 선정한 추천 ${eligibleCount}개 · 계절과 확인된 산지를 함께 반영합니다.`:'상품 소개를 먼저 둘러보세요. 추천은 구매 조건·구성·판매 상태 확인 후 시작합니다.';
  }
  const reset=()=>{if(input)input.value='';view='all';filter('all');};
  for(const button of filters)on(button,'click',()=>{filter(button.dataset.filter);if(button.hasAttribute('data-scroll-catalog'))scrollCatalog();});
  for(const button of views)on(button,'click',()=>{view=button.dataset.view;if(input)input.value='';filter('all');if(button.hasAttribute('data-scroll-catalog'))scrollCatalog();});
  for(const link of root.querySelectorAll('[data-collection-link]'))on(link,'click',e=>{e.preventDefault();view='all';if(input)input.value='';filter(link.dataset.collectionLink);scrollCatalog();});
  if(input)on(input,'input',()=>{view='all';filter('all');});
  const form=root.querySelector('[data-search-form]');if(form)on(form,'submit',e=>{e.preventDefault();filter();setSearch(false,false);scrollCatalog();});
  if(sort)on(sort,'change',sorted);
  for(const button of root.querySelectorAll('[data-reset]'))on(button,'click',reset);
  const isDialogHash=()=>/^#(?:product|policy)=/.test(location.hash);
  function closeDialog({restoreHash=true}={}){if(!opened)return;const dialog=opened;opened=null;dialog.close();document.body.classList.remove('dialog-is-open');if(restoreHash&&isDialogHash())history.replaceState(null,'',location.pathname+location.search+previousHash);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  function openDialog(id,push=true){const dialog=[...root.querySelectorAll('[data-dialog]')].find(d=>d.dataset.dialog===id);if(!dialog||typeof dialog.showModal!=='function'||opened===dialog)return;if(opened)closeDialog({restoreHash:false});returnFocus=document.activeElement;previousHash=isDialogHash()?'#products':location.hash;const hash=id.startsWith('policy:')?'#policy='+encodeURIComponent(id.slice(7)):'#product='+encodeURIComponent(id);if(push)history.pushState(null,'',location.pathname+location.search+hash);opened=dialog;dialog.showModal();document.body.classList.add('dialog-is-open');dialog.querySelector('[data-close-dialog]')?.focus({preventScroll:true});}
  for(const link of root.querySelectorAll('[data-open-product],[data-open-policy]'))on(link,'click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openDialog(link.dataset.openPolicy?'policy:'+link.dataset.openPolicy:link.dataset.openProduct);});
  for(const dialog of root.querySelectorAll('[data-dialog]')){on(dialog,'cancel',e=>{e.preventDefault();closeDialog();});on(dialog,'click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog();}});const close=dialog.querySelector('[data-close-dialog]');if(close)on(close,'click',()=>closeDialog());}
  function hashChanged(){try{if(location.hash.startsWith('#product='))openDialog(decodeURIComponent(location.hash.slice(9)),false);else if(location.hash.startsWith('#policy='))openDialog('policy:'+decodeURIComponent(location.hash.slice(8)),false);else closeDialog({restoreHash:false});}catch{}}
  // Select current and next season themes on each visit using Korean calendar dates.
  const seasonCards=[...root.querySelectorAll('[data-season-months]')],month=koreaMonth(now),seasonGrid=root.querySelector('[data-seasonal-grid]');
  const nextSeasons=seasonCards.map((card,index)=>({card,index,distance:Math.min(...card.dataset.seasonMonths.split(',').map(Number).map(m=>(m-month+12)%12))})).sort((a,b)=>a.distance-b.distance||a.index-b.index);
  nextSeasons.forEach(({card,distance},index)=>{card.hidden=index>=3;const timing=card.querySelector('[data-season-timing]');if(timing)timing.textContent=distance===0?'이달의 산지':'다가오는 계절';seasonGrid?.append(card);});
  const refresh=()=>{expireOffers();reassess();sorted();filter();};
  const expiryTimer=window.setInterval(refresh,30000);cleanups.push(()=>window.clearInterval(expiryTimer));on(document,'visibilitychange',refresh);
  on(window,'hashchange',hashChanged);on(window,'popstate',hashChanged);refresh();hashChanged();
  return()=>{cleanups.forEach(fn=>fn());if(opened)opened.close();document.body.classList.remove('dialog-is-open');};
}
