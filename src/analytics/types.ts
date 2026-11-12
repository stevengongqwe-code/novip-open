export interface AnalyticsTool {
 id:string;name:string;path:string;opens:number|null;starts:number|null;success:number|null;errors:number|null;
}
export interface AnalyticsPoint {x:string;y:number;uv:number|null;}
export interface AnalyticsUsagePoint {x:string;starts:number;success:number;errors:number;}
export interface AnalyticsCountry {code:string;visitors:number;}
export interface AnalyticsTotals {
 pv:number|null;
 /** Pageviews today (Beijing). V17.1+. */
 todayPv:number|null;
 /** All-time deduplicated UV (only the period that can actually be deduped). Null = not collected. */
 uv:number|null;
 today:number|null;yesterday:number|null;sevenDays:number|null;thirtyDays:number|null;
 toolStarts:number|null;toolSuccess:number|null;toolErrors:number|null;
}
export interface AnalyticsPublic {
 status:'ok';source:'EdgeOne Blob';timezone:'Asia/Shanghai';generatedAt:string;startDate:string;
 /** First event carrying an anonymous visitor mark; null when UV was never collected. V17.1+. */
 uvStartDate:string|null;
 /** Whether the server HMAC secret is configured (UV collection possible). V17.1+. */
 uvConfigured:boolean;
 range:'24h'|'7d'|'30d'|'90d'|'all';
 totals:AnalyticsTotals;
 trends:AnalyticsPoint[];usageTrend:AnalyticsUsagePoint[];tools:AnalyticsTool[];countries:AnalyticsCountry[];
 collectionNotes:string[];
}
export type AnalyticsRange=AnalyticsPublic['range'];
export async function getPublicAnalytics(range:AnalyticsRange='7d'):Promise<AnalyticsPublic>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('/api/analytics/public?range='+encodeURIComponent(range),{signal:controller.signal,credentials:'omit'});
  if(!response.ok)throw new Error(response.status===503?'统计服务尚未配置或暂时不可用':'数据服务暂时无法读取');
  const data:unknown=await response.json();
  if(!data||typeof data!=='object'||(data as AnalyticsPublic).status!=='ok'||!Array.isArray((data as AnalyticsPublic).trends))throw new Error('统计服务返回的数据不完整');
  return data as AnalyticsPublic;
 }finally{clearTimeout(timer);}
}
