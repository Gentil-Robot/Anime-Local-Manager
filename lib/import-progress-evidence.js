'use strict';
// CSV's last episode is a position, not necessarily a contiguous watched count.
// Infer a count only when percentage rounding and remaining episodes agree on
// one integer. Never subtract one by convention or invent a missing season.
function infer(row={}){
 const text=String(row.status??'').trim().replace(',','.').replace(/%$/,'');
 const percent=Number(text),rawRemaining=String(row.remaining??'').trim(),remaining=Number(rawRemaining);
 if(!text||!rawRemaining||!Number.isInteger(remaining)||remaining<0||!Number.isFinite(percent)||percent<0||percent>=100)return null;
 const digits=(text.split('.')[1]||'').length,tolerance=0.5*Math.pow(10,-digits)+1e-8;
 const low=Math.max(0,percent-tolerance),high=Math.min(99.999999,percent+tolerance);
 const start=Math.max(0,Math.ceil(low*remaining/(100-low)-1e-8));
 const end=Math.min(100000,Math.floor(high*remaining/(100-high)+1e-8));
 if(start!==end||end<start)return null;
 const total=start+remaining;
 if(!total||Math.abs(100*start/total-percent)>tolerance)return null;
 return {watched:start,total,remaining,percent,source:'percentage-and-remaining'};
}
module.exports={infer};
