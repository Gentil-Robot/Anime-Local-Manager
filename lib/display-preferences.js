'use strict';
const sizes={FHD:[1920,1080],QHD:[2560,1440],'4K':[3840,2160]};
function normalize(input={}){return {mode:['maximized','windowed','fullscreen'].includes(input.mode)?input.mode:'fullscreen',resolution:Object.hasOwn(sizes,input.resolution)?input.resolution:'auto',size:input.size==='large'?'large':'normal'};}
function bounds(preference,display,old={}){
 const area=display.workArea||{x:0,y:0,width:1280,height:800},scale=Number(display.scaleFactor)||1,size=sizes[preference.resolution];
 const maxWidth=preference.mode==='windowed'?Math.max(Math.min(720,area.width),Math.floor(area.width*.9)):area.width;
 const maxHeight=preference.mode==='windowed'?Math.max(Math.min(480,area.height),Math.floor(area.height*.9)):area.height;
 const width=Math.min(maxWidth,Math.max(Math.min(720,area.width),Math.round(size?size[0]/scale:Number(old.width)||1280)));
 const height=Math.min(maxHeight,Math.max(Math.min(480,area.height),Math.round(size?size[1]/scale:Number(old.height)||800)));
 return {width,height,x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2)};
}
module.exports={normalize,bounds};
