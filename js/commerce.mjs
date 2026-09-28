/** Public storefront contract. Supplier prices, API keys and customer data never belong here. */
export const FOOD_COLLECTIONS = ['fruit','produce','kimchi','seafood','meat','pantry'];
export const COMMERCE_CHECKS = ['ownershipVerified','checkoutVerified','orderSyncVerified','shippingVerified','refundVerified'];
export const PAYAPP_CHECKS = ['checkoutVerified','callbackVerified','shippingVerified','refundVerified'];
const hasText = value => typeof value === 'string' && Boolean(value.trim());
const safeUrl = value => {
  if (!hasText(value) || value !== value.trim() || /[\s\\\u0000-\u001f<>"']/.test(value)) return null;
  try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash?u:null; } catch { return null; }
};
export function commerceOrigin(site={}) {
  const u=safeUrl(site.commerce?.storeOrigin);
  if(!u||u.pathname!=='/'||u.search||u.hostname.endsWith('.'))return null;
  // Never turn a supplier's wholesale checkout or a marketplace into our own checkout.
  const blocked=['beseller.net','specialoffer.kr','doogofood.com','baljuora.com','coupang.com','naver.com'];
  if(blocked.some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))return null;
  return u.origin;
}
export function commerceLink(value,site={}) {
  const u=safeUrl(value),origin=commerceOrigin(site);
  if(!u||!origin||u.origin!==origin)return null;
  // Canonical Cafe24 product links only; select options on the actual product page.
  if(u.pathname!=='/product/detail.html'||!/^[1-9]\d*$/.test(u.searchParams.get('product_no')||''))return null;
  if([...u.searchParams.keys()].some(k=>!['product_no','cate_no','display_group'].includes(k)))return null;
  if([...u.searchParams.keys()].some(k=>u.searchParams.getAll(k).length!==1))return null;
  if([...u.searchParams.values()].some(v=>!/^\d+$/.test(v)))return null;
  return u.href;
}
export function commerceSetupErrors(site={}) {
  const c=site.commerce||{},errors=[];
  if(!['cafe24','payapp'].includes(c.provider))errors.push('구매 시스템 확인');
  if(c.provider!=='payapp'&&!commerceOrigin(site))errors.push('본인 자사몰 주소 확인');
  for(const key of c.provider==='payapp'?PAYAPP_CHECKS:COMMERCE_CHECKS)if(c[key]!==true)errors.push(key);
  if(c.enabled!==true)errors.push('실제 판매 시작 설정');
  if(site.termsReviewed!==true||site.privacy?.reviewed!==true)errors.push('운영 안내 확정');
  const b=site.business||{};
  if(['legalName','representative','registrationNumber','address','phone','email'].some(k=>!hasText(b[k])))errors.push('판매자·고객센터 정보');
  return errors;
}
export function freshCommerceWindow(c={},now=new Date()) {
  const strict=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if(!strict.test(c.checkedAt||'')||!strict.test(c.validUntil||''))return false;
  const from=Date.parse(c.checkedAt),to=Date.parse(c.validUntil),current=now.getTime();
  return Number.isFinite(from)&&Number.isFinite(to)&&from<=current&&current<to&&to>from;
}
export function directSaleErrors(product,site={},now=new Date()) {
  if(product.salesMode!=='direct')return [];
  const c=product.commerce||{},errors=commerceSetupErrors(site);
  if(c.status!=='active')errors.push('판매 준비');
  if(site.commerce?.provider!=='payapp'&&!commerceLink(c.productUrl,site))errors.push('본인 자사몰 상품 연결');
  if(product.imageRightsConfirmed!==true||c.productVerified!==true)errors.push('상품·이미지 검수');
  if(!freshCommerceWindow(c,now))errors.push('가격·재고 확인기간');
  if(!hasText(c.dispatchGroup)||!hasText(c.shippingNote)||!hasText(c.dispatchNote)||!hasText(c.originLabel))errors.push('출고·배송·원산지 안내');
  if(!['ambient','chilled','frozen'].includes(c.temperature))errors.push('배송 온도대');
  const variants=Array.isArray(c.variants)?c.variants:[],ids=new Set(),optionCodes=new Set();
  if(!variants.length)errors.push('판매 옵션');
  for(const v of variants){
    if(!v||typeof v!=='object'||Array.isArray(v)){errors.push('올바르지 않은 옵션');continue;}
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v?.sku||'')||ids.has(v.sku))errors.push('옵션 SKU 중복·누락');
    ids.add(v?.sku);
    if(optionCodes.has(v.optionCode))errors.push('구매 옵션코드 중복');
    optionCodes.add(v.optionCode);
    if(!hasText(v?.label)||!hasText(v?.optionCode)||!Number.isInteger(v?.price)||v.price<=0||!Number.isInteger(v?.shippingFee)||v.shippingFee<0)errors.push('옵션 규격·가격·운임');
    if(!['in_stock','out_of_stock'].includes(v?.availability))errors.push('옵션 재고 확인');
  }
  if(!variants.some(v=>v?.availability==='in_stock'))errors.push('판매 가능 옵션 없음');
  return [...new Set(errors)];
}
/** Unavailable items may remain in the catalog; they never receive a purchase URL. */
export function directPublicationErrors(product,site={},now=new Date()) {
  const c=product.commerce||{};
  const hasPastValidWindow=Date.parse(c.checkedAt)<=now.getTime()&&freshCommerceWindow(c,new Date(Date.parse(c.checkedAt)));
  return directSaleErrors(product,site,now).filter(error=>error!=='판매 가능 옵션 없음'&&!(error==='가격·재고 확인기간'&&hasPastValidWindow));
}
export function directSaleState(product,site={},now=new Date()) {
  const errors=directSaleErrors(product,site,now);
  if(product.salesMode!=='direct'||product.commerce?.status!=='active')return {kind:'draft',label:'판매 준비 중'};
  if(!errors.length)return {kind:'available',label:'구매 가능'};
  if(errors.every(e=>e==='판매 가능 옵션 없음'))return {kind:'sold-out',label:'품절'};
  if(errors.every(e=>['판매 가능 옵션 없음','가격·재고 확인기간'].includes(e)))return {kind:'checking',label:'판매 조건 확인 중'};
  return {kind:'draft',label:'판매 준비 중'};
}
export function directOffer(product,site={},now=new Date()) {
  return product.salesMode==='direct'&&!directSaleErrors(product,site,now).length
    ? {provider:'direct',name:'대자만몰',url:site.commerce?.provider==='payapp'?'/checkout/'+encodeURIComponent(product.id):commerceLink(product.commerce.productUrl,site)} : null;
}
export function directPrice(product,site={},now=new Date()) {
  if(!directOffer(product,site,now))return null;
  const available=product.commerce.variants.filter(v=>v.availability==='in_stock');
  return {amount:Math.min(...available.map(v=>v.price)),multiple:available.length>1};
}
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object?.[key]!==undefined).map(key=>[key,object[key]]));
export function publicCommerce(commerce={}) {
  if(commerce?.status!=='active')return {status:commerce?.status || 'draft',variants:[]};
  return {...pick(commerce,['status','productUrl','productVerified','checkedAt','validUntil','dispatchGroup','temperature','shippingNote','dispatchNote','originLabel']),variants:Array.isArray(commerce?.variants)?commerce.variants.map(v=>pick(v,['sku','optionCode','label','price','shippingFee','availability'])):[]};
}
export function publicRankingSite(site={}) {
  return {commerce:pick(site.commerce,['provider','storeOrigin','enabled',...COMMERCE_CHECKS,'callbackVerified']),business:pick(site.business,['legalName','representative','registrationNumber','address','phone','email']),privacy:{reviewed:site.privacy?.reviewed===true},termsReviewed:site.termsReviewed===true,recommendations:pick(site.recommendations,['maxEvidenceAgeDays','regionPriority','maxOfferAgeDays']),affiliates:{coupang:{mediaApproved:site.affiliates?.coupang?.mediaApproved===true}}};
}
