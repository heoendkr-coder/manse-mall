import { productOffers, safeHttps } from './affiliate.mjs';
import { publicCommerce } from './commerce.mjs';

export const koreaMonth = (now = new Date()) => Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',month:'numeric'}).format(now));
export const fresh = (value, days, now) => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return false;
  const day=value.slice(0,10),validDay=new Date(day+'T12:00:00Z');
  if(!Number.isFinite(validDay.getTime())||validDay.toISOString().slice(0,10)!==day)return false;
  const timestamp=Date.parse(value.length===10?value+'T00:00:00+09:00':value), age=now.getTime()-timestamp;
  return Number.isFinite(timestamp)&&age>=0&&age<=days*86400000;
};
const limit = (value, fallback, max) => Number.isFinite(value)&&value>0?Math.min(value,max):fallback;
export function verifiedRegion(p) {
  const c=p.curation||{};
  return c.originVerified===true&&safeHttps(c.originSource)&&['경상북도','경상남도'].includes(c.originProvince) ? c.originProvince : '';
}
/** Only operator-reviewed evidence is ranked. Never treat a search position as sales. */
export function assessProduct(p,site={},now=new Date()) {
  const c=p.curation||{}, config=site.recommendations||{}, reasons=[];
  const offers=productOffers(p,site,now).filter(o=>['seller','direct'].includes(o.provider)||(p.coupangLinkConfirmed===true&&site.affiliates?.coupang?.mediaApproved===true));
  if(!offers.length)reasons.push(p.salesMode==='direct'?'자사몰 주문·결제 준비':p.salesMode==='own-store'?'본인 판매 스토어 상품·옵션 확인':'본인 발급 링크·상품 일치·게재 조건 확인');
  if(p.imageRightsConfirmed!==true)reasons.push('이미지 사용 권한 확인');
  if(c.qualityChecked!==true||typeof c.qualityNote!=='string'||!c.qualityNote.trim()||!safeHttps(c.evidenceUrl))reasons.push('구성·품질 검수 내용과 출처 입력');
  if(!fresh(c.reviewedAt,limit(config.maxEvidenceAgeDays,30,90),now))reasons.push('상품 검수 자료 갱신');
  if(c.availability!=='in_stock'||!fresh(c.offerCheckedAt,limit(config.maxOfferAgeDays,3,7),now))reasons.push('현재 판매 상태 확인');
  const eligible=reasons.length===0, region=verifiedRegion(p);
  const seasonal=Boolean(safeHttps(c.seasonSource)&&Array.isArray(c.seasonMonths)&&c.seasonMonths.includes(koreaMonth(now)));
  // Popularity evidence is optional and must have its own source. No zero-as-missing coercion.
  const reviews=Number.isInteger(c.reviewCount)&&c.reviewCount>=0?c.reviewCount:0;
  const rating=typeof c.rating==='number'&&c.rating>=0&&c.rating<=5?c.rating:null;
  const metrics=Boolean(safeHttps(c.metricsSource)&&fresh(c.metricsCheckedAt,limit(config.maxEvidenceAgeDays,30,90),now));
  const popularity=metrics&&rating!==null&&reviews>=20?Math.min(20,Math.log10(reviews+1)*4)*(rating/5):0;
  // A price comparison is usable only for the same delivered quantity/options.
  const value=Boolean(c.valueChecked===true&&typeof c.valueNote==='string'&&c.valueNote.trim()&&safeHttps(c.priceSource)&&fresh(c.priceCheckedAt,3,now)&&c.sameOptionsCompared===true&&Number.isFinite(c.totalPrice)&&c.totalPrice>0&&Number.isFinite(c.comparisonPrice)&&c.comparisonPrice>0);
  const savings=value?Math.max(0,Math.min(1,(c.comparisonPrice-c.totalPrice)/c.comparisonPrice)):0;
  const score=eligible?50+popularity+Math.min(15,savings*50)+(seasonal?12:0)+(region&&config.regionPriority!==false?8:0):0;
  const labels=eligible?['구성 확인',...(seasonal?['계절 추천']:[]),...(region?[region+' 산지']:[]),...(value&&savings>0?['비교 가격 확인']:[])]:[];
  return {eligible,score,region,seasonal,labels,reasons};
}
export function rankProducts(products,site,now=new Date()) {
  return products.map((product,index)=>({product,index,...assessProduct(product,site,now)})).sort((a,b)=>b.score-a.score||a.index-b.index);
}
/** Data exposed to browser ranking: no credentials or operator-only account records. */
export function rankingInput(p) {
  const keys=['qualityChecked','qualityNote','evidenceUrl','reviewedAt','availability','offerCheckedAt','originVerified','originProvince','originSource','seasonSource','seasonMonths','reviewCount','rating','metricsSource','metricsCheckedAt','valueChecked','valueNote','priceSource','priceCheckedAt','sameOptionsCompared','totalPrice','comparisonPrice'];
  const curation=Object.fromEntries(keys.filter(k=>p.curation?.[k]!==undefined).map(k=>[k,p.curation[k]]));
  return {id:p.id,salesMode:p.salesMode,sellerUrl:p.sellerUrl,sellerLinkConfirmed:p.sellerLinkConfirmed,affiliateUrl:p.affiliateUrl,coupangLinkConfirmed:p.coupangLinkConfirmed,imageRightsConfirmed:p.imageRightsConfirmed,commerce:publicCommerce(p.commerce),curation};
}
