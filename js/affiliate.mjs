import { directOffer, directPublicationErrors, FOOD_COLLECTIONS } from './commerce.mjs';
/** Checks link shape only. Ownership, destination and earning eligibility need the owner's account. */
export const PROVIDERS = {
  coupang: {name:'쿠팡',disclosure:'이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'},
  naver: {name:'네이버',disclosure:'이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.'},
};
export function affiliateLink(value, provider='coupang') {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\s\\\u0000-\u001f<>"']/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
  // naver.me is also used for ordinary sharing. This checks shape ONLY;
  // productOffers additionally requires the owner to confirm account issuance.
  if(provider==='naver') return url.hostname==='naver.me' && !url.search && /^\/[A-Za-z0-9]{1,64}$/.test(url.pathname) ? value : null;
  if(provider!=='coupang') return null;
  const short = url.hostname === "link.coupang.com" && /^\/a\/[A-Za-z0-9]+$/.test(url.pathname);
  const legacy = url.hostname === "coupa.ng" && /^\/[A-Za-z0-9]+$/.test(url.pathname);
  // This project deliberately supports issued short links only; unknown shapes stay disabled.
  return short || legacy ? value : null;
}
/** A listing in the operator's own marketplace store, never a wholesale order page. */
export function sellerLink(value) {
  if (typeof value !== 'string' || value !== value.trim() || /[\s\\\u0000-\u001f<>"']/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (url.hostname === 'smartstore.naver.com' && /^\/[A-Za-z0-9_-]+\/products\/\d+\/?$/.test(url.pathname)) return {url:value,name:'스마트스토어'};
    if (url.hostname === 'www.coupang.com' && /^\/vp\/products\/\d+\/?$/.test(url.pathname)) return {url:value,name:'쿠팡 판매점'};
  } catch {}
  return null;
}

export function productOffers(p, site={}, now=new Date()) {
  // Our checkout lives on the verified commerce site. Never substitute an affiliate link.
  if (p.salesMode === 'direct') { const offer=directOffer(p,site,now);return offer?[offer]:[]; }
  if (p.salesMode === 'own-store') {
    const seller = sellerLink(p.sellerUrl);
    return seller && p.sellerLinkConfirmed === true ? [{provider:'seller',...seller}] : [];
  }
  const offers=[];
  const coupang=affiliateLink(p.affiliateUrl);
  if(coupang && p.coupangLinkConfirmed===true) offers.push({provider:'coupang',url:coupang,...PROVIDERS.coupang});
  return offers;
}
export function disclosuresFor(products, site) {
  const active=new Set(products.flatMap(p=>productOffers(p,site).map(o=>o.provider)));
  return Object.keys(PROVIDERS).filter(k=>active.has(k)).map(k=>({provider:k,text:k==='coupang'?(site.disclosure||PROVIDERS.coupang.disclosure):(site.naverDisclosure||PROVIDERS.naver.disclosure)}));
}
export function safeHttps(value) {
  if(typeof value!=='string'||value!==value.trim()||/[\s\\\u0000-\u001f<>"']/.test(value))return null;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?value:null;}catch{return null;}
}

export function releaseReadiness(site) {
  const errors=[],b=site.business||{},p=site.privacy||{};
  for(const key of ['legalName','representative','registrationNumber','address','phone','email'])if(!b[key]?.trim())errors.push(`사업자 정보 ${key}를 입력하세요.`);
  if(b.registrationNumber&&!/^\d{3}-?\d{2}-?\d{5}$/.test(b.registrationNumber))errors.push('사업자등록번호 형식을 확인하세요.');
  if(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))errors.push('운영 이메일을 확인하세요.');
  if(b.taxReviewed!==true)errors.push('실제 운영 사업자의 업종·세무 처리 확인이 필요합니다.');
  if(!['reported','not-required'].includes(b.mailOrderStatus))errors.push('통신판매업 신고 해당 여부를 확인하세요.');
  if(b.mailOrderStatus==='reported'&&(!b.mailOrderNumber?.trim()||!b.mailOrderAuthority?.trim()))errors.push('통신판매업 신고번호와 신고기관이 필요합니다.');
  if(b.mailOrderStatus==='not-required'&&!b.mailOrderReviewNote?.trim())errors.push('신고 비대상 판단을 확인한 근거를 운영 기록에 남겨 주세요.');
  if(!safeHttps(site.publicUrl))errors.push('실제 공개할 HTTPS 사이트 주소를 입력하세요.');
  if(p.reviewed!==true)errors.push('호스팅·문의·접속기록을 확인한 개인정보 처리방침 확정이 필요합니다.');
  for(const key of ['hostingProvider','hostingLocation','logItems','logPurpose','logRetention','inquiryItems','inquiryPurpose','inquiryRetention','processingPartners','thirdPartySharing','overseasTransfer','cookies','securityMeasures','destructionMethod','contactName','contactEmail','contactPhone','effectiveDate'])if(!p[key]?.trim())errors.push(`개인정보 처리 설정 ${key}를 입력하세요.`);
  if(p.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail))errors.push('개인정보 문의 이메일을 확인하세요.');
  if(site.termsReviewed!==true)errors.push('이용 안내·약관을 실제 운영 방식에 맞춰 확인하세요.');
  return errors;
}

export function channelLink(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtube.com", "www.youtube.com"].includes(url.hostname) && !url.username && !url.password && !url.port && /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/.test(url.pathname) ? value : null;
  } catch { return null; }
}

export function validateCatalog(products, site, { release = false } = {}) {
  const errors = [];
  if (!site || typeof site.mallName !== "string" || typeof site.channelName !== "string" || typeof site.disclosure !== "string") errors.push("사이트 이름과 광고 고지문이 필요합니다.");
  if (site?.youtubeUrl && !channelLink(site.youtubeUrl)) errors.push("youtubeUrl은 실제 유튜브 채널 주소여야 합니다.");
  if (!Array.isArray(products) || !products.length) return [...errors, "상품 목록이 비어 있습니다."];
  const ids = new Set();
  for (const p of products) {
    if (!p || typeof p !== "object") { errors.push("올바르지 않은 상품 데이터입니다."); continue; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id || "") || ids.has(p.id)) errors.push(`상품 ID가 잘못되었거나 중복됩니다: ${p.id}`);
    ids.add(p.id);
    if (!["food", "home"].includes(p.category)) errors.push(`${p.id}: category는 food 또는 home이어야 합니다.`);
    if(p.collection!==undefined&&![...FOOD_COLLECTIONS,'home'].includes(p.collection))errors.push(`${p.id}: 상품 분류를 확인하세요.`);
    for (const key of ["brand", "title", "spec", "tag", "reason", "check"]) if (typeof p[key] !== "string" || !p[key].trim()) errors.push(`${p.id}: ${key} 항목이 필요합니다.`);
    if (!/^\/products\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(p.image || "")) errors.push(`${p.id}: 로컬 상품 이미지 경로가 잘못되었습니다.`);
    if (p.affiliateUrl && !affiliateLink(p.affiliateUrl)) errors.push(`${p.id}: 본인 계정에서 발급한 쿠팡파트너스 단축 링크를 입력하세요.`);
    if (p.salesMode !== undefined && !['affiliate','own-store','direct'].includes(p.salesMode)) errors.push(`${p.id}: 판매 방식은 affiliate, own-store 또는 direct여야 합니다.`);
    if (p.salesMode === 'own-store' && p.sellerUrl && !sellerLink(p.sellerUrl)) errors.push(`${p.id}: 실제 본인 판매 스토어의 상품 주소를 입력하세요.`);
    if (p.sellerLinkConfirmed !== undefined && typeof p.sellerLinkConfirmed !== 'boolean') errors.push(`${p.id}: sellerLinkConfirmed는 확인 여부(true/false)여야 합니다.`);
    if (p.naverAffiliateUrl && !affiliateLink(p.naverAffiliateUrl,'naver')) errors.push(`${p.id}: 발급받은 네이버 쇼핑커넥트 단축 링크 형식을 확인하세요. 지원하지 않는 형식은 변환하지 말고 확인해야 합니다.`);
    for(const key of ['coupangLinkConfirmed','naverLinkConfirmed','imageRightsConfirmed'])if(p[key]!==undefined&&typeof p[key]!=='boolean')errors.push(`${p.id}: ${key}는 확인 여부(true/false)여야 합니다.`);
    if(p.curation!==undefined){
      const c=p.curation;
      if(!c||typeof c!=='object'||Array.isArray(c))errors.push(`${p.id}: 검수 자료 형식을 확인하세요.`);
      else{
        for(const key of ['qualityNote','valueNote','evidenceUrl','reviewedAt','availability','offerCheckedAt','originProvince','originDetail','originSource','seasonSource','metricsSource','metricsCheckedAt','priceSource','priceCheckedAt'])if(c[key]!==undefined&&typeof c[key]!=='string')errors.push(`${p.id}: ${key}는 문자열이어야 합니다.`);
        for(const key of ['qualityChecked','originVerified','valueChecked','sameOptionsCompared'])if(c[key]!==undefined&&typeof c[key]!=='boolean')errors.push(`${p.id}: ${key}는 확인 여부(true/false)여야 합니다.`);
        for(const key of ['rating','reviewCount','recentSales','totalPrice','comparisonPrice'])if(c[key]!==undefined&&c[key]!==null&&(!Number.isFinite(c[key])||c[key]<0))errors.push(`${p.id}: ${key} 숫자를 확인하세요.`);
        if(typeof c.rating==='number'&&c.rating>5)errors.push(`${p.id}: 평점 범위는 0–5입니다.`);
        for(const key of ['reviewCount','recentSales'])if(c[key]!=null&&!Number.isInteger(c[key]))errors.push(`${p.id}: ${key}는 정수여야 합니다.`);
        if(c.seasonMonths!==undefined&&(!Array.isArray(c.seasonMonths)||c.seasonMonths.some(m=>!Number.isInteger(m)||m<1||m>12)))errors.push(`${p.id}: 편성 월은 1–12의 배열이어야 합니다.`);
        if(c.availability!==undefined&&!['unknown','in_stock','out_of_stock'].includes(c.availability))errors.push(`${p.id}: 판매 상태를 확인하세요.`);
        for(const key of ['evidenceUrl','originSource','seasonSource','metricsSource','priceSource'])if(c[key]&&!safeHttps(c[key]))errors.push(`${p.id}: ${key}는 HTTPS 근거 주소여야 합니다.`);
      }
    }
    if (release && p.salesMode === 'direct') errors.push(...directPublicationErrors(p,site).map(error=>`${p.id}: ${error}`));
    if (release && p.salesMode !== 'direct' && !productOffers(p,site).length) errors.push(`${p.id}: 공개 전 구매처 연결이 필요합니다.`);
    if (release && !['direct','own-store'].includes(p.salesMode) && p.affiliateUrl && p.coupangLinkConfirmed!==true) errors.push(`${p.id}: 쿠팡 본인 발급 링크와 도착 상품·옵션 확인이 필요합니다.`);
    if (release && p.salesMode === 'own-store' && (!sellerLink(p.sellerUrl) || p.sellerLinkConfirmed !== true)) errors.push(`${p.id}: 본인 판매 스토어의 상품 등록과 도착 옵션 확인이 필요합니다.`);
    if (release && p.imageRightsConfirmed !== true) errors.push(`${p.id}: 공개 사용 가능한 상품 이미지를 확정하세요.`);
  }
  if(release){
    errors.push(...releaseReadiness(site));
    const providers=new Set(products.flatMap(p=>productOffers(p,site).map(o=>o.provider)).filter(provider=>provider in PROVIDERS));
    for(const provider of providers){
      if(site.affiliates?.[provider]?.mediaApproved!==true)errors.push(`${PROVIDERS[provider].name}: 실제 채널·사이트 게재 조건과 계정 이용 가능 여부를 확인하세요.`);
      const notice=provider==='coupang'?site.disclosure:site.naverDisclosure;
      if(!notice?.includes('수수료'))errors.push(`${PROVIDERS[provider].name}: 경제적 이해관계 고지문을 입력하세요.`);
    }
  }
  return errors;
}
